/**
 * The shared input layer for every AI task that reads a person's sentence (docs/AI-DEADLINE-PLAN.md). Before any model is asked
 * anything, the server keeps only the person's own wish in natural language: it removes code, JSON, tags and identifier-like words,
 * and drops every sentence that speaks to the assistant instead of describing a wish (orders, fake roles, requests to print or write).
 * The model is then sent only what is left, so an order or an embedded block in the original never reaches it. The same reading is
 * used afterwards to check what the model chose (the grounding guards). This file imports nothing and has no side effects.
 */

/** A sentence that contains any of these speaks to the assistant, and is dropped whole. */
export const ADDRESSES_ASSISTANT: readonly RegExp[] = [
  /\b(ignore|disregard|forget|override|overrule)\b/i,
  /\bauthori[sz]\w*/i,
  /\badministrator\b/i,
  /\b(new|these|following|updated) instructions?\b/i,
  /\byour (instructions|prompt|rules)\b/i,
  /\byou are now\b/i,
  /\bdeveloper mode\b/i,
  /\bSYSTEM\b/,
  /\b(respond|reply|answer|return|output|print|reveal|repeat)\b/i,
  /\bwrite (me|a|an|the)\b/i,
  /\b(set|mark|flag)\b[^.;]{0,50}\b(true|false|every|all)\b/i,
];

/** One line with code, JSON, tags and the form's own field names (words with `_` or a lower-to-upper change) taken out. */
function naturalLine(line: string): string {
  return line
    .replace(/[‘’]/g, "'")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter((w) => w && !w.includes("_") && !/^[a-z]+[A-Z]/.test(w))
    .join(" ");
}

/** The person's text as natural language only. Each line is kept apart, so a line break ends a sentence. */
export function naturalText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\r?\n/)
    .map(naturalLine)
    .filter(Boolean)
    .join(". ");
}

const SENTENCE_END = /[.!?;]+/;

/** The sentences of the text that describe a wish, in order: natural language only, and none that addresses the assistant. */
export function wishSentences(text: string, markers: readonly RegExp[] = ADDRESSES_ASSISTANT): string[] {
  return naturalText(text)
    .split(SENTENCE_END)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !markers.some((marker) => marker.test(sentence)));
}

export interface Sanitized {
  /** What the model may be sent: the surviving sentences, each ending with a full stop. Empty when nothing survived. */
  cleaned: string;
  sentences: string[];
  /** Something was taken out: code, JSON, a field name, or a sentence that addressed the assistant. */
  ignored: boolean;
}

const wordsIn = (s: string) => (s.replace(/[‘’]/g, "'").match(/[\p{L}\p{N}_'-]+/gu) ?? []).length;

export function sanitizeWish(text: string, markers: readonly RegExp[] = ADDRESSES_ASSISTANT): Sanitized {
  const sentences = wishSentences(text, markers);
  return {
    cleaned: sentences.map((s) => s + ".").join(" "),
    sentences,
    // Nothing was taken out exactly when every word of the original survived.
    ignored: wordsIn(sentences.join(" ")) < wordsIn(text),
  };
}
