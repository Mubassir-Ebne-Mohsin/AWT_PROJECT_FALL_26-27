import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLearnFixtures, fixturesMatch } from "@/src/script/learn-fixtures";

const file = resolve(__dirname, "../../../../../docs/contracts/learn-fixtures.json");

describe("P2 Learn fixtures follow the real simulator", () => {
  it("the stored fixtures are what the engine produces now, to within a last-digit tolerance (run `pnpm fixtures:learn` after a model change)", () => {
    expect(fixturesMatch(JSON.parse(readFileSync(file, "utf8")), buildLearnFixtures())).toBe(true);
  });

  it("the comparison itself notices a real change and ignores only a last-digit one", () => {
    expect(fixturesMatch({ a: [1, 2.0000000000000004] }, { a: [1, 2] })).toBe(true);
    expect(fixturesMatch({ a: 1 }, { a: 1.001 })).toBe(false);
    expect(fixturesMatch({ a: 1 }, { b: 1 })).toBe(false);
    expect(fixturesMatch([1, 2], [1])).toBe(false);
    expect(fixturesMatch({ s: "ok" }, { s: "fail" })).toBe(false);
  });

  it("covers every demo with real, finite, engine-made numbers", () => {
    const f = buildLearnFixtures();
    expect(Object.keys(f.cases).sort()).toEqual(["caching", "cdn", "loadBalancing", "percentiles", "queues", "regions", "replicas", "utilization"]);
    for (const [name, list] of Object.entries(f.cases) as Array<[string, unknown[]]>) {
      expect(list.length).toBeGreaterThanOrEqual(6);
      const finite = JSON.stringify(list, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? "NOT FINITE" : v));
      expect({ name, ok: !finite.includes("NOT FINITE") }).toEqual({ name, ok: true });
    }
  });

  it("holds the constants the lessons quote", () => {
    const { constants } = buildLearnFixtures();
    expect(constants).toMatchObject({ statusOk: 0.75, statusFail: 1, replicationCost: 0.25, burstSeconds: 60, rtt: { "us-east|eu-west": 75, "us-east|ap-south": 190, "eu-west|ap-south": 115 } });
  });
});
