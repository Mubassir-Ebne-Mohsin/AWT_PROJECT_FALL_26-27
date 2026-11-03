const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../src/lib/api/errors.ts");
const { CreationSession } = require("../src/lib/creation-session.ts");
const W = require("../src/lib/ai-describe.ts");

// Describe-to-design with a hosted model: what the page says, what it refuses to send, and that leaving cancels the request.
const prepared = (over = {}) => ({
  design: { schemaVersion: 1, name: "News site", description: "d", source: "ai", templateId: null, graph: { nodes: [], edges: [] }, traffic: {} },
  assumptions: ["Suggested by a hosted AI model (Groq, openai/gpt-oss-20b) from your description. Review every part before creating."],
  provider: "groq",
  model: "openai/gpt-oss-20b",
  ...over,
});
const readiness = (over = {}) => ({ task: "describe", enabled: true, available: true, provider: "groq", model: "openai/gpt-oss-20b", reason: "AVAILABLE", ...over });
const err = (status, code, details, message = "failed") => new ApiError(code, message, status, details);

test("the notice says what is sent, to whom, how long it may be kept, and that nothing is saved yet", () => {
  for (const part of ["description you typed", "Groq", "hosted", "secrets or personal data", "30 days", "Zero Data Retention", "Nothing is saved until you create"])
    assert.match(W.AI_DESCRIBE_NOTICE, new RegExp(part));
  assert.equal(W.AI_DESCRIBE_MAX, 500);
});

test("it is quiet when the task is off or ready, and explains a quota wait, a missing service or anything else", () => {
  assert.equal(W.describeUnavailableText(undefined), null);
  assert.equal(W.describeUnavailableText(null), null);
  assert.equal(W.describeUnavailableText(readiness({ enabled: false, available: false, reason: "DISABLED" })), null);
  assert.equal(W.describeUnavailableText(readiness()), null);
  assert.equal(W.describeUnavailableText(readiness({ available: false, reason: "QUOTA_EXHAUSTED", retryAfterSeconds: 300 })), "The free AI quota is used up for now. You can try again in about 5 minutes.");
  assert.equal(W.describeUnavailableText(readiness({ available: false, reason: "PROVIDER_NOT_CONFIGURED" })), "The AI service is not set up on this server.");
  assert.equal(W.describeUnavailableText(readiness({ available: false, reason: "DISABLED" })), "AI drafts are not available right now.");
});

test("waits are said in seconds, minutes or hours, and not at all when unknown", () => {
  assert.equal(W.waitText(undefined), "");
  assert.equal(W.waitText(0), "");
  assert.equal(W.waitText(45), " You can try again in about 45 seconds.");
  assert.equal(W.waitText(89), " You can try again in about 89 seconds.");
  assert.equal(W.waitText(90), " You can try again in about 2 minutes.");
  assert.equal(W.waitText(7140), " You can try again in about 119 minutes.");
  assert.equal(W.waitText(7200), " You can try again in about 2 hours.");
});

