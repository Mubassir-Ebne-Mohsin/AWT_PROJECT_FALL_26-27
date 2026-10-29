const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../src/lib/api/errors.ts");
const { ExplainSession, POLL_MS, POLL_BACKOFF_MS, STOP_WATCH_MS, explainStatusText } = require("../src/lib/explain-session.ts");

const U = "11111111-1111-4111-8111-111111111111";
const D = "22222222-2222-4222-8222-222222222222";
const R = "33333333-3333-4333-8333-333333333333";
const R2 = "44444444-4444-4444-8444-444444444444";
const ctx = (over = {}) => ({ userId: U, designId: D, designName: "Single-server MVP", runId: R, runRevision: 1, savedRevision: 1, ...over });
const job = (over = {}) => ({
  id: "55555555-5555-4555-8555-555555555555", designId: D, requestId: "66666666-6666-4666-8666-666666666666", designRevision: 1,
  versionId: "77777777-7777-4777-8777-777777777777", runId: R, fingerprint: "a".repeat(64), model: "qwen2.5:1.5b", modelDigest: "b".repeat(64),
  promptVersion: "m12-explain-v1", schemaVersion: "m12-explanation-v1", status: "pending", createdAt: "2026-10-29T00:00:00.000Z", completedAt: null,
  expiresAt: "2026-10-30T00:00:00.000Z", result: null, failure: null, experimental: true, ...over,
});
const done = (over = {}) => job({ status: "completed", completedAt: "2026-10-29T00:00:05.000Z", result: { summary: "The run misses its latency target.", evidenceIds: ["verdict"] }, ...over });
const evidence = (over = {}) => ({
  jobId: job().id, designId: D, runId: R, designRevision: 1, fingerprint: "a".repeat(64), engineVersion: "reference-port-v1", structured: true,
  facts: { verdict: "fail", p95Ms: 2068.67, p95TargetMs: 300, errorRateFraction: 0.99, errorBudgetFraction: 0.01, bottleneck: null },
  evidenceIds: ["verdict", "p95", "errorRate", "noBottleneck"], statements: ["p95 latency 2,068.67 ms is above the 300 ms target."], limitations: ["Mathematical model estimates, not measured infrastructure performance."], ...over,
});
const ready = (reason = "AVAILABLE") => ({ enabled: reason !== "DISABLED", ready: reason === "AVAILABLE", model: "qwen2.5:1.5b", reason });
const lost = () => new ApiError("NETWORK", "Could not reach the server", 0);
const api = (code, status, reason) => new ApiError(code, "x", status, reason ? { reason } : undefined);

/** Manual timers and a scriptable API: every call is recorded, nothing touches the network. */
function harness(script = {}) {
  const calls = [];
  const timers = new Map();
  let nextTimer = 1;
  let ids = 0;
  const deps = {
    readiness: async (signal) => { calls.push(["readiness"]); return (script.readiness ?? (() => ready()))(signal); },
    submit: async (body, signal) => { calls.push(["submit", body]); return (script.submit ?? (async () => ({ job: job(), statusUrl: "/v1/ai/jobs/x" })))(body, signal); },
    job: async (id, signal) => { calls.push(["job", id]); return (script.job ?? (async () => job()))(id, signal); },
    evidence: async (id) => { calls.push(["evidence", id]); return (script.evidence ?? (async () => evidence()))(id); },
    cancel: async (id) => { calls.push(["cancel", id]); return (script.cancel ?? (async () => job({ status: "cancelled", failure: { reason: "CANCELLED", message: "x" } })))(id); },
    newId: () => "req-" + ++ids,
    setTimer: (fn, ms) => { const h = nextTimer++; timers.set(h, { fn, ms }); return h; },
    clearTimer: (h) => { timers.delete(h); },
  };
  const session = new ExplainSession(deps);
  const jobIds = [];
  session.setJobListener((id) => jobIds.push(id));
  const fire = async () => {
    const [h, t] = [...timers.entries()][0] ?? [];
    assert.ok(t, "a timer should be pending");
    timers.delete(h);
    t.fn();
    await new Promise((r) => setImmediate(r));
  };
  const flush = () => new Promise((r) => setImmediate(r));
  return { session, calls, timers, jobIds, fire, flush, count: (name) => calls.filter((c) => c[0] === name).length };
}

