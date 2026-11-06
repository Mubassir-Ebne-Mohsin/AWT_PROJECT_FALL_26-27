import type { AdminMetrics } from "@/lib/admin-metrics";
import { A4, type Dossier, type Op } from "@/lib/dossier/ops";

/** Deliberate one-page allow-list: no account, design, note, prompt or Support content enters this layout. */
export function buildAdminSummary(m: AdminMetrics): Dossier {
  const rows: [string, number][] = [
    ["Accounts (all time)", m.totals.users],
    ["Suspended accounts", m.totals.suspendedUsers],
    ["Designs (all time)", m.totals.designs],
    ["Runs (all time)", m.totals.runs],
    ["Open shares", m.totals.openShares],
    ["Active accounts (15 minutes)", m.activeNow],
    ["Signups (24-hour chart window)", m.last24h.signups],
    ["Completed runs (24-hour chart window)", m.last24h.runsCompleted],
    ["Failed runs (24-hour chart window)", m.last24h.runsFailed],
    ["AI calls (24-hour chart window)", m.last24h.aiCalls],
    ["Support reports (all time)", m.support.total],
    ["Unresolved Support reports", m.support.unresolved],
    ["Designs created (rolling 28 days)", m.heatmap.designsCreated],
    ["Runs created (rolling 28 days)", m.heatmap.runsCreated],
    ["Total activity (rolling 28 days)", m.heatmap.total],
  ];
  const ops: Op[] = [];
  const text = (t: string, y: number, size = 11, bold = false, x = 40) =>
    ops.push({ k: "text", x, y, size, text: t, bold });
  text("STRESSFORGE / ADMIN SNAPSHOT", 52, 18, true);
  text(`UTC snapshot: ${m.generatedAt}`, 80, 10);
  text(
    "Aggregate numbers only. PDF is a headline summary; CSV and JSON contain the full snapshot.",
    103,
    9,
  );
  rows.forEach(([label, value], i) => {
    const y = 145 + i * 29;
    text(label, y);
    text(String(value), y, 12, true, 485);
  });
  text(`28-day window: ${m.heatmap.windowStart}`, 619, 9);
  text(`Until (exclusive): ${m.heatmap.windowEnd}`, 637, 9);
  text("Heatmap uses UTC weekdays and hours, Monday first.", 662, 9);
  text("Snapshot key", 711, 9, true);
  text(m.snapshotKey, 729, 9);
  text(
    "Recorded view, not a live export. Refresh the dashboard for newer numbers.",
    786,
    9,
  );
  return {
    title: "StressForge Admin snapshot",
    fileName: `stressforge-metrics-${m.generatedAt.replace(/:/g, "-")}.pdf`,
    replaced: 0,
    pages: [{ ...A4, replaced: 0, ops }],
  };
}
