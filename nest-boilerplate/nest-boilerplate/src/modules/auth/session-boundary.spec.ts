import { JwtService } from "@nestjs/jwt";
import { appConfig } from "@/config";
import { Role } from "@/common/enums/role.enum";
import { AuthService } from "@/modules/auth/auth.service";
import { UsersService } from "@/modules/users/users.service";
import { User } from "@/modules/users/entities/user.entity";
import { TokenStore } from "@/modules/auth/token-store.service";
import { FakeRedisCacheService } from "../../../test/fake-redis";

describe("H2 same-second session revocation", () => {
  afterEach(() => jest.useRealTimers());
  it("waits for the cutoff boundary instead of minting future tokens, then a later cutoff ends them", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    const start = Math.floor(Date.now() / 1000) * 1000 + 100;
    jest.setSystemTime(start);
    const user = { id: "h2-user", email: "h2@example.test", role: Role.USER,
      accountStatus: "active", sessionsRevokedAt: new Date(start) } as User;
    const users = { findById: async () => user } as unknown as UsersService;
    const jwt = new JwtService({ secret: appConfig.env.JWT_ACCESS_SECRET });
    const auth = new AuthService(users, jwt, new TokenStore(new FakeRedisCacheService() as never));
    let resolved = false;
    const issuing = auth.issue(user, "h2-family").then(s => { resolved = true; return s; });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(resolved).toBe(false);
    await jest.advanceTimersByTimeAsync(901);
    const session = await issuing;
    expect(jwt.decode(session.accessToken).iat).toBeLessThanOrEqual(Math.floor(Date.now()/1000));
    user.sessionsRevokedAt = new Date(Date.now());
    await expect(auth.refresh(session.refreshToken)).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });
  it("refuses large server clock skew instead of issuing arbitrarily future-dated credentials", async () => {
    const user = { id: "h2-skew", sessionsRevokedAt: new Date(Date.now()+60000) } as User;
    const auth = new AuthService({} as UsersService, new JwtService({ secret: appConfig.env.JWT_ACCESS_SECRET }), {} as TokenStore);
    await expect(auth.issue(user, "h2-family")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
