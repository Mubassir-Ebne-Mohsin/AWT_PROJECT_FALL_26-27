import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiExtraModels, ApiTags } from "@nestjs/swagger";
import { ErrorResponseDto } from "@/common/swagger/error-response.dto";
import { Throttle } from "@nestjs/throttler";
import type { CookieOptions, Request, Response } from "express";
import { appConfig } from "@/config";
import { CurrentUser, Public } from "@/common/decorators";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { AppException } from "@/common/errors";
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
} from "@/common/swagger/api-envelope";
import { AuthService, IssuedSession } from "@/modules/auth/auth.service";
import {
  AuthSessionDto,
  LoginDto,
  RegisterDto,
} from "@/modules/auth/dto/auth.dto";
import { UserDto } from "@/modules/users/dto/user.dto";
import { UsersService } from "@/modules/users/users.service";

const { env } = appConfig;

export const REFRESH_COOKIE = "sf_refresh";
const AUTH_PATH = "/v1/auth";

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: "lax",
  secure: env.IS_PRODUCTION,
  // Only sent to the auth routes, never to the rest of the API.
  path: AUTH_PATH,
});

const authLimit = {
  default: { limit: env.AUTH_THROTTLE_LIMIT, ttl: 60_000 },
};

@ApiTags("auth")
// Registered once so the generated client has a type for every error body.
@ApiExtraModels(ErrorResponseDto)
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Throttle(authLimit)
  @Post("register")
  @ApiCreatedEnvelope(AuthSessionDto)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.register(dto));
  }

  @Public()
  @Throttle(authLimit)
  @Post("login")
  @HttpCode(200)
  @ApiOkEnvelope(AuthSessionDto)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(dto));
  }

  @Public()
  @Throttle(authLimit)
  @Post("refresh")
  @HttpCode(200)
  @ApiOkEnvelope(AuthSessionDto)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return this.respond(
        res,
        await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]),
      );
    } catch (e) {
      // A dead refresh token is useless; stop the browser from resending it.
      if (
        e instanceof AppException &&
        ["UNAUTHENTICATED", "SESSION_EXPIRED"].includes(e.code)
      ) {
        res.clearCookie(REFRESH_COOKIE, cookieOptions());
      }
      throw e;
    }
  }

  // Public so a user whose access token already expired can still sign out.
  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const bearer = (req.headers.authorization ?? "").split(" ")[1];
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], bearer);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOkEnvelope(UserDto)
  async me(@CurrentUser() current: AuthUser): Promise<UserDto> {
    const user = await this.users.findById(current.id);
    if (!user)
      throw new AppException("UNAUTHENTICATED", "You are not signed in");
    return this.users.toDto(user);
  }

  private respond(res: Response, session: IssuedSession) {
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
}
