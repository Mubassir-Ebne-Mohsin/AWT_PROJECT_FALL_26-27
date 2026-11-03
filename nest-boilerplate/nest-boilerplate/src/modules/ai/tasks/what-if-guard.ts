import type { WhatIfChange } from "@/common/contracts/phase3/what-if.schema";

/**
 * The grounding guard for the what-if in words (declared in docs/AI-WHATIF-GATE-RUBRIC.md, section "The guard"). The sentence has
 * already been cleaned by the shared sanitizer. This file reads what numbers, multipliers, shapes and read shares the person's
 * own words give, keeps a choice of the model's only if those words support it, and never adds one. It is also, run on its own, a
 * complete deterministic reader of these sentences (`keywordWhatIf`), which is the no-model baseline: the guard and the baseline
 * are the same evidence, which is why the acceptance run reports what the model adds over it.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
const WORDS = [...Object.keys(UNITS), ...Object.keys(SCALES)].join("|");
const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, thousand: 1e3, million: 1e6, billion: 1e9 };

/** A number the sentence states: digits (with commas, decimals and a k / m / thousand / million / billion suffix) or number words. */
const MENTION = new RegExp(String.raw`\ba\s+(?:hundred|thousand|million|billion)\b|\b(?:${WORDS})(?:[\s-]+(?:${WORDS}))*\b|(?<![\w.])\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|thousand|million|billion)\b)?`, "gi");

export interface Mention {
  value: number;
  start: number;
  end: number;
}

function wordsToNumber(phrase: string): number {
  let total = 0;
  let current = 0;
  for (const word of phrase.toLowerCase().split(/[\s-]+/)) {
    if (word === "a") current = 1;
    else if (word in UNITS) current += UNITS[word];
    else if (word === "hundred") current = (current || 1) * 100;
    else if (word in SCALES) {
      total += (current || 1) * SCALES[word];
      current = 0;
    }
  }
  return total + current;
}

export function mentions(text: string): Mention[] {
  const found: Mention[] = [];
  for (const match of text.matchAll(MENTION)) {
    const raw = match[0].replace(/,+$/, "");
    let value: number;
    if (/^\d/.test(raw)) {
      const parts = /^([\d,]*\.?\d+)\s?(k|m|thousand|million|billion)?$/i.exec(raw.trim());
      if (!parts) continue;
      value = Number(parts[1].replace(/,/g, "")) * (parts[2] ? SUFFIX[parts[2].toLowerCase()] : 1);
    } else value = wordsToNumber(raw);
    if (Number.isFinite(value)) found.push({ value, start: match.index!, end: match.index! + raw.length });
  }
  return found;
}

const INCREASE = /\b(more|higher|up|increase[sd]?|grow[sn]?|grown|rises?|risen|jumps?|jumped|bigger|larger|greater|extra)\b/i;
const DECREASE = /\b(less|lower|down|decrease[sd]?|drops?|dropped|falls?|fell|cuts?|reduces?|reduced|fewer|smaller)\b/i;
const RATE_UNIT = /\b(rps|requests? (?:per|a) second|req\/s|requests\/s|per second|a second)\b|\brequests?\/s\b/i;

