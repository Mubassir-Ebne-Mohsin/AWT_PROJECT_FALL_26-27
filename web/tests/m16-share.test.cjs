const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../src/lib/api/errors.ts");
const { expiryText, openedText, shareUrl, looksLikeToken, shareErrorText, scopeLabel, scopeHelp, EXPIRY_CHOICES, BOUNDARY_TEXT, SNAPSHOT_TEXT } = require("../src/lib/share-presentation.ts");

const link = (over = {}) => ({ status: "active", expiresAt: "2026-12-01T10:00:00.000Z", revokedAt: null, openCount: 0, lastOpenedAt: null, ...over });

test("M16 share: expiry wording follows the link's real state", () => {
  assert.match(expiryText(link()), /^Expires Dec 1, 2026/);
  assert.equal(expiryText(link({ expiresAt: null })), "Does not expire");
  assert.match(expiryText(link({ status: "expired" })), /^Expired Dec 1, 2026/);
  assert.match(expiryText(link({ status: "revoked", revokedAt: "2026-11-02T08:00:00.000Z" })), /^Revoked Nov 2, 2026/);
  assert.equal(expiryText(link({ status: "revoked", revokedAt: null })), "Revoked");
});

test("M16 share: opening statistics are stated plainly and singular or plural correctly", () => {
  assert.equal(openedText(link()), "Not opened yet");
  assert.match(openedText(link({ openCount: 1, lastOpenedAt: "2026-11-02T08:00:00.000Z" })), /^Opened 1 time, last Nov 2, 2026/);
  assert.match(openedText(link({ openCount: 3, lastOpenedAt: "2026-11-02T08:00:00.000Z" })), /^Opened 3 times, last /);
});

test("M16 share: the link is built from the origin and token, and only token-shaped text is ever sent", () => {
  assert.equal(shareUrl("https://sf.example", "abc_DEF-123"), "https://sf.example/share/abc_DEF-123");
  assert.equal(looksLikeToken("A".repeat(43)), true);
  assert.equal(looksLikeToken("A".repeat(42)), false);
  assert.equal(looksLikeToken("A".repeat(44)), false);
  assert.equal(looksLikeToken("frontend-audit-share"), false); // the route audit's sample token must not cause a request
  for (const bad of ["", "short", "has space in it and is long enough", "x".repeat(200), "../../etc/passwd" + "a".repeat(10), "token?x=1" + "a".repeat(20)])
    assert.equal(looksLikeToken(bad), false, bad);
});

test("M16 share: creation errors explain what to do without blaming the wrong thing", () => {
  const limit = new ApiError("VALIDATION_FAILED", "x", 422, { reason: "SHARE_LIMIT_REACHED" });
  assert.match(shareErrorText(limit), /already has 5 active links\. Revoke one/);
  assert.match(shareErrorText(new ApiError("NOT_FOUND", "x", 404, { reason: "VERSION_NOT_RETAINED" })), /no longer kept/);
  assert.match(shareErrorText(new ApiError("FORBIDDEN", "x", 403)), /another account/);
  assert.match(shareErrorText(new ApiError("NOT_FOUND", "x", 404)), /no longer available/);
  assert.match(shareErrorText(new ApiError("VALIDATION_FAILED", "x", 422)), /cannot be shared together/);
  assert.match(shareErrorText(new ApiError("NETWORK", "x", 0)), /could not be reached/);
  assert.match(shareErrorText(new Error("boom")), /Nothing was changed/);
});

test("M16 share: scopes, expiry choices and the honest boundary text", () => {
  assert.equal(scopeLabel("design"), "Design only");
  assert.equal(scopeLabel("design_report"), "Design and report");
  assert.match(scopeHelp("design"), /No results, no Limits and no notes/);
  assert.match(scopeHelp("design_report"), /Notes are off unless/);
  assert.deepEqual(EXPIRY_CHOICES.map((c) => c.value), [7, 30, 90, null]);
  assert.match(EXPIRY_CHOICES.find((c) => c.value === 30).label, /recommended/);
  assert.match(BOUNDARY_TEXT, /cannot take back anything someone has already seen, copied or printed/);
  assert.match(SNAPSHOT_TEXT, /Later changes .* never appear/);
});
