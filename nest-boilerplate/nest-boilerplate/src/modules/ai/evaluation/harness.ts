import { aiResultSchema, type AiResult } from "@/common/contracts/phase3/ai.schema";
import { claimIsSupported, evidenceIdsFor, groundingViolation, providerFacts } from "@/modules/ai/grounding";
import type { ProviderObservation } from "@/modules/ai/provider";
import { admission, type EvaluationCase, type Refusal } from "@/modules/ai/evaluation/cases";

/**
 * Runs the benchmark cases through any explanation provider and keeps every result, including every failure, so a gate
 * decision can be audited later. It makes no judgement of usefulness itself: the deterministic checks run here, the written
 * rubric is applied afterwards (blind, see blindSheet) and fed to evaluateGate.
 */

/** The part of ExplanationProvider the harness needs. */
export interface GateProvider {
  generate(
    facts: Record<string, unknown>,
    allowed: string[],
    digest: string,
    signal: AbortSignal,
    observe?: (observation: ProviderObservation) => void,
  ): Promise<AiResult>;
}

export const GATE_THRESHOLDS = { usefulShare: 0.9, deadlineMs: 30_000, generationsPerCase: 3 } as const;

export type Check = "provider_error" | "timeout" | "schema" | "evidence_ids" | "claims" | "grounding";

export interface AnswerRecord {
  caseId: string;
  generation: number;
  /** accepted: passed every deterministic check. rejected: a check failed (the answer is kept). refused: the application would
   * have refused this case before any model call (correct behaviour). not_run: the run was stopped before this answer. */
  outcome: "accepted" | "rejected" | "refused" | "not_run";
  refusal?: Refusal;
  rejection?: { check: Check; detail: string };
  /** What the provider returned, kept even when rejected. */
  result?: unknown;
  latencyMs: number;
  returnedModel?: string;
  usage?: ProviderObservation["usage"];
  /** The model's reply text and why it stopped, kept even when the reply was rejected. */
  rawReply?: string;
  finishReason?: string;
}

export interface GateRun {
  provider: string;
  model: string;
  startedAt: string;
  records: AnswerRecord[];
  /** Set when the run stopped early (rate limit, authentication, configuration, changed model) and why. */
  stoppedBy?: string;
}

export interface RunOptions {
  provider: string;
  model: string;
  digest?: string;
  generations?: number;
  deadlineMs?: number;
  /** Called before each provider request, e.g. to keep inside a hosted quota. */
  beforeEach?: () => Promise<void>;
  now?: () => number;
}

/** Failures that mean "stop, do not keep sending requests". */
export const STOP_REASONS = new Set(["PROVIDER_RATE_LIMITED", "PROVIDER_AUTH", "PROVIDER_NOT_CONFIGURED", "MODEL_CHANGED"]);
export const reasonOf = (e: unknown) => ((e as { details?: { reason?: string } })?.details?.reason ?? null) as string | null;

export class Deadline extends Error {}

export async function withDeadline<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Deadline());
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** The deterministic checks every accepted answer must pass, in the order the application applies them. */
export function checkAnswer(result: unknown, c: EvaluationCase): { check: Check; detail: string } | null {
  const facts = c.facts;
  if (!facts) return { check: "schema", detail: "no facts" };
  const parsed = aiResultSchema.safeParse(result);
  if (!parsed.success) return { check: "schema", detail: "the answer does not match the result schema" };
  const answer = parsed.data;
  const allowed = evidenceIdsFor(facts);
  const stray = answer.evidenceIds.find((id) => !allowed.includes(id));
  if (stray) return { check: "evidence_ids", detail: "cites " + stray + ", which is not an allowed evidence id" };
  if (!answer.claims?.length) return { check: "claims", detail: "no typed claims supplied" };
  const unsupported = answer.claims.find((claim) => !claimIsSupported(claim, facts));
  if (unsupported) return { check: "claims", detail: unsupported + " is not supported by the facts" };
  const violation = groundingViolation(answer.summary, facts, c.currentRevision);
  if (violation) return { check: "grounding", detail: violation };
  return null;
}

