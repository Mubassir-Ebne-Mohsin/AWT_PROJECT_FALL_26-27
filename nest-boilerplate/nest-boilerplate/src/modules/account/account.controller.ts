import { Body, Controller, Get, Header, HttpCode, Patch, Post, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { appConfig } from "@/config";
import { CurrentUser } from "@/common/decorators";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { REFRESH_COOKIE, cookieOptions } from "@/modules/auth/auth.controller";
import { AccountService } from "@/modules/account/account.service";

// Passwords are checked here and the export is heavy, so these routes get the same brake as sign-in (one setting for both).
const sensitive = { default: { limit: appConfig.env.AUTH_THROTTLE_LIMIT, ttl: 60_000 } };

/** P4: the signed-in person's own account. No route takes an account id; the account is always the caller's. */
@ApiTags("account")
@ApiBearerAuth()
@Controller("account")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Patch("profile")
  profile(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    return this.account.updateProfile(u.id, body);
  }

  @Get("export")
  @Throttle(sensitive)
  @Header("Cache-Control", "no-store")
  export(@CurrentUser() u: AuthUser) {
    return this.account.exportData(u.id);
  }

  @Post("delete")
  @HttpCode(204)
  @Throttle(sensitive)
  async remove(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    await this.account.deleteAccount(u.id, body);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }
}
