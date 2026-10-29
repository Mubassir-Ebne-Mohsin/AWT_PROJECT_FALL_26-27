import type { Report } from "@/lib/api/report";
import { milliseconds, numberText, percent } from "@/lib/result-presentation";

type Run = NonNullable<Report["run"]>;

export const verdictSentence = (v: "pass" | "strained" | "fail") =>
  v === "pass" ? "Meets its targets" : v === "strained" ? "Strained: close to its limits" : "Misses its targets";

export const dateText = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** What the report says about the chosen run. Never presents another revision's result as this one's. */
export function runStatement(run: Run | null, revision: number): { text: string; warn: boolean } {
  if (!run) return { text: `No test result has been recorded for revision ${revision}. Run a test on this revision to add one.`, warn: false };
  const what = run.kind === "limits" ? "Limits search" : "Test run";
  if (run.status === "pending") return { text: `This ${what.toLowerCase()} was still running when the report was made.`, warn: true };
  if (run.status === "failed") return { text: `This ${what.toLowerCase()} failed${run.failure ? ` (${run.failure.message})` : ""}. No numbers were produced.`, warn: true };
  if (!run.matchesRevision)
    return {
      text: `This result was recorded for revision ${run.designRevision}, not revision ${revision}. The numbers below describe revision ${run.designRevision}.`,
      warn: true,
    };
  if (run.kind === "limits") return { text: "A Limits search is not a simulation. Its result is shown under Limits.", warn: false };
  return { text: `Recorded for revision ${revision} on ${dateText(run.createdAt)}.`, warn: false };
}

/** Disclosure of whether a Limits search exists for the revision, stated as the model found it. */
export function limitsStatement(limits: Report["limits"]): string {
  if (!limits) return "A Limits search was not run for this revision, so this report states no breaking point.";
  if (limits.state === "found")
    return `The model found a breaking point: the design passes at ${numberText(limits.passingRps ?? 0, 0)} requests per second and fails at ${numberText(limits.failingRps ?? 0, 0)}${
      limits.firstComponent ? `. ${limits.firstComponent} saturates first` : ""
    }${limits.cause ? ` (${limits.cause === "both" ? "latency and errors" : limits.cause})` : ""}.`;
  if (limits.state === "failsAtMinimumLoad") return "The design already fails its targets at the lowest load tested, so no lower threshold is known.";
  return `The design did not fail within the tested range${limits.headroom !== null ? `; at least ${numberText(limits.headroom, 2)}x headroom (a lower bound)` : ""}.`;
}

export const noteScopeText = (scope: Report["noteScope"]) =>
  scope === "all" ? "All notes for this design." : scope === "decisions" ? "Decision notes only." : "Notes are not included.";

export function trafficRows(t: Report["traffic"]): Array<[string, string]> {
  return [
    ["Requests per second", numberText(t.rps, 0)],
    ["Burst multiplier", numberText(t.burst, 2) + "x"],
    ["Reads", percent(t.readRatio)],
    ["p95 latency target", milliseconds(t.sloP95)],
    ["Error budget", percent(t.errorBudget)],
    ["Duration", numberText(t.durationMin, 0) + " min"],
    ["Shape", t.shape],
  ];
}

export const reportFileTitle = (r: Pick<Report, "name" | "revision">) => `${r.name} - revision ${r.revision} report`;
