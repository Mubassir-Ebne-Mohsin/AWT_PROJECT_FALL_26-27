"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { Icon } from "@/components/ui/icon";
import { fetchMe } from "@/lib/api/auth";
import { LEARN_TOPICS } from "@/lib/catalog";

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

const START_OPTIONS: Array<[string, string, string, string]> = [
  ["/new/describe", "wand", "Describe it in words", "Get an AI draft from a paragraph"],
  ["/new/template", "grid", "From a template", "Working designs to start from"],
  ["/new/blank", "square", "Blank canvas", "Draw it yourself"],
  ["/new/import", "upload", "Import JSON", "Bring a saved design"],
];

/** Phase 1 dashboard: the real greeting from GET /auth/me, with the prototype's cards as Phase 2 placeholders. */
export function Dashboard() {
  const { user: sessionUser } = useAuth();
  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const name = me.data?.displayName ?? sessionUser?.displayName;
  const first = name?.split(" ")[0];

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Dashboard</span>
          <h1 className="h1">{first ? `${greeting()}, ${first}.` : `${greeting()}.`}</h1>
          <p className="lede">
            {me.isError
              ? "We could not load your profile. Your designs will appear here in phase 2."
              : "Your designs and test runs will appear here. Designs, the editor and the simulator arrive in phase 2."}
          </p>
        </div>
        <div className="row">
          <Link href="/new/describe" className="btn">
            <Icon n="wand" /> Describe a system
          </Link>
          <Link href="/new" className="btn btn-primary">
            <Icon n="plus" /> New design
          </Link>
        </div>
      </div>

      <div className="stack xl">
        {me.data && (
          <div className="note accent" data-testid="me-card">
            <Icon n="user" />
            <div>
              Signed in as <b>{me.data.displayName}</b> ({me.data.email}), role <code>{me.data.role}</code>. Loaded from <code>GET /v1/auth/me</code>.
            </div>
          </div>
        )}

        <div className="readouts" aria-label="Summary (available in phase 2)">
          {[
            ["Designs", "—", "none yet"],
            ["Tests this week", "—", "none yet"],
            ["Missing target", "—", "needs a design"],
            ["AI calls left today", "—", "AI arrives in phase 3"],
          ].map(([label, value, sub]) => (
            <div className="readout" key={label}>
              <div className="eyebrow">{label}</div>
              <div className="v num muted">{value}</div>
              <div className="s">{sub}</div>
            </div>
          ))}
        </div>

        <section className="stack">
          <div className="row between">
            <h2 className="h2">Needs attention</h2>
            <span className="tag accent">Phase 2</span>
          </div>
          <div className="panel empty">Designs that miss their p95 or error target at the traffic you set will be listed here.</div>
        </section>

        <section className="stack">
          <div className="row between">
            <h2 className="h2">Your designs</h2>
            <span className="tag accent">Phase 2</span>
          </div>
          <div className="panel empty">
            <p>No designs yet.</p>
            <p className="hint" style={{ marginTop: 6 }}>
              Cards with a diagram, a live verdict and a breaking point will appear here.
            </p>
          </div>
        </section>

        <div className="split">
          <section className="panel">
            <div className="panel-h">
              <h2 className="h3">Recent test runs</h2>
              <span className="tag accent">Phase 2</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Design</th>
                    <th>When</th>
                    <th className="r">Traffic</th>
                    <th className="r">p95</th>
                    <th className="r">Errors</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={6} className="muted">
                      No runs yet.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <div className="stack lg">
            <section className="panel">
              <div className="panel-h">
                <h2 className="h3">Start something new</h2>
                <span className="tag accent">Phase 2</span>
              </div>
              <div className="panel-b stack">
                {START_OPTIONS.map(([to, icon, title, sub]) => (
                  <Link key={to} href={to} className="row" style={{ color: "var(--ink)", textDecoration: "none", gap: 12 }}>
                    <span className="pal-item" style={{ padding: 0 }}>
                      <span className="gl">
                        <Icon n={icon} />
                      </span>
                    </span>
                    <span className="grow">
                      <b style={{ fontWeight: 650 }}>{title}</b>
                      <br />
                      <span className="muted small">{sub}</span>
                    </span>
                    <Icon n="chevR" s={14} />
                  </Link>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-h">
                <h2 className="h3">Learn next</h2>
                <span className="tag">Phase 4</span>
              </div>
              <div className="panel-b row tight">
                {["p95", "caching", "queues", "replicas"].map((k) => (
                  <Link key={k} href={`/learn/${k}`} className="chip">
                    <Icon n="book" s={13} /> {LEARN_TOPICS[k]}
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
        <p className="hint">Every card above is a placeholder for phase 2. Only your name and role come from the API.</p>
      </div>
    </div>
  );
}