test("M12 explain: generate uses the saved run identity, polls about every two seconds and shows evidence after completion", async () => {
  const h = harness({ job: async () => done() });
  h.session.attach();
  h.session.bind(ctx());
  await h.flush();
  assert.equal(h.session.state.readiness.reason, "AVAILABLE");
  await h.session.generate();
  assert.deepEqual(h.calls.find((c) => c[0] === "submit")[1], { requestId: "req-1", designId: D, expectedRevision: 1, runId: R });
  assert.equal(h.session.state.phase, "pending");
  assert.deepEqual([...h.timers.values()].map((t) => t.ms), [POLL_MS]);
  await h.fire();
  await h.flush();
  assert.equal(h.session.state.phase, "completed");
  assert.equal(h.session.state.evidence.facts.bottleneck, null, "a missing bottleneck stays null");
  assert.equal(h.timers.size, 0, "polling stops at a terminal status");
  assert.deepEqual(h.jobIds.at(-1), job().id, "the job id is published for reload recovery");
});

test("M12 explain: a lost acknowledgement retries the SAME request id and never creates a second request", async () => {
  let attempt = 0;
  const h = harness({ submit: async () => { if (attempt++ === 0) throw lost(); return { job: job(), statusUrl: "x" }; } });
  h.session.attach();
  h.session.bind(ctx());
  await h.session.generate();
  assert.equal(h.session.state.phase, "uncertain");
  assert.match(h.session.state.message, /nothing is duplicated/);
  await h.session.generate();
  const ids = h.calls.filter((c) => c[0] === "submit").map((c) => c[1].requestId);
  assert.deepEqual(ids, ["req-1", "req-1"]);
  assert.equal(h.session.state.phase, "pending");
});

test("M12 explain: definitive refusals stay inline and keep the request id; a terminal job gets a new one", async () => {
  let refuse = true;
  const h = harness({
    submit: async () => { if (refuse) throw api("RATE_LIMITED", 429, "AI_BUSY"); return { job: job(), statusUrl: "x" }; },
    job: async () => job({ status: "failed", failure: { reason: "INVALID_OUTPUT", message: "x" } }),
  });
  h.session.attach();
  h.session.bind(ctx());
  await h.session.generate();
  assert.equal(h.session.state.phase, "error");
  assert.match(h.session.state.message, /busy/i);
  refuse = false;
  await h.session.generate();
  await h.fire();
  assert.equal(h.session.state.phase, "ended");
  assert.match(h.session.state.message, /rejected/);
  await h.session.generate();
  const ids = h.calls.filter((c) => c[0] === "submit").map((c) => c[1].requestId);
  assert.deepEqual(ids, ["req-1", "req-1", "req-2"], "kept after a refusal, renewed after a terminal job");
});

test("M12 explain: a late reply never attaches to another design, run, revision or account", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const h = harness({ submit: async () => { await gate; return { job: job(), statusUrl: "x" }; } });
  h.session.attach();
  h.session.bind(ctx());
  const pending = h.session.generate();
  h.session.bind(ctx({ runId: R2 }));
  release();
  await pending;
  assert.equal(h.session.state.phase, "idle", "the late acceptance was ignored for the new run");
  assert.equal(h.session.state.job, null);
  h.session.bind(ctx({ runId: R2, userId: "other-user" }));
  assert.equal(h.session.state.phase, "idle");
  h.session.bind(ctx({ runId: R2, userId: "other-user", runRevision: 2, savedRevision: 2 }));
  assert.equal(h.session.state.job, null);
});

