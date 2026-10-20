"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { useUi } from "@/components/shell/ui-provider";
import { Icon } from "@/components/ui/icon";
import { FOREIGN_DESIGNS } from "@/lib/catalog";
import { notify } from "@/lib/notify";
import { ROUTES } from "@/lib/routes";
import { SYSTEM_STATES, SystemKind } from "@/lib/system-states";
import { API_URL } from "@/lib/api/client";

interface Props {
  kind: SystemKind;
  /** Path shown by the 404 state; defaults to the current URL. */
  path?: string;
  /** Forced from the dev switcher: demo behaviour instead of real recovery. */
  fromDev?: boolean;
  /** Called by "Try again" on the 500 state when rendered by an error boundary. */
  onRetry?: () => void;
  reference?: string;
}

const HEALTH_POLL_MS = 2500;

export function SystemScreen({ kind, path, fromDev, onRetry, reference }: Props) {
  const { closeSystem, setUI } = useUi();
  const { user, status, restore } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [showRaw, setShowRaw] = useState(false);

  const home = status === "authed" ? "/dashboard" : "/";

  // "Waking up": real mode polls the health endpoint until the API answers; demo mode runs a timer.
  useEffect(() => {
    if (kind !== "waking") return;
    const t0 = Date.now();
    const recovered = () => {
      closeSystem();
      notify("The server is awake. Everything is back to normal speed.", "ok");
      void queryClient.invalidateQueries();
      if (status === "loading") void restore();
    };
    if (fromDev) {
      const iv = setInterval(() => {
        const p = Math.min(1, (Date.now() - t0) / 7000);
        setProg(p);
        if (p >= 1) {
          clearInterval(iv);
          recovered();
        }
      }, 120);
      return () => clearInterval(iv);
    }
    let stopped = false;
    const tick = setInterval(() => setProg((p) => Math.min(0.95, p + 0.02)), 500);
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/health`, { credentials: "omit", signal: AbortSignal.timeout(4000) });
        // Any HTTP answer except a gateway error means the process is up; 503 with details still is "up".
        if (res.ok && !stopped) {
          clearInterval(tick);
          recovered();
          return;
        }
      } catch {
        // still down
      }
      if (!stopped) timeout = setTimeout(poll, HEALTH_POLL_MS);
    };
    let timeout = setTimeout(poll, HEALTH_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(tick);
      clearTimeout(timeout);
    };
    // Re-run only when the state itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, fromDev]);

  const retry = (message?: string) => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      onRetry?.();
      closeSystem();
      void queryClient.invalidateQueries();
      router.refresh();
      if (message) notify(message, "ok");
    }, 700);
  };

  const meta = SYSTEM_STATES.find((s) => s.id === kind) ?? { code: "", icon: "alert" };
  let tone = "";
  let title = "";
  let body: ReactNode = null;
  let detail: ReactNode = null;
  let actions: ReactNode = null;

  switch (kind) {
    case "404": {
      const p = path ?? pathname ?? "/";
      const seg = p.split("/").filter(Boolean)[0] ?? "";
      const near = ROUTES.filter((r) => !r.path.includes(":") && !r.redirectTo && seg && r.path.includes(seg.slice(0, 4))).slice(0, 3);
      const suggestions = near.length ? near : ROUTES.filter((r) => ["dashboard", "new", "learn"].includes(r.id));
      title = "There is no screen at this address.";
      body = (
        <p className="lede">
          Nothing matches <code>{p}</code>. The link may be mistyped, or the page was renamed.
        </p>
      );
      detail = (
        <div className="panel sys-detail stack">
          <div className="eyebrow">Try instead</div>
          <div className="row tight">
            {suggestions.map((r) => (
              <Link key={r.id} href={r.path} className="chip">
                {r.title as string}
              </Link>
            ))}
          </div>
        </div>
      );
      actions = (
        <>
          <Link href={home} className="btn btn-primary">
            {status === "authed" ? "Go to the dashboard" : "Go to the home page"}
          </Link>
          <button className="btn" onClick={() => setUI({ palette: true })}>
            <Icon n="search" /> Search all screens
          </button>
        </>
      );
      break;
    }
    case "403": {
      tone = "warn";
      const id = "acme-legacy";
      title = "This design belongs to another account.";
      body = (
        <p className="lede">
          You are logged in as {user ? user.email : "a guest"}. Ask the owner to share a read-only link, or open one of your own designs.
        </p>
      );
      detail = (
        <div className="panel sys-detail">
          <dl className="kv">
            <dt>Design</dt>
            <dd>{FOREIGN_DESIGNS[id]}</dd>
            <dt>Owner</dt>
            <dd>another account</dd>
            <dt>Your access</dt>
            <dd>none</dd>
          </dl>
        </div>
      );
      actions = (
        <>
          <Link href={home} className="btn btn-primary" onClick={closeSystem}>
            Back to your designs
          </Link>
          <button className="btn" onClick={() => notify("Access requests arrive with sharing in phase 3.", "info")}>
            Request access
          </button>
        </>
      );
      break;
    }
    case "500":
      tone = "fail";
      title = "Something broke on our side.";
      body = <p className="lede">The server hit an error while loading this page. Your designs are safe and nothing was lost.</p>;
      detail = (
        <div className="panel sys-detail">
          <dl className="kv">
            <dt>Reference</dt>
            <dd>{reference ?? "none"}</dd>
            <dt>When</dt>
            <dd>{new Date().toISOString().slice(0, 19).replace("T", " ")} UTC</dd>
          </dl>
          <p className="hint" style={{ marginTop: 10 }}>
            If it keeps happening, send feedback and include the reference.
          </p>
        </div>
      );
      actions = (
        <>
          <button className="btn btn-primary" onClick={() => retry()} disabled={busy}>
            {busy ? (
              <>
                <Icon n="refresh" className="spin" /> Retrying…
              </>
            ) : (
              <>
                <Icon n="refresh" /> Try again
              </>
            )}
          </button>
          <button className="btn" onClick={() => setUI({ feedback: true })}>
            Send feedback
          </button>
        </>
      );
      break;
    case "waking": {
      tone = "accent";
      const steps = ["Reaching the API", "Connecting to the database", "Connecting to Redis"];
      const at = Math.min(steps.length - 1, Math.floor(prog * steps.length));
      title = "Waking up the server.";
      body = (
        <p className="lede">
          {fromDev
            ? "This is a demo of the state; it closes after a few seconds."
            : "The API did not answer. If it runs on a free hosting tier it sleeps when idle and the first request takes 20 to 40 seconds. This page checks again every few seconds and returns on its own."}
        </p>
      );
      detail = (
        <div className="panel sys-detail stack">
          <div className="progress">
            <i style={{ width: `${Math.round(prog * 100)}%` }} />
          </div>
          <ol className="ph-list">
            {steps.map((x, i) => (
              <li key={x}>
                <Icon n={i < at || prog >= 1 ? "check" : i === at ? "refresh" : "clock"} s={14} className={i === at && prog < 1 ? "spin" : undefined} />
                <span className={i > at ? "muted" : ""}>{x}</span>
              </li>
            ))}
          </ol>
        </div>
      );
      actions = (
        <button className="btn" onClick={closeSystem}>
          Keep working while it starts
        </button>
      );
      break;
    }
    case "ratelimited":
      tone = "warn";
      title = "Too many requests. Slow down for a moment.";
      body = <p className="lede">You hit the rate limit that keeps the service free to run. Wait about a minute and try again; nothing you did was lost.</p>;
      detail = (
        <div className="panel sys-detail">
          <dl className="kv">
            <dt>Limit</dt>
            <dd>requests per minute, per IP</dd>
            <dt>Resets</dt>
            <dd>within 60 seconds</dd>
          </dl>
        </div>
      );
      actions = (
        <button className="btn btn-primary" onClick={() => retry()} disabled={busy}>
          {busy ? "Retrying…" : "Try again"}
        </button>
      );
      break;
    case "quota": {
      tone = "warn";
      const now = new Date();
      const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const mins = Math.round((reset.getTime() - now.getTime()) / 60000);
      title = "You have used all 50 AI calls for today.";
      body = (
        <p className="lede">
          AI drafts, suggestions and the assistant pause until the quota resets at 00:00 UTC, in {Math.floor(mins / 60)} h {mins % 60} min. The simulator, the editor and the limits finder don’t use AI and keep working.
        </p>
      );
      detail = (
        <div className="panel sys-detail stack">
          <div className="row between">
            <span className="label">AI calls today</span>
            <span className="mono num">50 / 50</span>
          </div>
          <div className="meter fail">
            <i style={{ width: "100%" }} />
          </div>
          <p className="hint">The quota keeps the product free to run. Rule-based suggestions don’t count against it.</p>
        </div>
      );
      actions = (
        <Link href={home} className="btn btn-primary" onClick={closeSystem}>
          Back to the app
        </Link>
      );
      break;
    }
    case "simfail":
      tone = "fail";
      title = "The simulation could not run.";
      body = <p className="lede">The design has a problem the simulator cannot model, so no numbers were produced. Nothing about your design was changed.</p>;
      detail = (
        <div className="panel sys-detail stack">
          <div className="eyebrow">Example of what the validator reports</div>
          <div className="issue error">
            <Icon n="xcircle" s={14} />
            <div>
              <b>Cycle found: App servers → Database → App servers.</b>Requests would loop forever. Delete one of these edges.
            </div>
          </div>
          <div className="issue warning">
            <Icon n="alert" s={14} />
            <div>
              <b>Queue has no workers.</b>Messages pile up and are never processed. Connect a Worker to it.
            </div>
          </div>
          <p className="hint">The simulator and this check arrive in phase 2.</p>
        </div>
      );
      actions = (
        <Link href="/dashboard" className="btn btn-primary" onClick={closeSystem}>
          Back to the dashboard
        </Link>
      );
      break;
    case "aiinvalid":
      tone = "fail";
      title = "The AI draft did not pass validation.";
      body = <p className="lede">The model returned a design that doesn’t match the schema, so nothing was applied to your canvas. Every AI output is checked before it can change a design.</p>;
      detail = (
        <div className="panel sys-detail stack">
          <div className="row between">
            <span className="eyebrow">Schema errors (2)</span>
            <span className="tag mock">Mock output</span>
          </div>
          <div className="issue error">
            <Icon n="xcircle" s={14} />
            <div className="mono" style={{ fontSize: 12 }}>nodes[2].type: expected one of client|cdn|lb|app|cache|db, got &quot;database&quot;</div>
          </div>
          <div className="issue error">
            <Icon n="xcircle" s={14} />
            <div className="mono" style={{ fontSize: 12 }}>edges[4].to: no node with id &quot;n9&quot;</div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => setShowRaw(!showRaw)}>
            <Icon n={showRaw ? "chevD" : "chevR"} s={14} /> {showRaw ? "Hide" : "Show"} the raw output
          </button>
          {showRaw && <pre className="codeblock">{`{ "nodes": [ ... { "id": "n3", "type": "database" } ], "edges": [ ... { "from": "n2", "to": "n9" } ] }`}</pre>}
        </div>
      );
      actions = (
        <button className="btn btn-primary" onClick={closeSystem}>
          Close
        </button>
      );
      break;
    case "maintenance":
      tone = "accent";
      title = "Scheduled maintenance until 02:30 UTC.";
      body = <p className="lede">We are upgrading the database. You can open designs and reports, but editing, tests and AI are paused until it finishes.</p>;
      detail = (
        <div className="panel sys-detail">
          <dl className="kv">
            <dt>Started</dt>
            <dd>02:00 UTC</dd>
            <dt>Expected end</dt>
            <dd>02:30 UTC</dd>
            <dt>Still works</dt>
            <dd>viewing designs, reports</dd>
            <dt>Paused</dt>
            <dd>edits, tests, AI</dd>
          </dl>
        </div>
      );
      actions = (
        <button className="btn btn-primary" onClick={closeSystem}>
          View designs read-only
        </button>
      );
      break;
    default:
      title = "Unknown state";
  }

  return (
    <div className="sys">
      <div className="row" style={{ gap: 16 }}>
        <div className={`sys-glyph ${tone}`}>
          <Icon n={meta.icon} s={28} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="sys-code">
            <span className="tag">{meta.code}</span>
            {fromDev && <span className="tag mock">Demo state</span>}
          </span>
        </div>
      </div>
      <h1 className="sys-title">{title}</h1>
      {body}
      {detail}
      <div className="row">
        {actions}
        {fromDev && (
          <button className="btn btn-ghost" onClick={closeSystem}>
            Leave this demo state
          </button>
        )}
      </div>
    </div>
  );
}
