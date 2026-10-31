import { Injectable, Optional } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { appConfig } from "@/config";
import { AppException } from "@/common/errors";
import { TokenStore } from "@/modules/auth/token-store.service";
import { ACCOUNT_ROLE_ORDER, AccountRole, type GrantableRole } from "@/common/enums/account-role.enum";
import {
  adminUserSchema,
  auditEntrySchema,
  auditQuerySchema,
  grantRoleRequestSchema,
  grantableRoleSchema,
  lookupQuerySchema,
  roleChangeSchema,
  statusChangeSchema,
  userSearchQuerySchema,
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
  // The token store is only needed to cut off a suspended account's live access tokens; server-side scripts that never
  // suspend anyone construct this service with the database alone.
  constructor(
    private readonly db: DataSource,
    @Optional() private readonly tokens?: TokenStore,
  ) {}

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
    return this.view(user);
  }

  private async view(user: User) {
    return adminUserSchema.parse({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      roles: await this.rolesOf(user.id),
      status: user.accountStatus ?? "active",
      createdAt: user.createdAt.toISOString(),
    });
  }

  /** Find accounts by part of an email or display name. Account details only, never any design content. */
  async search(raw: Record<string, unknown>) {
    const parsed = userSearchQuerySchema.safeParse(raw);
    if (!parsed.success) throw new AppException("VALIDATION_FAILED", "Invalid search");
    const pattern = `%${parsed.data.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = (await this.db.query(
      `SELECT id FROM users WHERE email ILIKE $1 ESCAPE '\\' OR display_name ILIKE $1 ESCAPE '\\' ORDER BY created_at DESC, id DESC LIMIT $2`,
      [pattern, parsed.data.limit],
    )) as Array<{ id: string }>;
    const out = [];
    for (const row of rows) out.push(await this.view(await this.requireUser(row.id, this.db.manager)));
    return out;
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

  /** Admins who can act: a suspended Admin does not count, so suspending or demoting the last working one is refused. */
  private async activeAdminCount(m: EntityManager) {
    const rows = (await m.query(
      `SELECT count(*)::int AS n FROM users u
        WHERE u.account_status = 'active'
          AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin'))`,
    )) as Array<{ n: number }>;
    return rows[0].n;
  }

  private audit(m: EntityManager, action: "grant" | "revoke" | "bootstrap" | "suspend" | "restore", role: GrantableRole | null, actor: Actor, target: User) {
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
        if (role === AccountRole.ADMIN && target.accountStatus !== "suspended" && (await this.activeAdminCount(m)) <= 1)
          throw new AppException("CONFLICT", "The last admin cannot be removed", { reason: "LAST_ADMIN" });
        await m.query("DELETE FROM user_roles WHERE user_id = $1 AND role = $2", [targetId, role]);
        // Decision 3: removing a role ends the account's sessions, so it has to sign in again and cannot keep refreshing.
        await m.query("UPDATE users SET sessions_revoked_at = now() WHERE id = $1", [targetId]);
        // The legacy column is read through, so it must not keep an admin the table no longer has.
        if (role === AccountRole.ADMIN) await m.query("UPDATE users SET role = 'user' WHERE id = $1 AND role = 'admin'", [targetId]);
        await this.audit(m, "revoke", role, actor, target);
      }
      return roleChangeSchema.parse({ userId: targetId, roles: await this.rolesOf(targetId, m) });
    });
  }

  /**
   * Suspend: sign-in and refresh are refused, live sessions end, every row is kept. Idempotent. An Admin cannot suspend
   * themselves, and the last working Admin cannot be suspended.
   */
  async suspend(actor: Actor, targetId: string) {
    if (!this.tokens) throw new AppException("INTERNAL", "Suspending needs the token store");
    await this.db.transaction(async (m) => {
      await m.query(LOCK);
      const target = await this.requireUser(targetId, m);
      if (target.id === actor.id) throw new AppException("CONFLICT", "You cannot suspend your own account", { reason: "SELF" });
      if (target.accountStatus === "suspended") return;
      const roles = await this.rolesOf(targetId, m);
      if (roles.includes(AccountRole.ADMIN) && (await this.activeAdminCount(m)) <= 1)
        throw new AppException("CONFLICT", "The last admin cannot be suspended", { reason: "LAST_ADMIN" });
      await m.query("UPDATE users SET account_status = 'suspended', sessions_revoked_at = now() WHERE id = $1", [targetId]);
      await this.audit(m, "suspend", null, actor, target);
    });
    // After the commit, and repeated on a retry: the database says suspended, this cuts off tokens already issued.
    try {
      await this.tokens.blockUser(targetId, appConfig.env.JWT_ACCESS_TTL_SECONDS);
    } catch {
      throw new AppException("UNAVAILABLE", "The account is suspended, but live sessions could not be ended yet. Please retry.");
    }
    return statusChangeSchema.parse({ userId: targetId, status: "suspended" });
  }

  /** Restore: the account can sign in again; sessions that were ended stay ended. Idempotent. */
  async restore(actor: Actor, targetId: string) {
    await this.db.transaction(async (m) => {
      await m.query(LOCK);
      const target = await this.requireUser(targetId, m);
      if (target.accountStatus !== "suspended") return;
      await m.query("UPDATE users SET account_status = 'active' WHERE id = $1", [targetId]);
      await this.audit(m, "restore", null, actor, target);
    });
    try {
      await this.tokens?.unblockUser(targetId);
    } catch {
      throw new AppException("UNAVAILABLE", "The account is restored, but its sign-in block could not be cleared yet. Please retry.");
    }
    return statusChangeSchema.parse({ userId: targetId, status: "active" });
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
    )) as Array<{ id: string; at: Date; action: "grant" | "revoke" | "bootstrap" | "suspend" | "restore"; role: GrantableRole | null; actorId: string | null; actorEmail: string; targetId: string | null; targetEmail: string }>;
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
