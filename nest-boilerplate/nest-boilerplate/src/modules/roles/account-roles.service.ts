import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { AppException } from "@/common/errors";
import { ACCOUNT_ROLE_ORDER, AccountRole, type GrantableRole } from "@/common/enums/account-role.enum";
import {
  adminUserSchema,
  auditEntrySchema,
  auditQuerySchema,
  grantRoleRequestSchema,
  grantableRoleSchema,
  lookupQuerySchema,
  roleChangeSchema,
} from "@/common/contracts/phase3/roles.schema";
import { User } from "@/modules/users/entities/user.entity";
import { normalizeEmail } from "@/modules/users/users.service";

/** Who made a change. Server-side commands (first-admin bootstrap, demo seed) are recorded as "operator". */
export type Actor = { id: string | null; email: string };
export const OPERATOR: Actor = { id: null, email: "operator" };

// Role changes and the last-admin check run one at a time, so two admins cannot each remove the other.
const LOCK = "SELECT pg_advisory_xact_lock(hashtext('sf-account-roles'))";

/**
 * R1 Roles. Roles are read from the database on every privileged call, never trusted from the token, so a revoked
 * role stops working at once. Effective roles are User (implicit), the granted roles, and the legacy `users.role`
 * value read through (so both sources agree during the transition).
 */
@Injectable()
export class AccountRolesService {
  constructor(private readonly db: DataSource) {}

  async rolesOf(userId: string, m: EntityManager = this.db.manager): Promise<AccountRole[]> {
    const rows = (await m.query(
      `SELECT u.role AS legacy, COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS granted
         FROM users u LEFT JOIN user_roles r ON r.user_id = u.id WHERE u.id = $1 GROUP BY u.id`,
      [userId],
    )) as Array<{ legacy: string; granted: string[] }>;
    if (!rows.length) return [];
    const set = new Set<string>([AccountRole.USER, ...rows[0].granted]);
    if (rows[0].legacy === AccountRole.ADMIN) set.add(AccountRole.ADMIN);
    return ACCOUNT_ROLE_ORDER.filter((role) => set.has(role));
  }

  private async requireUser(id: string, m: EntityManager) {
    const user = await m.findOneBy(User, { id });
    if (!user) throw new AppException("NOT_FOUND", "Account not found");
    return user;
  }

  async lookup(raw: Record<string, unknown>) {
    const parsed = lookupQuerySchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid lookup");
    const user = await this.db.manager.findOneBy(User, { email: normalizeEmail(parsed.data.email) });
    if (!user) throw new AppException("NOT_FOUND", "No account with that email");
    return adminUserSchema.parse({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      roles: await this.rolesOf(user.id),
      createdAt: user.createdAt.toISOString(),
    });
  }

  async rolesFor(id: string) {
    await this.requireUser(id, this.db.manager);
    return roleChangeSchema.parse({ userId: id, roles: await this.rolesOf(id) });
  }

  private async adminCount(m: EntityManager) {
    const rows = (await m.query(
      `SELECT count(*)::int AS n FROM users u
        WHERE u.role = 'admin' OR EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin')`,
    )) as Array<{ n: number }>;
    return rows[0].n;
  }

  private audit(m: EntityManager, action: "grant" | "revoke" | "bootstrap", role: GrantableRole, actor: Actor, target: User) {
    return m.query(
      `INSERT INTO role_audit(at, action, role, actor_id, actor_email, target_id, target_email)
       VALUES (date_trunc('milliseconds', now()), $1, $2, $3, $4, $5, $6)`,
      [action, role, actor.id, actor.email, target.id, target.email],
    );
  }

  /** Idempotent: granting a role the account already holds changes nothing and writes no audit entry. */
  async grant(actor: Actor, targetId: string, raw: Record<string, unknown>) {
    const parsed = grantRoleRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid role");
    const role = parsed.data.role;
    return this.db.transaction(async (m) => {
      await m.query(LOCK);
      const target = await this.requireUser(targetId, m);
      const before = await this.rolesOf(targetId, m);
      if (!before.includes(role)) {
        await m.query("INSERT INTO user_roles(user_id, role, granted_by, granted_at) VALUES ($1, $2, $3, now())", [targetId, role, actor.id]);
        await this.audit(m, "grant", role, actor, target);
      }
      return roleChangeSchema.parse({ userId: targetId, roles: await this.rolesOf(targetId, m) });
    });
  }

  /** Idempotent. The last Admin cannot be removed, so the platform can never lock itself out. */
  async revoke(actor: Actor, targetId: string, rawRole: string) {
    const parsed = grantableRoleSchema.safeParse(rawRole);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid role");
    const role = parsed.data;
    return this.db.transaction(async (m) => {
      await m.query(LOCK);
      const target = await this.requireUser(targetId, m);
      const before = await this.rolesOf(targetId, m);
      if (before.includes(role)) {
        if (role === AccountRole.ADMIN && (await this.adminCount(m)) <= 1)
          throw new AppException("CONFLICT", "The last admin cannot be removed", { reason: "LAST_ADMIN" });
        await m.query("DELETE FROM user_roles WHERE user_id = $1 AND role = $2", [targetId, role]);
        // The legacy column is read through, so it must not keep an admin the table no longer has.
        if (role === AccountRole.ADMIN) await m.query("UPDATE users SET role = 'user' WHERE id = $1 AND role = 'admin'", [targetId]);
        await this.audit(m, "revoke", role, actor, target);
      }
      return roleChangeSchema.parse({ userId: targetId, roles: await this.rolesOf(targetId, m) });
    });
  }

  /** The one-time server command: makes the first Admin, and only while no Admin exists. */
  async bootstrapAdmin(email: string) {
    return this.db.transaction(async (m) => {
      await m.query(LOCK);
      const target = await m.findOneBy(User, { email: normalizeEmail(email) });
      if (!target) throw new AppException("NOT_FOUND", "No account with that email");
      if ((await this.adminCount(m)) > 0) throw new AppException("CONFLICT", "An admin already exists", { reason: "ADMIN_EXISTS" });
      await m.query("INSERT INTO user_roles(user_id, role, granted_by, granted_at) VALUES ($1, 'admin', NULL, now())", [target.id]);
      await this.audit(m, "bootstrap", AccountRole.ADMIN, OPERATOR, target);
      return roleChangeSchema.parse({ userId: target.id, roles: await this.rolesOf(target.id, m) });
    });
  }

  /** Newest first. The cursor is (before, beforeId), so entries in the same millisecond are never skipped. */
  async listAudit(raw: Record<string, unknown>) {
    const parsed = auditQuerySchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid audit query");
    const { limit, before, beforeId } = parsed.data;
    const rows = (await this.db.query(
      `SELECT id, at, action, role, actor_id AS "actorId", actor_email AS "actorEmail", target_id AS "targetId", target_email AS "targetEmail"
         FROM role_audit
        WHERE ($1::timestamptz IS NULL OR (at, id) < ($1::timestamptz, COALESCE($2::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
        ORDER BY at DESC, id DESC LIMIT $3`,
      [before ?? null, beforeId ?? null, limit],
    )) as Array<{ id: string; at: Date; action: "grant" | "revoke" | "bootstrap"; role: GrantableRole; actorId: string | null; actorEmail: string; targetId: string | null; targetEmail: string }>;
    return rows.map((row) =>
      auditEntrySchema.parse({
        id: row.id,
        at: row.at.toISOString(),
        action: row.action,
        role: row.role,
        actor: { id: row.actorId, email: row.actorEmail },
        target: { id: row.targetId, email: row.targetEmail },
      }),
    );
  }
}
