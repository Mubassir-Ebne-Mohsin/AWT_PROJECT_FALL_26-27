import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { appConfig } from "@/config";
import { Role } from "@/common/enums/role.enum";
import { AppException } from "@/common/errors";
import { AuthService } from "@/modules/auth/auth.service";
import { TokenStore } from "@/modules/auth/token-store.service";
import { User } from "@/modules/users/entities/user.entity";
import { UsersService } from "@/modules/users/users.service";
import { FakeRedisCacheService } from "../../../test/fake-redis";

const { env } = appConfig;

describe("AuthService", () => {
  let users: Map<string, User>;
  let service: AuthService;
  let jwt: JwtService;

  const usersStub = {
    findByEmail: async (email: string) =>
      [...users.values()].find((u) => u.email === email.toLowerCase()) ?? null,
    findById: async (id: string) => users.get(id) ?? null,
    create: async (input: Partial<User>) => {
      const u = {
        id: `id-${users.size + 1}`,
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...input,
        email: input.email!.toLowerCase(),
      } as User;
      users.set(u.id, u);
      return u;
    },
  } as unknown as UsersService;

  const register = (email = "Ada@Example.com", password = "pass-word-1") =>
    service.register({ email, password, displayName: "Ada" });

  beforeEach(() => {
    users = new Map();
    jwt = new JwtService({ secret: env.JWT_ACCESS_SECRET });
    const tokens = new TokenStore(new FakeRedisCacheService() as any);
    service = new AuthService(usersStub, jwt, tokens);
  });

  describe("password hashing", () => {
    it("stores an argon2 hash, never the plain password", async () => {
      const { user } = await register(undefined, "pass-word-1");
      expect(user.passwordHash).not.toContain("pass-word-1");
      expect(user.passwordHash.startsWith("$argon2")).toBe(true);
      expect(await argon2.verify(user.passwordHash, "pass-word-1")).toBe(true);
    });

    it("rejects a duplicate email regardless of case", async () => {
      await register("ada@example.com");
      await expect(register("ADA@example.com")).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
    });
  });

  describe("login", () => {
    it("accepts the right password", async () => {
      await register("ada@example.com", "pass-word-1");
      const s = await service.login({
        email: "ada@example.com",
        password: "pass-word-1",
      });
      expect(s.accessToken).toEqual(expect.any(String));
    });

    it("fails identically for a wrong password and an unknown email", async () => {
      await register("ada@example.com", "pass-word-1");
      const wrong = await service
        .login({ email: "ada@example.com", password: "nope-nope-1" })
        .catch((e) => e);
      const unknown = await service
        .login({ email: "who@example.com", password: "nope-nope-1" })
        .catch((e) => e);
      expect(wrong).toBeInstanceOf(AppException);
      expect(unknown).toBeInstanceOf(AppException);
      expect(wrong.message).toBe(unknown.message);
      expect(wrong.code).toBe(unknown.code);
    });
  });

  describe("token rotation", () => {
    it("issues a new refresh token on every refresh", async () => {
      const first = await register();
      const second = await service.refresh(first.refreshToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);
      const a = jwt.decode(first.refreshToken);
      const b = jwt.decode(second.refreshToken);
      expect(b.jti).not.toBe(a.jti);
      expect(b.fam).toBe(a.fam);
    });

    it("rejects a spent refresh token and revokes the whole family", async () => {
      const first = await register();
      const second = await service.refresh(first.refreshToken);

      await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({
        code: "SESSION_EXPIRED",
      });
      // The token legitimately issued by the rotation is now dead too.
      await expect(service.refresh(second.refreshToken)).rejects.toMatchObject({
        code: "SESSION_EXPIRED",
      });
    });

    it("rejects a refresh token signed with the access secret", async () => {
      const { user } = await register();
      const forged = await jwt.signAsync(
        { typ: "refresh", sub: user.id, jti: "x", fam: "y" },
        { expiresIn: 60 },
      );
      await expect(service.refresh(forged)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("rejects an access token presented as a refresh token", async () => {
      const s = await register();
      await expect(service.refresh(s.accessToken)).rejects.toBeInstanceOf(
        AppException,
      );
    });

    it("requires a refresh token", async () => {
      await expect(service.refresh(undefined)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });
  });

  describe("logout", () => {
    it("revokes the refresh family so it cannot be refreshed", async () => {
      const s = await register();
      await service.logout(s.refreshToken, s.accessToken);
      await expect(service.refresh(s.refreshToken)).rejects.toMatchObject({
        code: "SESSION_EXPIRED",
      });
    });

    it("never throws on junk tokens", async () => {
      await expect(service.logout("junk", "junk")).resolves.toBeUndefined();
    });
  });
});
