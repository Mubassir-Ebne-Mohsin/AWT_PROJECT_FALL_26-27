import { graphSchema, type Graph, type Traffic } from "@/common/contracts/phase2/graph.schema";
import { calculate } from "@/modules/simulation/engine/compute";
import { candidateFixes, improves, MAX_CANDIDATES, rank, type Measure } from "@/modules/simulation/engine/fixes";
import { getTemplates } from "@/modules/simulation/engine/templates";

const template = (id: string) => getTemplates().find((t) => t.id === id)!;
const run = (graph: Graph, traffic: Traffic) => (calculate({ kind: "preview", snapshot: { schemaVersion: 1, graph, traffic } }) as { preview: Measure & { bottleneckId: string | null } | null }).preview;
const measureOf = (s: Measure): Measure => ({ verdict: s.verdict, p95: s.p95, errorRate: s.errorRate, maxRho: s.maxRho });
const node = (id: string, type: string, x: number, y: number, props: Record<string, unknown> = {}, label = id) => ({ id, type, label, x, y, props });
const edge = (from: string, to: string) => ({ id: "e_" + from + "_" + to, from, to });
const traffic = (over: Partial<Traffic> = {}): Traffic => ({ preset: "custom", rps: 500, burst: 1.5, readRatio: 0.8, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: "steady", ...over });
/** client -> app -> db, the smallest design whose limit can be the database. */
const dbDesign = (appProps: Record<string, unknown> = { replicas: 20 }, dbProps: Record<string, unknown> = {}): Graph =>
  ({ nodes: [node("c", "client", 0, 0, { region: "us-east" }, "Users"), node("a", "app", 240, 0, { region: "us-east", ...appProps }, "App servers"), node("d", "db", 480, 0, { region: "us-east", ...dbProps }, "Database")], edges: [edge("c", "a"), edge("a", "d")] }) as unknown as Graph;
const measure = (verdict: Measure["verdict"], p95: number, errorRate: number, maxRho = 1): Measure => ({ verdict, p95, errorRate, maxRho });

