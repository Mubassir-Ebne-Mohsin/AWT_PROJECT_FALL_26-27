import type { operations } from "@/lib/api/phase3-schema";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { milliseconds, percent } from "@/lib/result-presentation";

/** Verified fix suggestions: the request, and the words around what the server measured. No figure here is computed in the browser. */
export type Fixes = operations["suggestDesignFixes"]["responses"][200]["content"]["application/json"]["data"];
export type FixSuggestion = Fixes["suggestions"][number];
export type FixMeasure = Fixes["baseline"];

export type FixFilter = Fixes["filter"];
export type FixKindName = FixFilter["exclude"][number];
export type FixPreferenceName = FixFilter["preference"];
export const NO_FILTER: FixFilter = { exclude: [], preference: "default" };

/** Nothing is sent when the person asked for nothing, so the request is exactly the one made before there were choices. */
export const isNoFilter = (f: FixFilter) => f.exclude.length === 0 && f.preference === "default";

export const requestFixes = (designId: string, expectedRevision: number, runId: string, signal?: AbortSignal, filter: FixFilter = NO_FILTER) =>
  api<Fixes>("/designs/" + designId + "/fixes", { method: "POST", body: { expectedRevision, runId, ...(isNoFilter(filter) ? {} : { filter }) }, silent: true, scope: "local", signal });

/** The kinds of fix a person may leave out, and what to put first, in the words the panel shows. */
export const KIND_CHOICES: ReadonlyArray<{ kind: FixKindName; label: string }> = [
  { kind: "replicas", label: "More copies of the limiting part" },
  { kind: "capacity", label: "A bigger size" },
  { kind: "cache", label: "A cache" },
  { kind: "readReplica", label: "A read replica" },
];
export const PREFERENCE_CHOICES: ReadonlyArray<{ preference: FixPreferenceName; label: string }> = [
  { preference: "default", label: "The best result" },
  { preference: "simplest", label: "The lightest change" },
  { preference: "lowest_latency", label: "The lowest p95" },
  { preference: "fewest_errors", label: "The fewest errors" },
];

/** A filter with one kind switched on or off, keeping the kinds in their fixed order. */
export function toggleKind(filter: FixFilter, kind: FixKindName, excluded: boolean): FixFilter {
  const exclude = KIND_CHOICES.map((c) => c.kind).filter((k) => (k === kind ? excluded : filter.exclude.includes(k)));
  return { ...filter, exclude };
}

export const FIXES_NOTE =
  "These figures come from the same model as your test runs, at the same traffic. They are estimates from a model, not measurements of real infrastructure. Nothing changes until you apply a fix and save.";

const VERDICT: Record<FixMeasure["verdict"], string> = { pass: "passes", strained: "is strained", fail: "fails" };
export const verdictWord = (v: FixMeasure["verdict"]) => VERDICT[v];

/** What a fix does, said plainly and truthfully, from two measures of the same design at the same traffic. */
export function changeText(before: FixMeasure, after: FixMeasure): string {
  const outcome =
    after.verdict === "pass"
      ? "The design would pass."
      : after.verdict === before.verdict
        ? "It would still " + (after.verdict === "fail" ? "fail" : "be strained") + ", but less badly."
        : "The design would be " + (after.verdict === "strained" ? "strained instead of failing" : after.verdict) + ".";
  const parts: string[] = [];
  if (after.errorRate < before.errorRate - 1e-9) parts.push("errors fall from " + percent(before.errorRate) + " to " + percent(after.errorRate));
  if (after.p95 < before.p95 * 0.999) parts.push("p95 falls from " + milliseconds(before.p95) + " to " + milliseconds(after.p95));
  return outcome + (parts.length ? " " + parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts[1] ? " and " + parts[1] : "") + "." : "");
}

export function statusText(f: Fixes): string {
  if (f.status === "NOTHING_TO_FIX") return "This run passes, so there is nothing to fix.";
  if (f.status === "ALL_EXCLUDED") return "You left out every kind of fix that could be tried here, so none was tried. Untick one to see suggestions.";
  if (f.status === "INCOMPLETE") return "The calculation service was busy, so no fix could be checked. Try again in a moment.";
  if (f.status === "NO_IMPROVEMENT_FOUND")
    return f.limiter
      ? 'None of the ' + f.tried + ' fixes tried for "' + f.limiter.label + '" improved this design. The limit may be elsewhere, or the load may be too high for this shape of design.'
      : "There was no single component to aim at, so no fix was tried.";
  return "";
}

export function fixesError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Fix suggestions could not be made. Try again.";
  const reason = (error.details as { reason?: string } | undefined)?.reason;
  if (error.status === 401) return "Your session ended. Sign in again to see fixes.";
  if (reason === "RUN_NOT_CURRENT") return "This result is not for the saved design any more. Save, then run the test again first.";
  if (reason === "RUN_NOT_USABLE") return "Fixes need a completed test run.";
  if (error.status === 409) return "The design changed since this result. Reload it, then run the test again.";
  if (error.status === 429) return "Calculation capacity is busy. Try again in a moment.";
  if (error.status === 0 || error.code === "NETWORK") return "Could not reach the server.";
  return "Fix suggestions could not be made. Try again.";
}