test("M12 explain: a job or evidence for a different run is refused visibly", async () => {
  const h = harness({ submit: async () => ({ job: job({ runId: R2 }), statusUrl: "x" }) });
  h.session.attach();
  h.session.bind(ctx());
  await h.session.generate();
  assert.equal(h.session.state.phase, "error");
  assert.match(h.session.state.message, /different result/);
  assert.equal(h.jobIds.at(-1), null);
  const g = harness({ submit: async () => ({ job: done(), statusUrl: "x" }), evidence: async () => evidence({ runId: R2 }) });
  g.session.attach();
  g.session.bind(ctx());
  await g.session.generate();
  await g.flush();
  assert.equal(g.session.state.evidence, null);
  assert.equal(g.session.state.evidenceFailed, true, "mismatched evidence is never presented as verified");
});

test("M12 explain: an earlier-revision result cannot be newly explained and sends nothing", async () => {
  const h = harness();
  h.session.attach();
  h.session.bind(ctx({ runRevision: 1, savedRevision: 3 }));
  assert.equal(h.session.historical, true);
  await h.session.generate();
  assert.equal(h.count("submit"), 0);
  assert.match(explainStatusText(h.session.state), /earlier revision/);
  await h.flush(); // a slow readiness reply must not overwrite the notice
  assert.match(explainStatusText(h.session.state), /earlier revision/);
  h.session.bind(ctx({ runRevision: 1, savedRevision: 1 }));
  assert.equal(h.session.historical, false);
});

test("M12 explain: saving a new revision during generation keeps the job but marks the result historical", async () => {
  const h = harness();
  h.session.attach();
  h.session.bind(ctx());
  await h.session.generate();
  h.session.bind(ctx({ savedRevision: 2 }));
  assert.equal(h.session.state.phase, "pending", "same account/design/run: the accepted job continues");
  assert.equal(h.session.historical, true);
  assert.equal(h.session.state.job.designRevision, 1);
});

test("M12 explain: cancel is terminal at once but generation stays unavailable until the runner is idle", async () => {
  let reasons = null;
  const h = harness({ readiness: () => ready(reasons ? (reasons.shift() ?? "AVAILABLE") : "AVAILABLE") });
  h.session.attach();
  h.session.bind(ctx());
  await h.session.generate();
  h.calls.length = 0;
  reasons = ["BUSY", "BUSY", "AVAILABLE"];
  await h.session.cancel();
  assert.equal(h.session.state.phase, "ended");
  assert.equal(h.session.state.job.status, "cancelled");
  assert.equal(h.session.state.providerStopping, true);
  await h.fire();
  assert.equal(h.session.state.providerStopping, true, "runner still resident");
  assert.deepEqual([...h.timers.values()].map((t) => t.ms), [STOP_WATCH_MS]);
  await h.fire();
  await h.fire();
  assert.equal(h.session.state.providerStopping, false);
  assert.equal(h.session.state.readiness.ready, true);
  assert.equal(h.timers.size, 0);
});

test("M12 explain: closing the panel stops polling but not the job, and reopening resumes it", async () => {
  let status = "pending";
  const h = harness({ job: async () => (status === "pending" ? job() : done()) });
  h.session.attach();
  h.session.bind(ctx());
  await h.session.generate();
  h.session.detach();
  assert.equal(h.timers.size, 0);
  assert.equal(h.count("cancel"), 0, "closing is not cancelling");
  status = "completed";
  h.session.attach();
  assert.equal(h.timers.size, 1);
  await h.fire();
  await h.flush();
  assert.equal(h.session.state.phase, "completed");
});

test("M12 explain: closing the panel while the submit is in flight does not strand the state", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const h = harness({ submit: async () => { await gate; return { job: job(), statusUrl: "x" }; } });
  h.session.attach();
  h.session.bind(ctx());
  const submitted = h.session.generate();
  h.session.detach();
  release();
  await submitted;
  assert.equal(h.session.state.phase, "pending", "the server may have accepted it; the job is tracked");
});

