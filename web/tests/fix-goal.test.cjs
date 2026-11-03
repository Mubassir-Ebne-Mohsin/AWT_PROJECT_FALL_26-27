const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../src/lib/api/errors.ts");
const F = require("../src/lib/fixes.ts");
const G = require("../src/lib/ai-fix-goal.ts");

// What a person may ask of the fix suggestions (leave kinds out, choose what comes first), and the optional AI goal box that only
// sets those choices. Nothing here computes a figure.
const readiness = (over = {}) => ({ task: "fixes", enabled: true, available: true, provider: "groq", model: "openai/gpt-oss-20b", reason: "AVAILABLE", ...over });
const err = (status, code, details) => new ApiError(code, "failed", status, details);
const fixes = (over = {}) => ({ status: "ALL_EXCLUDED", limiter: { id: "n", label: "App servers", type: "app" }, tried: 0, ...over });

test("the choices are the four kinds and four preferences the server knows, in a fixed order", () => {
  assert.deepEqual(F.KIND_CHOICES.map((c) => c.kind), ["replicas", "capacity", "cache", "readReplica"]);
  assert.deepEqual(F.PREFERENCE_CHOICES.map((c) => c.preference), ["default", "simplest", "lowest_latency", "fewest_errors"]);
  for (const c of [...F.KIND_CHOICES, ...F.PREFERENCE_CHOICES]) assert.ok(c.label.length > 3);
});

test("switching a kind on or off keeps the kinds in their fixed order and leaves the preference alone", () => {
  let f = { exclude: [], preference: "simplest" };
  f = F.toggleKind(f, "cache", true);
  f = F.toggleKind(f, "replicas", true);
  assert.deepEqual(f, { exclude: ["replicas", "cache"], preference: "simplest" });
  f = F.toggleKind(f, "replicas", false);
  assert.deepEqual(f, { exclude: ["cache"], preference: "simplest" });
  assert.deepEqual(F.toggleKind(f, "cache", true), f);
});

test("a filter that asks for nothing is recognised, and anything else is not", () => {
  assert.equal(F.isNoFilter(F.NO_FILTER), true);
  assert.equal(F.isNoFilter({ exclude: ["cache"], preference: "default" }), false);
  assert.equal(F.isNoFilter({ exclude: [], preference: "fewest_errors" }), false);
});

test("leaving every fix out has its own plain sentence that says what to do", () => {
  assert.match(F.statusText(fixes()), /left out every kind of fix that could be tried here, so none was tried\. Untick one/);
});

test("the goal box is offered only when the server says the fixes task is switched on", () => {
  assert.equal(G.fixGoalEnabled(undefined), false);
  assert.equal(G.fixGoalEnabled(null), false);
  assert.equal(G.fixGoalEnabled([]), false);
  assert.equal(G.fixGoalEnabled([readiness({ enabled: false, available: false, reason: "DISABLED" })]), false);
  assert.equal(G.fixGoalEnabled([readiness({ task: "describe" })]), false, "another task's switch does not count");
  assert.equal(G.fixGoalEnabled([readiness({ task: "describe" }), readiness()]), true);
});

test("it is quiet when the task is off or ready, and explains a quota wait, a missing service or anything else", () => {
  assert.equal(G.fixGoalUnavailableText(undefined), null);
  assert.equal(G.fixGoalUnavailableText([readiness({ enabled: false, available: false, reason: "DISABLED" })]), null);
  assert.equal(G.fixGoalUnavailableText([readiness()]), null);
  assert.equal(G.fixGoalUnavailableText([readiness({ available: false, reason: "QUOTA_EXHAUSTED", retryAfterSeconds: 300 })]), "The free AI quota is used up for now. You can try again in about 5 minutes.");
  assert.equal(G.fixGoalUnavailableText([readiness({ available: false, reason: "PROVIDER_NOT_CONFIGURED" })]), "The AI service is not set up on this server.");
  assert.equal(G.fixGoalUnavailableText([readiness({ available: false, reason: "DISABLED" })]), "Reading a goal with AI is not available right now.");
});

test("the notice says what is sent, to whom, and that the AI only sets choices and never a figure", () => {
  for (const part of ["sentence you typed", "Groq", "hosted", "secrets or personal data", "only sets the choices", "every figure still comes from the model, not the AI"]) assert.match(G.AI_FIX_GOAL_NOTICE, new RegExp(part));
  assert.equal(G.AI_FIX_GOAL_MAX, 200);
});

test("every failure is put in plain words with what to do next, and none leaks a server message", () => {
  const cases = [
    [new Error("boom"), /could not be read\. Use the choices below/],
    [err(401, "UNAUTHORIZED"), /session ended/],
    [err(503, "UNAVAILABLE", { reason: "AI_DISABLED" }), /switched off on this server\. Use the choices below/],
    [err(503, "UNAVAILABLE", { reason: "PROVIDER_NOT_CONFIGURED" }), /not set up on this server/],
    [err(429, "RATE_LIMITED", { reason: "AI_QUOTA", retryAfterSeconds: 120 }), /quota is used up for now\. You can try again in about 2 minutes\. Use the choices below meanwhile/],
    [err(429, "RATE_LIMITED", { reason: "AI_QUOTA", limit: "requests per person per day" }), /used today's AI requests/],
    [err(503, "UNAVAILABLE", { reason: "AI_QUOTA_UNAVAILABLE" }), /could not be checked, so no request was made/],
    [err(422, "VALIDATION_FAILED", { reason: "INVALID_OUTPUT" }), /reading could not be used\. Try rewording/],
    [err(422, "VALIDATION_FAILED", { fields: [{ path: "goal", message: "Too big: expected string to have <=200 characters" }] }), /^The goal too big/],
    [err(0, "NETWORK"), /Nothing was sent to the AI/],
    [err(500, "INTERNAL_ERROR"), /could not be read\. Use the choices below/],
  ];
  for (const [error, pattern] of cases) {
    const text = G.fixGoalError(error);
    assert.match(text, pattern);
    assert.doesNotMatch(text, /failed|boom|INTERNAL/);
  }
});

test("the goal box says plainly that it is experimental and off by default, and points to the evidence", () => {
  assert.match(G.AI_FIX_GOAL_EXPERIMENTAL, /^Experimental: it narrowly missed its own test and is off by default\.$/);
  assert.doesNotMatch(G.AI_FIX_GOAL_EXPERIMENTAL, /verified|proven|accurate|reliable|passed/i);
});
