// Deterministic matching for the concept-help drawer. It scores every entry instead of taking the first regular expression that matches.
import type { Entry } from "./types";

const STOP = new Set(["a", "an", "the", "is", "are", "was", "were", "be", "do", "does", "did", "i", "me", "my", "we", "you", "your", "it", "its", "of", "to", "in", "on", "at", "for", "and", "or", "with", "this", "that", "what", "which", "how", "can", "should", "would", "could", "will", "about", "when", "where", "why", "who", "there", "any", "some", "if", "so", "as", "by", "from", "than", "then", "tell", "explain", "mean", "means", "meaning", "please", "help", "want", "need", "get", "make", "use"]);

/** Very light stemming: enough for plurals and -ing / -ed, no more. */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es") && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+%\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
}

const norm = (text: string) => " " + tokens(text).join(" ") + " ";

/** One typo (a single edit) is accepted for words of five letters or more. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

interface Prepared {
  entry: Entry;
  kwWords: Set<string>;
  kwPhrases: string[];
  qSets: string[][];
  titleSet: Set<string>;
}

const cache = new WeakMap<readonly Entry[], Prepared[]>();

function prepare(entries: readonly Entry[]): Prepared[] {
  const hit = cache.get(entries);
  if (hit) return hit;
  const out = entries.map((entry) => {
    const kwWords = new Set<string>();
    const kwPhrases: string[] = [];
    for (const k of entry.kw) {
      const t = tokens(k);
      if (t.length > 1) kwPhrases.push(" " + t.join(" ") + " ");
      else if (t.length === 1) kwWords.add(t[0]);
    }
    return { entry, kwWords, kwPhrases, qSets: entry.q.map(tokens), titleSet: new Set(tokens(entry.title)) };
  });
  cache.set(entries, out);
  return out;
}

export interface Scored {
  entry: Entry;
  score: number;
}

/** Score of one question against every entry, best first. `screen` gives a small boost to entries meant for the open screen. */
export function rank(entries: readonly Entry[], question: string, screen?: string): Scored[] {
  const qt = tokens(question);
  if (qt.length === 0) return [];
  const qn = " " + qt.join(" ") + " ";
  const qset = new Set(qt);
  const scored: Scored[] = [];
  for (const p of prepare(entries)) {
    let s = 0;
    for (const w of qt) {
      if (p.kwWords.has(w)) s += 2;
      else for (const k of p.kwWords) if (near(w, k)) { s += 1.2; break; }
      if (p.titleSet.has(w)) s += 1.5;
    }
    for (const ph of p.kwPhrases) if (qn.includes(ph)) s += 4;
    let best = 0;
    for (const set of p.qSets) {
      if (set.length === 0) continue;
      let common = 0;
      for (const w of set) if (qset.has(w)) common++;
      const cover = common / set.length; // how much of the example question the user's words cover
      const used = common / qt.length; // how much of the user's question the example explains
      best = Math.max(best, cover * 0.6 + used * 0.4);
    }
    s += best * 6;
    if (screen && p.entry.screens?.includes(screen)) s += 0.6;
    if (s > 0) scored.push({ entry: p.entry, score: s });
  }
  return scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
}

export const MIN_SCORE = 3;
export { norm };
