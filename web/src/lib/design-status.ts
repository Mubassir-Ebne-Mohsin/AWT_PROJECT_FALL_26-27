import type { DashboardData } from "@/lib/api/designs";
export function designStatus(design: DashboardData["designs"][number]) {
  const run = design.latestRun;
  if (!run) return { label: "Not run", tone: "" };
  const stale = run.designRevision !== design.revision;
  const label =
    run.status === "pending"
      ? "Test running"
      : run.status === "failed"
        ? "Calculation failed"
        : run.verdict === "pass"
          ? "Passing"
          : run.verdict === "strained"
            ? "Strained"
            : run.verdict === "fail"
              ? "Missing target"
              : "Completed";
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
