import type { DashboardData } from "@/lib/api/designs";
export function designStatus(design: DashboardData["designs"][number]) {
  const run = design.latestRun;
  if (!run) return { label: "Not run", tone: "" };
  const stale = run.designRevision !== design.revision;
  const limits = run.kind === "limits";
  const label =
    (limits && run.status === "completed" ? "Limits searched · current load " : "") +
    (run.status === "pending"
      ? limits
        ? "Limits search running"
        : "Test running"
      : run.status === "failed"
        ? limits
          ? "Limits search failed"
          : "Calculation failed"
        : run.verdict === "pass"
          ? "Passing"
          : run.verdict === "strained"
            ? "Strained"
            : run.verdict === "fail"
              ? "Missing target"
              : "Completed");
  return {
    label: (stale ? "Earlier revision · " : "") + label,
    tone: stale
      ? ""
      : run.status === "failed" || run.verdict === "fail"
        ? "fail"
        : run.verdict === "strained"
          ? "warn"
          : run.verdict === "pass"
            ? "ok"
            : "",
  };
}
