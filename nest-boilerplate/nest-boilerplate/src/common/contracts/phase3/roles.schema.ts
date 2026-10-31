import { z } from "zod";
import { AccountRole, GRANTABLE_ROLES } from "@/common/enums/account-role.enum";

// R1 Roles. Core product contracts, independent of the optional AI contracts and of the frozen phase 2 contract.

export const accountRoleSchema = z.enum(AccountRole);
export const grantableRoleSchema = z.enum(GRANTABLE_ROLES);

/** The signed-in account's own roles, read from the database. User is always present. */
export const accountRolesSchema = z.strictObject({ roles: z.array(accountRoleSchema).min(1).max(4) });

export const grantRoleRequestSchema = z.strictObject({ role: grantableRoleSchema });
export const lookupQuerySchema = z.strictObject({ email: z.string().trim().min(3).max(254) });
export const auditQuerySchema = z
  .strictObject({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    before: z.iso.datetime().optional(),
    beforeId: z.uuid().optional(),
  })
  .refine((q) => q.beforeId === undefined || q.before !== undefined, "beforeId needs before");

/** What an Admin sees about an account. Never includes password material or any design content. */
export const adminUserSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  roles: z.array(accountRoleSchema).min(1).max(4),
  status: z.enum(["active", "suspended"]),
  createdAt: z.iso.datetime(),
});

/** R2: search by part of an email or display name. Newest accounts first; an Admin still sees no design content. */
export const userSearchQuerySchema = z.strictObject({ q: z.string().trim().min(2).max(100), limit: z.coerce.number().int().min(1).max(20).default(10) });
export const statusChangeSchema = z.strictObject({ userId: z.uuid(), status: z.enum(["active", "suspended"]) });

export const roleChangeSchema = z.strictObject({ userId: z.uuid(), roles: z.array(accountRoleSchema).min(1).max(4) });

const party = z.strictObject({ id: z.uuid().nullable(), email: z.string() });
/** Append-only: nobody can edit or delete an entry. `actor.email` is "operator" for server-side commands. */
export const auditEntrySchema = z.strictObject({
  id: z.uuid(),
  at: z.iso.datetime(),
  action: z.enum(["grant", "revoke", "bootstrap", "suspend", "restore"]),
  /** Null for suspend and restore, which are about the account and not a role. */
  role: grantableRoleSchema.nullable(),
  actor: party,
  target: party,
});
