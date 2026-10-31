import "reflect-metadata";
import { AccountController } from "@/modules/account/account.controller";
import { AuthController } from "@/modules/auth/auth.controller";

const throttled = (target: object) => Reflect.getMetadataKeys(target).some((k) => String(k).startsWith("THROTTLER:"));
const isPublic = (target: object) => Reflect.getMetadata("isPublic", target) === true;

describe("P4 account routes are braked and never public", () => {
  it("puts the sign-in style brake on every route that checks a password or builds the export", () => {
    expect(throttled(AccountController.prototype.remove)).toBe(true);
    expect(throttled(AccountController.prototype.export)).toBe(true);
    expect(throttled(AuthController.prototype.password)).toBe(true);
  });

  it("leaves none of the account routes open to guests", () => {
    for (const handler of [AccountController.prototype.profile, AccountController.prototype.export, AccountController.prototype.remove, AuthController.prototype.password]) {
      expect(isPublic(handler)).toBe(false);
    }
    expect(isPublic(AccountController)).toBe(false);
  });
});
