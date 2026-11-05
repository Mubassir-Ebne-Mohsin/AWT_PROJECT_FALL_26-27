/**
 * Account roles for the roles track (R1). Separate from the legacy `Role` enum, whose ranked token check stays as it is:
 * these roles are never inherited and never read from the token. User is the implicit base every account has; the
 * others are granted by an Admin and read from the database on every privileged call.
 */
export enum AccountRole {
  USER = "user",
  INSTRUCTOR = "instructor",
  REVIEWER = "reviewer",
  SUPPORT = "support",
  ADMIN = "admin",
}

/** Stable display and storage order. */
export const ACCOUNT_ROLE_ORDER: readonly AccountRole[] = [AccountRole.USER, AccountRole.INSTRUCTOR, AccountRole.REVIEWER, AccountRole.SUPPORT, AccountRole.ADMIN];

/** What an Admin may grant or revoke. User is implicit and cannot be removed. */
export const GRANTABLE_ROLES = [AccountRole.INSTRUCTOR, AccountRole.REVIEWER, AccountRole.SUPPORT, AccountRole.ADMIN] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

export enum Permission {
  ADMIN_USERS_READ = "admin.users.read",
  ADMIN_ROLES_GRANT = "admin.roles.grant",
  ADMIN_AUDIT_READ = "admin.audit.read",
  ADMIN_USERS_SUSPEND = "admin.users.suspend",
  /** Live dashboard: aggregate counts only, never design content. */
  ADMIN_METRICS_READ = "admin.metrics.read",
  /** R3: read designs that owners have shared with this Reviewer. Reviewer only; Admin never reads design content. */
  REVIEW_READ = "review.read",
  /** R5: write, publish, archive and duplicate one's own challenges. Instructor only. */
  CHALLENGE_MANAGE = "challenge.manage",
  /** Support: see every problem report and read its thread. Support only; Admin never inherits it. */
  SUPPORT_INBOX_READ = "support.inbox.read",
  /** Support: reply, write internal notes, set status and priority, assign. Support only. */
  SUPPORT_INBOX_REPLY = "support.inbox.reply",
}

/**
 * The one permission table. A role has exactly the permissions listed here: there is no inheritance, so Admin does not
 * silently gain Instructor or Reviewer powers, and holding a role never grants access to anyone's private design.
 * Later slices add their permissions here and every new endpoint declares one with `@RequirePermission`.
 */
export const PERMISSIONS: Record<AccountRole, readonly Permission[]> = {
  [AccountRole.USER]: [],
  [AccountRole.INSTRUCTOR]: [Permission.CHALLENGE_MANAGE],
  [AccountRole.REVIEWER]: [Permission.REVIEW_READ],
  [AccountRole.SUPPORT]: [Permission.SUPPORT_INBOX_READ, Permission.SUPPORT_INBOX_REPLY],
  [AccountRole.ADMIN]: [Permission.ADMIN_USERS_READ, Permission.ADMIN_ROLES_GRANT, Permission.ADMIN_AUDIT_READ, Permission.ADMIN_USERS_SUSPEND, Permission.ADMIN_METRICS_READ],
};

export const hasPermission = (roles: readonly AccountRole[], permission: Permission) => roles.some((role) => PERMISSIONS[role]?.includes(permission) ?? false);
