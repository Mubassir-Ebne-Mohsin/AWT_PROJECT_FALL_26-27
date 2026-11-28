"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { ThemeSelect } from "@/components/shell/theme-select";
import { api } from "@/lib/api/client";
import seed from "@/lib/region-lab-starter.json";
import "@/styles/region-lab.css";
const base = "/region-lab";
const terminal = (s?: string) =>
  ["completed", "failed", "cancelled"].includes(s ?? "");
const number = (v: unknown, digits = 2) =>
  typeof v === "number"
    ? v.toLocaleString(undefined, { maximumFractionDigits: digits })
    : "Insufficient evidence";
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Diagram({ scenario }: { scenario: any }) {
  return (
    <div className="rl-diagram" aria-label="Architecture grouped by region">
      {scenario.regions.map((region: string) => (
        <section key={region}>
          <h3>
            <span className="rl-dot" />
            {region}
          </h3>
          {scenario.graph.nodes
            .filter((n: any) => n.region === region)
            .map((n: any) => (
              <div className="rl-node" key={n.id}>
                <span aria-hidden="true">
                  {n.type === "client" ? "◎" : n.type === "db" ? "▤" : "◇"}
                </span>
                <div>
                  <b>{n.label || n.id}</b>
                  <small>
                    {n.type}
                    {n.replicas
                      ? [
                          "db",
                          "replica",
                          "queue",
                          "storage",
                          "external",
                        ].includes(n.type)
                        ? " · single resource"
                        : ` · ${n.replicas} replica${n.replicas === 1 ? "" : "s"}`
                      : ""}
                  </small>
                </div>
              </div>
            ))}
        </section>
      ))}
      <p className="rl-caption">
        {scenario.graph.edges.length} declared connections · routing and network
        links are separate inputs
      </p>
    </div>
  );
}
function resultRows(view: string, rows: any[]) {
  return view === "regions" || view === "operations"
    ? rows.map((r) => ({
        [view === "regions" ? "Region" : "Operation"]: r.region ?? r.operation,
        Verdict: r.verdict ?? r.summary.verdict,
        ...(r.target
          ? {
              "p95 target (ms)": r.target.p95Ms,
              "Error budget (%)": r.target.errorBudgetRatio * 100,
            }
          : {}),
        Offered: r.summary.offeredRequests,
        Successful: r.summary.successfulRequests,
        Failed: r.summary.failedRequests,
        "Errors (%)":
          r.summary.errorRateRatio === null
            ? null
            : Number((r.summary.errorRateRatio * 100).toFixed(3)),
        "p50 (ms)": r.summary.latency.p50Ms,
        "p95 (ms)": r.summary.latency.p95Ms,
        "p99 (ms)": r.summary.latency.p99Ms,
      }))
    : rows;
}
function JsonTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <p>No records in this view.</p>;
  const keys = Object.keys(rows[0]);
  return (
    <div
      className="rl-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Recorded data table"
    >
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {keys.map((k) => (
                <td key={k}>
                  {row[k] === null ? (
                    "—"
                  ) : typeof row[k] === "object" ? (
                    <pre>{JSON.stringify(row[k], null, 2)}</pre>
                  ) : (
                    String(row[k])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RegionLabWorkspace({
  view = "intro",
  id,
}: {
  view?: "intro" | "experiments" | "experiment" | "run";
  id?: string;
}) {
  const { status, user } = useAuth(),
    router = useRouter(),
    cache = useQueryClient();
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(true),
    [cursor, setCursor] = useState<string | null>(null),
    [name, setName] = useState("Regional capacity experiment"),
    [description, setDescription] = useState(""),
    [draft, setDraft] = useState<any>(seed),
    [loaded, setLoaded] = useState(""),
    [json, setJson] = useState(""),
    [selected, setSelected] = useState(""),
    [side, setSide] = useState("baseline"),
    [repetition, setRepetition] = useState(0),
    [resultView, setResultView] = useState("regions"),
    [resultCursor, setResultCursor] = useState<string | null>(null),
    [otherId, setOtherId] = useState(""),
    [rightSide, setRightSide] = useState("outage"),
    [comparison, setComparison] = useState<any>(null),
    [showProfiles, setShowProfiles] = useState(false);
  const requestId = useRef<{ revision: number; id: string } | null>(null),
    session = useRef(user?.id);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (session.current !== user?.id) {
      session.current = user?.id;
      setComparison(null);
      setDraft(seed);
      setLoaded("");
      setJson("");
      setError("");
      requestId.current = null;
    }
  }, [user?.id]);
  const go=(path:string)=>{if(alive.current)router.push(path);};
  const owner = user?.id ?? "guest",
    authed = status === "authed";
  const list = useQuery({
    queryKey: ["region", owner, "experiments", cursor],
    enabled: authed && view === "experiments",
    queryFn: ({ signal }) =>
      api<any>(
        base +
          "/experiments" +
          (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
        { signal, scope: "local" },
      ),
    retry: 1,
  });
  const experiment = useQuery({
    queryKey: ["region", owner, "experiment", id],
    enabled: authed && view === "experiment",
    queryFn: ({ signal }) =>
      api<any>(base + "/experiments/" + id, { signal, scope: "local" }),
    staleTime:Infinity,refetchOnWindowFocus:false,refetchOnReconnect:false,
    retry: 1,
  });
  const history = useQuery({
    queryKey: ["region", owner, "runs", id, historyCursor],
    enabled: authed && view === "experiment",
    queryFn: ({ signal }) =>
      api<any>(
        base +
          "/experiments/" +
          id +
          "/runs" +
          (historyCursor ? "?before=" + encodeURIComponent(historyCursor) : ""),
        { signal, scope: "local" },
      ),
    retry: 1,
  });
  const profiles = useQuery({
    queryKey: ["region", owner, "profiles"],
    enabled: authed && showProfiles,
    queryFn: ({ signal }) =>
      api<any>(base + "/profiles", { signal, scope: "local" }),
    retry: 1,
  });
  const run = useQuery({
    queryKey: ["region", owner, "run", id],
    enabled: authed && view === "run" && visible,
    queryFn: ({ signal }) =>
      api<any>(base + "/runs/" + id, { signal, scope: "local" }),
    refetchInterval: (q) =>
      terminal(q.state.data?.status)
        ? false
        : Math.min(10000, 1000 * 2 ** Math.min(q.state.errorUpdateCount, 3)),
    refetchIntervalInBackground: false,
    retry: 2,
  });
  useEffect(() => {
    if (run.data?.availableSides && !run.data.availableSides.includes(side))
      setSide(run.data.availableSides[0]);
  }, [run.data, side]);
  const result = useQuery({
    queryKey: [
      "region",
      owner,
      "result",
      id,
      side,
      repetition,
      resultView,
      resultCursor,
    ],
    enabled:
      authed &&
      view === "run" &&
      run.data?.status === "completed" &&
      (run.data.availableSides ?? ["baseline"]).includes(side),
    queryFn: ({ signal }) =>
      api<any>(
        base +
          `/runs/${id}/results?scenario=${side}&repetition=${repetition}&view=${resultView}` +
          (resultCursor ? "&cursor=" + encodeURIComponent(resultCursor) : ""),
        { signal, scope: "local" },
      ),
    retry: 1,
  });
  useEffect(() => {
    const e = experiment.data,
      key = e ? `${owner}:${e.id}:${e.revision}` : "";
    if (e && key !== loaded) {
      setDraft(e.scenario);
      setName(e.name);
      setDescription(e.description);
      setLoaded(key);
      setJson("");
    }
  }, [experiment.data, loaded, owner]);
  const action = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(
        (e instanceof Error
          ? e.message
          : "Request did not complete. Retry when ready.") +
          ((e as any)?.details
            ? " · " + JSON.stringify((e as any).details)
            : ""),
      );
    } finally {
      setBusy(false);
    }
  };
  const current = () => (json ? JSON.parse(json) : draft);
  const update = (fn: (s: any) => void) => {
    const s = structuredClone(draft);
    fn(s);
    setDraft(s);
    setJson("");
  };
  const create = () =>
    action(async () => {
      const e = await api<any>(base + "/experiments", {
        method: "POST",
        body: { name, description, scenario: current() },
        scope: "local",
      });
      await cache.invalidateQueries({ queryKey: ["region", owner] });
      go(base + "/experiments/" + e.id);
    });
  const persist = () =>
    action(async () => {
      const e = await api<any>(base + "/experiments/" + id, {
        method: "PATCH",
        body: {
          expectedRevision: experiment.data.revision,
          name,
          description,
          scenario: current(),
        },
        scope: "local",
      });
      if(!alive.current)return;
      cache.setQueryData(["region", owner, "experiment", id], e);
      setError("Saved as revision " + e.revision);
    });
  const submit = () =>
    action(async () => {
      const revision = experiment.data.revision;
      if (!requestId.current || requestId.current.revision !== revision)
        requestId.current = { revision, id: crypto.randomUUID() };
      const accepted = await api<any>(base + `/experiments/${id}/runs`, {
        method: "POST",
        body: { expectedRevision: revision, requestId: requestId.current.id },
        scope: "local",
      });
      requestId.current=null;
      if(accepted.run.retained===false){setError("The original accepted result expired. Click Run again to create a new request.");return;}
      go(base + "/runs/" + accepted.run.id);
    });
  const download = (kind: "export" | "report") =>
    action(async () => {
      const blob = await api<Blob>(base + `/runs/${id}/${kind}`, {
        binary: true,
        scope: "local",
      });
      if(alive.current)saveFile(blob, `region-lab-${id}.${kind === "report" ? "pdf" : "json"}`);
    });
  const input = (
    title: string,
    value: number,
    change: (v: number) => void,
    min = 0,
    max = 60000,
  ) => (
    <label>
      {title}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => change(Number(e.target.value))}
      />
    </label>
  );
  const queryError = [
    list.error,
    experiment.error,
    history.error,
    run.error,
    result.error,
    profiles.error,
  ].find(Boolean);
  const activeNode = draft.graph.nodes.find((n: any) => n.id === selected),
    profile = draft.profiles.find((p: any) => p.id === activeNode?.profileId);
  const dirty =
    !!experiment.data &&
    (name !== experiment.data.name ||
      description !== experiment.data.description ||
      JSON.stringify(currentSafe()) !==
        JSON.stringify(experiment.data.scenario));
  function currentSafe() {
    try {
      return current();
    } catch {
      return null;
    }
  }
  if (view !== "intro" && !authed)
    return (
      <div className="rl">
        <p role="status">Checking your session…</p>
      </div>
    );
  return (
    <div className="rl">
      <header className="rl-nav">
        <Link className="rl-brand" href={base}>
          <span aria-hidden="true">◈</span> REGION LAB{" "}
          <small>by STRESSFORGE</small>
        </Link>
        <nav aria-label="Region Lab">
          <Link href="/dashboard">StressForge</Link>
          <Link href={base + "/experiments"}>Experiments</Link>
          <Link href={base + "#guide"}>Guide</Link>
          <ThemeSelect />
          {!authed && (
            <Link
              className="rl-primary"
              href="/login?next=%2Fregion-lab%2Fexperiments"
            >
              Log in
            </Link>
          )}
        </nav>
      </header>
      <div className="rl-body">
        {(error || queryError) && (
          <div className="rl-notice" role="status">
            {error ||
              (queryError instanceof Error
                ? queryError.message
                : "Could not load this view.")}{" "}
            {queryError && (
              <button
                onClick={() => {
                  void cache.invalidateQueries({ queryKey: ["region", owner] });
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {view === "intro" ? (
          <>
            <section className="rl-hero">
              <div>
                <p className="rl-eyebrow">CAPACITY / GEOGRAPHY / RESILIENCE</p>
                <h1>
                  Distance changes
                  <br />
                  the design.
                </h1>
                <p>
                  Explore where requests travel, how capacity fills and what
                  happens while a region’s failure is still being detected.
                </p>
                <div className="rl-actions">
                  <Link className="rl-primary" href={base + "/experiments"}>
                    Open the lab ↗
                  </Link>
                  <a href="#guide">Understand the model ↓</a>
                </div>
                <p className="rl-caption">
                  Seeded event simulation · private experiments · explicit
                  assumptions
                </p>
              </div>
              <Diagram scenario={seed} />
            </section>
            <div className="rl-cards">
              {[
                [
                  "01",
                  "Declare the system",
                  "Choose regions, component profiles, traffic, routing and targets. Every profile carries its assumptions.",
                ],
                [
                  "02",
                  "Run a controlled outage",
                  "Test baseline and outage with the same seed. Detection and switching take real simulated time.",
                ],
                [
                  "03",
                  "Inspect the evidence",
                  "Read each recorded repetition, regional outcomes, component queues and arrival-cohort timelines.",
                ],
              ].map(([n, title, text]) => (
                <article key={n}>
                  <span className="rl-eyebrow">{n}</span>
                  <h2>{title}</h2>
                  <p>{text}</p>
                </article>
              ))}
            </div>
            <section className="rl-panel" id="guide">
              <p className="rl-eyebrow">KNOW THE BOUNDARY</p>
              <h2>A model you can inspect.</h2>
              <p>
                Reference and custom profiles are assumptions, not measured
                cloud hardware. Region Lab models service pools, directed
                bandwidth and propagation, explicit route candidates, detection
                clocks, queues and ordered replica application. It does not
                model database promotion, partitions, autoscaling or cold
                caches.
              </p>
              <p>
                Errors count failed original requests. p95 needs 1,000
                successful observations; p99 needs 10,000. Missing evidence
                remains unavailable. Histograms are captured during execution;
                older runs never gain invented samples.
              </p>
              <p>
                Paired sides share inputs and seeds. Comparison reports
                mismatched foundations instead of subtracting incompatible
                numbers.
              </p>
              <Link href="/evaluation/simulator">
                Read existing simulator evidence ↗
              </Link>
            </section>
          </>
        ) : view === "experiments" ? (
          <>
            <div className="rl-title">
              <div>
                <p className="rl-eyebrow">PRIVATE WORKSPACE</p>
                <h1>Your experiments</h1>
                <p>
                  Saved configurations and recorded runs belong to your account.
                </p>
              </div>
              <button onClick={() => setShowProfiles(!showProfiles)}>
                Profile catalog
              </button>
            </div>
            {showProfiles && (
              <section className="rl-panel">
                <h2>Operator assumptions</h2>
                <p>
                  These profiles are uncalibrated. Custom profiles record your
                  own assumptions.
                </p>
                <JsonTable rows={profiles.data?.items ?? []} />
              </section>
            )}
            <div className="rl-split">
              <section className="rl-panel">
                <h2>Create an experiment</h2>
                <label>
                  Name
                  <input
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    maxLength={2000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <p>
                  Starts with two regions and a shared primary. All values can
                  be edited before the first test.
                </p>
                <button
                  className="rl-primary"
                  disabled={busy || !name.trim()}
                  onClick={create}
                >
                  Create private experiment
                </button>
              </section>
              <section className="rl-panel">
                <h2>Recent experiments</h2>
                {list.isPending ? (
                  <p role="status">Loading experiments…</p>
                ) : !list.data?.items.length ? (
                  <p>
                    No experiments yet. Start with the configuration on the
                    left.
                  </p>
                ) : (
                  list.data.items.map((e: any) => (
                    <Link
                      className="rl-list-item"
                      href={base + "/experiments/" + e.id}
                      key={e.id}
                    >
                      <span>
                        <b>{e.name}</b>
                        <small>
                          Revision {e.revision} ·{" "}
                          {new Date(e.updatedAt).toLocaleDateString()}
                        </small>
                      </span>
                      <span aria-hidden="true">↗</span>
                    </Link>
                  ))
                )}
                <div className="rl-actions">
                  {cursor && (
                    <button onClick={() => setCursor(null)}>Newest</button>
                  )}
                  {list.data?.nextCursor && (
                    <button onClick={() => setCursor(list.data.nextCursor)}>
                      Older experiments
                    </button>
                  )}
                </div>
              </section>
            </div>
          </>
        ) : view === "experiment" ? (
          <>
            <div className="rl-title">
              <div>
                <p className="rl-eyebrow">CONFIGURE / RUN / REFINE</p>
                <h1>{experiment.data?.name ?? "Experiment"}</h1>
                <p>
                  Revision {experiment.data?.revision ?? "…"} · uncalibrated
                  assumptions{dirty ? " · unsaved changes" : " · saved"}
                </p>
              </div>
              <div className="rl-actions">
                <button
                  disabled={busy || !experiment.data || !dirty || !name.trim()}
                  onClick={persist}
                >
                  Save revision
                </button>
                <button
                  className="rl-primary"
                  disabled={busy || !experiment.data || dirty}
                  onClick={submit}
                >
                  Run saved revision
                </button>
              </div>
            </div>
            {experiment.isPending ? (
              <p role="status">Loading configuration…</p>
            ) : (
              experiment.data && (
                <>
                  <Diagram scenario={draft} />
                  <div className="rl-editor">
                    <section className="rl-panel">
                      <h2>Workload & targets</h2>
                      <label>
                        Name
                        <input
                          value={name}
                          maxLength={100}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      <div className="rl-fields">
                        {input(
                          "Baseline requests/s",
                          draft.workload.baselineRps,
                          (v) => update((s) => (s.workload.baselineRps = v)),
                          0,
                          20000,
                        )}
                        {input(
                          "Test seconds",
                          draft.workload.durationSeconds,
                          (v) =>
                            update((s) => {
                              s.workload.durationSeconds = v;
                              s.workload.schedule.at(-1).atSeconds = v;
                            }),
                          10,
                          3600,
                        )}
                        {input(
                          "Warmup seconds",
                          draft.workload.warmupSeconds,
                          (v) => update((s) => (s.workload.warmupSeconds = v)),
                          0,
                          600,
                        )}
                        {input(
                          "p95 target (ms)",
                          draft.targets.p95Ms,
                          (v) => update((s) => (s.targets.p95Ms = v)),
                          1,
                        )}
                        {input(
                          "Error budget (%)",
                          draft.targets.errorBudgetRatio * 100,
                          (v) =>
                            update(
                              (s) => (s.targets.errorBudgetRatio = v / 100),
                            ),
                          0,
                          100,
                        )}
                        {input(
                          "Seed",
                          draft.runOptions.seed,
                          (v) => update((s) => (s.runOptions.seed = v)),
                          0,
                          4294967295,
                        )}
                        {input(
                          "Repetitions",
                          draft.runOptions.repetitions,
                          (v) => update((s) => (s.runOptions.repetitions = v)),
                          1,
                          5,
                        )}
                        <label>
                          Run mode
                          <select
                            value={draft.runOptions.mode}
                            onChange={(e) =>
                              update(
                                (s) => (s.runOptions.mode = e.target.value),
                              )
                            }
                          >
                            <option value="baseline">Baseline</option>
                            <option value="outage" disabled={!draft.outage}>
                              Outage
                            </option>
                            <option value="paired" disabled={!draft.outage}>
                              Paired
                            </option>
                          </select>
                        </label>
                      </div>
                      <p className="rl-caption">
                        The total rate is allocated by regional and operation
                        shares, never duplicated for each origin.
                      </p>
                    </section>
                    <section className="rl-panel">
                      <h2>Components</h2>
                      <label>
                        Deployment
                        <select
                          value={selected}
                          onChange={(e) => setSelected(e.target.value)}
                        >
                          <option value="">Choose a component</option>
                          {draft.graph.nodes.map((n: any) => (
                            <option value={n.id} key={n.id}>
                              {n.label} · {n.region}
                            </option>
                          ))}
                        </select>
                      </label>
                      {activeNode && (
                        <>
                          <p>
                            {activeNode.type} · {activeNode.region}
                          </p>
                          {activeNode.replicas &&
                            ![
                              "db",
                              "replica",
                              "queue",
                              "storage",
                              "external",
                            ].includes(activeNode.type) &&
                            input(
                              "Replicas",
                              activeNode.replicas,
                              (v) =>
                                update(
                                  (s) =>
                                    (s.graph.nodes.find(
                                      (n: any) => n.id === selected,
                                    ).replicas = v),
                                ),
                              1,
                              100,
                            )}
                          {profile && (
                            <>
                              <p>
                                Profile: {profile.label}. Editing this profile
                                changes every deployment that references it.
                              </p>
                              <label>
                                Service properties (JSON)
                                <textarea
                                  className="rl-code"
                                  key={profile.id + ":" + loaded}
                                  defaultValue={JSON.stringify(
                                    profile.properties,
                                    null,
                                    2,
                                  )}
                                  onBlur={(e) => {
                                    try {
                                      const value = JSON.parse(e.target.value);
                                      update(
                                        (s) =>
                                          (s.profiles.find(
                                            (p: any) => p.id === profile.id,
                                          ).properties = value),
                                      );
                                    } catch {
                                      setError(
                                        "Invalid service properties JSON. Correct it, then leave the field again. No changes were applied.",
                                      );
                                    }
                                  }}
                                />
                              </label>
                            </>
                          )}
                        </>
                      )}
                    </section>
                  </div>
                  <section className="rl-panel">
                    <h2>Outage plan</h2>
                    <label className="rl-check">
                      <input
                        aria-label="Enable deployment outage"
                        type="checkbox"
                        checked={!!draft.outage}
                        onChange={(e) =>
                          update((s) => {
                            const node =
                              s.graph.nodes.find(
                                (n: any) =>
                                  n.type === "app" && n.region === s.regions[1],
                              ) ??
                              s.graph.nodes.find((n: any) => n.type === "app");
                            if (e.target.checked && node) {
                              s.outage = {
                                id: "deployment_outage",
                                scope: "application_deployment",
                                region: node.region,
                                affectedNodeIds: [node.id],
                                startSeconds: 3,
                                durationSeconds: Math.min(
                                  6,
                                  s.workload.durationSeconds - 3,
                                ),
                                inFlightPolicy: "abort_at_failed_node",
                              };
                              s.runOptions.mode = "paired";
                            } else {
                              s.outage = null;
                              s.runOptions.mode = "baseline";
                            }
                          })
                        }
                      />
                      Enable deployment outage
                    </label>
                    <p>
                      Compare healthy and outage sides with the same inputs and
                      seed. A failed deployment is not immediately observed by
                      the router.
                    </p>
                    {draft.outage && (
                      <>
                        <div className="rl-fields">
                          <label>
                            Outage target
                            <select
                              aria-label="Outage target"
                              value={draft.outage.affectedNodeIds[0]}
                              onChange={(e) =>
                                update((s) => {
                                  const node = s.graph.nodes.find(
                                    (n: any) => n.id === e.target.value,
                                  );
                                  s.outage.region = node.region;
                                  s.outage.affectedNodeIds = [node.id];
                                })
                              }
                            >
                              {draft.graph.nodes
                                .filter((n: any) =>
                                  [
                                    "app",
                                    "lb",
                                    "gateway",
                                    "cache",
                                    "worker",
                                  ].includes(n.type),
                                )
                                .map((n: any) => (
                                  <option value={n.id} key={n.id}>
                                    {n.label} · {n.region}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {input(
                            "Outage starts (seconds)",
                            draft.outage.startSeconds,
                            (v) => update((s) => (s.outage.startSeconds = v)),
                            0,
                            draft.workload.durationSeconds,
                          )}
                          {input(
                            "Outage duration (seconds)",
                            draft.outage.durationSeconds,
                            (v) =>
                              update((s) => (s.outage.durationSeconds = v)),
                            1,
                            3600,
                          )}
                        </div>
                        <p className="rl-caption">
                          This control selects one deployment. Advanced JSON
                          supports a subset of deployments in one region.
                          Database promotion and network partitions are
                          unsupported.
                        </p>
                      </>
                    )}
                    <details>
                      <summary>Route candidates and observation clocks</summary>
                      {draft.routing.map((route: any, index: number) => (
                        <fieldset
                          className="rl-route"
                          key={route.originRegion + route.operationId}
                        >
                          <legend>
                            {route.originRegion} · {route.operationId}
                          </legend>
                          <p>
                            Policy: {route.policy}. Primary:{" "}
                            {route.primaryEntryNodeId}. Fallback order:{" "}
                            {route.fallbackEntryNodeIds.join(" → ") || "none"}.
                          </p>
                          <div className="rl-fields">
                            {input(
                              "Detection ms · " +
                                route.originRegion +
                                " " +
                                route.operationId,
                              route.detectionMs,
                              (v) =>
                                update(
                                  (s) => (s.routing[index].detectionMs = v),
                                ),
                              0,
                            )}
                            {input(
                              "Switch ms · " +
                                route.originRegion +
                                " " +
                                route.operationId,
                              route.switchMs,
                              (v) =>
                                update((s) => (s.routing[index].switchMs = v)),
                              0,
                            )}
                            {input(
                              "Failback ms · " +
                                route.originRegion +
                                " " +
                                route.operationId,
                              route.failbackMs,
                              (v) =>
                                update(
                                  (s) => (s.routing[index].failbackMs = v),
                                ),
                              0,
                            )}
                          </div>
                          <label className="rl-check">
                            <input
                              type="checkbox"
                              checked={route.returnOnRecovery}
                              onChange={(e) =>
                                update(
                                  (s) =>
                                    (s.routing[index].returnOnRecovery =
                                      e.target.checked),
                                )
                              }
                            />
                            Return to the primary after observed recovery
                          </label>
                        </fieldset>
                      ))}
                    </details>
                  </section>
                  <section className="rl-panel">
                    <details>
                      <summary>
                        Complete scenario · routing, network, profiles and
                        outages
                      </summary>
                      <p>
                        Edit every supported component property here, or import
                        a Region Lab scenario/version/run export. Unsupported
                        controls are rejected by the server. Validate before
                        saving.
                      </p>
                      <label>
                        Scenario JSON
                        <textarea
                          aria-label="Scenario JSON"
                          className="rl-code rl-code-large"
                          spellCheck={false}
                          value={json || JSON.stringify(draft, null, 2)}
                          onChange={(e) => setJson(e.target.value)}
                        />
                      </label>
                      <label>
                        Import JSON
                        <input
                          type="file"
                          accept="application/json,.json"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file)
                              void action(async () => {
                                if (file.size > 4 * 1024 * 1024)
                                  throw Error("Import is limited to 4 MiB");
                                const parsed = JSON.parse(await file.text());
                                setJson(
                                  JSON.stringify(
                                    parsed.snapshot?.scenario ??
                                      parsed.scenario ??
                                      parsed,
                                    null,
                                    2,
                                  ),
                                );
                              });
                          }}
                        />
                      </label>
                      <div className="rl-actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await api(base + "/validate", {
                                method: "POST",
                                body: current(),
                                scope: "local",
                              });
                              setDraft(current());
                              setJson("");
                              setError(
                                "Scenario is valid within current admission limits. Save before running.",
                              );
                            })
                          }
                        >
                          Validate scenario
                        </button>
                        <button disabled={currentSafe()===null}
                          onClick={() =>
                            saveFile(
                              new Blob(
                                [JSON.stringify(currentSafe(), null, 2)],
                                { type: "application/json" },
                              ),
                              "region-draft.json",
                            )
                          }
                        >
                          Export draft JSON
                        </button>
                        <button onClick={() => setJson("")}>
                          Discard JSON edits
                        </button>
                      </div>
                    </details>
                  </section>
                  <section className="rl-panel">
                    <h2>Recorded runs</h2>
                    {history.data?.items.length ? (
                      history.data.items.map((r: any) => (
                        <Link
                          className="rl-list-item"
                          key={r.id}
                          href={base + "/runs/" + r.id}
                        >
                          <span>
                            <b>{r.status}</b>
                            <small>
                              Revision {r.experimentRevision} ·{" "}
                              {new Date(r.createdAt).toLocaleString()}
                            </small>
                            <code>{r.id}</code>
                          </span>
                          <span>Inspect ↗</span>
                        </Link>
                      ))
                    ) : (
                      <p>
                        No recorded runs yet. Save your inputs, then run a test.
                      </p>
                    )}
                    <div className="rl-actions">
                      {historyCursor && (
                        <button onClick={() => setHistoryCursor(null)}>
                          Newest runs
                        </button>
                      )}
                      {history.data?.nextCursor && (
                        <button
                          onClick={() =>
                            setHistoryCursor(history.data.nextCursor)
                          }
                        >
                          Older runs
                        </button>
                      )}
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const copy = await api<any>(
                            base + `/experiments/${id}/duplicate`,
                            {
                              method: "POST",
                              body: {
                                expectedRevision: experiment.data.revision,
                                name: name.slice(0, 93) + " (copy)",
                              },
                              scope: "local",
                            },
                          );
                          go(base + "/experiments/" + copy.id);
                        })
                      }
                    >
                      Duplicate experiment
                    </button>{" "}
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (
                          confirm(
                            "Delete this experiment and its retained versions and runs? Cancel active runs first.",
                          )
                        )
                          void action(async () => {
                            await api(
                              base +
                                `/experiments/${id}?expectedRevision=${experiment.data.revision}`,
                              { method: "DELETE", scope: "local" },
                            );
                            go(base + "/experiments");
                          });
                      }}
                    >
                      Delete experiment
                    </button>
                  </section>
                </>
              )
            )}
          </>
        ) : (
          <>
            <div className="rl-title">
              <div>
                <p className="rl-eyebrow">RECORDED EVIDENCE</p>
                <h1>Run inspection</h1>
                <code className="rl-hash">{id}</code>
                <p>
                  {run.data?.status ?? "Loading status…"}
                  {!visible ? " · polling paused while hidden" : ""}
                </p>
              </div>
              <div className="rl-actions">
                {run.data?.experimentId && (
                  <Link href={base + "/experiments/" + run.data.experimentId}>
                    Back to experiment
                  </Link>
                )}
                {!terminal(run.data?.status) && run.data && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api(base + `/runs/${id}/cancel`, {
                          method: "POST",
                          scope: "local",
                        });
                        await run.refetch();
                      })
                    }
                  >
                    Cancel run
                  </button>
                )}
                {run.data?.status === "completed" && (
                  <>
                    <button disabled={busy} onClick={() => download("export")}>
                      Download JSON
                    </button>
                    <button disabled={busy} onClick={() => download("report")}>
                      Download PDF
                    </button>
                  </>
                )}
              </div>
            </div>
            {run.data?.failure && (
              <div className="rl-notice">
                {run.data.failure.code}: {run.data.failure.message}
              </div>
            )}
            {run.data?.retained === false && (
              <p>This result expired. No computation was repeated.</p>
            )}
            {run.data && !terminal(run.data.status) && (
              <section className="rl-panel">
                <p role="status">
                  {run.data.status === "queued"
                    ? "Waiting for an execution slot…"
                    : "The isolated worker is executing the frozen inputs…"}
                </p>
                <p>No partial metrics are shown as a completed result.</p>
              </section>
            )}
            {run.data?.status === "completed" && (
              <>
                {result.isFetching && (
                  <p role="status">Loading recorded results…</p>
                )}
                <section className="rl-panel rl-controls">
                  <label>
                    Scenario
                    <select
                      aria-label="Scenario"
                      value={side}
                      onChange={(e) => {
                        setSide(e.target.value);
                        setResultCursor(null);
                      }}
                    >
                      {(run.data.availableSides ?? ["baseline"]).map(
                        (s: string) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Repetition
                    <select
                      aria-label="Repetition"
                      value={repetition}
                      onChange={(e) => {
                        setRepetition(Number(e.target.value));
                        setResultCursor(null);
                      }}
                    >
                      {Array.from(
                        { length: run.data.repetitions ?? 1 },
                        (_, i) => (
                          <option key={i} value={i}>
                            Repetition {i}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Recorded view
                    <select
                      aria-label="Recorded view"
                      value={resultView}
                      onChange={(e) => {
                        setResultView(e.target.value);
                        setResultCursor(null);
                      }}
                    >
                      {["regions", "components", "timeline", "operations"].map(
                        (v) => (
                          <option value={v} key={v}>
                            {v}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </section>
                {result.data && (
                  <>
                    {result.data.isCurrentRevision===false&&<div className="rl-notice" role="status">Earlier revision: this run describes revision {result.data.experimentRevision}; the experiment is now revision {result.data.currentRevision}. Run the saved current revision to assess changes.</div>}<div className="rl-metrics">
                      {[
                        ["Verdict", result.data.summary.verdict],
                        [
                          "p95 latency",
                          result.data.summary.latency.p95Ms === null
                            ? "Insufficient samples"
                            : number(result.data.summary.latency.p95Ms) + " ms",
                        ],
                        [
                          "Error rate",
                          result.data.summary.errorRateRatio === null
                            ? "No requests"
                            : number(result.data.summary.errorRateRatio * 100) +
                              "%",
                        ],
                        [
                          "Successful / offered",
                          number(result.data.summary.successfulRequests, 0) +
                            " / " +
                            number(result.data.summary.offeredRequests, 0),
                        ],
                      ].map(([label, value]) => (
                        <section key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </section>
                      ))}
                    </div>
                    <section className="rl-panel">
                      <p className="rl-caption">
                        Uncalibrated · repetition {repetition} · seed{" "}
                        {result.data.seed} · {result.data.wireVersion} ·
                        recorded revision {result.data.experimentRevision}
                      </p>
                      <p className="rl-hash">Input {result.data.inputHash}</p>
                      <p>
                        Targets: p95 ≤ {result.data.targets.p95Ms} ms · errors ≤{" "}
                        {number(result.data.targets.errorBudgetRatio * 100)}%.
                        Regional overrides appear in their rows.
                      </p>
                      <p>{result.data.timelineAccounting}</p>
                      <JsonTable
                        rows={resultRows(resultView, result.data.items)}
                      />
                      <div className="rl-actions">
                        {resultCursor && (
                          <button onClick={() => setResultCursor(null)}>
                            First page
                          </button>
                        )}
                        {result.data.nextCursor && (
                          <button
                            onClick={() =>
                              setResultCursor(result.data.nextCursor)
                            }
                          >
                            Next page
                          </button>
                        )}
                      </div>
                      <details>
                        <summary>
                          Distribution, provenance and limitations
                        </summary>
                        <p>
                          {result.data.distributionStatus}. p95 requires 1,000
                          successful requests; p99 requires 10,000.
                        </p>
                        <p>
                          {result.data.distribution
                            ? `${result.data.distribution.count} captured observations · HDR v2, 3 significant digits, microsecond ticks`
                            : "No captured distribution is available for this recorded run."}
                        </p>
                        <pre>
                          {JSON.stringify(
                            {
                              provenance: result.data.provenance,
                              warnings: result.data.warnings,
                              limitations: result.data.limitations,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    </section>
                    <section className="rl-panel">
                      <h2>Recorded latency distribution</h2>
                      {result.data.distributionPlot?.length ? (
                        <figure>
                          <div
                            className="rl-histogram"
                            role="img"
                            aria-label="Counts of successful requests by recorded latency bucket"
                          >
                            {result.data.distributionPlot.map(
                              (b: any, i: number) => (
                                <div
                                  key={i}
                                  style={{
                                    height: `${b.count ? Math.max(0.5, (100 * b.count) / Math.max(...result.data.distributionPlot.map((x: any) => x.count))) : 0}%`,
                                  }}
                                  title={`${number(b.fromMs)}–${number(b.toMs)} ms: ${b.count} requests`}
                                />
                              ),
                            )}
                          </div>
                          <figcaption>
                            {result.data.distribution.count} observations ·
                            bucket ranges from 0 to{" "}
                            {number(result.data.distributionPlot.at(-1).toMs)}{" "}
                            ms. Hover bars for counts; JSON contains the full
                            HDR distribution.
                          </figcaption>
                        </figure>
                      ) : (
                        <p>No captured distribution for this run.</p>
                      )}
                    </section>
                    <section className="rl-panel">
                      <h2>Recorded network activity</h2>
                      <p>
                        {number(result.data.reroutedRoots, 0)} original requests
                        used a route different from their baseline entry.
                      </p>
                      <JsonTable rows={result.data.links} />
                    </section>
                    <section className="rl-panel">
                      <h2>Outage phases</h2>
                      <JsonTable rows={result.data.phases} />
                    </section>
                  </>
                )}
                <section className="rl-panel">
                  <h2>Compare recorded sides</h2>
                  <p>
                    Leave the second run empty to compare this run’s paired
                    sides. Only matching foundations and repetition seeds
                    receive deltas.
                  </p>
                  <div className="rl-fields">
                    <label>
                      Other run UUID
                      <input
                        value={otherId}
                        placeholder="Same run"
                        onChange={(e) => setOtherId(e.target.value)}
                      />
                    </label>
                    <label>
                      Right scenario
                      <select
                        value={rightSide}
                        onChange={(e) => setRightSide(e.target.value)}
                      >
                        <option value="outage">Outage</option>
                        <option value="baseline">Baseline</option>
                      </select>
                    </label>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        setComparison(null);
                        setComparison(
                          await api(
                            base +
                              `/runs/${id}/compare?otherId=${encodeURIComponent(otherId || id!)}&left=${side}&right=${rightSide}&repetition=${repetition}`,
                            { scope: "local" },
                          ),
                        );
                      })
                    }
                  >
                    Compare saved results
                  </button>
                  {comparison &&
                    comparison.left.runId===id &&
                    comparison.left.scenario === side &&
                    comparison.left.repetition === repetition &&
                    comparison.right.scenario === rightSide &&
                    comparison.right.runId.toLowerCase() ===
                      (otherId || id!).toLowerCase() && (
                      <>
                        <p>
                          {comparison.comparable
                            ? "Comparable foundation and seed."
                            : "Deltas withheld: " +
                              comparison.reasons.join(", ")}
                        </p>
                        <JsonTable rows={comparison.items} />
                        <p>{comparison.note}</p>
                      </>
                    )}
                </section>
              </>
            )}
          </>
        )}
      </div>
      <footer className="rl-footer">
        REGION LAB / explicit assumptions, reproducible experiments.{" "}
        <Link href={base + "#guide"}>Model boundaries</Link>
      </footer>
    </div>
  );
}

export function RegionLab(props: {
  view?: "intro" | "experiments" | "experiment" | "run";
  id?: string;
}) {
  const { user } = useAuth();
  return <RegionLabWorkspace key={[user?.id??"guest",props.view??"intro",props.id??""].join(":")} {...props} />;
}
