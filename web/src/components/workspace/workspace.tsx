"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useDrafts } from "@/components/workspace/draft-provider";
import { ValidationPanel } from "@/components/canvas/validation-panel";
import { CanvasEditor } from "@/components/canvas/canvas-editor";
import { TrafficTab } from "@/components/workspace/traffic-tab";
import { RunResults } from "@/components/workspace/run-results";
import { LimitsTab } from "@/components/workspace/limits-tab";
import { workspaceHref } from "@/lib/run-links";
import { useUi } from "@/components/shell/ui-provider";
import { HistoryTab } from "@/components/workspace/history-tab";
import { restoreBlockedReason } from "@/lib/history-presentation";
import { ExplainTrigger } from "@/components/workspace/explain-panel";
import { explainParam, explainView, useAiEnabled, type ExplainView } from "@/lib/explain-store";
import { PreviewSession } from "@/lib/preview-session";
import { LivePreviewPanel, type LivePreviewView } from "@/components/workspace/live-preview";
import { Crumbs } from "@/components/shell/crumbs";
import { RoutePlaceholder } from "@/components/placeholder";
import { resolveRoute } from "@/lib/routes";
import { WS_TABS } from "@/lib/catalog";
import { Design, fetchDesign, fetchRun, deleteDesign } from "@/lib/api/designs";
import { useActiveView } from "@/lib/use-active-view";
import { EditorSession } from "@/lib/editor-session";
const LIVE_TABS = ["edit", "traffic", "results", "limits", "history"];
export function Workspace({ id, tab }: { id: string; tab: string }) {
  const { user } = useAuth();
  const design = useQuery({
    queryKey: ["design", user?.id, id],
    queryFn: () => fetchDesign(id),
    enabled: !!user && LIVE_TABS.includes(tab),
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });
  if (!LIVE_TABS.includes(tab))
    return <RoutePlaceholder />;
  if (!design.data)
    return (
      <div className="page" role="status">
        {design.isError ? "Could not load this design." : "Loading design…"}
      </div>
    );
  return (
    <LoadedWorkspace key={user!.id + id} initial={design.data} tab={tab} />
  );
}
function LoadedWorkspace({ initial, tab }: { initial: Design; tab: string }) {
  const drafts = useDrafts(),
    { user } = useAuth(),
    router = useRouter(),
    queries = useQueryClient(),
    search = useSearchParams();
  const isActive = useActiveView();
  const [session] = useState(() => {
    const key = user!.id + ":" + initial.id;
    let value = drafts.get(key);
    if (!value) {
      value = new EditorSession(initial);
      drafts.set(key, value);
    }
    return value;
  });
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  const [current, setCurrent] = useState<Design | null>(null);
  const [actionError, setActionError] = useState("");

  // ?run= selects a recorded simulation and ?limits= a saved Limits search; each is routed by its stored kind.
  const runId = search.get("run") ?? state.run?.id;
  const limitsId = search.get("limits") ?? state.limitsRun?.id;
  const explainId = explainParam(search) ?? undefined;
  const selection = { run: runId, limits: limitsId, explain: explainId };
  const runQuery = useQuery({
    queryKey: ["run", user?.id, initial.id, runId],
    queryFn: ({ signal }) => fetchRun(initial.id, runId!, signal),
    enabled: !!runId,
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 600 : false),
  });
  const limitsQuery = useQuery({
    queryKey: ["run", user?.id, initial.id, limitsId],
    queryFn: ({ signal }) => fetchRun(initial.id, limitsId!, signal),
    enabled: !!limitsId,
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 600 : false),
  });
  const pick = (
    id: string | undefined,
    data: typeof runQuery.data,
    local: typeof state.run,
    kind: "simulation" | "limits",
  ) => {
    const r = data?.id === id ? data : local?.id === id ? local : undefined;
    return r?.kind === kind ? r : undefined;
  };
  const displayedRun = pick(runId, runQuery.data, state.run, "simulation");
  const displayedLimits = pick(limitsId, limitsQuery.data, state.limitsRun, "limits");
  // M12: publish the saved, completed simulation on screen so the assistant drawer can explain exactly it.
  const { ui, setUI } = useUi();
  const aiEnabled = useAiEnabled(); // AI is optional: nothing AI-related renders unless the backend enables it
  const explainContext: ExplainView | null =
    aiEnabled && user && displayedRun?.status === "completed" && displayedRun.result.kind === "simulation"
      ? (() => {
          const summary = displayedRun.result.summary;
          const hot = summary.bottleneckId ? summary.nodes.find((n) => n.id === summary.bottleneckId) : undefined;
          return {
            userId: user.id,
            designId: initial.id,
            designName: state.saved.name,
            runId: displayedRun.id,
            runRevision: displayedRun.designRevision,
            savedRevision: state.saved.revision,
            unsavedChanges: session.dirty,
            facts: {
              verdict: summary.verdict,
              p95Ms: summary.p95,
              p95TargetMs: summary.traffic.sloP95,
              errorRateFraction: summary.errorRate,
              errorBudgetFraction: summary.traffic.errorBudget,
              bottleneck: hot ? { label: hot.label, utilizationFraction: hot.rho } : null,
            },
          };
        })()
      : null;
  // M15 History: restore is offered only when no unsaved draft, conflict or calculation could be lost or confused.
  const restoreBlocked = restoreBlockedReason({
    dirty: session.dirty,
    saving: state.saving,
    gesture: state.gesture,
    conflict: state.conflict,
    busyWithCalculation: state.running || state.limitsRunning || displayedRun?.status === "pending" || displayedLimits?.status === "pending",
  });
  const restored = (next: Design) => {
    queries.setQueryData(["design", user?.id, initial.id], next);
    session.reload(next);
    void queries.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const explainKey = JSON.stringify(explainContext);
  useEffect(() => {
    explainView.publish(explainContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explainKey]);
  // Leaving the workspace removes the context, so the drawer never explains a result that is not on screen.
  useEffect(() => () => explainView.publish(null), []);
  // Reload recovery: a retained explanation id in the URL reopens the drawer for the same result.
  const reopened = explainContext !== null && !!explainId;
  useEffect(() => {
    if (reopened && !ui.ai) setUI({ ai: true, help: false });
    // Only on first availability: the user may close the drawer afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopened]);
  const limitsPending =
    state.limitsRunning || displayedLimits?.status === "pending";
  const simulationPending =
    state.running || displayedRun?.status === "pending";
  // M8 live preview: one latest-only session per mounted workspace; never persisted, never a saved result.
  const [preview] = useState(() => new PreviewSession());
  // Unmount/navigation away cancels and switches preview off. Not dispose(): React's development
  // double-invoke runs this cleanup once at mount, and a disposed session could never send again.
  useEffect(() => () => preview.disable(), [preview]);
  const previewState = useSyncExternalStore(
    preview.subscribe,
    preview.getSnapshot,
    preview.getSnapshot,
  );
  const wantPreview =
    state.livePreview && (tab === "edit" || tab === "traffic");
  useEffect(() => {
    if (wantPreview) preview.enable(session.state.design);
    else preview.disable();
  }, [wantPreview, preview, session]);
  // Same-account reauthentication yields a new user object: keep the draft, start a fresh preview identity.
  const [authUser, setAuthUser] = useState(user);
  if (authUser !== user) setAuthUser(user);
  useEffect(() => {
    if (authUser) preview.renew();
  }, [authUser, preview]);
  const pauseReason = state.gesture
    ? "Finish the current move or connection to update the preview."
    : state.inputErrors.length
      ? "Correct the highlighted input to update the preview."
      : state.conflict
        ? "Resolve the save conflict to update the preview."
        : simulationPending || limitsPending
          ? "Live preview pauses while your saved calculation runs."
          : undefined;
  useEffect(() => {
    preview.setInput(state.design, pauseReason);
  }, [preview, state.design, pauseReason, wantPreview]);
  const live: LivePreviewView = {
    enabled: wantPreview,
    state: previewState,
    current: preview.isCurrent(state.design),
    onToggle: () => session.setLivePreview(!state.livePreview),
    onRetry: () => preview.retry(),
  };
  // An older link may carry the wrong parameter for a stored kind: move it to the matching view.
  useEffect(() => {
    const misfiled =
      runQuery.data?.id === runId && runQuery.data?.kind === "limits"
        ? { run: undefined, limits: runId, tab: "limits" }
        : limitsQuery.data?.id === limitsId &&
            limitsQuery.data?.kind === "simulation"
          ? { run: limitsId, limits: undefined, tab: "results" }
          : null;
    if (misfiled && isActive())
      router.replace(
        workspaceHref(initial.id, misfiled.tab, {
          run: misfiled.run ?? (misfiled.tab === "limits" ? undefined : runId),
          limits:
            misfiled.limits ?? (misfiled.tab === "results" ? undefined : limitsId),
        }),
      );
  }, [runQuery.data, limitsQuery.data, runId, limitsId, initial.id, router, isActive]);
  useEffect(() => {
    session.receiveServer(initial);
  }, [
    session,
    initial,
    state.saving,
    state.design,
    state.gesture,
    state.inputErrors,
  ]);
  useEffect(() => {
    if (runQuery.data && runQuery.data.id === runId)
      session.setRun(runQuery.data);
  }, [runQuery.data, runId, session]);
  useEffect(() => {
    if (limitsQuery.data && limitsQuery.data.id === limitsId)
      session.setRun(limitsQuery.data);
  }, [limitsQuery.data, limitsId, session]);
  useEffect(() => {
    if (
      !session.dirty ||
      state.conflict ||
      state.saving ||
      state.error ||
      state.gesture ||
      state.inputErrors.length
    )
      return;
    const timer = setTimeout(() => {
      void session
        .save()
        .then(() => queries.invalidateQueries({ queryKey: ["dashboard"] }))
        .catch(() => undefined);
    }, 750);
    return () => clearTimeout(timer);
  }, [
    session,
    state.design,
    state.conflict,
    state.saving,
    state.error,
    state.gesture,
    state.inputErrors,
    queries,
  ]);
  async function run() {
    setActionError("");
    try {
      const accepted = await session.run();
      if (!isActive()) return;
      await queries.invalidateQueries({ queryKey: ["dashboard"] });
      if (!isActive()) return;
      router.replace(
        workspaceHref(initial.id, "results", {
          run: accepted.run.id,
          limits: limitsId,
        }),
      );
    } catch {
      /* Session keeps a retryable identity and the draft. */
    }
  }
  async function findLimits() {
    setActionError("");
    try {
      const accepted = await session.findLimits();
      if (!isActive()) return;
      await queries.invalidateQueries({ queryKey: ["dashboard"] });
      if (!isActive()) return;
      router.replace(
        workspaceHref(initial.id, "limits", {
          run: runId,
          limits: accepted.run.id,
        }),
      );
    } catch {
      /* Session keeps a retryable Limits identity (never a simulation one) and the draft. */
    }
  }
  async function resolveConflict() {
    try {
      setCurrent(await fetchDesign(initial.id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not reload");
    }
  }
  async function remove() {
    if (!window.confirm("Delete this design and its stored results?")) return;
    try {
      await deleteDesign(initial.id);
      session.dispose();
      drafts.delete(user!.id + ":" + initial.id);
      await queries.invalidateQueries({ queryKey: ["dashboard"] });
      router.push("/dashboard");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Deletion failed");
    }
  }
  return (
    <div className="ws">
      <div className="ws-head stack">
        <h1 className="sr-only">{WS_TABS.find((t) => t.id === tab)?.label}</h1>
        <Crumbs resolved={resolveRoute("/designs/" + initial.id + "/" + tab)} />
        <div className="row between">
          <div className="grow stack">
            <label className="sr-only" htmlFor="design-name">
              Design name
            </label>
            <input
              id="design-name"
              className="ws-name"
              maxLength={100}
              value={state.design.name}
              onChange={(e) => session.rename(e.target.value)}
            />
            <span className="hint" role="status">
              {state.saving
                ? "Saving…"
                : state.conflict
                  ? "Save conflict"
                  : session.dirty
                    ? state.error
                      ? "Save failed — unsaved changes"
                      : "Unsaved"
                    : "Saved"}{" "}
              · revision {state.saved.revision}
            </span>
          </div>
          <div className="row tight">
            <button
              className="btn btn-sm"
              disabled={
                state.saving ||
                !session.dirty ||
                state.conflict ||
                state.gesture ||
                !!state.inputErrors.length
              }
              onClick={() =>
                session
                  .save()
                  .then(() =>
                    queries.invalidateQueries({ queryKey: ["dashboard"] }),
                  )
                  .catch(() => undefined)
              }
            >
              Save
            </button>
            <button
              className="btn btn-sm"
              disabled={
                state.checking ||
                state.running ||
                state.conflict ||
                state.gesture ||
                !!state.inputErrors.length
              }
              onClick={() => session.check().catch(() => undefined)}
            >
              {state.checking ? "Checking…" : "Check graph"}
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={
                state.checking ||
                simulationPending ||
                limitsPending ||
                state.conflict ||
                state.gesture ||
                !!state.inputErrors.length
              }
              onClick={run}
            >
              {state.running
                ? "Submitting…"
                : state.intent
                  ? "Retry same request"
                  : state.run?.status === "pending"
                    ? "Queued / running…"
                    : "Run test"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={remove}>
              Delete
            </button>
          </div>
        </div>
        <nav className="tabs" aria-label="Design workspace">
          {WS_TABS.map((t) => (
            <Link
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              href={workspaceHref(initial.id, t.id, selection)}
            >
              {t.label}
              {!LIVE_TABS.includes(t.id) && (
                <span className="ph-mark">Later</span>
              )}
            </Link>
          ))}
        </nav>
      </div>
      <div className="ws-body stack lg m3-body">
        {(state.error || actionError) && (
          <p className="note fail" role="alert">
            {state.error || actionError}
          </p>
        )}
        {limitsPending && tab !== "limits" && (
          <p className="hint" role="status">
            A Limits search is pending. Run test becomes available when it
            finishes.
          </p>
        )}
        {state.intent && (
          <p className="note warn">
            Acceptance is unconfirmed. Retry the same request to recover its
            status. Your newer edits will be used only for a subsequent run.
          </p>
        )}
        {state.intent &&
          state.error.includes("Acceptance is unknown beyond the 24-hour") && (
            <button
              className="btn"
              onClick={() => {
                if (
                  window.confirm(
                    "The original acceptance is unknown. Check recent runs first. Starting another intent may duplicate that calculation. Continue?",
                  )
                )
                  session.abandonUncertainIntent();
              }}
            >
              Allow a deliberate new calculation
            </button>
          )}
        {state.conflict && (
          <button className="btn" onClick={resolveConflict}>
            Inspect current saved version
          </button>
        )}
        {current && (
          <section
            className="panel panel-b stack"
            aria-label="Save conflict resolution"
          >
            <h2 className="h3">
              Saved revision {current.revision}: {current.name}
            </h2>
            <p>
              Your draft remains in memory. Review the saved graph before
              deciding.
            </p>
            <details>
              <summary>Current saved inputs</summary>
              <pre className="m3-wrap">
                {JSON.stringify(
                  { graph: current.graph, traffic: current.traffic },
                  null,
                  2,
                )}
              </pre>
            </details>
            <div className="row">
              <button
                className="btn"
                onClick={() => {
                  if (
                    window.confirm(
                      "Discard your draft and load this saved version?",
                    )
                  ) {
                    session.reload(current);
                    setCurrent(null);
                  }
                }}
              >
                Discard draft and reload
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (
                    window.confirm(
                      "Keep your draft on this revision? The next save will replace the reviewed saved inputs.",
                    )
                  ) {
                    session.reapply(current);
                    setCurrent(null);
                  }
                }}
              >
                Reapply my draft deliberately
              </button>
            </div>
          </section>
        )}
        {tab === "edit" ? (
          <CanvasEditor
            session={session}
            focusNode={search.get("node") ?? undefined}
            live={live}
          />
        ) : tab === "history" ? null : (
          <ValidationPanel session={session} />
        )}
        {state.design.description && (
          <details className="panel panel-b">
            <summary>Design description and assumptions</summary>
            <p className="m3-wrap">{state.design.description}</p>
          </details>
        )}
        {runQuery.isError && (
          <div className="note fail" role="alert">
            <p>Could not load the selected result.</p>
            <button className="btn" onClick={() => runQuery.refetch()}>
              Retry loading result
            </button>
          </div>
        )}
        {limitsQuery.isError && (
          <div className="note fail" role="alert">
            <p>Could not load the selected Limits search.</p>
            <button className="btn" onClick={() => limitsQuery.refetch()}>
              Retry loading Limits
            </button>
          </div>
        )}
        {tab === "history" ? (
          <HistoryTab
            designId={initial.id}
            saved={state.saved}
            blocked={restoreBlocked}
            onRestored={restored}
          />
        ) : tab === "limits" ? (
          <LimitsTab
            designId={initial.id}
            run={displayedLimits}
            stale={session.isRunStale(displayedLimits)}
            selection={selection}
            finding={state.limitsRunning}
            uncertain={!!state.limitsIntent}
            canFind={
              !state.checking &&
              !simulationPending &&
              !limitsPending &&
              !state.conflict &&
              !state.gesture &&
              !state.inputErrors.length
            }
            blockedReason={
              simulationPending
                ? "A test run is pending. Find limits becomes available when it finishes."
                : state.inputErrors.length
                  ? "Correct the highlighted input before searching."
                  : state.conflict
                    ? "Resolve the save conflict before searching."
                    : undefined
            }
            onFind={findLimits}
          />
        ) : tab === "traffic" ? (
          <>
            <LivePreviewPanel v={live} />
            <TrafficTab session={session} run={displayedRun} />
          </>
        ) : (
          <>
            {tab === "results" && explainContext && <ExplainTrigger view={explainContext} />}
            <RunResults
              run={displayedRun}
              stale={session.isRunStale(displayedRun)}
              compact={tab === "edit"}
              currentNodeIds={state.design.graph.nodes.map((n) => n.id)}
            />
          </>
        )}
      </div>
    </div>
  );
}
