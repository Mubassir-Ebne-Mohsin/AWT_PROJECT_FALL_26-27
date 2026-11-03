const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/lib/scripted-reply.ts");

// The concept-help drawer's fixed answers. No model is called, and every answer must be honest about that and about what the tool is.
const ask = (q) => R.scriptedReply(q);

test("every starter question gets a written answer, not the fallback", () => {
  assert.equal(R.STARTER_CHIPS.length, 5);
  for (const chip of R.STARTER_CHIPS) assert.notEqual(ask(chip), R.FALLBACK, chip);
});

test("each concept answers its own question, and the more specific one wins", () => {
  const cases = [
    ["What is p95?", "p95"],
    ["Explain the 95th percentile", "p95"],
    ["What limits my design?", "utilization"],
    ["what is the bottleneck", "utilization"],
    ["How do read replicas help?", "replica"],
    ["When should I add a queue?", "queue"],
    ["Should I add a cache?", "cache"],
    ["Why does my design fail?", "verdict"],
    ["What does strained mean?", "verdict"],
    ["What is the error budget?", "targets"],
    ["What does a spike do?", "burst"],
    ["Should I add more app servers?", "scale"],
    ["Why is the Asia region slow?", "region"],
    ["What if traffic doubles?", "what-if"],
    ["Where does it break?", "ladder"],
    ["What are the suggested fixes?", "fixes"],
    ["Where are the AI features?", "ai"],
  ];
  for (const [question, id] of cases) assert.equal(ask(question), R.CONCEPTS.find((c) => c.id === id).answer, question);
});

test("a question it cannot answer gets the fallback, which says what it can answer and that no model is called", () => {
  const out = ask("What is the meaning of life?");
  assert.equal(out, R.FALLBACK);
  assert.match(out, /fixed set of questions/);
  assert.match(out, /do not call a model/);
  assert.match(out, /do not look at your design/);
});

test("nothing is out of date: no 'phase 2', 'phase 3', 'prototype' or 'arrive' wording", () => {
  for (const text of [...R.CONCEPTS.map((c) => c.answer), R.FALLBACK]) assert.doesNotMatch(text, /phase \d|prototype|arrive/i);
});

test("no answer claims to be AI, a measurement, or to know the open design", () => {
  for (const { id, answer } of R.CONCEPTS) {
    assert.doesNotMatch(answer, /I (have )?(looked|checked|analy[sz]ed)|your design (is|has|will)|guarantee|verified|proven/i, id);
    if (id !== "ai") assert.doesNotMatch(answer.replace(/no AI/g, ""), /\bAI\b/, id);
  }
  assert.match(ask("is this ai?"), /not AI: it is a fixed set of written answers/);
});

test("the AI answer points to all three places and says that none writes a figure", () => {
  const out = ask("Where are the AI features?");
  for (const part of ["Suggested fixes", "Describe your system", "What if the traffic changed?", "experimental", "None of them writes a figure", "Evaluation page"]) assert.ok(out.includes(part), part);
});

test("the verdict answer matches the engine's rule: fail on a missed target, strained when close, otherwise pass", () => {
  const out = ask("what is a verdict");
  assert.match(out, /fails when p95 is above its target or the error rate is above the error budget/);
  assert.match(out, /strained when those targets are met but with little room/);
  assert.match(out, /80% of its target/);
  assert.match(out, /not a measurement of real servers/);
});

test("answers are stable: asking twice gives the same text", () => {
  for (const chip of R.STARTER_CHIPS) assert.equal(ask(chip), ask(chip));
});
