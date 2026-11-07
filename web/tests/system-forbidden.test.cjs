const { test } = require("node:test");
const assert = require("node:assert/strict");
const { forbiddenCopy } = require("../src/lib/system-states.ts");

test("the no-access screen tells a signed-in person who they are, and never names a design it does not know", () => {
  const c = forbiddenCopy("sam@example.test");
  assert.equal(c.signedIn, true);
  assert.match(c.body, /You are signed in as sam@example\.test\./);
  assert.match(c.body, /another account, or needs a role/);
  for (const text of [c.title, c.body]) assert.doesNotMatch(text, /Legacy billing|acme|guest/i);
});

test("a person who is not signed in is told so plainly, and is not called a guest who is logged in", () => {
  for (const none of [null, undefined, ""]) {
    const c = forbiddenCopy(none);
    assert.equal(c.signedIn, false);
    assert.match(c.body, /You are not signed in/);
    assert.match(c.body, /log in with the account that owns it/);
    assert.doesNotMatch(c.body, /logged in as a guest|Legacy billing/);
  }
});

test("the title is the same for both, so the page heading never depends on who is looking", () => {
  assert.equal(forbiddenCopy("a@b.test").title, forbiddenCopy(null).title);
  assert.equal(forbiddenCopy(null).title, "You do not have access to this.");
});
