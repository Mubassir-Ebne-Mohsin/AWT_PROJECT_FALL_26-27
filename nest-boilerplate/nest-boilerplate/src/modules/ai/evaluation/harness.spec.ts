import { AppException } from "@/common/errors";
import type { AiResult } from "@/common/contracts/phase3/ai.schema";
import { ruleBasedExplanation } from "@/modules/ai/evaluation/baseline";
import { EVALUATION_CASES } from "@/modules/ai/evaluation/cases";
import {
  answerKey,
  blindSheet,
  checkAnswer,
  evaluateGate,
  GATE_THRESHOLDS,
  runGate,
  sampleThird,
  type AnswerRecord,
  type GateProvider,
  type GateRun,
  type Judgement,
} from "@/modules/ai/evaluation/harness";

const opts = { provider: "fake", model: "fake-model" };
const factsOf = (facts: Record<string, unknown>) => facts as never;

/** A provider that answers like the rule-based baseline, counting calls. */
class Right implements GateProvider {
  calls = 0;
  async generate(facts: Record<string, unknown>, _a: string[], _d: string, _s: AbortSignal, observe?: Parameters<GateProvider["generate"]>[4]) {
    this.calls++;
    observe?.({ returnedModel: "fake-model", usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } });
    return ruleBasedExplanation(factsOf(facts));
  }
}
const wrap = (change: (answer: AiResult) => unknown): GateProvider => ({
  generate: async (facts) => change(ruleBasedExplanation(factsOf(facts))) as AiResult,
});

describe("checkAnswer", () => {
  const c = EVALUATION_CASES.find((x) => x.id === "failed")!;
  const good = ruleBasedExplanation(c.facts!);
  it("accepts a good answer", () => expect(checkAnswer(good, c)).toBeNull());
  it("rejects a malformed answer", () => expect(checkAnswer({ summary: "x" }, c)?.check).toBe("schema"));
  it("rejects an evidence id that was not offered", () => expect(checkAnswer({ ...good, evidenceIds: ["noBottleneck"] }, c)?.check).toBe("evidence_ids"));
  it("rejects missing claims and a claim the facts do not support", () => {
    expect(checkAnswer({ summary: good.summary, evidenceIds: good.evidenceIds }, c)?.check).toBe("claims");
    expect(checkAnswer({ ...good, claims: ["no_bottleneck_identified"] }, c)?.check).toBe("claims");
  });
  it("rejects a figure that is not one of the facts", () => {
    expect(checkAnswer({ ...good, summary: "p95 latency is 999 ms." }, c)).toMatchObject({ check: "grounding" });
  });
});

