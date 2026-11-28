import { TokenStore } from "@/modules/auth/token-store.service";
import { FakeRedisCacheService } from "../../../test/fake-redis";
describe("H2 monotonic revocation marker", () => {
  it("cannot move a cutoff backwards or shorten its remaining lifetime", async () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(200000);
    try {
      const store = new TokenStore(new FakeRedisCacheService() as never);
      await store.endSessions("owner", 200, 60);
      await store.endSessions("owner", 100, 5);
      expect(await store.sessionsEndedAt("owner")).toBe(200);
      clock.mockReturnValue(206000);
      expect(await store.sessionsEndedAt("owner")).toBe(200);
    } finally { clock.mockRestore(); }
  });
});
