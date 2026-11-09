// The concept-help drawer's answers. No model is called: this is a fixed set of written answers chosen by scoring the words in the question
// (see src/lib/concept-help). It does not look at the design that is open, and it says so. Each answer describes how the tool behaves, not a measurement.
import { ENTRIES, FALLBACK_TEXT, POPULAR, flatten, reply } from "./concept-help";

export interface Concept {
  id: string;
  answer: string;
}

export const CONCEPTS: readonly Concept[] = ENTRIES.map((e) => ({ id: e.id, answer: flatten(e) }));

export const FALLBACK = FALLBACK_TEXT;

export function scriptedReply(question: string): string {
  return reply(question).text;
}

export const STARTER_CHIPS: readonly string[] = POPULAR;
