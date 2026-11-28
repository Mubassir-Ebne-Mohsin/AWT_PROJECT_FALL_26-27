import {
  socialPasswordProofSchema,
  socialProofRequestSchema,
  socialReauthRequestSchema,
  socialPasswordRequestSchema,
  socialDeleteRequestSchema,
} from "@/common/contracts/phase3/social.schema";
import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  Header,
  HttpCode,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import { appConfig } from "@/config";
import { Public, CurrentUser } from "@/common/decorators";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { AppException } from "@/common/errors";
import { UsersService } from "@/modules/users/users.service";
import { AccountService } from "@/modules/account/account.service";
import { AuthService, IssuedSession } from "@/modules/auth/auth.service";
import { REFRESH_COOKIE, cookieOptions } from "@/modules/auth/auth.controller";
import {
  SocialFlowService,
  Completion,
} from "@/modules/social/social-flow.service";
import { SocialAccountService } from "@/modules/social/social-account.service";
import { actionSchema, providerOf } from "@/modules/social/social.types";
import { digest, secret } from "@/modules/social/social-store";
const BROWSER = "sf_oauth_browser",
  PENDING = "sf_oauth_pending",
  COMPLETE = "sf_oauth_complete";
const options = () => ({
  ...cookieOptions(),
  path: "/v1/auth",
  maxAge: 600000,
});
@Controller("auth")
@Throttle({ default: { limit: appConfig.env.AUTH_THROTTLE_LIMIT, ttl: 60000 } })
export class SocialController {
  constructor(
    private readonly flow: SocialFlowService,
    private readonly accounts: SocialAccountService,
    private readonly account: AccountService,
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}
  private browser(req: Request, res?: Response) {
    let b = req.cookies?.[BROWSER];
    if (typeof b !== "string" || !/^[\w-]{43}$/.test(b)) {
      if (!res)
        throw new AppException(
          "UNAUTHENTICATED",
          "Start sign-in again in this browser",
        );
      b = secret();
    }
    if (res) res.cookie(BROWSER, b, options());
    return b as string;
  }
  private input<T extends z.ZodType>(schema: T, raw: unknown) {
    const p = schema.safeParse(raw);
    if (!p.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "Check the account action fields",
      );
    return p.data;
  }
  private origin(req: Request) {
    if (
      req.method === "POST" &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    )
      throw new AppException("VALIDATION_FAILED", "Send a JSON object");
    if (req.headers.origin !== new URL(appConfig.env.FRONTEND_URL).origin)
      throw new AppException(
        "FORBIDDEN",
        "This action must start on StressForge",
      );
  }
  private session(res: Response, session: IssuedSession) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...cookieOptions(),
      maxAge: session.refreshExpiresIn * 1000,
    });
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: this.users.toDto(session.user),
    };
  }
  @Public() @Header("Cache-Control", "no-store") @Get("providers") providers() {
    return {
      google: this.flow.provider.enabled("google"),
      github: this.flow.provider.enabled("github"),
    };
  }
  @Public()
  @Header("Cache-Control", "no-store")
  @Get(":provider/start")
  async start(
    @Param("provider") raw: string,
    @Query("next") next: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = providerOf(raw);
    const url = await this.flow.start(provider, this.browser(req, res), next);
    res.redirect(303, url);
  }
  @Public()
  @Header("Cache-Control", "no-store")
  @Get(":provider/callback")
  async callback(
    @Param("provider") raw: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const front = appConfig.env.FRONTEND_URL.replace(/\/$/, "");
    try {
      const provider = providerOf(raw),
        browser = this.browser(req),
        flow = await this.flow.takeState(provider, query.state, browser);
      if (query.error)
        throw new AppException("UNAUTHENTICATED", "Provider declined");
      const result = await this.flow.callback(
        flow,
        query,
        browser,
        req.cookies?.[REFRESH_COOKIE],
      );
      if (result.session) this.session(res, result.session);
      if (result.pending) {
        res.cookie(PENDING, result.pending, options());
        res.redirect(303, front + "/register?social=1");
        return;
      }
      res.cookie(COMPLETE, result.completion, { ...options(), maxAge: 60000 });
      res.redirect(303, front + "/auth/complete?oauth=1");
    } catch (e) {
      const code = e instanceof AppException ? e.code : "INTERNAL";
      const reason =
        code === "VALIDATION_FAILED"
          ? "verified-email-required"
          : code === "CONFLICT"
            ? "email-or-identity-conflict"
            : code === "FORBIDDEN"
              ? "account-unavailable"
              : code === "UNAVAILABLE"
                ? "provider-unavailable"
                : query.error === "access_denied"
                  ? "authorization-canceled"
                  : "sign-in-failed";
      res.redirect(303, front + "/login?social_error=" + reason);
    }
  }
  @Public()
  @Header("Cache-Control", "no-store")
  @Get("oauth/completion")
  async completion(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[COMPLETE],
      b = this.browser(req),
      c = await this.flow.store.read<Completion>("completion", token);
    if (c.binding !== digest(b))
      throw new AppException("FORBIDDEN", "Completion browser changed");
    await this.flow.store.read("completion", token, true);
    res.clearCookie(COMPLETE, options());
    return {
      kind: c.kind,
      next: c.next,
      ...(c.proof ? { proof: c.proof, owner: c.owner, action: c.action } : {}),
    };
  }
  @Public()
  @Header("Cache-Control", "no-store")
  @Get("oauth/pending")
  async pending(@Req() req: Request) {
    const p = await this.flow.pending(
      req.cookies?.[PENDING],
      this.browser(req),
    );
    return {
      email: p.identity.email,
      displayName: p.identity.name
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .slice(0, 60),
      csrf: p.csrf,
    };
  }
  @Public()
  @Header("Cache-Control", "no-store")
  @Post("oauth/register")
  async register(
    @Body() raw: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    const result = await this.flow.register(
      req.cookies?.[PENDING],
      this.browser(req),
      raw,
    );
    res.clearCookie(PENDING, options());
    return { ...this.session(res, result.session), next: result.next };
  }
  @Header("Cache-Control", "no-store") @Get("oauth/identities") identities(
    @CurrentUser() u: AuthUser,
  ) {
    return this.accounts.methods(u.id);
  }
  @Header("Cache-Control", "no-store")
  @Post("reauthenticate")
  @HttpCode(200)
  async reauthenticate(
    @CurrentUser() u: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    this.input(socialPasswordProofSchema, body);
    const action = actionSchema.safeParse(body.action);
    if (!action.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "Choose a supported account action",
      );
    const browser = this.browser(req, res),
      family = await this.auth.socialSessionFamily(
        req.cookies?.[REFRESH_COOKIE],
        u.id,
      );
    return {
      proof: await this.accounts.passwordProof(
        u.id,
        family,
        browser,
        action.data,
        body.password,
      ),
      action: action.data,
      owner: u.id,
    };
  }
  @Header("Cache-Control", "no-store")
  @Post("oauth/:provider/link")
  @HttpCode(200)
  async link(
    @CurrentUser() u: AuthUser,
    @Param("provider") raw: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    this.origin(req);
    this.input(socialProofRequestSchema, body);
    const provider = providerOf(raw),
      browser = this.browser(req);
    const proof = await this.flow.proof(
      body.proof,
      browser,
      u.id,
      req.cookies?.[REFRESH_COOKIE],
      `link:${provider}`,
    );
    return {
      url: await this.flow.start(
        provider,
        browser,
        "/settings/security",
        "link",
        { owner: u.id, family: proof.family, action: `link:${provider}` },
      ),
    };
  }
  @Header("Cache-Control", "no-store")
  @Post("oauth/:provider/reauth")
  @HttpCode(200)
  async providerReauth(
    @CurrentUser() u: AuthUser,
    @Param("provider") raw: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    this.input(socialReauthRequestSchema, body);
    const provider = providerOf(raw),
      action = actionSchema.safeParse(body.action);
    if (!action.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "Choose a supported account action",
      );
    const methods = await this.accounts.methods(u.id);
    if (
      !methods.providers.some(
        (p: { provider: string }) => p.provider === provider,
      )
    )
      throw new AppException(
        "FORBIDDEN",
        "Use a connected provider to authenticate",
      );
    const browser = this.browser(req, res),
      family = await this.auth.socialSessionFamily(
        req.cookies?.[REFRESH_COOKIE],
        u.id,
      );
    return {
      url: await this.flow.start(
        provider,
        browser,
        "/settings/security",
        "reauth",
        { owner: u.id, family, action: action.data },
      ),
    };
  }
  @Header("Cache-Control", "no-store")
  @Post("oauth/:provider/unlink")
  @HttpCode(200)
  async unlink(
    @CurrentUser() u: AuthUser,
    @Param("provider") raw: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    this.origin(req);
    this.input(socialProofRequestSchema, body);
    const provider = providerOf(raw);
    await this.flow.proof(
      body.proof,
      this.browser(req),
      u.id,
      req.cookies?.[REFRESH_COOKIE],
      `unlink:${provider}`,
    );
    return this.accounts.unlink(u.id, provider);
  }
  @Header("Cache-Control", "no-store")
  @Post("oauth/password")
  @HttpCode(200)
  async password(
    @CurrentUser() u: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    this.input(socialPasswordRequestSchema, body);
    await this.flow.proof(
      body.proof,
      this.browser(req),
      u.id,
      req.cookies?.[REFRESH_COOKIE],
      "set-password",
    );
    return this.session(
      res,
      await this.accounts.setPassword(u.id, { newPassword: body.newPassword }),
    );
  }
  @Header("Cache-Control", "no-store")
  @Post("oauth/delete")
  @HttpCode(204)
  async remove(
    @CurrentUser() u: AuthUser,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.origin(req);
    this.input(socialDeleteRequestSchema, body);
    const confirmation = z
      .literal("delete my account")
      .safeParse(body.confirmation);
    if (!confirmation.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "Type delete my account to confirm",
      );
    const user = await this.users.findById(u.id);
    if (user?.passwordHash)
      throw new AppException(
        "FORBIDDEN",
        "Use your current password to delete this account",
      );
    await this.flow.proof(
      body.proof,
      this.browser(req),
      u.id,
      req.cookies?.[REFRESH_COOKIE],
      "delete",
    );
    await this.account.deleteAccount(
      u.id,
      { confirmation: confirmation.data },
      u.id,
    );
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }
}
