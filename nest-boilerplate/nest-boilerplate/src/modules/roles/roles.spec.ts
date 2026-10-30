import "reflect-metadata";
import { ExecutionContext } from "@nestjs/common";
import { PERMISSION_KEY } from "@/common/decorators/permission.decorator";
import { ACCOUNT_ROLE_ORDER, AccountRole, GRANTABLE_ROLES, PERMISSIONS, Permission, hasPermission } from "@/common/enums/account-role.enum";
import { AppException } from "@/common/errors";
import { PermissionGuard } from "@/modules/roles/permission.guard";
import { AccountController, AdminController } from "@/modules/roles/roles.controller";

const ADMIN_ONLY = [Permission.ADMIN_USERS_READ, Permission.ADMIN_ROLES_GRANT, Permission.ADMIN_AUDIT_READ];

describe("R1 permission table", () => {
  it("gives Admin exactly the admin permissions and every other role none", () => {
    for (const permission of ADMIN_ONLY) {
      expect(hasPermission([AccountRole.ADMIN], permission)).toBe(true);
      for (const role of [AccountRole.USER, AccountRole.INSTRUCTOR, AccountRole.REVIEWER]) expect(hasPermission([role], permission)).toBe(false);
    }
  });

  it("never inherits: combining roles adds only what each role has, and Admin gains nothing from User", () => {
    expect(hasPermission([AccountRole.USER, AccountRole.INSTRUCTOR, AccountRole.REVIEWER], Permission.ADMIN_ROLES_GRANT)).toBe(false);
    expect(hasPermission([AccountRole.USER, AccountRole.ADMIN], Permission.ADMIN_AUDIT_READ)).toBe(true);
    expect(hasPermission([], Permission.ADMIN_USERS_READ)).toBe(false);
    expect(hasPermission(["superuser" as AccountRole], Permission.ADMIN_USERS_READ)).toBe(false);
  });

  it("assigns every permission to at least one role, and covers every role", () => {
    const assigned = new Set(Object.values(PERMISSIONS).flat());
    for (const permission of Object.values(Permission)) expect(assigned.has(permission)).toBe(true);
    expect(Object.keys(PERMISSIONS).sort()).toEqual([...ACCOUNT_ROLE_ORDER].sort());
  });

  it("lets an Admin grant Instructor, Reviewer and Admin, but never User, which every account has", () => {
    expect([...GRANTABLE_ROLES]).toEqual([AccountRole.INSTRUCTOR, AccountRole.REVIEWER, AccountRole.ADMIN]);
    expect(GRANTABLE_ROLES as readonly AccountRole[]).not.toContain(AccountRole.USER);
  });

  it("makes every admin route declare a permission, so none can be added unprotected", () => {
    const routes = Object.getOwnPropertyNames(AdminController.prototype).filter((name) => name !== "constructor");
    expect(routes.length).toBeGreaterThanOrEqual(5);
    for (const route of routes) {
      const permission = Reflect.getMetadata(PERMISSION_KEY, (AdminController.prototype as unknown as Record<string, () => void>)[route]);
      expect(Object.values(Permission)).toContain(permission);
    }
    // The account's own roles are open to any signed-in account and declare nothing.
    expect(Reflect.getMetadata(PERMISSION_KEY, AccountController.prototype.mine)).toBeUndefined();
  });
});

describe("PermissionGuard", () => {
  const ctx = (user?: { id: string; role?: string }) =>
    ({ getHandler: () => undefined, getClass: () => undefined, switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
  const build = (needed: Permission | undefined, roles: AccountRole[] = [AccountRole.USER]) => {
    const rolesOf = jest.fn().mockResolvedValue(roles);
    const guard = new PermissionGuard({ getAllAndOverride: () => needed } as never, { rolesOf } as never);
    return { guard, rolesOf };
  };

  it("leaves a route with no declared permission alone and does not touch the database", async () => {
    const { guard, rolesOf } = build(undefined);
    await expect(guard.canActivate(ctx({ id: "u" }))).resolves.toBe(true);
    expect(rolesOf).not.toHaveBeenCalled();
  });

  it("refuses a guest, and refuses an account that lacks the permission", async () => {
    await expect(build(Permission.ADMIN_USERS_READ).guard.canActivate(ctx())).rejects.toBeInstanceOf(AppException);
    const refused = build(Permission.ADMIN_USERS_READ, [AccountRole.USER, AccountRole.REVIEWER]);
    await expect(refused.guard.canActivate(ctx({ id: "u" }))).rejects.toBeInstanceOf(AppException);
  });

  it("reads the roles from the database on every call and ignores any role claim from the token", async () => {
    const { guard, rolesOf } = build(Permission.ADMIN_ROLES_GRANT, [AccountRole.USER]);
    // A token that claims admin is not believed.
    await expect(guard.canActivate(ctx({ id: "u", role: "admin" }))).rejects.toBeInstanceOf(AppException);
    rolesOf.mockResolvedValue([AccountRole.USER, AccountRole.ADMIN]);
    await expect(guard.canActivate(ctx({ id: "u", role: "user" }))).resolves.toBe(true);
    rolesOf.mockResolvedValue([AccountRole.USER]);
    await expect(guard.canActivate(ctx({ id: "u", role: "user" }))).rejects.toBeInstanceOf(AppException);
    expect(rolesOf).toHaveBeenCalledTimes(3);
  });
});
