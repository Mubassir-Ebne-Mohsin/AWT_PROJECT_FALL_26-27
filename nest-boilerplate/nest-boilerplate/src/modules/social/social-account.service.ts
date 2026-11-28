import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import * as argon2 from "argon2";
import { appConfig } from "@/config";
import { AppException } from "@/common/errors";
import { newPasswordSchema } from "@/common/contracts/phase3/account.schema";
import { AuthService } from "@/modules/auth/auth.service";
import { TokenStore } from "@/modules/auth/token-store.service";
import { UsersService } from "@/modules/users/users.service";
import { Provider, SocialAction } from "@/modules/social/social.types";
import { SocialFlowService, Proof } from "@/modules/social/social-flow.service";
import { digest } from "@/modules/social/social-store";
import { z } from "zod";
@Injectable()
export class SocialAccountService {
  constructor(
    private readonly db: DataSource,
    private readonly users: UsersService,
    private readonly flow: SocialFlowService,
    private readonly auth: AuthService,
    private readonly tokens: TokenStore,
  ) {}
  async methods(owner: string) {
    const u = await this.users.findById(owner);
    this.flow.active(u);
    const rows = await this.db.query(
      "SELECT provider,linked_at,last_used_at FROM external_identities WHERE user_id=$1 ORDER BY provider",
      [owner],
    );
    return {
      hasPassword: !!u!.passwordHash,
      available: {
        google: this.flow.provider.enabled("google"),
        github: this.flow.provider.enabled("github"),
      },
      providers: rows.map(
        (r: { provider: Provider; linked_at: Date; last_used_at: Date }) => ({
          provider: r.provider,
          enabled: this.flow.provider.enabled(r.provider),
          linkedAt: new Date(r.linked_at).toISOString(),
          lastUsedAt: new Date(r.last_used_at).toISOString(),
        }),
      ),
    };
  }
  async passwordProof(
    owner: string,
    family: string,
    browser: string,
    action: SocialAction,
    password: unknown,
  ) {
    const user = await this.users.findById(owner);
    this.flow.active(user);
    if (
      typeof password !== "string" ||
      password.length > 128 ||
      !user!.passwordHash ||
      !(await argon2.verify(user!.passwordHash, password))
    )
      throw new AppException("FORBIDDEN", "Incorrect password");
    return this.flow.store.put(
      "proof",
      { owner, family, binding: digest(browser), action } satisfies Proof,
      300,
    );
  }
  async unlink(owner: string, provider: Provider) {
    return this.db.transaction(async (m) => {
      const [u] = await m.query(
        "SELECT password_hash,account_status FROM users WHERE id=$1 FOR UPDATE",
        [owner],
      );
      if (u?.account_status !== "active")
        throw new AppException("FORBIDDEN", "This account is unavailable");
      const methods: { provider: Provider }[] = await m.query(
        "SELECT provider FROM external_identities WHERE user_id=$1",
        [owner],
      );
      if (!methods.some((p) => p.provider === provider))
        throw new AppException("NOT_FOUND", "This provider is not connected");
      if (
        !u.password_hash &&
        !methods.some(
          (p) =>
            p.provider !== provider && this.flow.provider.enabled(p.provider),
        )
      )
        throw new AppException(
          "CONFLICT",
          "Add a password or another usable provider before disconnecting your last sign-in method",
        );
      await m.query(
        "DELETE FROM external_identities WHERE user_id=$1 AND provider=$2",
        [owner, provider],
      );
      return { disconnected: true };
    });
  }
  async setPassword(owner: string, raw: unknown) {
    const parsed = z
      .strictObject({ newPassword: newPasswordSchema })
      .safeParse(raw);
    if (!parsed.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "Use the existing password strength rules",
      );
    const hash = await argon2.hash(parsed.data.newPassword),
      now = new Date();
    await this.db.transaction(async (m) => {
      const [u] = await m.query(
        "SELECT password_hash,account_status FROM users WHERE id=$1 FOR UPDATE",
        [owner],
      );
      if (u?.account_status !== "active")
        throw new AppException("FORBIDDEN", "This account is unavailable");
      if (u.password_hash)
        throw new AppException(
          "CONFLICT",
          "Use Change password for an existing password",
        );
      await m.query(
        "UPDATE users SET password_hash=$2,sessions_revoked_at=$3,updated_at=now() WHERE id=$1",
        [owner, hash, now],
      );
    });
    await this.tokens.endSessions(
      owner,
      Math.floor(now.getTime() / 1000),
      appConfig.env.JWT_ACCESS_TTL_SECONDS,
    );
    return this.auth.issue(
      (await this.users.findById(owner))!,
      crypto.randomUUID(),
    );
  }
}