describe("runGate", () => {
  it("asks the model for the six explainable cases three times each, and never for the two the application refuses", async () => {
    const provider = new Right();
    const run = await runGate(provider, EVALUATION_CASES, opts);
    expect(provider.calls).toBe(18);
    expect(run.records).toHaveLength(24);
    expect(run.records.filter((r) => r.outcome === "accepted")).toHaveLength(18);
    const refused = run.records.filter((r) => r.outcome === "refused");
    expect(refused).toHaveLength(6);
    expect(new Set(refused.map((r) => r.refusal))).toEqual(new Set(["STALE_RESULT", "MISSING_INPUT"]));
    expect(run.records[0]).toMatchObject({ caseId: "healthy", generation: 1, returnedModel: "fake-model", usage: { totalTokens: 120 } });
  });

  it("keeps a wrong answer, says which check rejected it, and keeps going", async () => {
    const cases = [
      { name: "claims", provider: wrap((a) => ({ ...a, claims: ["latency_within_target"] })), check: "claims" },
      { name: "grounding", provider: wrap((a) => ({ ...a, summary: "p95 is 12345 ms." })), check: "grounding" },
      { name: "evidence_ids", provider: wrap((a) => ({ ...a, evidenceIds: ["secret"] })), check: "evidence_ids" },
      { name: "schema", provider: wrap(() => ({ nope: true })), check: "schema" },
    ];
    for (const t of cases) {
      const run = await runGate(t.provider, EVALUATION_CASES, opts);
      const rejected = run.records.filter((r) => r.outcome === "rejected");
      // latency_within_target is true of every case except "failed" (p95 800 ms), so only its three answers are wrong.
      expect(rejected).toHaveLength(t.name === "claims" ? 3 : 18);
      expect(rejected.every((r) => r.rejection?.check === t.check && r.result !== undefined)).toBe(true);
      expect(run.stoppedBy).toBeUndefined();
    }
  });

  it("counts an answer that arrives after the deadline as a timeout, even from a provider that ignores the abort", async () => {
    const slow: GateProvider = { generate: () => new Promise((resolve) => setTimeout(() => resolve({ summary: "late", evidenceIds: ["p95"] } as AiResult), 400)) };
    const run = await runGate(slow, EVALUATION_CASES.slice(0, 1), { ...opts, generations: 1, deadlineMs: 30 });
    expect(run.records[0]).toMatchObject({ outcome: "rejected", rejection: { check: "timeout" } });
    expect(run.records[0].latencyMs).toBeLessThan(300);
  });

  it("records an ordinary provider failure and continues", async () => {
    let n = 0;
    const flaky: GateProvider = {
      generate: async (facts) => {
        if (++n === 2) throw new AppException("UNAVAILABLE", "x", { reason: "PROVIDER_UNAVAILABLE" });
        return ruleBasedExplanation(factsOf(facts));
      },
    };
    const run = await runGate(flaky, EVALUATION_CASES, opts);
    expect(run.records.filter((r) => r.outcome === "rejected")).toHaveLength(1);
    expect(run.records[1]).toMatchObject({ outcome: "rejected", rejection: { check: "provider_error", detail: "PROVIDER_UNAVAILABLE" } });
    expect(run.stoppedBy).toBeUndefined();
    expect(n).toBe(18);
  });

  it.each(["PROVIDER_RATE_LIMITED", "PROVIDER_AUTH", "PROVIDER_NOT_CONFIGURED", "MODEL_CHANGED"])("stops at %s instead of sending more requests", async (reason) => {
    let n = 0;
    const stopping: GateProvider = {
      generate: async (facts) => {
        if (++n === 3) throw new AppException("RATE_LIMITED", "x", { reason });
        return ruleBasedExplanation(factsOf(facts));
      },
    };
    const run = await runGate(stopping, EVALUATION_CASES, opts);
    expect(n).toBe(3);
    expect(run.stoppedBy).toBe(reason);
    expect(run.records).toHaveLength(24);
    expect(run.records.filter((r) => r.outcome === "not_run")).toHaveLength(15);
    expect(evaluateGate(run).verdict).toBe("INCOMPLETE");
  });

  it("calls the pacing hook before every request and not for refused cases", async () => {
    let paced = 0;
    await runGate(new Right(), EVALUATION_CASES, { ...opts, beforeEach: async () => void paced++ });
    expect(paced).toBe(18);
  });
});

// A run built by hand so the arithmetic is tested without any provider.
const record = (i: number, over: Partial<AnswerRecord> = {}): AnswerRecord => ({ caseId: "c" + i, generation: 1, outcome: "accepted", latencyMs: 1000, ...over });
const handRun = (accepted: number, refused: number, rejected = 0): GateRun => ({
  provider: "p",
  model: "m",
  startedAt: "t",
  records: [
    ...Array.from({ length: accepted }, (_, i) => record(i)),
    ...Array.from({ length: refused }, (_, i) => record(100 + i, { outcome: "refused", refusal: "STALE_RESULT", latencyMs: 0 })),
    ...Array.from({ length: rejected }, (_, i) => record(200 + i, { outcome: "rejected", rejection: { check: "claims", detail: "x" } })),
  ],
});
const judge = (run: GateRun, useful: number, fabricated = 0): Record<string, Judgement> => {
  const out: Record<string, Judgement> = {};
  run.records.filter((r) => r.outcome === "accepted").forEach((r, i) => (out[answerKey(r)] = { useful: i < useful, fabricated: i < fabricated }));
  return out;
};