test("M12 explain: a failed status check keeps the job pending, backs off and recovers", async () => {
  let fail = true;
  const h = harness({ job: async () => { if (fail) throw lost(); return done(); } });
  h.session.attach();
  h.session.bind(ctx());
  await h.session.generate();
  await h.fire();
  assert.equal(h.session.state.phase, "pending", "an unreachable status check is not a failed job");
  assert.equal(h.session.state.connectionLost, true);
  assert.deepEqual([...h.timers.values()].map((t) => t.ms), [POLL_BACKOFF_MS]);
  fail = false;
  await h.fire();
  await h.flush();
  assert.equal(h.session.state.phase, "completed");
  assert.equal(h.session.state.connectionLost, false);
});

test("M12 explain: a job that disappeared or is forbidden ends inline without leaking details", async () => {
  const h = harness({ job: async () => { throw api("NOT_FOUND", 404); } });
  h.session.attach();
  h.session.bind(ctx());
  await h.session.generate();
  await h.fire();
  assert.equal(h.session.state.phase, "error");
  assert.match(h.session.state.message, /not available to this account/);
  assert.equal(h.jobIds.at(-1), null);
});

test("M12 explain: reload recovery adopts only a job for this exact result", async () => {
  const good = harness({ job: async () => done() });
  good.session.attach();
  good.session.bind(ctx());
  await good.session.resume(job().id);
  await good.flush();
  assert.equal(good.session.state.phase, "completed");
  assert.equal(good.count("submit"), 0, "recovery never submits a new request");
  const bad = harness({ job: async () => done({ designId: "99999999-9999-4999-8999-999999999999" }) });
  bad.session.attach();
  bad.session.bind(ctx());
  await bad.session.resume(job().id);
  assert.equal(bad.session.state.phase, "error");
  assert.equal(bad.session.state.job, null);
  assert.equal(bad.jobIds.at(-1), null, "a foreign job id is removed from the URL");
});

test("M12 explain: every unavailable condition is explained inline with its own plain-language text", async () => {
  for (const [reason, pattern] of [["DISABLED", /not enabled/], ["BUSY", /busy/], ["MODEL_MISSING", /not installed/], ["PROVIDER_UNAVAILABLE", /not reachable/], ["MEMORY_PRESSURE", /free memory/], ["INSTANCE_BUSY", /another StressForge/i]]) {
    const h = harness({ readiness: () => ready(reason) });
    h.session.attach();
    h.session.bind(ctx());
    await h.flush();
    assert.match(explainStatusText(h.session.state), pattern, reason);
    assert.equal(h.session.state.readiness.ready, false);
  }
  for (const [error, pattern] of [
    [api("UNAVAILABLE", 503, "MEMORY_PRESSURE"), /free memory/],
    [api("UNAVAILABLE", 503, "MODEL_MISSING"), /not installed/],
    [api("UNAVAILABLE", 503, "AI_DISABLED"), /not enabled/],
    [api("CONFLICT", 409, "AI_STALE_RUN"), /latest saved revision/],
    [api("VALIDATION_FAILED", 422, "AI_CONTEXT_TOO_LARGE"), /too much evidence/],
    [api("RATE_LIMITED", 429), /rate limited/],
    [api("INTERNAL", 500), /unavailable right now/],
    [api("FORBIDDEN", 403), /not available to this account/],
  ]) {
    const h = harness({ submit: async () => { throw error; } });
    h.session.attach();
    h.session.bind(ctx());
    await h.session.generate();
    assert.equal(h.session.state.phase, "error");
    assert.match(explainStatusText(h.session.state), pattern);
  }
  const offline = harness({ readiness: async () => { throw lost(); } });
  offline.session.attach();
  offline.session.bind(ctx());
  await offline.flush();
  assert.match(explainStatusText(offline.session.state), /could not be reached/);
});

