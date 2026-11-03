import { allowedCandidates, FIX_KINDS, FIX_PREFERENCES, rank, rankFor, type FixKind, type Measure } from "@/modules/simulation/engine/fixes";
import { fixFilterSchema } from "@/common/contracts/phase3/fixes.schema";

const m = (verdict: Measure["verdict"], p95: number, errorRate: number): Measure => ({ verdict, p95, errorRate, maxRho: 1 });
const item = (id: string, after: Measure, effort: number) => ({ id, after, effort });

describe("what a person may ask of the fixes", () => {
  it("leaves out exactly the excluded kinds and keeps the order of the rest", () => {
    const all = [{ kind: "replicas" }, { kind: "capacity" }, { kind: "cache" }, { kind: "readReplica" }, { kind: "replicas" }] as { kind: FixKind }[];
    expect(allowedCandidates(all, { exclude: [], preference: "default" })).toEqual(all);
    expect(allowedCandidates(all, { exclude: ["replicas"], preference: "default" }).map((c) => c.kind)).toEqual(["capacity", "cache", "readReplica"]);
    expect(allowedCandidates(all, { exclude: ["cache", "readReplica"], preference: "default" }).map((c) => c.kind)).toEqual(["replicas", "capacity", "replicas"]);
    expect(allowedCandidates(all, { exclude: [...FIX_KINDS], preference: "default" })).toEqual([]);
  });

  it("does not change the list it is given", () => {
    const all = [{ kind: "cache" }, { kind: "replicas" }] as { kind: FixKind }[];
    allowedCandidates(all, { exclude: ["cache"], preference: "default" });
    expect(all).toHaveLength(2);
  });

  // a: best verdict, most effort. b: middle. c: lowest p95 but fails. d: fewest errors but slower.
  const items = [item("a", m("strained", 300, 0.02), 5), item("b", m("fail", 500, 0.05), 1), item("c", m("fail", 200, 0.2), 3), item("d", m("fail", 900, 0.01), 2)];

  it("'default' is the ordinary ranking, unchanged", () => {
    expect(rankFor(items, "default").map((x) => x.id)).toEqual(rank(items).map((x) => x.id));
    expect(rankFor(items, "default")[0].id).toBe("a");
  });
  it("'simplest' puts the lightest change first, whatever it achieves", () => {
    expect(rankFor(items, "simplest").map((x) => x.id)).toEqual(["b", "d", "c", "a"]);
  });
  it("'lowest_latency' puts the lowest p95 first, even if the design still fails", () => {
    expect(rankFor(items, "lowest_latency").map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
  });
  it("'fewest_errors' puts the lowest error rate first", () => {
    expect(rankFor(items, "fewest_errors").map((x) => x.id)).toEqual(["d", "a", "b", "c"]);
  });
  it("breaks every tie the same way, by id, and never changes the list it is given", () => {
    const tied = [item("z", m("fail", 100, 0.1), 1), item("y", m("fail", 100, 0.1), 1)];
    for (const p of FIX_PREFERENCES) expect(rankFor(tied, p).map((x) => x.id)).toEqual(["y", "z"]);
    expect(tied.map((x) => x.id)).toEqual(["z", "y"]);
  });
  it("rounds error rates to a basis point before comparing, so noise does not reorder", () => {
    // p has the lower raw error rate but the higher p95. Within a basis point the error rates tie, so p95 decides: q first.
    const close = [item("p", m("fail", 500, 0.10001), 3), item("q", m("fail", 400, 0.10004), 3)];
    expect(rankFor(close, "fewest_errors").map((x) => x.id)).toEqual(["q", "p"]);
  });
});

describe("the contract and the engine use the same words", () => {
  it("the contract accepts every kind and every preference the engine knows, and nothing else", () => {
    for (const p of FIX_PREFERENCES) expect(fixFilterSchema.safeParse({ exclude: [...FIX_KINDS], preference: p }).success).toBe(true);
    expect(fixFilterSchema.safeParse({ exclude: ["bigger"], preference: "default" }).success).toBe(false);
    expect(fixFilterSchema.safeParse({ exclude: [], preference: "cheapest" }).success).toBe(false);
    expect(fixFilterSchema.safeParse({ exclude: [], preference: "default", extra: 1 }).success).toBe(false);
    expect(fixFilterSchema.safeParse({ exclude: [], preference: "default" }).success).toBe(true);
  });
});
