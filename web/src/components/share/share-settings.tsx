"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { ReviewShares } from "@/components/review/review-shares";
import { Crumbs } from "@/components/shell/crumbs";
import { fetchRunSummaries, fetchVersions } from "@/lib/api/history";
import { createShare, fetchShares, revokeShare, type ShareLink } from "@/lib/api/shares";
import { verdictLabel } from "@/lib/history-presentation";
import { dateText } from "@/lib/report-presentation";
import { resolveRoute } from "@/lib/routes";
import { BOUNDARY_TEXT, EXPIRY_CHOICES, ONCE_TEXT, SNAPSHOT_TEXT, expiryText, openedText, scopeHelp, scopeLabel, shareErrorText, shareUrl } from "@/lib/share-presentation";

const MAX_ACTIVE = 5;
type Notice = { ok: boolean; text: string } | null;
type Fresh = { url: string; scope: ShareLink["scope"] };

export function ShareSettings({ id }: { id: string }) {
  const { user } = useAuth();
  const queries = useQueryClient();
  const uid = useId();
  const [scope, setScope] = useState<ShareLink["scope"]>("design_report");
  const [revision, setRevision] = useState("");
  const [run, setRun] = useState("");
  const [decisions, setDecisions] = useState(false);
  const [expiry, setExpiry] = useState("30");
  const [fresh, setFresh] = useState<Fresh | null>(null);
  const [copyText, setCopyText] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const urlInput = useRef<HTMLInputElement>(null);

  const shares = useQuery({ queryKey: ["shares", user?.id, id], queryFn: ({ signal }) => fetchShares(id, signal), enabled: !!user, retry: false });
  const versions = useQuery({ queryKey: ["report-versions", user?.id, id], queryFn: ({ signal }) => fetchVersions(id, undefined, signal), enabled: !!user, retry: false });
  const runs = useQuery({ queryKey: ["report-runs", user?.id, id], queryFn: ({ signal }) => fetchRunSummaries(id, signal), enabled: !!user, retry: false });

  const active = (shares.data ?? []).filter((s) => s.status === "active").length;
  const full = active >= MAX_ACTIVE;
  const completed = (runs.data ?? []).filter((r) => r.kind === "simulation" && r.status === "completed");

  const create = useMutation({
    mutationFn: () =>
      createShare(id, {
        scope,
        ...(revision ? { revision: Number(revision) } : {}),
        ...(scope === "design_report" && run ? { run } : {}),
        ...(scope === "design_report" ? { includeDecisions: decisions } : {}),
        expiresInDays: expiry === "never" ? null : (Number(expiry) as 7 | 30 | 90),
      }),
    onSuccess: (made) => {
      setFresh({ url: shareUrl(window.location.origin, made.token), scope: made.scope });
      setCopyText("");
      setNotice(null);
      void queries.invalidateQueries({ queryKey: ["shares", user?.id, id] });
    },
    onError: (e) => setNotice({ ok: false, text: shareErrorText(e) }),
  });

  const revoke = useMutation({
    mutationFn: (shareId: string) => revokeShare(id, shareId),
    onSuccess: () => {
      setConfirming(null);
      setNotice({ ok: true, text: "Link revoked. It stops working straight away." });
      void queries.invalidateQueries({ queryKey: ["shares", user?.id, id] });
    },
    onError: (e) => {
      setConfirming(null);
      setNotice({ ok: false, text: shareErrorText(e) });
    },
  });

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
      setCopyText("Link copied.");
    } catch {
      urlInput.current?.select();
      setCopyText("Could not copy automatically. The link is selected: copy it now.");
    }
  }

  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute(`/designs/${id}/share`)} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Share</span>
          <h1 className="h1">Share settings</h1>
          <p className="lede">Create a read-only link to a frozen copy of your design.</p>
        </div>
        <Link className="btn" href={`/designs/${id}/report`}>
          View the report
        </Link>
      </div>

      <p className="hint">{SNAPSHOT_TEXT}</p>

      {fresh && (
        <section className="panel stack m16-fresh" aria-label="Your new link" data-testid="share-fresh">
          <h2 className="h3">Your new link</h2>
          <p className="m16-warn">{ONCE_TEXT}</p>
          <div className="m15-field">
            <label htmlFor={uid + "u"}>Share link</label>
            <input id={uid + "u"} ref={urlInput} readOnly value={fresh.url} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div className="row">
            <button className="btn btn-primary" type="button" onClick={() => void copy()}>
              Copy link
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setFresh(null);
                setCopyText("");
              }}
            >
              I have copied it
            </button>
          </div>
          <p className="hint" role="status" aria-live="polite">
            {copyText}
          </p>
        </section>
      )}

      <form
        className="panel stack"
        aria-label="Create a link"
        onSubmit={(e) => {
          e.preventDefault();
          if (!full) create.mutate();
        }}
      >
        <h2 className="h3">Create a link</h2>
        <fieldset className="m15-field m16-fieldset">
          <legend>What the link shows</legend>
          {(["design_report", "design"] as const).map((s) => (
            <label key={s} className="m15-pick">
              <input type="radio" name={uid + "scope"} checked={scope === s} onChange={() => setScope(s)} />
              <span>
                <strong>{scopeLabel(s)}</strong>
                <span className="hint"> {scopeHelp(s)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="m15-pickers">
          <div className="m15-field">
            <label htmlFor={uid + "r"}>Revision</label>
            <select id={uid + "r"} value={revision} onChange={(e) => setRevision(e.target.value)} disabled={!versions.data}>
              <option value="">Current revision</option>
              {(versions.data ?? []).map((v) => (
                <option key={v.revision} value={v.revision}>
                  Revision {v.revision} · {dateText(v.createdAt)}
                </option>
              ))}
            </select>
          </div>
          {scope === "design_report" && (
            <div className="m15-field">
              <label htmlFor={uid + "x"}>Result</label>
              <select id={uid + "x"} value={run} onChange={(e) => setRun(e.target.value)} disabled={!runs.data}>
                <option value="">Latest result for this revision</option>
                {completed.map((r) => (
                  <option key={r.id} value={r.id}>
                    Revision {r.designRevision} · {dateText(r.createdAt)} · {verdictLabel(r.verdict)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="m15-field">
            <label htmlFor={uid + "e"}>Expires</label>
            <select id={uid + "e"} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              {EXPIRY_CHOICES.map((c) => (
                <option key={String(c.value)} value={c.value === null ? "never" : String(c.value)}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {scope === "design_report" && (
          <label className="m15-pick">
            <input type="checkbox" checked={decisions} onChange={(e) => setDecisions(e.target.checked)} />
            <span>Include my Decision notes (your assumptions stay private)</span>
          </label>
        )}
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={full || create.isPending}>
            {create.isPending ? "Creating…" : "Create link"}
          </button>
          <span className="hint">
            {active} of {MAX_ACTIVE} active links
            {full ? ". Revoke one to create another." : ""}
          </span>
        </div>
      </form>

      <div aria-live="polite">
        {notice && (
          <p className={notice.ok ? "hint" : "m15-error"} role={notice.ok ? "status" : "alert"} data-testid="share-notice">
            {notice.text}
          </p>
        )}
      </div>

      <section className="stack" aria-labelledby={uid + "l"}>
        <h2 className="h3" id={uid + "l"}>
          Links for this design
        </h2>
        <p className="hint">{BOUNDARY_TEXT}</p>
        {shares.isError ? (
          <div className="panel stack" role="alert">
            <p>{shareErrorText(shares.error)}</p>
            <button className="btn" type="button" onClick={() => void shares.refetch()}>
              Try again
            </button>
          </div>
        ) : !shares.data ? (
          <p className="hint" role="status">
            Loading links…
          </p>
        ) : shares.data.length === 0 ? (
          <p data-testid="share-empty">No links yet. Create one above.</p>
        ) : (
          <ul className="m16-links" aria-label="Links">
            {shares.data.map((s) => (
              <li key={s.id} className="panel stack m16-link" data-testid="share-link">
                <div className="row m15-vh">
                  <strong>{scopeLabel(s.scope)}</strong>
                  <span className={"tag " + (s.status === "active" ? "ok" : "")}>{s.status === "active" ? "Active" : s.status === "expired" ? "Expired" : "Revoked"}</span>
                  <span className="tag">Revision {s.revision}</span>
                  {s.includeDecisions && <span className="tag">With Decision notes</span>}
                </div>
                <p className="hint">
                  Created {dateText(s.createdAt)} · {expiryText(s)} · {openedText(s)}
                </p>
                {s.status === "active" &&
                  (confirming === s.id ? (
                    <div className="m15-confirm stack" role="group" aria-label="Confirm revoking this link">
                      <p>Stop this link? People who already opened it keep what they saw.</p>
                      <div className="row">
                        <button className="btn btn-primary" type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
                          Revoke link
                        </button>
                        <button className="btn" type="button" onClick={() => setConfirming(null)}>
                          Keep link
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="row">
                      <button className="btn" type="button" onClick={() => setConfirming(s.id)}>
                        Revoke
                      </button>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReviewShares id={id} />
    </div>
  );
}
