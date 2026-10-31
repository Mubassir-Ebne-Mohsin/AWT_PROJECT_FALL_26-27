import "reflect-metadata";
import { PERMISSION_KEY } from "@/common/decorators/permission.decorator";
import { AccountRole, Permission, hasPermission } from "@/common/enums/account-role.enum";
import { ReviewsController } from "@/modules/reviews/reviews.controller";

describe("R3 review permission", () => {
  it("belongs to the Reviewer role only: not Admin, Instructor or User, and not by combining them", () => {
    expect(hasPermission([AccountRole.REVIEWER], Permission.REVIEW_READ)).toBe(true);
    expect(hasPermission([AccountRole.USER, AccountRole.REVIEWER], Permission.REVIEW_READ)).toBe(true);
    for (const role of [AccountRole.USER, AccountRole.INSTRUCTOR, AccountRole.ADMIN]) expect(hasPermission([role], Permission.REVIEW_READ)).toBe(false);
    expect(hasPermission([AccountRole.USER, AccountRole.INSTRUCTOR, AccountRole.ADMIN], Permission.REVIEW_READ)).toBe(false);
    expect(hasPermission([], Permission.REVIEW_READ)).toBe(false);
  });

  it("is the permission every Reviewer-side route declares, so none can be added unprotected", () => {
    const routes = Object.getOwnPropertyNames(ReviewsController.prototype).filter((name) => name !== "constructor");
    expect(routes.length).toBeGreaterThanOrEqual(2);
    for (const route of routes) {
      const permission = Reflect.getMetadata(PERMISSION_KEY, (ReviewsController.prototype as unknown as Record<string, () => void>)[route]);
      expect(permission).toBe(Permission.REVIEW_READ);
    }
  });
});
