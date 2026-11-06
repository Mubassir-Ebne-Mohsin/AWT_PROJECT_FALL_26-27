import type { AdminMetrics } from "@/lib/admin-metrics";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  STATUSES,
  STATUS_LABEL_SUPPORT,
} from "@/lib/support";

/** Exact underlying counts stay visible; a missing duration is never presented as zero. */
function firstReply(ms: number | null): string {
  if (ms === null) return "No replies yet";
  const [value, unit]: [number, string] =
    ms < 1000
      ? [ms, "ms"]
      : ms < 60000
        ? [ms / 1000, "s"]
        : ms < 3600000
          ? [ms / 60000, "min"]
          : ms < 86400000
            ? [ms / 3600000, "h"]
            : [ms / 86400000, "days"];
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${unit}`;
}

export function SupportMetrics({
  metrics: m,
}: {
  metrics: AdminMetrics["support"];
}) {
  return (
    <div className="stack" data-testid="support-metrics">
      <p className="small muted">
        All time. Counts only; report content and identities are not included.
      </p>
      <dl className="kv">
        <dt>Unresolved reports</dt>
        <dd data-testid="support-unresolved">
          {m.unresolved.toLocaleString("en-US")}
        </dd>
        <dt>Total reports</dt>
        <dd data-testid="support-total">{m.total.toLocaleString("en-US")}</dd>
        <dt>Median first response</dt>
        <dd data-testid="support-first-response">
          {firstReply(m.medianFirstResponseMs)}
        </dd>
      </dl>
      <p className="small muted" data-testid="support-response-samples">
        {m.responded.toLocaleString("en-US")} of{" "}
        {m.total.toLocaleString("en-US")} reports have a valid first public
        Support reply time. Unanswered reports are excluded from the median.
        Internal notes do not count.
      </p>
      <p className="small muted">
        Unresolved includes Open, In progress and Waiting for the reporter.
      </p>
      <table className="table" aria-label="Reports by category">
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Reports</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((key) => (
            <tr key={key}>
              <th scope="row">{CATEGORY_LABEL[key]}</th>
              <td>{m.byCategory[key].toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="table" aria-label="Reports by status">
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Reports</th>
          </tr>
        </thead>
        <tbody>
          {STATUSES.map((key) => (
            <tr key={key}>
              <th scope="row">{STATUS_LABEL_SUPPORT[key]}</th>
              <td>{m.byStatus[key].toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
