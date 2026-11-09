// Concept help: all entries, ranking and the reply the drawer shows. Deterministic: the same question gives the same reply.
import { ACCOUNT_TROUBLE_AI_GLOSSARY } from "./e-account-trouble-ai-glossary";
import { BASICS_RESULTS } from "./e-basics-results";
import { COMPONENTS_TRAFFIC } from "./e-components-traffic";
import { PATTERNS_APP } from "./e-patterns-app";
import { MIN_SCORE, rank, tokens } from "./match";
import type { Entry, Reply } from "./types";

export { CATEGORIES } from "./types";
export type { Category, Entry, Link, Reply } from "./types";

export const ENTRIES: readonly Entry[] = [...BASICS_RESULTS, ...COMPONENTS_TRAFFIC, ...PATTERNS_APP, ...ACCOUNT_TROUBLE_AI_GLOSSARY];

const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));
export const entryById = (id: string): Entry | undefined => BY_ID.get(id);

/** The answer as plain text (what the older scriptedReply() returned, extended with the optional parts). */
export function flatten(e: Entry): string {
  const parts = [e.a];
  if (e.why) parts.push(e.why);
  if (e.steps?.length) parts.push("In the app:\n" + e.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  if (e.example) parts.push("Example: " + e.example);
  return parts.join("\n\n");
}

export const FALLBACK_TEXT =
  "I answer a fixed set of questions: p95, utilization and the limiting component, verdicts and targets, components, traffic settings, caches, queues, read replicas, regions, scaling, and where things are in the app. I do not look at your design and I do not call a model. Try one of the nearest topics below, browse by category, or suggest a topic.";

/** Twelve questions that show what the drawer can do. */
export const POPULAR: readonly string[] = [
  "What is p95?",
  "What limits my design?",
  "What does strained mean?",
  "When should I add a cache?",
  "When should I add a queue?",
  "How do read replicas help?",
  "How do I run a test?",
  "What are the suggested fixes?",
  "Where does it break?",
  "What does a burst do?",
  "How do I get a PDF?",
  "Where are the AI features?",
];

export function reply(question: string, screen?: string): Reply {
  const ranked = rank(ENTRIES, question, screen);
  const top = ranked[0];
  // A one- or two-word question has little to score, so one keyword hit, even a one-typo match, is enough.
  const floor = tokens(question).length <= 2 ? 1.2 : MIN_SCORE;
  if (top && top.score >= floor) {
    // Other close matches: within 60% of the best score and above the floor.
    const also = ranked.slice(1, 4).filter((r) => r.score >= MIN_SCORE && r.score >= top.score * 0.6).map((r) => r.entry);
    return { kind: "answer", entry: top.entry, text: flatten(top.entry), also };
  }
  return { kind: "fallback", text: FALLBACK_TEXT, also: ranked.slice(0, 3).map((r) => r.entry) };
}

export function related(e: Entry): Entry[] {
  return (e.rel ?? []).map((id) => BY_ID.get(id)).filter((x): x is Entry => !!x);
}
