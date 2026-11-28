const { test } = require("node:test");
const assert = require("node:assert/strict");
const config = require("../next.config.ts").default;
test("every frontend path gets frame, referrer and capability restrictions", async () => {
  const rules = await config.headers();
  const rule = rules.find(r => r.source === "/:path*");
  const headers = Object.fromEntries(rule.headers.map(h => [h.key.toLowerCase(), h.value]));
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["referrer-policy"], "no-referrer");
  assert.match(headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(headers["content-security-policy"], /object-src 'none'/);
  assert.match(headers["permissions-policy"], /camera=\(\)/);
});
test("Next does not advertise its implementation", () => {
  assert.equal(config.poweredByHeader, false);
});
