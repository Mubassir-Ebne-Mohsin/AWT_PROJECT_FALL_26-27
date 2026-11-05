"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { createReport } from "@/lib/api/support";
import { resolveRoute } from "@/lib/routes";
import {
  BODY_MAX,
  CATEGORIES,
  CATEGORY_HINT,
  CATEGORY_LABEL,
  EXPECTED_MAX,
  TITLE_MAX,
  buildRequest,
  collectContext,
  contextRows,
  draftIssues,
  duplicateCode,
  emptyDraft,
  supportErrorText,
  withoutKeys,
  type Category,
  type ReportDetail,
} from "@/lib/support";
import pkg from "../../../package.json";

/**
 * "Report a problem": a short form with the technical facts shown beside it, each of which can be switched off. Reports go to the
 * Support inbox; replies appear under My reports. Everything typed is sent as plain text and shown as text.
 */
export function ReportDialog({ path }: { path: string }) {
  const { ui, setUI } = useUi();
  const { status } = useAuth();
  const [draft, setDraft] = useState(() => emptyDraft());
  const [shown, setShown] = useState(false);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [sent, setSent] = useState<ReportDetail | null>(null);
  // Collected once, when the dialog opens, so what the person sees is exactly what would be sent.
  const [context] = useState(() =>
    collectContext({
      routePattern: resolveRoute(path).route.path,
      appVersion: pkg.version,
      userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
      width: typeof window === "undefined" ? 0 : window.innerWidth,
      height: typeof window === "undefined" ? 0 : window.innerHeight,
      now: new Date(),
      errorId: ui.reportRef,
    }),
  );
  const close = () => setUI({ feedback: false, reportRef: null });
  const issues = draftIssues(draft);
  const rows = contextRows(context);

  const set = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDuplicate(null);
    setError(null);
  };
  const toggle = (key: string) =>
    setRemoved((r) => {
      const next = new Set(r);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function submit(confirmDuplicate = false) {
    if (busy) return;
    setShown(true);
    if (Object.keys(issues).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      setSent(await createReport(buildRequest(draft, withoutKeys(context, removed), confirmDuplicate)));
    } catch (e) {
      const dup = duplicateCode(e);
      if (dup) setDuplicate(dup);
      else setError(supportErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="modal-h">
      <Icon n="msg" />
      <div className="h3 grow">Report a problem</div>
      <button className="btn btn-ghost icon btn-sm" aria-label="Close" onClick={close}>
        <Icon n="x" />
      </button>
    </div>
  );

  if (status !== "authed")
    return (
      <Modal label="Report a problem" onClose={close}>
        {header}
        <div className="modal-b stack" data-testid="report-signin">
          <p>Please log in to send a report, so Support can reply to you.</p>
        </div>
        <div className="modal-f">
          <button className="btn" onClick={close}>
            Close
          </button>
          <Link href="/login" className="btn btn-primary" onClick={close}>
            Log in
          </Link>
        </div>
      </Modal>
    );

  if (sent)
    return (
      <Modal label="Report received" onClose={close}>
        {header}
        <div className="modal-b stack" data-testid="report-sent" role="status">
          <p className="h3">We have your report.</p>
          <p>
            Your reference is <b data-testid="report-code">{sent.code}</b>. Support will read it and reply. You will find the reply, and can add more, under{" "}
            <Link href={`/reports/${sent.id}`} onClick={close}>
              My reports
            </Link>
            .
          </p>
          <p className="hint">Nothing else was sent. Support cannot see your designs.</p>
        </div>
        <div className="modal-f">
          <button className="btn btn-primary" onClick={close} data-autofocus>
            Done
          </button>
        </div>
      </Modal>
    );

  const shownIssues = shown ? issues : {};
  return (
    <Modal label="Report a problem" onClose={close} wide>
      {header}
      <div className="modal-b stack" data-testid="report-dialog">
        <div className="seg rp-seg" role="group" aria-label="What kind of problem">
          {CATEGORIES.map((c) => (
            <button key={c} aria-pressed={draft.category === c} onClick={() => set({ category: c as Category })} data-testid={`report-category-${c}`}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="field">
          <label className="label" htmlFor="rp-title">
            Title
          </label>
          <input
            id="rp-title"
            className={`input${shownIssues.title ? " bad" : ""}`}
            value={draft.title}
            maxLength={TITLE_MAX + 20}
            onChange={(e) => set({ title: e.target.value })}
            aria-invalid={!!shownIssues.title}
            aria-describedby={shownIssues.title ? "rp-title-err" : undefined}
            data-autofocus
            data-testid="report-title"
          />
          {shownIssues.title && (
            <span className="hint" id="rp-title-err" role="alert" style={{ color: "var(--fail-ink)" }}>
              {shownIssues.title}
            </span>
          )}
        </div>
        <div className="field">
          <label className="label" htmlFor="rp-body">
            What happened?
          </label>
          <textarea
            id="rp-body"
            className={`textarea${shownIssues.body ? " bad" : ""}`}
            rows={5}
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder={CATEGORY_HINT[draft.category]}
            aria-invalid={!!shownIssues.body}
            aria-describedby={shownIssues.body ? "rp-body-err" : "rp-body-count"}
            data-testid="report-body"
          />
          {shownIssues.body ? (
            <span className="hint" id="rp-body-err" role="alert" style={{ color: "var(--fail-ink)" }}>
              {shownIssues.body}
            </span>
          ) : (
            <span className="hint" id="rp-body-count">
              {draft.body.trim().length} of {BODY_MAX} characters
            </span>
          )}
        </div>
        <div className="field">
          <label className="label" htmlFor="rp-expected">
            What did you expect? <span className="muted">(optional)</span>
          </label>
          <textarea
            id="rp-expected"
            className={`textarea${shownIssues.expected ? " bad" : ""}`}
            rows={2}
            value={draft.expected}
            onChange={(e) => set({ expected: e.target.value })}
            aria-invalid={!!shownIssues.expected}
            data-testid="report-expected"
          />
          {shownIssues.expected && (
            <span className="hint" role="alert" style={{ color: "var(--fail-ink)" }}>
              {shownIssues.expected} ({EXPECTED_MAX} at most)
            </span>
          )}
        </div>

        <fieldset className="rp-context" data-testid="report-context">
          <legend className="label">Sent with your report (untick anything you do not want to share)</legend>
          {rows.length === 0 ? (
            <p className="hint">Nothing about your browser or screen will be sent.</p>
          ) : (
            <ul className="rp-context-list" role="list">
              {rows.map((r) => (
                <li key={r.key}>
                  <label className="row tight">
                    <input type="checkbox" checked={!removed.has(r.key)} onChange={() => toggle(r.key)} data-testid={`ctx-${r.key}`} />
                    <span className="rp-context-label">{r.label}</span>
                    <span className="muted rp-context-value">{r.value}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">Never sent: your password, sign-in, cookies, or anything inside your designs.</p>
        </fieldset>

        <p className="hint">If you delete your account later, your reports stay, without your name or email.</p>

        {duplicate && (
          <div className="note warn" role="alert" data-testid="report-duplicate">
            <Icon n="alert" />
            <div className="stack">
              <span>
                You already have an open report with this title (<b>{duplicate}</b>). You can add to that one under My reports, or send this as a new report.
              </span>
              <div className="row tight">
                <Link href="/reports" className="btn btn-sm" onClick={close}>
                  Open my reports
                </Link>
                <button className="btn btn-sm" onClick={() => void submit(true)} disabled={busy} data-testid="report-send-anyway">
                  Send anyway
                </button>
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="note fail" role="alert" data-testid="report-error">
            <Icon n="alert" />
            <span>{error}</span>
          </div>
        )}
      </div>
      <div className="modal-f">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void submit()} disabled={busy} data-testid="report-send">
          {busy ? "Sending…" : "Send report"}
        </button>
      </div>
    </Modal>
  );
}
