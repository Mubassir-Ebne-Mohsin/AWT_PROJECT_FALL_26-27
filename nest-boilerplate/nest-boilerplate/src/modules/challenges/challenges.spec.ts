import "reflect-metadata";
import { PERMISSION_KEY } from "@/common/decorators/permission.decorator";
import { AccountRole, Permission, hasPermission } from "@/common/enums/account-role.enum";
import { InstructorChallengesController } from "@/modules/challenges/challenges.controller";

describe("R5 challenge permission", () => {
  it("belongs to the Instructor role only: not User, Reviewer or Admin, and not by combining them", () => {
    expect(hasPermission([AccountRole.INSTRUCTOR], Permission.CHALLENGE_MANAGE)).toBe(true);
    expect(hasPermission([AccountRole.USER, AccountRole.INSTRUCTOR], Permission.CHALLENGE_MANAGE)).toBe(true);
    for (const role of [AccountRole.USER, AccountRole.REVIEWER, AccountRole.ADMIN]) expect(hasPermission([role], Permission.CHALLENGE_MANAGE)).toBe(false);
    expect(hasPermission([AccountRole.USER, AccountRole.REVIEWER, AccountRole.ADMIN], Permission.CHALLENGE_MANAGE)).toBe(false);
    expect(hasPermission([], Permission.CHALLENGE_MANAGE)).toBe(false);
  });

  it("is the permission every Instructor route declares, so none can be added unprotected", () => {
    const routes = Object.getOwnPropertyNames(InstructorChallengesController.prototype).filter((name) => name !== "constructor");
    expect(routes.length).toBeGreaterThanOrEqual(7);
    for (const route of routes) {
      const permission = Reflect.getMetadata(PERMISSION_KEY, (InstructorChallengesController.prototype as unknown as Record<string, () => void>)[route]);
      expect(permission).toBe(Permission.CHALLENGE_MANAGE);
    }
  });
});
