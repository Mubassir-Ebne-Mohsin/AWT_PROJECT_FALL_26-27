import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService, TokenExpiredError } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { appConfig } from "@/config";
import { AppException } from "@/common/errors";
import { User } from "@/modules/users/entities/user.entity";
import { UsersService } from "@/modules/users/users.service";
import { TokenStore } from "@/modules/auth/token-store.service";
import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "@/modules/auth/auth.types";
import { LoginDto, RegisterDto } from "@/modules/auth/dto/auth.dto";

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  user: User;
}

const { env } = appConfig;

// Verified when the email is unknown so both failure paths cost the same time
// and return the same message (no account enumeration through login).
const DUMMY_HASH_PROMISE = argon2.hash("not-a-real-password");
const BAD_CREDENTIALS = "Incorrect email or password";

const secondsLeft = (exp: number) => exp - Math.floor(Date.now() / 1000);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly tokens: TokenStore,
  ) {}

  async register(dto: RegisterDto): Promise<IssuedSession> {
    if (await this.users.findByEmail(dto.email)) {
      throw new AppException("VALIDATION_FAILED", "Validation failed", {
        fields: [
          { path: "email", message: "This email is already registered" },
        ],
      });
    }
    const user = await this.users.create({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash: await argon2.hash(dto.password),
    });
    return this.issue(user, randomUUID());
  }

  async login(dto: LoginDto): Promise<IssuedSession> {
    const user = await this.users.findByEmail(dto.email);
    const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const ok = await argon2.verify(hash, dto.password);
    if (!user || !ok)
      throw new AppException("UNAUTHENTICATED", BAD_CREDENTIALS);
    return this.issue(user, randomUUID());
  }

  /** Rotates the refresh token: the presented one is spent and a new pair is issued. */
  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) {
      throw new AppException("UNAUTHENTICATED", "You are not signed in");
    }
    const payload = await this.verifyRefresh(refreshToken);
    const ttl = secondsLeft(payload.exp);

    if (await this.tokens.isFamilyRevoked(payload.fam)) {
      throw new AppException("SESSION_EXPIRED", "Your session has expired");
    }
    if (!(await this.tokens.consumeRefresh(payload.jti, ttl))) {
      // A spent token came back: assume it was stolen and kill the whole chain.
      await this.tokens.revokeFamily(payload.fam, ttl);
      throw new AppException("SESSION_EXPIRED", "Your session has expired");
    }

    const user = await this.users.findById(payload.sub);
    if (!user)
      throw new AppException("UNAUTHENTICATED", "You are not signed in");
    return this.issue(user, payload.fam, payload.exp);
  }

  /** Invalid credentials are harmless; failed revocation writes must remain retryable. */
  async logout(refreshToken?: string, accessToken?: string): Promise<void> {
    let refresh: RefreshTokenPayload | undefined;
    let access: AccessTokenPayload | undefined;
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
          refreshToken,
          {
            secret: env.JWT_REFRESH_SECRET,
          },
        );
        if (payload.typ === "refresh") refresh = payload;
      } catch {
        /* An expired or malformed token has nothing left to revoke. */
      }
    }
    if (accessToken) {
      try {
        const payload =
          await this.jwt.verifyAsync<AccessTokenPayload>(accessToken);
        if (payload.typ === "access") access = payload;
      } catch {
        /* Already expired or invalid. */
      }
    }
    try {
      await Promise.all([
        refresh &&
          this.tokens.revokeFamily(refresh.fam, secondsLeft(refresh.exp)),
        access && this.tokens.revokeAccess(access.jti, secondsLeft(access.exp)),
      ]);
    } catch {
      throw new AppException(
        "UNAVAILABLE",
        "Sign out could not be confirmed. Please retry.",
      );
    }
  }

  private async verifyRefresh(token: string): Promise<RefreshTokenPayload> {
    try {
      const p = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: env.JWT_REFRESH_SECRET,
      });
      if (
        p.typ !== "refresh" ||
        p.ver !== 1 ||
        !p.sub ||
        !p.jti ||
        !p.fam ||
        !Number.isFinite(p.exp)
      ) {
        throw new Error("Invalid refresh claims");
      }
      return p;
    } catch (e) {
      if (e instanceof TokenExpiredError) {
        throw new AppException("SESSION_EXPIRED", "Your session has expired");
      }
      throw new AppException("UNAUTHENTICATED", "Invalid refresh token");
    }
  }

  private async issue(
    user: User,
    family: string,
    // A family has an absolute lifetime. Rotation changes ids, never its deadline,
    // so no descendant can outlive a replay/logout revocation marker.
    refreshExpiresAt = Math.floor(Date.now() / 1000) +
      env.JWT_REFRESH_TTL_SECONDS,
  ): Promise<IssuedSession> {
    const accessPayload: Omit<AccessTokenPayload, "exp"> = {
      typ: "access",
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
    };
    const refreshPayload: RefreshTokenPayload = {
      ver: 1,
      typ: "refresh",
      sub: user.id,
      jti: randomUUID(),
      fam: family,
      exp: refreshExpiresAt,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: env.JWT_REFRESH_SECRET,
      }),
    ]);
    return {
      accessToken,
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      refreshToken,
      refreshExpiresIn: Math.max(0, secondsLeft(refreshExpiresAt)),
      user,
    };
  }
}
