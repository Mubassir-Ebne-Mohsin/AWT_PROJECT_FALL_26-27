import { AccountRolesService, OPERATOR } from "@/modules/roles/account-roles.service";
import { TokenStore } from "@/modules/auth/token-store.service";
import { FakeRedisCacheService } from "../../../test/fake-redis";
import { DataSource } from "typeorm";

describe("H2 restored accounts do not revive old access sessions", () => {
  it("stores the persistent cutoff before clearing the suspension marker, including retries", async () => {
    const id = "70000000-0000-4000-8000-000000000001";
    const cutoff = new Date();
    const user = { id, email: "restore@example.test", accountStatus: "active", sessionsRevokedAt: cutoff };
    const manager = { query: async () => [], findOneBy: async () => user };
    const db = { transaction: async (fn: (m: unknown) => unknown) => fn(manager) } as unknown as DataSource;
    const tokens = new TokenStore(new FakeRedisCacheService() as never);
    await tokens.blockUser(id, 60);
    await new AccountRolesService(db, tokens).restore(OPERATOR, id);
    expect(await tokens.isUserBlocked(id)).toBe(false);
    expect(await tokens.sessionsEndedAt(id)).toBe(Math.floor(cutoff.getTime()/1000));
  });
});
