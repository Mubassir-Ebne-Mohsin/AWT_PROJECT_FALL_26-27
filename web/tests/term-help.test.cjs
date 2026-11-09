const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { entryById } = require("../src/lib/concept-help/index.ts");

// Every term the results screen turns into a definition card must have a short written topic behind it.
test("each result term points at an existing, short Concept help topic", () => {
  const src = fs.readFileSync(require.resolve("../src/components/workspace/run-results.tsx"), "utf8");
  const ids = [...src.matchAll(/topic="([\w-]+)"/g)].map((m) => m[1]);
  const map = src.match(/const TERMS[^=]*=\s*\{([^}]*)\}/);
  assert.ok(map, "TERMS map present");
  ids.push(...[...map[1].matchAll(/:\s*"([\w-]+)"/g)].map((m) => m[1]));
  assert.ok(ids.length >= 3);
  for (const id of ids) {
    const e = entryById(id);
    assert.ok(e, id);
    assert.ok(e.a.split(/\s+/).length <= 70, `${id} is too long for a card`);
  }
});

test("the card is a button that is closed by Escape and not opened by hover alone", () => {
  const src = fs.readFileSync(require.resolve("../src/components/ui/term-help.tsx"), "utf8");
  assert.match(src, /<button/);
  assert.match(src, /aria-expanded/);
  assert.match(src, /"Escape"/);
  assert.doesNotMatch(src, /onMouse(Enter|Over)/);
});
