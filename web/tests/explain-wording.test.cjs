const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../src/lib/api/errors.ts");
const W = require("../src/lib/explain-wording.ts");
const { ExplainSession, READINESS_TEXT, explainStatusText, failureText, readinessText } = require("../src/lib/explain-session.ts");

// An explanation can be generated locally (nothing leaves the computer) or by a hosted provider (the facts of one run are sent to
// Groq). The words must say which, and a response that does not say keeps the local wording it always had.
const U = "11111111-1111-4111-8111-111111111111";
const D = "22222222-2222-4222-8222-222222222222";
const R = "33333333-3333-4333-8333-333333333333";
const ctx = () => ({ userId: U, designId: D, designName: "Single-server MVP", runId: R, runRevision: 1, savedRevision: 1 });
const REASONS = ["DISABLED", "AVAILABLE", "BUSY", "MODEL_MISSING", "PROVIDER_UNAVAILABLE", "MEMORY_PRESSURE", "INSTANCE_BUSY", "QUOTA_EXHAUSTED"];
const ready = (reason, provider, extra = {}) => ({ enabled: true, ready: reason === "AVAILABLE", model: "openai/gpt-oss-20b", provider, reason, ...extra });
const job = (over = {}) => ({
  id: "55555555-5555-4555-8555-555555555555", designId: D, requestId: "66666666-6666-4666-8666-666666666666", designRevision: 1,
  versionId: "77777777-7777-4777-8777-777777777777", runId: R, fingerprint: "a".repeat(64), model: "openai/gpt-oss-20b", modelDigest: W.isHosted("groq") ? "hosted-model-digest-unavailable" : "",
  promptVersion: "m12-explain-v1", schemaVersion: "m12-explanation-v1", status: "pending", createdAt: "2026-11-01T00:00:00.000Z", completedAt: null,
  expiresAt: "2026-11-02T00:00:00.000Z", result: null, failure: null, experimental: true, ...over,
});

function session(script = {}) {
  const deps = {
    readiness: async () => (script.readiness ? script.readiness() : ready("AVAILABLE", "groq")),
    submit: async () => { if (script.submit) return script.submit(); return { job: job(), statusUrl: "/v1/ai/jobs/x" }; },
    job: async () => (script.job ? script.job() : job()),
    evidence: async () => { throw new Error("not needed"); },
    cancel: async () => job({ status: "cancelled" }),
    newId: () => "req-1",
    setTimer: () => 1,
    clearTimer: () => undefined,
  };
  const s = new ExplainSession(deps);
  s.setJobListener(() => undefined);
  s.attach();
  s.bind(ctx());
  return s;
}
const flush = () => new Promise((r) => setImmediate(r));
const apiError = (code, status, details) => new ApiError(code, "x", status, details);

