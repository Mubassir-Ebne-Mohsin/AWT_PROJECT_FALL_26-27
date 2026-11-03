import { INTENT_DEV_V3, keywordReading, pipelineWithoutModel, scoreReading, tally } from "@/modules/ai/evaluation/intent-dev-v3";
import { INTENT_CASES } from "@/modules/ai/evaluation/intent-cases";
import { INTENT_CASES_V2 } from "@/modules/ai/evaluation/intent-cases-v2";
import { FIX_INTENT_MAX_CHARS } from "@/common/contracts/phase3/ai-tasks.schema";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

describe("the development corpus", () => {
  it("has unique ids, a dev label, goals within the length limit, and the declared mix", () => {
    expect(new Set(INTENT_DEV_V3.map((c) => c.id)).size).toBe(INTENT_DEV_V3.length);
    for (const c of INTENT_DEV_V3) {
      expect(c.label).toBe("dev");
      expect(c.text.length).toBeLessThanOrEqual(FIX_INTENT_MAX_CHARS);
    }
    const count = (g: string) => INTENT_DEV_V3.filter((c) => c.group === g).length;
    expect([count("ordinary"), count("mixed"), count("ambiguous"), count("neutral")]).toEqual([20, 10, 8, 7]);
  });
  it("does not repeat a goal already seen in the earlier gates", () => {
    const seen = new Set([...INTENT_CASES, ...INTENT_CASES_V2].map((c) => norm(c.text)));
    for (const c of INTENT_DEV_V3) expect(seen.has(norm(c.text))).toBe(false);
  });
  it("labels every clarification with a reason and nothing else with one", () => {
    for (const c of INTENT_DEV_V3) expect(Boolean(c.expected.reason)).toBe(c.expected.status === "CLARIFY");
  });
});

describe("the scorer", () => {
  const filter = (exclude: never[] | string[], preference = "default") => ({ exclude, preference }) as never;
  it("accepts exactly the expected exclusions and preference, in any order", () => {
    const want = { status: "SUPPORTED" as const, exclude: ["cache", "replicas"] as never, preference: "simplest" as const };
    expect(scoreReading({ status: "SUPPORTED", filter: filter(["replicas", "cache"], "simplest"), clarification: null }, want).correct).toBe(true);
    expect(scoreReading({ status: "SUPPORTED", filter: filter(["cache"], "simplest"), clarification: null }, want).correct).toBe(false);
  });
  it("counts a choice nobody asked for, even when the status is right", () => {
    const score = scoreReading({ status: "SUPPORTED", filter: filter(["cache", "capacity"]), clarification: null }, { status: "SUPPORTED", exclude: ["cache"] });
    expect(score).toEqual({ correct: false, unsupportedChoice: true });
  });
  it("a clarification is right only with the right reason and nothing applied", () => {
    const c = { reason: "copies_or_replica" as const, question: "?", choices: [] } as never as { reason: "copies_or_replica" | "conflicting_preferences"; question: string; choices: never[] };
    const want = { status: "CLARIFY" as const, reason: "copies_or_replica" as const };
    expect(scoreReading({ status: "CLARIFY", filter: filter([]), clarification: c }, want).correct).toBe(true);
    expect(scoreReading({ status: "CLARIFY", filter: filter(["replicas"]), clarification: c }, want).correct).toBe(false);
    expect(scoreReading({ status: "CLARIFY", filter: filter([]), clarification: { ...c, reason: "conflicting_preferences" } }, want).correct).toBe(false);
    expect(scoreReading({ status: "SUPPORTED", filter: filter(["replicas"]), clarification: null }, want).correct).toBe(false);
  });
  it("an unsupported reading is right only if it applied nothing", () => {
    expect(scoreReading({ status: "UNSUPPORTED", filter: filter([]), clarification: null }, { status: "UNSUPPORTED" }).correct).toBe(true);
    expect(scoreReading({ status: "UNSUPPORTED", filter: filter(["cache"]), clarification: null }, { status: "UNSUPPORTED" }).correct).toBe(false);
  });
});

describe("the two no-model baselines (recorded as dev reference, no bar)", () => {
  const keyword = tally(keywordReading);
  const pipeline = tally(pipelineWithoutModel);
  it("reports both, and the fair pipeline is never worse than the bare keyword reader on hidden orders", () => {
    console.log("DEV BASELINES keyword:", JSON.stringify(keyword), "pipeline-without-model:", JSON.stringify(pipeline));
    expect(pipeline.byGroup.mixed.correct).toBeGreaterThanOrEqual(keyword.byGroup.mixed.correct);
    expect(pipeline.unsupportedChoices).toBeLessThanOrEqual(keyword.unsupportedChoices);
  });
  it("the bare keyword reader cannot ask a question, so it scores 0 on the ambiguous goals", () => {
    expect(keyword.byGroup.ambiguous.correct).toBe(0);
  });
});
