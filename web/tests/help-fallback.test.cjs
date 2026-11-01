const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROUTES } = require("../src/lib/routes.ts");
const { HELP, PLACEHOLDER_ROUTES } = require("../src/lib/help.ts");

// The Help drawer may say "this screen arrives in phase N" only for pages that really are still the placeholder.
const appDir = path.resolve(__dirname, "../src/app");
const pageFor = (route) => path.join(appDir, ...route.path.split("/").filter(Boolean).map((s) => (s.startsWith(":") ? `[${s.slice(1)}]` : s)), "page.tsx");

test("the placeholder list is exactly the routes whose page renders the placeholder", () => {
  const actual = ROUTES.filter((r) => !r.redirectTo && fs.existsSync(pageFor(r)) && /RoutePlaceholder/.test(fs.readFileSync(pageFor(r), "utf8"))).map((r) => r.id).sort();
  assert.ok(actual.length > 0, "the check finds the placeholder pages");
  assert.deepEqual([...PLACEHOLDER_ROUTES].sort(), actual);
});

test("every placeholder route has no help entry of its own that would hide the note, and every id is a real route", () => {
  const ids = new Set(ROUTES.map((r) => r.id));
  for (const id of PLACEHOLDER_ROUTES) {
    assert.ok(ids.has(id), id);
    assert.equal(HELP[id], undefined, id);
  }
});

test("the drawer no longer says concept pages are coming, and only shows the placeholder note for placeholder routes", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/components/shell/help-drawer.tsx"), "utf8");
  assert.doesNotMatch(source, /Concept pages arrive/);
  assert.match(source, /PLACEHOLDER_ROUTES\.has\(route\.id\)/);
});
