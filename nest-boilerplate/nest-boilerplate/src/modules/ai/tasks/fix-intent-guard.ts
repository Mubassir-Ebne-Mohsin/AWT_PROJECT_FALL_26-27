import type { FixKind } from "@/modules/simulation/engine/fixes";
import type { FixIntentOutput } from "@/modules/ai/tasks/fix-intent";
import { wishSentences } from "@/modules/ai/sanitize";

/**
 * The grounding guard (docs/AI-FIX-INTENT-GUARD-RUBRIC.md). It checks every choice the model made against the person's own words and
 * removes any choice those words do not support. It only ever removes: it never adds a choice, and it writes nothing a person sees.
 * Step A keeps only clauses that describe a wish (not identifier-like words, JSON, or sentences that address the assistant); step B
 * accepts a choice only if a kept clause supports it. The rules are exactly those declared before the code was written.
 */

/** Words that name each kind of fix. Plural and suffixed forms count. */
const KIND_WORDS: Record<FixKind, RegExp> = {
  replicas: /\b(servers?|copies|copy|instances?|workers?|nodes?|machines?)\b/i,
  capacity: /\b(bigger|larger|upgrad\w*|resiz\w*|sizes?|tiers?|vertical\w*|capacity)\b/i,
  cache: /\b(cach\w*|redis|memcache\w*)\b/i,
  readReplica: /\b(replicas?|databases?|db|postgres\w*|mysql)\b/i,
};
const KINDS = Object.keys(KIND_WORDS) as FixKind[];
const FLAG_OF: Record<FixKind, keyof FixIntentOutput> = { replicas: "excludeReplicas", capacity: "excludeCapacity", cache: "excludeCache", readReplica: "excludeReadReplica" };

export const PREFERENCE_WORDS = {
  simplest: /\b(cheap\w*|simpl\w*|light\w*|minimal|easy|easiest|invasive)\b|\bleast (change|effort|work)\b/i,
  lowest_latency: /\b(latency|fast\w*|speed\w*|quick\w*|responsive\w*|p95)\b/i,
  fewest_errors: /\b(errors?|reliab\w*|fail\w*|dropped|stable|stability|availability)\b/i,
} as const;

export const LIMIT_CUE =/\b(no|not|never|without|avoid|off|don'?t|can'?t|cannot|won'?t|nothing|skip|except|locked|stuck|exclude)\b|\brule out\b|\binstead of\b|\bleave\b[^.;,]{0,30}\bout\b|\bleft out\b/i;
const NOTHING_ELSE = /\bnothing (else|but)\b/gi;
const ONLY_CUE = /\b(only|just)\b|\bnothing but\b|\bnothing else\b/i;

/** The sentences of the person's own wish (the shared reading in `sanitize.ts`), then split into clauses at commas and "but". */
export function wishClauses(goal: string): string[] {
  return wishSentences(goal)
    .flatMap((sentence) => sentence.split(/,|(?<!nothing\s)\bbut\b/i))
    .map((c) => c.trim())
    .filter(Boolean);
}

/** The kinds a clause names. "Database copy" is a read replica, not more copies of the servers. */
function kindsNamed(clause: string): FixKind[] {
  const text = clause.replace(/\b(database|db)s?\s+cop(y|ies)\b/gi, "database");
  return KINDS.filter((k) => KIND_WORDS[k].test(text));
}

/** The kinds of fix the person's words support leaving out. */
export function supportedExclusions(clauses: readonly string[]): Set<FixKind> {
  const supported = new Set<FixKind>();
  const allowed = new Set<FixKind>();
  let only = false;
  for (const clause of clauses) {
    const named = kindsNamed(clause);
    // "nothing else" and "nothing but" mean "only", so they are not read as a limit.
    if (LIMIT_CUE.test(clause.replace(NOTHING_ELSE, " "))) named.forEach((k) => supported.add(k));
    else if (ONLY_CUE.test(clause) && named.length) {
      only = true;
      named.forEach((k) => allowed.add(k));
    }
  }
  if (only) for (const k of KINDS) if (!allowed.has(k)) supported.add(k);
  return supported;
}

const NEUTRAL: FixIntentOutput = { understood: false, excludeReplicas: false, excludeCapacity: false, excludeCache: false, excludeReadReplica: false, preference: "default" };

export interface Grounded {
  output: FixIntentOutput;
  /** The model's choices that the words did not support, by field name. */
  dropped: string[];
}

/** Removes every choice the person's own words do not support. Never adds one. */
export function groundIntent(goal: string, answer: FixIntentOutput): Grounded {
  if (!answer.understood) return { output: { ...NEUTRAL }, dropped: [] };
  const clauses = wishClauses(goal);
  const supported = supportedExclusions(clauses);
  const dropped: string[] = [];
  const out: FixIntentOutput = { ...NEUTRAL, understood: true };
  for (const kind of KINDS) {
    const flag = FLAG_OF[kind] as "excludeReplicas" | "excludeCapacity" | "excludeCache" | "excludeReadReplica";
    if (!answer[flag]) continue;
    if (supported.has(kind)) out[flag] = true;
    else dropped.push(flag);
  }
  if (answer.preference !== "default") {
    if (PREFERENCE_WORDS[answer.preference].test(clauses.join(". "))) out.preference = answer.preference;
    else dropped.push("preference");
  }
  const anything = out.excludeReplicas || out.excludeCapacity || out.excludeCache || out.excludeReadReplica || out.preference !== "default";
  return anything ? { output: out, dropped } : { output: { ...NEUTRAL }, dropped };
}
