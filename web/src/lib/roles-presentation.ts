/** The four account roles, as the server names them. Every account is a User; the others are granted by an Admin. */
export type RoleName = "user" | "instructor" | "reviewer" | "admin";

export const ROLE_LABEL: Record<RoleName, string> = {
  user: "User",
  instructor: "Instructor",
  reviewer: "Reviewer",
  admin: "Admin",
};

const ORDER: RoleName[] = ["user", "instructor", "reviewer", "admin"];

/** Roles beyond the default User, in a fixed order, for display. Unknown values from the server are ignored. */
export function extraRoles(roles: readonly string[] | undefined): RoleName[] {
  const held = new Set(roles ?? []);
  return ORDER.filter((role) => role !== "user" && held.has(role));
}

/** "Admin, Reviewer" or "" when the account has only the default role. */
export function extraRoleText(roles: readonly string[] | undefined): string {
  return extraRoles(roles)
    .map((role) => ROLE_LABEL[role])
    .join(", ");
}

/**
 * Whether an account may enter an area. Roles never imply each other: an Admin does not become a Reviewer by being
 * an Admin, so each area names the one role it needs. This only decides what the screen shows; the server decides
 * what the account can actually do on every request.
 */
export function canEnter(roles: readonly string[] | undefined, needed: RoleName): boolean {
  return (roles ?? []).includes(needed);
}