export async function runGate(provider: GateProvider, cases: readonly EvaluationCase[], options: RunOptions): Promise<GateRun> {
  const generations = options.generations ?? GATE_THRESHOLDS.generationsPerCase;
  const deadlineMs = options.deadlineMs ?? GATE_THRESHOLDS.deadlineMs;
  const now = options.now ?? Date.now;
  const run: GateRun = { provider: options.provider, model: options.model, startedAt: new Date(now()).toISOString(), records: [] };

  for (const c of cases) {
    for (let generation = 1; generation <= generations; generation++) {
      const base = { caseId: c.id, generation };
      const refusal = admission(c);
      if (refusal) {
        run.records.push({ ...base, outcome: "refused", refusal, latencyMs: 0 });
        continue;
      }
      if (run.stoppedBy) {
        run.records.push({ ...base, outcome: "not_run", latencyMs: 0 });
        continue;
      }
      await options.beforeEach?.();
      let seen: ProviderObservation = {};
      const started = now();
      try {
        const result = await withDeadline(deadlineMs, (signal) =>
          provider.generate(providerFacts(c.facts!, c.currentRevision, "reference-port-v1"), evidenceIdsFor(c.facts!), options.digest ?? "", signal, (o) => {
            seen = { ...seen, ...o };
          }),
        );
        const latencyMs = now() - started;
        const rejection = checkAnswer(result, c);
        run.records.push({
          ...base,
          outcome: rejection ? "rejected" : "accepted",
          ...(rejection ? { rejection } : {}),
          result,
          latencyMs,
          ...(seen.returnedModel ? { returnedModel: seen.returnedModel } : {}),
          ...(seen.usage ? { usage: seen.usage } : {}),
          ...(seen.rawReply !== undefined ? { rawReply: seen.rawReply } : {}),
          ...(seen.finishReason ? { finishReason: seen.finishReason } : {}),
        });
      } catch (e) {
        const latencyMs = now() - started;
        const reason = reasonOf(e);
        const rejection =
          e instanceof Deadline
            ? { check: "timeout" as const, detail: "no answer within " + deadlineMs + " ms" }
            : { check: "provider_error" as const, detail: [reason, e instanceof Error ? e.message : null].filter(Boolean).join(": ") || "failed" };
        run.records.push({
          ...base,
          outcome: "rejected",
          rejection,
          latencyMs,
          ...(seen.returnedModel ? { returnedModel: seen.returnedModel } : {}),
          ...(seen.usage ? { usage: seen.usage } : {}),
          ...(seen.rawReply !== undefined ? { rawReply: seen.rawReply } : {}),
          ...(seen.finishReason ? { finishReason: seen.finishReason } : {}),
        });
        if (reason && STOP_REASONS.has(reason)) run.stoppedBy = reason;
      }
    }
  }
  return run;
}

/** A reviewer's verdict on one accepted answer, from the written three-question rubric. */
export interface Judgement {
  useful: boolean;
  /** The answer states a figure or a bottleneck the facts do not support, in a way the deterministic checks could not see. */
  fabricated: boolean;
}
export const answerKey = (r: Pick<AnswerRecord, "caseId" | "generation">) => r.caseId + "#" + r.generation;

export interface GateReport {
  total: number;
  accepted: number;
  rejected: number;
  rejectedBy: Partial<Record<Check, number>>;
  refusedCorrectly: number;
  notRun: number;
  modelAnswers: number;
  judged: number;
  pending: number;
  useful: number;
  usefulModelAnswers: number;
  usefulShare: number;
  usefulShareOfModelAnswers: number;
  fabricatedAccepted: number;
  slowerThanDeadline: number;
  slowestMs: number;
  verdict: "GO" | "NO-GO" | "PENDING" | "INCOMPLETE";
  reasons: string[];
}

/**
 * The gate arithmetic. Pass needs all of: at least 90% of every answer useful (a correct refusal counts as useful), at least
 * 90% of the answers a model actually produced useful (so refusals cannot carry a weak model), zero accepted answers judged
 * fabricated, and every answer within the deadline. A rejected or timed-out answer is never useful. Unjudged answers keep the
 * verdict PENDING unless even a perfect score on them could not pass.
 */
