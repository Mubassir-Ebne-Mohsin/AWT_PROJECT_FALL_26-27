import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildEvaluationData, curveNeverImproves, erlangB, erlangC, exactWait, modelWait, utilizationDidNotRise } from "@/src/script/evaluation-data";
import { fixturesMatch } from "@/src/script/learn-fixtures";

const file = resolve(__dirname, "../../../../../web/src/lib/evaluation-data.json");
const stored = () => JSON.parse(readFileSync(file, "utf8"));

describe("P5 the exact textbook maths the evaluation relies on", () => {
  it("Erlang B and C match closed forms worked out by hand", () => {
    expect(erlangB(1, 1)).toBeCloseTo(0.5, 12); // a / (1 + a)
    expect(erlangB(2, 1)).toBeCloseTo(0.2, 12); // (a^2/2) / (1 + a + a^2/2)
    expect(erlangC(1, 0.3)).toBeCloseTo(0.3, 12); // one server: C = rho
    expect(erlangC(2, 0.5)).toBeCloseTo(1 / 3, 12); // 2 rho^2 / (1 + rho)
    expect(erlangC(2, 0.8)).toBeCloseTo((2 * 0.64) / 1.8, 12);
  });

  it("the exact mean wait matches the known M/M/1 and M/M/2 results, in units of one service time", () => {
    for (const rho of [0.1, 0.5, 0.9]) expect(exactWait(1, rho)).toBeCloseTo(rho / (1 - rho), 12);
    expect(exactWait(2, 0.5)).toBeCloseTo(1 / 3, 12); // Lq = 2 rho^3 / (1 - rho^2)
    expect(exactWait(2, 0.8)).toBeCloseTo((2 * 0.8 ** 3) / (1 - 0.64) / (2 * 0.8), 10);
  });

  it("stays finite, in range and increasing in the load even for hundreds of servers", () => {
    let last = 0;
    for (const rho of [0.05, 0.3, 0.6, 0.9, 0.95, 0.98]) {
      const c = erlangC(480, rho);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
      const w = exactWait(480, rho);
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(last);
      last = w;
    }
  });

  it("the engine's own formula is exactly right for one server and an approximation for several", () => {
    for (const rho of [0.05, 0.3, 0.6, 0.9, 0.95]) expect(modelWait(1, rho)).toBeCloseTo(exactWait(1, rho), 12);
    expect(Math.abs(modelWait(16, 0.5) - exactWait(16, 0.5))).toBeGreaterThan(1e-4);
  });
});

describe("P5 the consistency checks themselves notice a violation", () => {
  const good = [{ p95: 10, err: 0, maxRho: 0.1 }, { p95: 20, err: 0.01, maxRho: 0.5 }, { p95: 20, err: 0.01, maxRho: 0.5 }, { p95: 90, err: 0.2, maxRho: 1.2 }];
  it("a curve that improves with more load is rejected, whichever measure improves", () => {
    expect(curveNeverImproves(good)).toBe(true);
    expect(curveNeverImproves([])).toBe(true);
    expect(curveNeverImproves([good[0], { ...good[1], p95: 5 }])).toBe(false);
    expect(curveNeverImproves([good[0], { ...good[1], err: 0 }, { ...good[2], err: -0.5 }])).toBe(false);
    expect(curveNeverImproves([good[1], { ...good[2], maxRho: 0.2 }])).toBe(false);
  });
  it("doubling replicas must not raise utilization", () => {
    expect(utilizationDidNotRise(0.5, 0.25)).toBe(true);
    expect(utilizationDidNotRise(0.5, 0.5)).toBe(true);
    expect(utilizationDidNotRise(0.5, 0.6)).toBe(false);
  });
});

describe("P5 evaluation data follows the real engine", () => {
  it("the stored file is what a fresh run produces, to within a last-digit tolerance (run `pnpm fixtures:evaluation` after a model change)", () => {
    expect(fixturesMatch(stored(), buildEvaluationData())).toBe(true);
  });

  it("covers the grid, the typical components, the reference fixtures and every check on every template", () => {
    const d = stored();
    expect(d.erlang.grid).toHaveLength(d.erlang.servers.length * d.erlang.loads.length);
    expect(d.erlang.typical.length).toBeGreaterThanOrEqual(10);
    for (const t of d.erlang.typical) expect(t.rows).toHaveLength(5);
    expect(d.fidelity.fixtures).toBe(6);
    expect(d.fidelity.valuesCompared).toBeGreaterThan(4000);
    expect(d.consistency.map((c: { id: string }) => c.id)).toEqual(["deterministic", "zero-load", "monotone-load", "breaking-point", "more-replicas"]);
    for (const c of d.consistency) expect(c.results).toHaveLength(6);
  });

  it("reports the findings the page will state, from the numbers and not from memory", () => {
    const d = stored();
    expect(d.erlang.oneServerWorstRelativeError).toBeLessThan(1e-12);
    const [b1, b5, b20] = d.erlang.bands;
    expect([b1.minWaitShare, b5.minWaitShare, b20.minWaitShare]).toEqual([0.01, 0.05, 0.2]);
    expect(b20.worstRelativeError).toBeLessThan(b5.worstRelativeError);
    expect(b5.worstRelativeError).toBeLessThan(b1.worstRelativeError);
    expect(b20.worstRelativeError).toBeLessThan(0.2);
    expect(d.erlang.maxAbsoluteGap.value).toBeLessThan(0.05);
    expect(d.fidelity.largestAbsoluteDifference).toBeLessThanOrEqual(d.fidelity.tolerance.absolute);
    expect(d.fidelity.largestRelativeDifference).toBeLessThanOrEqual(d.fidelity.tolerance.relative);
    for (const c of d.consistency) expect({ id: c.id, passed: c.passed }).toEqual({ id: c.id, passed: true });
  });
});