test("what is sent is stated precisely: the verified facts of one run, nothing else, and what the provider may keep", () => {
  const t = W.SENT_TO_HOSTED;
  for (const part of [/Sent to Groq/, /verdict/, /p95 and its target/, /error rate and its budget/, /bottleneck's label and utilization/, /Nothing else from your design or your account/, /30 days/, /Zero Data Retention/]) assert.match(t, part);
  assert.doesNotMatch(t, /nothing leaves|never leaves|private/i);
});

test("wait times read as a person would say them, at every boundary", () => {
  const cases = [[undefined, "a moment"], [0, "a moment"], [-5, "a moment"], [1, "less than a minute"], [59, "less than a minute"], [60, "about 1 minute"], [61, "about 2 minutes"], [150, "about 3 minutes"], [3599, "about 60 minutes"], [3600, "about 1 hour"], [3601, "about 2 hours"], [86400, "about 24 hours"]];
  for (const [seconds, text] of cases) assert.equal(W.waitText(seconds), text, String(seconds));
});

test("only the hosted provider is called hosted", () => {
  assert.equal(W.isHosted("groq"), true);
  for (const other of ["ollama", undefined, null, "", "GROQ"]) assert.equal(W.isHosted(other), false, String(other));
});

test("a local or unspecified provider keeps exactly the local readiness wording, for every reason", () => {
  for (const provider of [undefined, "ollama"]) for (const reason of REASONS) assert.equal(readinessText({ reason, provider }), READINESS_TEXT[reason], `${provider} ${reason}`);
});

test("a hosted provider is described as hosted: ready, unavailable and quota used up, with the wait", () => {
  assert.equal(readinessText({ reason: "AVAILABLE", provider: "groq" }), "Hosted AI (Groq) is ready.");
  assert.match(readinessText({ reason: "PROVIDER_UNAVAILABLE", provider: "groq" }), /hosted AI service is not available.*key is set on the server/);
  assert.match(readinessText({ reason: "QUOTA_EXHAUSTED", provider: "groq", retryAfterSeconds: 150 }), /free hosted quota is used up.*about 3 minutes/);
  assert.match(readinessText({ reason: "QUOTA_EXHAUSTED", provider: "groq" }), /try again in a moment/);
});

test("no hosted readiness text claims anything about a local model or this computer", () => {
  for (const reason of REASONS) {
    const text = readinessText({ reason, provider: "groq", retryAfterSeconds: 90 });
    assert.doesNotMatch(text, /local|this computer|install|memory|start it/i, `${reason}: ${text}`);
  }
});

test("the drawer's one status line follows the provider the server reports", async () => {
  const hosted = session({ readiness: async () => ready("QUOTA_EXHAUSTED", "groq", { retryAfterSeconds: 400 }) });
  await flush();
  assert.match(explainStatusText(hosted.state), /about 7 minutes/);
  const local = session({ readiness: async () => ({ enabled: true, ready: false, model: "qwen2.5:1.5b", reason: "PROVIDER_UNAVAILABLE" }) });
  await flush();
  assert.match(explainStatusText(local.state), /not reachable/);
});

test("a refused or failed request is explained in hosted terms: quota with the wait, quota unreadable, no key", async () => {
  for (const [error, pattern] of [
    [apiError("RATE_LIMITED", 429, { reason: "AI_QUOTA", limit: "requests per day", retryAfterSeconds: 200 }), /free hosted quota is used up.*about 4 minutes/],
    [apiError("UNAVAILABLE", 503, { reason: "AI_QUOTA_UNAVAILABLE" }), /quota could not be checked, so no request was sent/],
    [apiError("UNAVAILABLE", 503, { reason: "PROVIDER_NOT_CONFIGURED" }), /Hosted AI is not configured on the server \(no key is set\)/],
  ]) {
    const s = session({ submit: async () => { throw error; } });
    await flush();
    await s.generate();
    assert.equal(s.state.phase, "error");
    assert.match(explainStatusText(s.state), pattern);
  }
});

test("a provider outage on submit reads as hosted when the provider is hosted, and as local when it is local", async () => {
  const hosted = session({ submit: async () => { throw apiError("UNAVAILABLE", 503, { reason: "PROVIDER_UNAVAILABLE" }); } });
  await flush();
  await hosted.generate();
  assert.match(explainStatusText(hosted.state), /hosted AI service is not available/);
  const local = session({ readiness: async () => ({ enabled: true, ready: true, model: "qwen2.5:1.5b", reason: "AVAILABLE" }), submit: async () => { throw apiError("UNAVAILABLE", 503, { reason: "PROVIDER_UNAVAILABLE" }); } });
  await flush();
  await local.generate();
  assert.match(explainStatusText(local.state), /local model service is not reachable/);
});

test("a failed job says what failed in the words of its provider", () => {
  assert.match(failureText("PROVIDER_RATE_LIMITED", "groq"), /Groq's free quota was reached.*Nothing was retried/);
  assert.match(failureText("PROVIDER_UNAVAILABLE", "groq"), /hosted service did not respond or rejected the request/);
  assert.match(failureText("MODEL_CHANGED", "groq"), /hosted model reported a different name/);
  assert.match(failureText("PROVIDER_UNAVAILABLE", "ollama"), /local model service stopped responding/);
  assert.match(failureText("PROVIDER_UNAVAILABLE"), /local model service stopped responding/);
  assert.match(failureText("PROVIDER_RATE_LIMITED", "ollama"), /rate limit was reached/);
  assert.equal(failureText("SOMETHING_NEW", "groq"), "The explanation did not complete.");
  assert.equal(failureText(undefined), "The explanation did not complete.");
  // A reason that reads the same for both providers is not rewritten.
  assert.equal(failureText("CANCELLED", "groq"), failureText("CANCELLED", "ollama"));
  assert.doesNotMatch(Object.values(W.HOSTED_FAILURE_TEXT).join(" "), /local|computer|installed/i);
});

test("a hosted job that failed shows the hosted failure text, and a job without a provider shows the local one", async () => {
  const failed = (provider) => job({ status: "failed", provider, completedAt: "2026-11-01T00:00:05.000Z", failure: { reason: "PROVIDER_UNAVAILABLE", message: "x" } });
  const hosted = session({ job: async () => failed("groq") });
  await flush();
  await hosted.resume(job().id);
  await flush();
  assert.match(explainStatusText(hosted.state) ?? hosted.state.message ?? "", /hosted service did not respond/);
  const old = session({ job: async () => failed(undefined) });
  await flush();
  await old.resume(job().id);
  await flush();
  assert.match(old.state.message ?? "", /local model service stopped responding/);
});

test("provenance lines: a hosted model has no digest, tokens and time appear only when reported", () => {
  assert.equal(W.digestText({ provider: "groq", modelDigest: "hosted-model-digest-unavailable" }), "no digest (hosted model)");
  assert.equal(W.digestText({ provider: "ollama", modelDigest: "b".repeat(64) }), "b".repeat(12));
  assert.equal(W.digestText({ modelDigest: "c".repeat(64) }), "c".repeat(12));
  assert.equal(W.usageText({ promptTokens: 400, completionTokens: 120, totalTokens: 520 }), "400 in · 120 out · 520 total");
  assert.equal(W.usageText(null), null);
  assert.equal(W.usageText(undefined), null);
  assert.equal(W.latencyText(123), "123 ms");
  assert.equal(W.latencyText(999), "999 ms");
  assert.equal(W.latencyText(1000), "1.0 s");
  assert.equal(W.latencyText(2340), "2.3 s");
  assert.equal(W.latencyText(0), "0 ms");
  assert.equal(W.latencyText(null), null);
  assert.equal(W.latencyText(undefined), null);
});

test("the store learns that the provider is hosted from the readiness probe, and treats anything else as local", async () => {
  const fresh = () => {
    delete require.cache[require.resolve("../src/lib/explain-store.ts")];
    return require("../src/lib/explain-store.ts");
  };
  const hosted = fresh();
  await hosted.probeAiEnabled(async () => ({ enabled: true, provider: "groq" }));
  assert.equal(hosted.aiHostedStore.get(), true);
  assert.equal(hosted.aiEnabledStore.get(), true);
  const local = fresh();
  await local.probeAiEnabled(async () => ({ enabled: true, provider: "ollama" }));
  assert.equal(local.aiHostedStore.get(), false);
  const none = fresh();
  assert.equal(none.aiHostedStore.get(), false, "before the probe it is local wording");
  await none.probeAiEnabled(async () => ({ enabled: true }));
  assert.equal(none.aiHostedStore.get(), false, "a response that does not say keeps local wording");
});
