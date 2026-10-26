import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api/client";
import type { Catalog } from "@/lib/canvas/model";
import type { EditorSession } from "@/lib/editor-session";
import type { DesignRun } from "@/lib/api/designs";
import { rpsToSlider, sliderToRps } from "@/lib/traffic";
import { numberText, percent, milliseconds } from "@/lib/result-presentation";
import { TrafficField } from "@/components/workspace/traffic-field";
import { TimelineChart } from "@/components/workspace/timeline-chart";
export function TrafficTab({
  session,
  run,
}: {
  session: EditorSession;
  run?: DesignRun;
}) {
  const catalog = useQuery({
    queryKey: ["simulation-catalog"],
    queryFn: () => api<Catalog>("/simulation/catalog"),
  });
  const d = session.state.design,
    t = d.traffic,
    clients = d.graph.nodes.filter((n) => n.type === "client");
  const region = clients[0]?.props.region ?? "us-east",
    mixed = clients.some((n) => (n.props.region ?? "us-east") !== region);
  const output =
    run?.status === "completed" && run.result.kind === "simulation"
      ? run.result
      : undefined;
  const stale = session.isRunStale(run),
    blocked = !!session.state.inputErrors.length;
  return (
    <div
      className="m7-split"
      onKeyDown={(e) => {
        if (
          (e.target as Element).closest(
            "input,select,textarea,[contenteditable=true]",
          )
        )
          return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
          e.preventDefault();
          if (!blocked) session.redo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (!blocked) {
            if (e.shiftKey) session.redo();
            else session.undo();
          }
        }
      }}
    >
      <div className="stack lg">
        <section className="stack">
          <div className="row between">
            <h2 className="h2">Scenario</h2>
            <span className="hint">Choose a starting traffic profile</span>
          </div>
          {catalog.isError && (
            <div role="alert" className="note warn">
              Could not load presets. Your settings remain editable.{" "}
              <button className="btn btn-sm" onClick={() => catalog.refetch()}>
                Retry presets
              </button>
            </div>
          )}
          {catalog.isPending && <p role="status">Loading traffic presets…</p>}
          <div className="presets">
            {catalog.data?.presets.map((p) => (
              <button
                className="preset"
                key={p.id}
                disabled={blocked}
                aria-pressed={t.preset === p.id}
                onClick={() =>
                  session.setTraffic(
                    {
                      preset: p.id,
                      rps: p.traffic.rps,
                      burst: p.traffic.burst,
                      readRatio: p.traffic.readRatio,
                      sloP95: p.traffic.sloP95,
                      shape: p.traffic.shape,
                    },
                    true,
                  )
                }
              >
                <span className="pt">{p.name}</span>
                <span className="pf">
                  {numberText(p.traffic.rps)} rps ×{p.traffic.burst} ·{" "}
                  {percent(p.traffic.readRatio)} reads
                </span>
                <span className="small muted">{p.note}</span>
              </button>
            ))}
            <button
              className="preset"
              disabled={blocked}
              aria-pressed={t.preset === "custom"}
              onClick={() => session.setTraffic({})}
            >
              <span className="pt">Custom</span>
              <span className="pf">Your own numbers</span>
              <span className="small muted">
                Changing a setting switches to Custom.
              </span>
            </button>
          </div>
          <p className="hint">
            Presets update load, burst, reads, shape and p95 target; your error
            budget and duration are kept.
          </p>
        </section>
        <section className="panel">
          <div className="panel-h">
            <h2 className="h3">Settings</h2>
          </div>
          <div className="panel-b stack lg">
            <TrafficField
              label="Average requests per second"
              value={t.rps}
              min={0}
              max={1e7}
              session={session}
              change={(rps) => session.setTraffic({ rps })}
              unit="rps"
            />
            <label className="field">
              <span className="label">Traffic scale</span>
              <input
                aria-label="Traffic scale"
                type="range"
                min="0"
                max="1000"
                value={rpsToSlider(t.rps)}
                disabled={blocked}
                onChange={(e) =>
                  session.setTraffic({
                    rps: sliderToRps(Number(e.target.value)),
                  })
                }
              />
              <span className="hint">
                Slider: 10–50,000 rps. Use the number field for zero or other
                supported loads.
              </span>
            </label>
            <div className="grid-2">
              <TrafficField
                label="Burst multiplier"
                value={t.burst}
                min={1}
                max={100}
                session={session}
                change={(burst) => session.setTraffic({ burst })}
                unit="×"
              />
              <label className="field">
                <span className="label">Burst scale</span>
                <input
                  aria-label="Burst scale"
                  type="range"
                  min="1"
                  max="4"
                  step="0.1"
                  value={Math.min(4, t.burst)}
                  disabled={blocked}
                  onChange={(e) =>
                    session.setTraffic({ burst: Number(e.target.value) })
                  }
                />
                <span className="hint">
                  Prototype slider: 1–4×. Peak: {numberText(t.rps * t.burst)}{" "}
                  rps.
                </span>
              </label>
            </div>
            <label className="field">
              <span className="label">Reads ({percent(t.readRatio)})</span>
              <input
                aria-label="Reads percentage"
                type="range"
                min="0"
                max="100"
                step="1"
                value={t.readRatio * 100}
                disabled={blocked}
                onChange={(e) =>
                  session.setTraffic({
                    readRatio: Number(e.target.value) / 100,
                  })
                }
              />
              <span className="hint">
                {percent(1 - t.readRatio)} writes. Caches, CDNs and read
                replicas help reads; writes use the primary.
              </span>
            </label>
            <div className="field">
              <span className="label">Traffic shape over the test</span>
              <div className="seg" role="group" aria-label="Traffic shape">
                {(
                  [
                    ["steady", "Steady with one burst"],
                    ["spike", "Two sharp spikes"],
                    ["ramp", "Climbs all day"],
                  ] as const
                ).map(([shape, label]) => (
                  <button
                    key={shape}
                    disabled={blocked}
                    aria-pressed={t.shape === shape}
                    onClick={() => session.setTraffic({ shape })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid-3">
              <TrafficField
                label="p95 target"
                value={t.sloP95}
                min={1}
                max={60000}
                session={session}
                change={(sloP95) => session.setTraffic({ sloP95 })}
                unit="ms"
              />
              <label className="field">
                <span className="label">Error budget</span>
                <select
                  className="select sm"
                  aria-label="Error budget"
                  value={t.errorBudget}
                  disabled={blocked}
                  onChange={(e) =>
                    session.setTraffic({ errorBudget: Number(e.target.value) })
                  }
                >
                  {[...new Set([0.001, 0.005, 0.01, 0.02, 0.05, t.errorBudget])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {percent(n)} of requests
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Test length</span>
                <select
                  className="select sm"
                  aria-label="Test length"
                  value={t.durationMin}
                  disabled={blocked}
                  onChange={(e) =>
                    session.setTraffic({ durationMin: Number(e.target.value) })
                  }
                >
                  {[...new Set([5, 10, 30, 60, t.durationMin])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span className="label">Users are in</span>
              <select
                className="select sm"
                aria-label="Users are in"
                value={mixed ? "mixed" : region}
                disabled={!clients.length || !catalog.data || blocked}
                onChange={(e) =>
                  session.setUserRegion(
                    e.target.value as "us-east" | "eu-west" | "ap-south",
                  )
                }
              >
                {mixed && (
                  <option value="mixed" disabled>
                    Mixed regions
                  </option>
                )}
                {catalog.data?.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <span className="hint">
                Updates all {clients.length} Clients components together. Server
                regions stay as configured.
              </span>
            </label>
            <p className="hint">
              Test length describes the modeled scenario. You do not wait this
              many minutes for a calculation.
            </p>
          </div>
        </section>
        <div className="row" role="group" aria-label="Traffic history">
          <button
            className="btn"
            disabled={!session.state.canUndo || blocked}
            onClick={() => session.undo()}
          >
            Undo
          </button>
          <button
            className="btn"
            disabled={!session.state.canRedo || blocked}
            onClick={() => session.redo()}
          >
            Redo
          </button>
        </div>
      </div>
      <aside className="stack lg">
        <section className="panel">
          <div className="panel-h">
            <h2 className="h3">Recorded test preview</h2>
          </div>
          <div className="panel-b stack">
            {stale && (
              <p className="note warn">
                Inputs changed. This preview belongs to the previous recorded
                run.
              </p>
            )}
            {run?.status === "pending" && (
              <p role="status">
                Queued or running… Waiting for the recorded result.
              </p>
            )}
            {run?.status === "failed" && (
              <p className="note fail" role="alert">
                {run.failure.code}: {run.failure.message}. Run again to start a
                new calculation.
              </p>
            )}
            {output ? (
              <TimelineChart output={output} />
            ) : (
              <p className="hint">
                Run the saved design to record a timeline. The live preview above summarizes unsaved inputs and has no timeline.
              </p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-h">
            <h2 className="h3">In numbers</h2>
          </div>
          <div className="panel-b">
            <dl className="kv">
              <dt>Average</dt>
              <dd>{numberText(t.rps)} rps</dd>
              <dt>Busiest minute</dt>
              <dd>{numberText(t.rps * t.burst)} rps</dd>
              <dt>Reads / writes</dt>
              <dd>
                {numberText(t.rps * t.readRatio)} /{" "}
                {numberText(t.rps * (1 - t.readRatio))} per s
              </dd>
              <dt>About per day</dt>
              <dd>{numberText(t.rps * 86400 * 0.55)} requests</dd>
            </dl>
            <p className="hint">
              Daily estimate assumes this average for about 13 of 24 hours.
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-h">
            <h2 className="h3">Recorded outcome</h2>
          </div>
          <div className="panel-b stack">
            {output ? (
              <>
                <span
                  className={
                    "pill " +
                    (output.summary.verdict === "pass"
                      ? "ok"
                      : output.summary.verdict === "fail"
                        ? "fail"
                        : "warn")
                  }
                >
                  {output.summary.verdict}
                </span>
                <p>
                  p95 {milliseconds(output.summary.p95)} · Errors{" "}
                  {percent(output.summary.errorRate)}
                </p>
              </>
            ) : (
              <p className="hint">No completed simulation selected.</p>
            )}
            <Link
              className="btn btn-sm"
              href={
                "/designs/" + d.id + "/results" + (run ? "?run=" + run.id : "")
              }
            >
              Open full results
            </Link>
          </div>
        </section>
      </aside>
    </div>
  );
}
