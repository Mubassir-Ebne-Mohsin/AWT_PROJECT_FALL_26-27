import { JwtService } from "@nestjs/jwt";
import { appConfig } from "@/config";
import { Role } from "@/common/enums/role.enum";
import { AuthService } from "@/modules/auth/auth.service";
import { TokenStore } from "@/modules/auth/token-store.service";
import { UsersService } from "@/modules/users/users.service";
import { User } from "@/modules/users/entities/user.entity";

describe("M9 refresh recovery", () => {
  it("keeps the same refresh credential usable after a failed user lookup, then still rejects replay", async () => {
    const spent = new Set<string>(),
      revoked = new Set<string>();
    const tokens = {
      isFamilyRevoked: async (id: string) => revoked.has(id),
      consumeRefresh: async (id: string) => {
        if (spent.has(id)) return false;
        spent.add(id);
        return true;
      },
      revokeFamily: async (id: string) => {
        revoked.add(id);
      },
    } as unknown as TokenStore;
    const user = {
      id: "audit-user",
      email: "audit@example.test",
      role: Role.USER,
    } as User;
    let down = true;
    const users = {
      findById: async () => {
        if (down) throw new Error("Audit database unavailable");
        return user;
      },
    } as unknown as UsersService;
    const jwt = new JwtService({ secret: appConfig.env.JWT_ACCESS_SECRET });
    const service = new AuthService(users, jwt, tokens);
    const cookie = await jwt.signAsync(
      { ver: 1, typ: "refresh", sub: user.id, fam: "family", jti: "original" },
      { secret: appConfig.env.JWT_REFRESH_SECRET, expiresIn: 3600 },
    );
    await expect(service.refresh(cookie)).rejects.toThrow(
      "Audit database unavailable",
    );
    down = false;
    const rotated = await service.refresh(cookie);
    expect(rotated.user.id).toBe(user.id);
    await expect(service.refresh(cookie)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    await expect(service.refresh(rotated.refreshToken)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
});
