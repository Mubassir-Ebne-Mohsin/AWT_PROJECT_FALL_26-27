import { EVALUATION_CASES, type EvaluationCase } from "@/modules/ai/evaluation/cases";
import { runGate, type GateProvider, type GateRun } from "@/modules/ai/evaluation/harness";
import { Pacer } from "@/modules/ai/evaluation/pacer";

/** Tells the pacer what each request really cost, as soon as the provider reports it (even for an answer that is then rejected). */
export function settlingProvider(provider: GateProvider, pacer: Pacer): GateProvider {
  return {
    generate: (facts, allowed, digest, signal, observe) =>
      provider.generate(facts, allowed, digest, signal, (o) => {
        if (o.usage) pacer.settle(o.usage.totalTokens);
        observe?.(o);
      }),
  };
}

export interface LiveRunOptions {
  provider: string;
  model: string;
  digest: string;
  pacer: Pacer;
  cases?: readonly EvaluationCase[];
  generations?: number;
  deadlineMs?: number;
}

/** One paced pass over the cases. Every outcome is kept; the run stops by itself on a rate limit, authentication failure or changed model. */
export function runPaced(provider: GateProvider, options: LiveRunOptions): Promise<GateRun> {
  return runGate(settlingProvider(provider, options.pacer), options.cases ?? EVALUATION_CASES, {
    provider: options.provider,
    model: options.model,
    digest: options.digest,
    generations: options.generations,
    deadlineMs: options.deadlineMs,
    beforeEach: () => options.pacer.acquire(),
  });
}

/** Folder name for a run's files: when, which model. No key, no account detail. */
export const runFolderName = (run: GateRun) => run.startedAt.replace(/[:.]/g, "-") + "_" + run.model.replace(/[^A-Za-z0-9._-]/g, "_");
