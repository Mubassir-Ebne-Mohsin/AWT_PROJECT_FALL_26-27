import { seedDemoChallenges } from "@/modules/challenges/demo-challenges";
import { challengeBaselineSchema } from "@/common/contracts/phase3/challenges.schema";
describe("R5.2 dev-only starter challenges", () => {
  it("refuses production before touching the database", async () => {
    const db = { query: jest.fn() };
    await expect(seedDemoChallenges(db as never, true)).rejects.toThrow(
      /production/,
    );
    expect(db.query).not.toHaveBeenCalled();
  });
  it("measures four valid starts and does not replace existing challenges", async () => {
    const saved = new Map<string, string>();
    const inserts: unknown[][] = [];
    const manager = {
      query: jest.fn(async (sql: string, args: unknown[] = []) => {
        if (sql.startsWith("SELECT instructor_id"))
          return saved.has(String(args[0]))
            ? [{ instructor_id: saved.get(String(args[0])) }]
            : [];
        if (sql.startsWith("INSERT")) {
          saved.set(String(args[0]), String(args[1]));
          inserts.push(args);
        }
        return [];
      }),
    };
    const db = {
      query: jest.fn(async () => [{ id: "teacher" }]),
      transaction: async (fn: (m: typeof manager) => unknown) => fn(manager),
    };
    expect(await seedDemoChallenges(db as never, false)).toBe(4);
    expect(inserts).toHaveLength(4);
    for (const a of inserts)
      expect(() =>
        challengeBaselineSchema.parse(JSON.parse(String(a[7]))),
      ).not.toThrow();
    const graph = JSON.parse(String(inserts[2][6]));
    expect(
      graph.nodes.find((n: { type: string }) => n.type === "app").props.region,
    ).toBe("eu-west");
    await seedDemoChallenges(db as never, false);
    expect(inserts).toHaveLength(4);
  });
});
