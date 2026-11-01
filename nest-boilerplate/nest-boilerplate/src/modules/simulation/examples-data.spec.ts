import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildExamplesData } from "@/src/script/examples-data";
import { fixturesMatch } from "@/src/script/learn-fixtures";
import { getCatalog, getTemplates } from "@/modules/simulation/engine/templates";

const file = resolve(__dirname, "../../../../../web/src/lib/examples-data.json");
const stored = () => JSON.parse(readFileSync(file, "utf8"));

describe("P3 examples data follows the real engine", () => {
  it("the stored file is what the engine produces now, to within a last-digit tolerance (run `pnpm fixtures:examples` after a model change)", () => {
    expect(fixturesMatch(stored(), buildExamplesData())).toBe(true);
  });

  it("holds exactly the templates and catalog the API serves, unchanged", () => {
    const data = stored();
    expect(data.templates.map((t: { id: string }) => t.id)).toEqual(getTemplates().map((t) => t.id));
    for (const [i, t] of getTemplates().entries()) {
      expect(data.templates[i].name).toBe(t.name);
      expect(data.templates[i].blurb).toBe(t.blurb);
      expect(data.templates[i].graph).toEqual(JSON.parse(JSON.stringify(t.graph)));
      expect(data.templates[i].traffic).toEqual(JSON.parse(JSON.stringify(t.traffic)));
    }
    expect(data.catalog).toEqual(JSON.parse(JSON.stringify(getCatalog())));
    expect(data.catalog.components).toHaveLength(12);
    expect(data.catalog.presets).toHaveLength(5);
  });

  it("gives every example a real breaking point, a named first failure and a full load curve", () => {
    for (const t of stored().templates) {
      expect(t.limits.state).toBe("found");
      expect(t.limits.passingRps).toBeGreaterThanOrEqual(1);
      expect(t.limits.failingRps).toBeGreaterThanOrEqual(t.limits.passingRps);
      expect(t.graph.nodes.map((n: { id: string }) => n.id)).toContain(t.limits.firstId);
      expect(t.limits.firstLabel).toBe(t.graph.nodes.find((n: { id: string }) => n.id === t.limits.firstId).label);
      expect(["latency", "errors", "both"]).toContain(t.limits.cause);
      expect(t.limits.curve).toHaveLength(45);
      const rps = t.limits.curve.map((p: { rps: number }) => p.rps);
      expect([...rps].sort((a: number, b: number) => a - b)).toEqual(rps);
      for (const p of t.limits.curve) for (const k of ["rps", "p50", "p95", "p99", "err", "maxRho"]) expect(Number.isFinite(p[k])).toBe(true);
      expect(t.result.nodes.length).toBe(t.graph.nodes.length);
      expect(["pass", "strained", "fail"]).toContain(t.result.verdict);
    }
  });

  it("is honest about the examples that miss their own goal", () => {
    const by = Object.fromEntries(stored().templates.map((t: { id: string }) => [t.id, t]));
    expect(by["three-tier"].result.sloMet).toBe(false);
    expect(by["checkout"].result.sloMet).toBe(false);
    expect(by["mvp"].result.sloMet).toBe(true);
  });
});
