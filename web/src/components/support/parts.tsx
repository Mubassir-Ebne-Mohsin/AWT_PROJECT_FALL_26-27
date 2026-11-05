"use client";

import { CONTEXT_LABEL, PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, contextRows, type Priority, type ReportContext, type Status } from "@/lib/support";

/** The reporter's words. React writes them as text, so markup in them is shown, never run; line breaks and long words stay inside the box. */
export function PlainText({ text, className = "" }: { text: string; className?: string }) {
  return <p className={`rp-text ${className}`.trim()}>{text}</p>;
}

export function StatusPill({ status, labels = STATUS_LABEL, testId = "status-pill" }: { status: Status; labels?: Record<Status, string>; testId?: string }) {
  return (
    <span className={`pill ${STATUS_TONE[status]}`} data-testid={testId}>
      <span className="dot" aria-hidden="true" /> {labels[status]}
    </span>
  );
}

export function PriorityPill({ priority, testId = "priority-pill" }: { priority: Priority; testId?: string }) {
  return (
    <span className={`pill ${PRIORITY_TONE[priority]}`} data-testid={testId}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** What the reporter chose to send with the report. Items they switched off are simply not here. */
export function ContextList({ context }: { context: ReportContext }) {
  const rows = contextRows(context);
  if (rows.length === 0) return <p className="hint">Nothing else was sent with this report.</p>;
  return (
    <dl className="rp-kv" data-testid="report-context-list">
      {rows.map((r) => (
        <div key={r.key} className="rp-kv-row">
          <dt>{CONTEXT_LABEL[r.key]}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