test("M12 explain: dispose stops everything and later replies change nothing", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const h = harness({ readiness: async () => { await gate; return ready(); } });
  h.session.attach();
  h.session.bind(ctx());
  const before = h.session.state;
  h.session.dispose();
  release();
  await h.flush();
  assert.equal(h.session.state, before);
  assert.equal(h.timers.size, 0);
});

test("M12 refuses a same-run job with the wrong revision", async () => {
  const h = harness({ job: async () => done({ designRevision: 2 }) });
  h.session.bind(ctx());
  await h.session.resume(job().id);
  assert.equal(h.session.state.phase, "error");
  assert.equal(h.session.state.job, null);
});

test("M12 refuses evidence with a mismatched fingerprint", async () => {
  const h = harness({ job: async () => done(), evidence: async () => evidence({ fingerprint: "c".repeat(64) }) });
  h.session.bind(ctx());
  await h.session.resume(job().id);
  await h.flush();
  assert.equal(h.session.state.evidenceFailed, true);
  assert.equal(h.session.state.evidence, null);
});

test("M12 closing and reopening during provider cleanup resumes readiness checks", async () => {
  const h = harness();
  h.session.bind(ctx());
  h.session.attach();
  await h.session.generate();
  await h.session.cancel();
  const count = h.count("submit");
  await h.session.generate();
  assert.equal(h.count("submit"), count);
  h.session.detach();
  h.session.attach();
  assert.ok([...h.timers.values()].some(t => t.ms === STOP_WATCH_MS));
  await h.fire();
  assert.equal(h.session.state.providerStopping, false);
});

test("M12 account switch clears retained explanation state immediately", () => {
  const { getExplainSession, explainView, resetExplainForTests } = require("../src/lib/explain-store.ts");
  const { adoptSession, dropSession } = require("../src/lib/api/client.ts");
  const session = getExplainSession();
  session.bind(ctx());
  explainView.publish({ ...ctx(), unsavedChanges: false, facts: null });
  adoptSession({ accessToken: "test-only", user: { id: R2, email: "other@example.test", displayName: "Other", role: "user" } });
  assert.equal(session.ctx, null);
  assert.equal(explainView.get(), null);
  dropSession();
  resetExplainForTests();
});

// AI is optional: the UI shows nothing AI-related unless the backend reports it enabled.
test("M12 optional AI: hidden unless the backend enables it, retried after an error, cleared on account switch", async () => {
  const store = require("../src/lib/explain-store.ts");
  const client = require("../src/lib/api/client.ts");
  const user = (id) => ({ accessToken: "t-" + id, user: { id, displayName: "T", email: id + "@example.test", role: "USER" } });
  store.resetExplainForTests();
  client.adoptSession(user("a"));
  assert.equal(store.aiEnabledStore.get(), false, "unknown is hidden");
  await store.probeAiEnabled(async () => ({ enabled: false }));
  assert.equal(store.aiEnabledStore.get(), false, "AI_ENABLED=false (the default) hides every AI surface");
  let calls = 0;
  store.resetExplainForTests();
  await store.probeAiEnabled(async () => { calls++; throw new Error("offline"); });
  assert.equal(store.aiEnabledStore.get(), false, "an unreachable probe shows nothing");
  await store.probeAiEnabled(async () => { calls++; return { enabled: true }; });
  assert.equal(calls, 2, "an error is not cached, so the next mount retries");
  assert.equal(store.aiEnabledStore.get(), true);
  await store.probeAiEnabled(async () => { calls++; return { enabled: false }; });
  assert.equal(calls, 2, "a known answer is cached for the sign-in");
  client.adoptSession(user("b"));
  assert.equal(store.aiEnabledStore.get(), false, "a different account never inherits the answer");
  store.resetExplainForTests();
});