describe("evaluateGate", () => {
  it("passes when every answer is useful and quick", () => {
    const run = handRun(18, 6);
    expect(evaluateGate(run, judge(run, 18))).toMatchObject({ verdict: "GO", total: 24, useful: 24, usefulShare: 1, usefulModelAnswers: 18 });
  });

  it("uses exactly 90% as the bar on the model's own answers: 17 of 18 passes, 16 of 18 does not, even though 22 of 24 looks fine", () => {
    const pass = handRun(18, 6);
    expect(evaluateGate(pass, judge(pass, 17)).verdict).toBe("GO");
    const fail = handRun(18, 6);
    const report = evaluateGate(fail, judge(fail, 16));
    expect(report.usefulShare).toBeCloseTo(22 / 24);
    expect(report.verdict).toBe("NO-GO");
  });

  it("counts a rejected answer as not useful", () => {
    const run = handRun(15, 6, 3);
    const report = evaluateGate(run, judge(run, 15));
    expect(report).toMatchObject({ rejected: 3, rejectedBy: { claims: 3 }, usefulModelAnswers: 15 });
    expect(report.verdict).toBe("NO-GO");
  });

  it("fails on a single accepted answer judged fabricated, even when it was otherwise useful", () => {
    const run = handRun(18, 6);
    const report = evaluateGate(run, judge(run, 18, 1));
    expect(report.fabricatedAccepted).toBe(1);
    expect(report.usefulModelAnswers).toBe(17);
    expect(report.verdict).toBe("NO-GO");
    expect(report.reasons.join(" ")).toMatch(/fabricated/);
  });

  it("fails if any answer took longer than 30 seconds, and allows exactly 30", () => {
    const ok = handRun(18, 6);
    ok.records[0].latencyMs = 30_000;
    expect(evaluateGate(ok, judge(ok, 18)).verdict).toBe("GO");
    const slow = handRun(18, 6);
    slow.records[0].latencyMs = 30_001;
    const report = evaluateGate(slow, judge(slow, 18));
    expect(report).toMatchObject({ verdict: "NO-GO", slowerThanDeadline: 1, slowestMs: 30_001 });
  });

  it("stays PENDING while accepted answers are unjudged, and turns NO-GO early only when a perfect score could not pass", () => {
    const run = handRun(18, 6);
    expect(evaluateGate(run).verdict).toBe("PENDING");
    expect(evaluateGate(run, { [answerKey(run.records[0])]: { useful: true, fabricated: false } }).verdict).toBe("PENDING");
    const partial: Record<string, Judgement> = {};
    run.records.slice(0, 3).forEach((r) => (partial[answerKey(r)] = { useful: false, fabricated: false }));
    expect(evaluateGate(run, partial).verdict).toBe("NO-GO");
  });

  it("says INCOMPLETE rather than a verdict when requests were not made", () => {
    const run = handRun(10, 6);
    run.records.push(...Array.from({ length: 8 }, (_, i) => record(300 + i, { outcome: "not_run", latencyMs: 0 })));
    run.stoppedBy = "PROVIDER_RATE_LIMITED";
    const report = evaluateGate(run, judge(run, 10));
    expect(report.verdict).toBe("INCOMPLETE");
    expect(report.notRun).toBe(8);
  });

  it("uses the thresholds the scope fixed", () => {
    expect(GATE_THRESHOLDS).toEqual({ usefulShare: 0.9, deadlineMs: 30000, generationsPerCase: 3 });
  });
});

describe("blind review", () => {
  const model = (): Promise<GateRun> => runGate(new Right(), EVALUATION_CASES, { provider: "groq", model: "openai/gpt-oss-20b" });
  const rules = (): Promise<GateRun> => runGate({ generate: async (f) => ruleBasedExplanation(factsOf(f)) }, EVALUATION_CASES, { provider: "rule-based", model: "none" });

  it("lists only accepted answers, shuffled, with no provider or model name anywhere", async () => {
    const { items, key } = blindSheet([await model(), await rules()], EVALUATION_CASES, 7);
    expect(items).toHaveLength(36);
    const text = JSON.stringify(items);
    for (const name of ["groq", "gpt-oss", "rule-based", "fake-model", "openai"]) expect(text).not.toContain(name);
    expect(new Set(items.map((i) => i.sheetId)).size).toBe(36);
    expect(Object.keys(key)).toHaveLength(36);
  });

  it("is repeatable for a seed, differs for another, and the key leads back to the right answer", async () => {
    const runs = [await model(), await rules()];
    const a = blindSheet(runs, EVALUATION_CASES, 7);
    expect(blindSheet(runs, EVALUATION_CASES, 7)).toEqual(a);
    expect(blindSheet(runs, EVALUATION_CASES, 8).items.map((i) => i.sheetId + JSON.stringify(i.answer))).not.toEqual(a.items.map((i) => i.sheetId + JSON.stringify(i.answer)));
    for (const item of a.items) {
      const where = a.key[item.sheetId];
      const record = runs[where.runIndex].records.find((r) => answerKey(r) === where.answer)!;
      expect(record.result).toEqual(item.answer);
      expect(item.facts).toEqual(EVALUATION_CASES.find((c) => c.id === record.caseId)!.facts);
    }
    // Shuffled: the sheet does not simply list the first run, then the second.
    expect(a.items.slice(0, 18).map((i) => a.key[i.sheetId].runIndex)).toContain(1);
  });

  it("picks a third, rounded up, without repeats, and the same third for the same seed", () => {
    const ids = Array.from({ length: 36 }, (_, i) => "A" + String(i + 1).padStart(3, "0"));
    const pick = sampleThird(ids, 3);
    expect(pick).toHaveLength(12);
    expect(new Set(pick).size).toBe(12);
    expect(pick.every((id) => ids.includes(id))).toBe(true);
    expect(sampleThird(ids, 3)).toEqual(pick);
    expect(sampleThird(ids.slice(0, 10), 3)).toHaveLength(4);
  });
});