export function evaluateGate(run: GateRun, judgements: Record<string, Judgement> = {}, deadlineMs: number = GATE_THRESHOLDS.deadlineMs): GateReport {
  const rs = run.records;
  const accepted = rs.filter((r) => r.outcome === "accepted");
  const refused = rs.filter((r) => r.outcome === "refused");
  const notRun = rs.filter((r) => r.outcome === "not_run").length;
  const rejected = rs.filter((r) => r.outcome === "rejected");
  const rejectedBy: Partial<Record<Check, number>> = {};
  for (const r of rejected) if (r.rejection) rejectedBy[r.rejection.check] = (rejectedBy[r.rejection.check] ?? 0) + 1;

  const judgedAccepted = accepted.filter((r) => judgements[answerKey(r)]);
  const pending = accepted.length - judgedAccepted.length;
  const usefulModelAnswers = judgedAccepted.filter((r) => judgements[answerKey(r)].useful && !judgements[answerKey(r)].fabricated).length;
  const fabricatedAccepted = judgedAccepted.filter((r) => judgements[answerKey(r)].fabricated).length;
  const total = rs.length;
  const modelAnswers = total - refused.length - notRun;
  const share = (n: number, d: number) => (d === 0 ? 0 : n / d);
  const useful = usefulModelAnswers + refused.length;
  const slow = rs.filter((r) => r.latencyMs > deadlineMs || r.rejection?.check === "timeout").length;
  const slowestMs = rs.reduce((m, r) => Math.max(m, r.latencyMs), 0);

  const bar = GATE_THRESHOLDS.usefulShare;
  const reasons: string[] = [];
  if (fabricatedAccepted > 0) reasons.push(fabricatedAccepted + " accepted answer(s) judged fabricated (the bar is zero)");
  if (slow > 0) reasons.push(slow + " answer(s) not within " + deadlineMs / 1000 + " seconds");
  // The share of all answers cannot fall below the bar while the share of the model's own answers meets it (correct refusals
  // only raise the first), so only the stricter test is applied here; usefulShare is still reported.
  if (share(usefulModelAnswers + pending, modelAnswers) < bar) reasons.push("even if every unjudged answer were useful, fewer than 90% of the model's own answers would be");

  let verdict: GateReport["verdict"];
  if (notRun > 0) verdict = "INCOMPLETE";
  else if (reasons.length > 0) verdict = "NO-GO";
  else if (pending > 0) verdict = "PENDING";
  else verdict = "GO";
  if (verdict === "INCOMPLETE") reasons.push("the run stopped early" + (run.stoppedBy ? " (" + run.stoppedBy + ")" : "") + "; " + notRun + " answer(s) were not requested");

  return {
    total,
    accepted: accepted.length,
    rejected: rejected.length,
    rejectedBy,
    refusedCorrectly: refused.length,
    notRun,
    modelAnswers,
    judged: judgedAccepted.length,
    pending,
    useful,
    usefulModelAnswers,
    usefulShare: share(useful, total),
    usefulShareOfModelAnswers: share(usefulModelAnswers, modelAnswers),
    fabricatedAccepted,
    slowerThanDeadline: slow,
    slowestMs,
    verdict,
    reasons,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Blind review sheet: the reviewer sees the facts and the answer, in a shuffled order, with no provider or model name.

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface SheetItem {
  sheetId: string;
  facts: unknown;
  answer: unknown;
}
export function blindSheet(runs: readonly GateRun[], cases: readonly EvaluationCase[], seed: number) {
  const entries = runs.flatMap((run, runIndex) =>
    run.records
      .filter((r) => r.outcome === "accepted")
      .map((r) => ({ runIndex, record: r, facts: cases.find((c) => c.id === r.caseId)?.facts ?? null })),
  );
  const order = shuffled(entries, seed);
  const items: SheetItem[] = order.map((e, i) => ({ sheetId: "A" + String(i + 1).padStart(3, "0"), facts: e.facts, answer: e.record.result }));
  // The key is kept apart from the sheet and not shown to the reviewer until the judgements are in.
  const key: Record<string, { runIndex: number; answer: string }> = {};
  order.forEach((e, i) => (key[items[i].sheetId] = { runIndex: e.runIndex, answer: answerKey(e.record) }));
  return { items, key };
}

/** A random third (rounded up) of the sheet, for the owner's independent check. */
export function sampleThird(sheetIds: readonly string[], seed: number): string[] {
  return shuffled(sheetIds, seed).slice(0, Math.ceil(sheetIds.length / 3)).sort();
}
