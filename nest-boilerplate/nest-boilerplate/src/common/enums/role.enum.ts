export enum Role {
  USER = "user",
  ADMIN = "admin",
}

// A role satisfies a requirement when its rank is >= the required rank.
export const RoleHierarchy: Record<Role, number> = {
  [Role.USER]: 1,
  [Role.ADMIN]: 2,
};
