const { test } = require("node:test");
const assert = require("node:assert/strict");
const { safeNext, authLink } = require("../src/lib/safe-next.ts");
const { resolveRoute, crumbsFor, ROUTES } = require("../src/lib/routes.ts");
const { WS_TABS } = require("../src/lib/catalog.ts");
test("login-register-login links preserve a validated destination including query and hash", () => {
  const next = "/new/template?audit=1&name=a%20b#preview";
  for (const path of ["/register", "/login"]) {
    const url = new URL(authLink(path, next), "https://stressforge.invalid");
    assert.equal(url.pathname, path);
    assert.equal(safeNext(url.searchParams.get("next")), next);
  }
});
test("return-to rejects external URLs, control characters, malformed encoding and auth loops", () => {
  for (const next of ["https://evil.test", "//evil.test", "/\\evil.test", "/ /bad", "/%zz", "/login", "/login/?x=1", "/register#x", "/%6cogin", "/x/../login", "/%2f%2fevil.test"]) {
    assert.equal(safeNext(next), "/dashboard", next);
    assert.equal(new URL(authLink("/login", next), "https://stressforge.invalid").searchParams.get("next"), "/dashboard");
  }
});
test("all workspace tabs resolve the heading/title/last breadcrumb consistently", () => {
  for (const tab of WS_TABS) {
    const r = resolveRoute(`/designs/example/${tab.id}`);
    assert.equal(r.title, tab.label);
    assert.equal(crumbsFor(r).at(-1).label, tab.label);
    assert.ok(tab.desc && tab.planned.length >= 2);
  }
  assert.equal(resolveRoute("/designs/example/unknown").route.id, "notfound");
});
test("dashboard has its current breadcrumb and new-design screens have concrete plans", () => {
  assert.deepEqual(crumbsFor(resolveRoute("/dashboard")), [{ label: "Dashboard" }]);
  for (const route of ROUTES.filter(r => r.path.startsWith("/new"))) assert.ok(route.description && route.planned.length >= 2, route.path);
});