/** Multipliers the words give, in the order they appear: double, half, N times, N-fold, a factor of N, N percent more or less. */
export function multipliers(sentence: string): number[] {
  const text = sentence.replace(/\bhalf and half\b/gi, " ");
  const found: { at: number; value: number }[] = [];
  const word = (re: RegExp, value: number) => {
    for (const m of text.matchAll(re)) found.push({ at: m.index!, value });
  };
  word(/\b(doubles?|doubled|twice)\b/gi, 2);
  word(/\b(triples?|tripled|thrice)\b/gi, 3);
  word(/\b(quadruples?|quadrupled)\b/gi, 4);
  word(/\b(half|halve[sd]?)\b/gi, 0.5);
  for (const m of mentions(text)) {
    const after = text.slice(m.end);
    const before = text.slice(0, m.start);
    if (/^\s*(times|x\b|×|-?fold\b)/i.test(after)) found.push({ at: m.start, value: m.value });
    else if (/factor of\s+$/i.test(before) || /multipl\w*[^.;]{0,30}\bby\s+$/i.test(before)) found.push({ at: m.start, value: m.value });
    else if (/^\s*(%|percent|per cent)/i.test(after)) {
      const down = DECREASE.test(text);
      const up = INCREASE.test(text);
      // Rounded, so that 1 - 90/100 is 0.1 and not 0.09999999999999998.
      if (up !== down) found.push({ at: m.start, value: Math.round((down ? 1 - m.value / 100 : 1 + m.value / 100) * 1e6) / 1e6 });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.value);
}

/** Numbers that can be a requests-per-second rate: stated numbers, and only when the sentence has a rate unit. */
export function rates(sentence: string): number[] {
  return RATE_UNIT.test(sentence) ? mentions(sentence).map((m) => m.value) : [];
}

const SHAPE_WORDS = {
  spike: /\b(spikes?|spiky|burst|bursty|flash sale)\b/i,
  ramp: /\b(ramps?|ramping|gradual|gradually)\b/i,
  steady: /\b(steady|constant|flat)\b/i,
} as const;
const READ_WORDS = {
  mostly_reads: /\b(mostly reads?|read[- ]heavy)\b/i,
  mostly_writes: /\b(mostly writes?|write[- ]heavy)\b/i,
  balanced: /\b(half and half|balanced|50\/50|even mix)\b/i,
} as const;

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(b) * 0.005, 1e-9);
const firstIn = <K extends string>(table: Record<K, RegExp>, text: string): K | null => {
  let best: { key: K; at: number } | null = null;
  for (const key of Object.keys(table) as K[]) {
    const at = text.search(table[key]);
    if (at >= 0 && (!best || at < best.at)) best = { key, at };
  }
  return best?.key ?? null;
};

export interface WhatIfAnswer extends WhatIfChange {
  understood: boolean;
}
export interface GroundedWhatIf {
  change: WhatIfChange;
  /** The model's choices the words did not support, by field name. */
  dropped: string[];
}
const NONE: WhatIfChange = { trafficMode: "keep", value: 0, shape: "keep", readShare: "keep" };
const anything = (c: WhatIfChange) => c.trafficMode !== "keep" || c.shape !== "keep" || c.readShare !== "keep";

/** Keeps each choice of the model only if the (cleaned) sentence supports it. Never adds one. Bounds are not checked here: the refusal does that. */
export function groundWhatIf(cleaned: string, answer: WhatIfAnswer): GroundedWhatIf {
  if (!answer.understood) return { change: { ...NONE }, dropped: [] };
  const dropped: string[] = [];
  const out: WhatIfChange = { ...NONE };
  if (answer.trafficMode === "multiply") {
    if (multipliers(cleaned).some((m) => near(m, answer.value))) Object.assign(out, { trafficMode: "multiply", value: answer.value });
    else dropped.push("trafficMode");
  } else if (answer.trafficMode === "set") {
    if (rates(cleaned).some((n) => near(n, answer.value))) Object.assign(out, { trafficMode: "set", value: answer.value });
    else dropped.push("trafficMode");
  }
  if (answer.shape !== "keep") {
    if (SHAPE_WORDS[answer.shape].test(cleaned)) out.shape = answer.shape;
    else dropped.push("shape");
  }
  if (answer.readShare !== "keep") {
    if (READ_WORDS[answer.readShare].test(cleaned)) out.readShare = answer.readShare;
    else dropped.push("readShare");
  }
  return { change: anything(out) ? out : { ...NONE }, dropped };
}

/**
 * The no-model reader: what the words themselves say, first match wins. A multiplier beats a stated rate (a sentence that says both,
 * such as "10 times the load, 5k rps", is read as the multiplier). The baseline for the acceptance run.
 */
export function keywordWhatIf(cleaned: string): WhatIfChange {
  const out: WhatIfChange = { ...NONE };
  const [multiplier] = multipliers(cleaned);
  const [rate] = rates(cleaned);
  if (multiplier !== undefined) Object.assign(out, { trafficMode: "multiply", value: multiplier });
  else if (rate !== undefined) Object.assign(out, { trafficMode: "set", value: rate });
  out.shape = firstIn(SHAPE_WORDS, cleaned) ?? "keep";
  out.readShare = firstIn(READ_WORDS, cleaned) ?? "keep";
  return out;
}
