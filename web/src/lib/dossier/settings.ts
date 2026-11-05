import { milliseconds, numberText, percent } from "@/lib/result-presentation";

// The settings a component carries, in one fixed order, formatted by the same helpers the report page uses (the PDF adds no figure
// of its own). Region has its own place in the table and in the diagram box, so it is not part of these lines.
const FULL: [string, (v: number) => string][] = [
  ["replicas", (v) => `${numberText(v, 0)} cop${v === 1 ? "y" : "ies"}`],
  ["capacity", (v) => `capacity ${numberText(v, 2)}`],
  ["latency", (v) => `latency ${milliseconds(v)}`],
  ["hitRatio", (v) => `hit ratio ${percent(v)}`],
  ["share", (v) => `share ${numberText(v, 3)}`],
  ["maxDepth", (v) => `max depth ${numberText(v, 0)}`],
];

const SHORT: [string, (v: number) => string][] = [
  ["replicas", (v) => `${numberText(v, 0)}x`],
  ["capacity", (v) => `cap ${numberText(v, 2)}`],
  ["latency", (v) => milliseconds(v).replace(" ", "")],
  ["hitRatio", (v) => `hit ${percent(v)}`],
  ["share", (v) => `share ${numberText(v, 3)}`],
  ["maxDepth", (v) => `depth ${numberText(v, 0)}`],
];

const parts = (table: typeof FULL, props: Record<string, unknown> | undefined) =>
  table.flatMap(([key, fmt]) => (typeof props?.[key] === "number" ? [fmt(props[key] as number)] : []));

/** The settings as one line for the Components table, or "defaults" when the component has none set. */
export function propertyText(props: Record<string, unknown>): string {
  const list = parts(FULL, props);
  return list.length ? list.join(", ") : "defaults";
}

/** The same settings, shortened for a diagram box, one item each ("3x", "cap 250", "40ms", "hit 80%"). Empty when none are set. */
export function compactTokens(props: Record<string, unknown> | undefined): string[] {
  return parts(SHORT, props);
}

/** The short settings as one line ("3x  cap 250  40ms  hit 80%"). Empty when none are set. */
export function compactSettings(props: Record<string, unknown> | undefined): string {
  return compactTokens(props).join("  ");
}

/** What the short words mean, for the sentence under the diagram. */
export const SETTINGS_KEY = "3x = three copies, cap = capacity, then latency, hit = cache hit ratio, depth = queue depth";