test("every failure is put in plain words with what to do next, and none leaks a server message", () => {
  const cases = [
    [err(401, "UNAUTHENTICATED"), /session ended/],
    [err(503, "UNAVAILABLE", { reason: "AI_DISABLED" }), /switched off.*keyword rules/],
    [err(503, "UNAVAILABLE", { reason: "PROVIDER_NOT_CONFIGURED" }), /not set up.*keyword rules/],
    [err(429, "RATE_LIMITED", { reason: "AI_QUOTA", limit: "requests per minute", retryAfterSeconds: 120 }), /quota is used up.*2 minutes.*keyword rules/],
    [err(429, "RATE_LIMITED", { reason: "AI_QUOTA", limit: "requests per person per day" }), /used today's AI drafts/],
    [err(429, "RATE_LIMITED", { reason: "PROVIDER_RATE_LIMITED" }), /quota is used up/],
    [err(503, "UNAVAILABLE", { reason: "AI_QUOTA_UNAVAILABLE" }), /no request was made/],
    [err(422, "VALIDATION_FAILED", { reason: "INVALID_OUTPUT" }), /suggestion could not be used.*rewording/],
    [err(422, "VALIDATION_FAILED", { reason: "NOT_A_SYSTEM" }), /did not read as a description of a web system.*no draft was made/],
    [err(422, "VALIDATION_FAILED", { fields: [{ path: "text", message: "Too big" }] }), /^The description too big/],
    [err(0, "NETWORK"), /Nothing was sent to the AI/],
    [err(500, "INTERNAL"), /could not be made/],
    [new Error("boom"), /could not be made/],
  ];
  for (const [error, pattern] of cases) {
    const text = W.aiDescribeError(error);
    assert.match(text, pattern);
    assert.doesNotMatch(text, /boom|failed/);
  }
});

test("an AI draft goes to review like a keyword draft, with the model's suggestion in place and nothing saved", async () => {
  const calls = [];
  const session = new CreationSession(undefined, undefined, async (text, signal) => (calls.push([text, signal.aborted]), prepared()));
  const result = await session.prepareWithAi("  A news site for 200k daily users  ");
  assert.deepEqual(calls, [["A news site for 200k daily users", false]]);
  assert.equal(result.design.source, "ai");
  assert.equal(session.state.prepared.design.name, "News site");
  assert.equal(session.state.name, "News site");
  assert.equal(session.state.pending, false);
  assert.equal(session.state.created, undefined);
  assert.equal(session.state.error, "");
});

test("a blank or over-long description never leaves the browser, and the person is told why", async () => {
  let calls = 0;
  const session = new CreationSession(undefined, undefined, async () => (calls++, prepared()));
  await session.prepareWithAi("   ");
  assert.equal(session.state.error, "Write a description first.");
  await session.prepareWithAi("x".repeat(501));
  assert.match(session.state.error, /up to 500 characters and yours has 501.*keyword rules/);
  await session.prepareWithAi("x".repeat(500));
  assert.equal(calls, 1);
});

test("a failed AI draft shows its words, keeps nothing half-made, and allows another try", async () => {
  let n = 0;
  const session = new CreationSession(undefined, undefined, async () => {
    if (++n === 1) throw err(429, "RATE_LIMITED", { reason: "AI_QUOTA", limit: "requests per minute", retryAfterSeconds: 30 });
    return prepared();
  });
  await session.prepareWithAi("a site");
  assert.match(session.state.error, /quota is used up.*30 seconds/);
  assert.equal(session.state.prepared, undefined);
  assert.equal(session.state.pending, false);
  await session.prepareWithAi("a site");
  assert.equal(session.state.error, "");
  assert.equal(session.state.prepared.design.name, "News site");
});

test("only one request runs at a time, and a draft is refused once the design exists", async () => {
  let finish, calls = 0;
  const session = new CreationSession(undefined, undefined, () => (calls++, new Promise((r) => (finish = r))));
  const first = session.prepareWithAi("a site");
  await session.prepareWithAi("a site");
  assert.equal(calls, 1);
  finish(prepared());
  await first;
  const done = new CreationSession(undefined, undefined, async () => (calls++, prepared()));
  done.state = { ...done.state, created: { id: "saved" } };
  await done.prepareWithAi("a site");
  assert.equal(calls, 1);
});

test("leaving the page cancels the model request and ignores its answer", async () => {
  let finish, signal;
  const session = new CreationSession(undefined, undefined, (_t, s) => ((signal = s), new Promise((r) => (finish = r))));
  const pending = session.prepareWithAi("a site");
  assert.equal(signal.aborted, false);
  session.dispose();
  assert.equal(signal.aborted, true);
  finish(prepared());
  assert.equal(await pending, undefined);
  assert.equal(session.state.prepared, undefined);
  assert.equal(session.state.error, "");
});

test("changing the description discards an AI draft, as it does a keyword draft", async () => {
  const session = new CreationSession(undefined, undefined, async () => prepared());
  await session.prepareWithAi("a site");
  session.update({ name: "Mine" });
  assert.equal(session.state.prepared.design.source, "ai");
  session.update({ text: "another site" });
  assert.equal(session.state.prepared, undefined);
});