describe("candidate fixes", () => {
  const mvp = template("mvp");
  const g = mvp.graph as unknown as Graph;
  const appId = g.nodes.find((n) => n.type === "app")!.id;

  it("for a single app server: one more copy, a bigger size, and nothing else", () => {
    const found = candidateFixes(g, mvp.traffic as Traffic, appId);
    expect(found.map((c) => c.kind)).toEqual(["replicas", "capacity"]);
    expect(found[0].title).toMatch(/Add one more copy of .* \(1 to 2\)/);
    expect(found[1].title).toMatch(/bigger size/);
    expect(found[1].assumption).toMatch(/twice the capacity/);
    expect(found[0].assumption).toBeNull();
  });

  it("offers doubling only when there are already two or more copies, and not when it would add the same one", () => {
    const four = candidateFixes(dbDesign({ replicas: 4 }), traffic(), "a");
    expect(four.filter((c) => c.kind === "replicas").map((c) => c.id)).toEqual(["a:replicas:5", "a:replicas:8"]);
    const two = candidateFixes(dbDesign({ replicas: 2 }), traffic(), "a");
    expect(two.filter((c) => c.kind === "replicas").map((c) => c.id)).toEqual(["a:replicas:3", "a:replicas:4"]);
    const one = candidateFixes(dbDesign({ replicas: 1 }), traffic(), "a");
    expect(one.filter((c) => c.kind === "replicas").map((c) => c.id)).toEqual(["a:replicas:2"]);
  });

  it("never goes past the engine's limit of 200 copies", () => {
    const top = candidateFixes(dbDesign({ replicas: 200 }), traffic(), "a");
    expect(top.filter((c) => c.kind === "replicas")).toEqual([]);
    const near = candidateFixes(dbDesign({ replicas: 150 }), traffic(), "a");
    const counts = near.filter((c) => c.kind === "replicas").map((c) => (c.graph.nodes.find((n) => n.id === "a")!.props as { replicas: number }).replicas);
    expect(counts).toEqual([151, 200]);
  });

  it("uses a component's own capacity when it has one, and the catalog's when it does not", () => {
    const own = candidateFixes(dbDesign({ replicas: 3, capacity: 100 }), traffic(), "a").find((c) => c.kind === "capacity")!;
    expect((own.graph.nodes.find((n) => n.id === "a")!.props as { capacity: number }).capacity).toBe(200);
    const catalog = candidateFixes(dbDesign({ replicas: 3 }), traffic(), "a").find((c) => c.kind === "capacity")!;
    expect((catalog.graph.nodes.find((n) => n.id === "a")!.props as { capacity: number }).capacity).toBe(1200);
  });

  it("aims at nothing that is not ours to scale: a client, a third-party API, an unknown component or no component", () => {
    const withExternal = { nodes: [...dbDesign().nodes, node("x", "external", 700, 0, { share: 0.1 }, "Payments")], edges: [...dbDesign().edges, edge("a", "x")] } as unknown as Graph;
    expect(candidateFixes(withExternal, traffic(), "x")).toEqual([]);
    expect(candidateFixes(withExternal, traffic(), "c")).toEqual([]);
    expect(candidateFixes(withExternal, traffic(), "nope")).toEqual([]);
    expect(candidateFixes(withExternal, traffic(), null)).toEqual([]);
  });

  it("never changes the design it was given", () => {
    const before = JSON.stringify(g);
    candidateFixes(g, mvp.traffic as Traffic, appId);
    candidateFixes(dbDesign(), traffic(), "d");
    expect(JSON.stringify(g)).toBe(before);
  });

  it("gives the same list, with the same ids, every time", () => {
    const a = candidateFixes(dbDesign(), traffic(), "d");
    const b = candidateFixes(dbDesign(), traffic(), "d");
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  describe("when the database is the limit", () => {
    it("also offers a cache in front of it and a read replica", () => {
      const kinds = candidateFixes(dbDesign(), traffic({ readRatio: 0.8 }), "d").map((c) => c.kind);
      expect(kinds).toEqual(["replicas", "capacity", "cache", "readReplica"]);
    });
    it("hangs the cache off every app or worker that feeds the database, and keeps the database edges", () => {
      const cache = candidateFixes(dbDesign(), traffic(), "d").find((c) => c.kind === "cache")!;
      const added = cache.graph.nodes.find((n) => n.type === "cache")!;
      expect(added.props).toMatchObject({ hitRatio: 0.8, region: "us-east" });
      expect(cache.graph.edges.filter((e) => e.to === added.id).map((e) => e.from)).toEqual(["a"]);
      expect(cache.graph.edges.some((e) => e.from === "a" && e.to === "d")).toBe(true);
      expect(cache.assumption).toBe("Assumes the cache answers 80% of reads.");
    });
    it("attaches a read replica behind the primary", () => {
      const rep = candidateFixes(dbDesign(), traffic(), "d").find((c) => c.kind === "readReplica")!;
      const added = rep.graph.nodes.find((n) => n.type === "replica")!;
      expect(rep.graph.edges.some((e) => e.from === "d" && e.to === added.id)).toBe(true);
      expect(added.label).toBe("Read replica");
    });
    it("does not offer a second cache, and a cache is no use to a write-heavy design", () => {
      const withCache = { nodes: [...dbDesign().nodes, node("k", "cache", 480, 120, { hitRatio: 0.8 }, "Cache")], edges: [...dbDesign().edges, edge("a", "k")] } as unknown as Graph;
      expect(candidateFixes(withCache, traffic(), "d").map((c) => c.kind)).not.toContain("cache");
      expect(candidateFixes(dbDesign(), traffic({ readRatio: 0.2 }), "d").map((c) => c.kind)).not.toContain("cache");
      expect(candidateFixes(dbDesign(), traffic({ readRatio: 0.2 }), "d").map((c) => c.kind)).not.toContain("readReplica");
    });
    it("needs a mostly-read design for a replica, and stops at five", () => {
      expect(candidateFixes(dbDesign(), traffic({ readRatio: 0.49 }), "d").map((c) => c.kind)).not.toContain("readReplica");
      expect(candidateFixes(dbDesign(), traffic({ readRatio: 0.5 }), "d").map((c) => c.kind)).toContain("readReplica");
      const five = dbDesign();
      for (let i = 0; i < 5; i++) {
        five.nodes.push(node("r" + i, "replica", 700, i * 100, {}, "Read replica") as never);
        five.edges.push(edge("d", "r" + i) as never);
      }
      expect(candidateFixes(five, traffic(), "d").map((c) => c.kind)).not.toContain("readReplica");
    });
    it("does not offer a cache when nothing app-like feeds the database", () => {
      const odd = { nodes: [node("c", "client", 0, 0), node("d", "db", 240, 0)], edges: [edge("c", "d")] } as unknown as Graph;
      expect(candidateFixes(odd, traffic(), "d").map((c) => c.kind)).not.toContain("cache");
      expect(candidateFixes(odd, traffic(), "d").map((c) => c.kind)).toContain("readReplica");
    });
    it("moves a new component off a spot that is already taken, instead of stacking it on top", () => {
      // The cache would go to (480, -110) and the replica to (720, 0): put something on both.
      const crowded = { nodes: [...dbDesign().nodes, node("x1", "lb", 480, -110, {}, "Taken 1"), node("x2", "queue", 720, 0, {}, "Taken 2")], edges: dbDesign().edges } as unknown as Graph;
      const found = candidateFixes(crowded, traffic(), "d");
      const cache = found.find((c) => c.kind === "cache")!.graph.nodes.find((n) => n.type === "cache")!;
      const replica = found.find((c) => c.kind === "readReplica")!.graph.nodes.find((n) => n.type === "replica")!;
      expect([cache.x, cache.y]).not.toEqual([480, -110]);
      expect([replica.x, replica.y]).not.toEqual([720, 0]);
      for (const c of found) {
        const nodes = c.graph.nodes;
        for (const a of nodes) for (const b of nodes) if (a.id < b.id) expect(Math.abs(a.x - b.x) < 200 && Math.abs(a.y - b.y) < 80).toBe(false);
      }
    });
    it("puts a new component where it does not sit on another", () => {
      for (const c of candidateFixes(dbDesign(), traffic(), "d")) {
        const nodes = c.graph.nodes;
        for (const a of nodes) for (const b of nodes) if (a.id < b.id) expect(Math.abs(a.x - b.x) < 200 && Math.abs(a.y - b.y) < 80).toBe(false);
      }
    });
  });

  it("only ever produces designs the application's own schema and engine accept, with unique ids", () => {
    for (const t of getTemplates()) {
      const tg = t.graph as unknown as Graph;
      for (const n of tg.nodes) {
        for (const c of candidateFixes(tg, { ...(t.traffic as Traffic), readRatio: 0.9 }, n.id)) {
          expect(graphSchema.safeParse(c.graph).success).toBe(true);
          const ids = [...c.graph.nodes.map((x) => x.id), ...c.graph.edges.map((x) => x.id)];
          expect(new Set(ids).size).toBe(ids.length);
          expect(run(c.graph, t.traffic as Traffic)).not.toBeNull();
        }
      }
    }
  });
});

describe("what counts as an improvement", () => {
  const before = measure("fail", 1000, 0.3);
  it("accepts a better verdict, even with a slightly different p95 or error rate that is not worse", () => {
    expect(improves(before, measure("strained", 900, 0.2))).toBe(true);
    expect(improves(before, measure("pass", 50, 0))).toBe(true);
  });
  it("accepts a clearly lower p95 or error rate at the same verdict", () => {
    expect(improves(before, measure("fail", 980, 0.3))).toBe(true);
    expect(improves(before, measure("fail", 1000, 0.29))).toBe(true);
  });
  it("refuses a fix that changes nothing, or less than the engine's noise floor", () => {
    expect(improves(before, measure("fail", 1000, 0.3))).toBe(false);
    expect(improves(before, measure("fail", 995, 0.3))).toBe(false);
    expect(improves(before, measure("fail", 1000, 0.2996))).toBe(false);
  });
  it("refuses a fix that makes any of the three worse, even if another improves", () => {
    expect(improves(before, measure("fail", 500, 0.31))).toBe(false);
    expect(improves(before, measure("fail", 1100, 0.1))).toBe(false);
    expect(improves(before, measure("fail", 900, 0.3000001))).toBe(false);
    expect(improves(measure("strained", 200, 0), measure("fail", 100, 0))).toBe(false);
    expect(improves(measure("pass", 100, 0), measure("pass", 100, 0))).toBe(false);
  });
});

describe("ranking", () => {
  const item = (id: string, after: Measure, effort = 1) => ({ id, after, effort });
  it("puts a better verdict first, then fewer errors, then lower p95, then the lighter fix, then the id", () => {
    const ranked = rank([
      item("e", measure("fail", 100, 0.1, 1), 1),
      item("d", measure("strained", 200, 0.05), 1),
      item("c", measure("strained", 100, 0.05), 5),
      item("b", measure("strained", 100, 0.05), 2),
      item("a", measure("pass", 900, 0), 9),
      item("b2", measure("strained", 100, 0.05), 2),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b", "b2", "c", "d", "e"]);
  });
  it("does not change the list it was given", () => {
    const list = [item("z", measure("fail", 1, 1)), item("a", measure("pass", 1, 0))];
    rank(list);
    expect(list.map((x) => x.id)).toEqual(["z", "a"]);
  });
  it("treats error rates closer than a hundredth of a percent as equal, so p95 decides", () => {
    expect(rank([item("x", measure("fail", 500, 0.10004)), item("y", measure("fail", 400, 0.10001))]).map((r) => r.id)).toEqual(["y", "x"]);
  });
});

describe("with the real engine", () => {
  it("a database-limited design gets a cache and a replica that the engine says help, with numbers that repeat exactly", () => {
    const t = traffic({ rps: 4000, readRatio: 0.9 });
    const g = dbDesign({ replicas: 20 });
    const base = run(g, t)!;
    expect(base.verdict).not.toBe("pass");
    expect(base.bottleneckId).toBe("d");
    const fixes = candidateFixes(g, t, "d");
    const results = fixes.map((c) => ({ kind: c.kind, after: run(c.graph, t)! }));
    const helped = results.filter((r) => improves(measureOf(base), measureOf(r.after))).map((r) => r.kind);
    expect(helped).toEqual(expect.arrayContaining(["cache", "readReplica"]));
    for (const c of fixes) expect(JSON.stringify(run(c.graph, t))).toBe(JSON.stringify(run(c.graph, t)));
  });

  it("every template under heavy load: any fix the engine says helps is never worse on any measure", () => {
    let helpedSomewhere = 0;
    for (const tpl of getTemplates()) {
      const t = { ...(tpl.traffic as Traffic), rps: Math.round(tpl.traffic.rps * 4) };
      const tg = tpl.graph as unknown as Graph;
      const base = run(tg, t)!;
      if (base.verdict === "pass") continue;
      for (const c of candidateFixes(tg, t, base.bottleneckId)) {
        const after = run(c.graph, t)!;
        if (!improves(measureOf(base), measureOf(after))) continue;
        helpedSomewhere++;
        expect(after.p95).toBeLessThanOrEqual(base.p95 * 1.001);
        expect(after.errorRate).toBeLessThanOrEqual(base.errorRate + 1e-9);
      }
    }
    expect(helpedSomewhere).toBeGreaterThan(5);
  });
});
