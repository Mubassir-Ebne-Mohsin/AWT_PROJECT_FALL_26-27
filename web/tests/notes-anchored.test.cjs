const { test } = require("node:test");
const assert = require("node:assert/strict");
const N = require("../src/lib/notes-presentation.ts");

// Notes pinned to components (docs/COMPONENT-NOTES-SCOPE.md): the words and rules around the marker, the filter and the Notes tab.
const note = (id, componentId, label, removed = false) => ({
  id,
  componentId,
  component: componentId && !removed ? { id: componentId, label } : null,
  componentRemoved: removed,
});
const NOTES = [note("a", "app1", "App servers"), note("b", "app1", "App servers"), note("c", "db1", "Database"), note("d", null, null), note("e", "gone", null, true)];
const COMPONENTS = [{ id: "app1", label: "App servers" }, { id: "db1", label: "Database" }, { id: "cache1", label: "Cache" }];

test("what a note says it is about: the component's name now, 'Component removed', or nothing for the whole design", () => {
  assert.equal(N.noteAboutText(NOTES[0]), "App servers");
  assert.equal(N.noteAboutText(NOTES[3]), null);
  assert.equal(N.noteAboutText(NOTES[4]), "Component removed");
});

test("the counts per component ignore the whole-design notes and a removed component's notes", () => {
  const counts = N.noteCounts(NOTES);
  assert.deepEqual([...counts.entries()].sort(), [["app1", 2], ["db1", 1]]);
  assert.equal(counts.get("gone"), undefined);
  assert.equal(counts.size, 2);
  assert.equal(N.noteCounts([]).size, 0);
});

test("the marker's name is always words, with the right plural", () => {
  assert.equal(N.markerLabel(1, "Database"), "1 note on Database");
  assert.equal(N.markerLabel(3, "App servers"), "3 notes on App servers");
});

test("filters show the right notes and never lose one", () => {
  const ids = (list) => list.map((n) => n.id);
  assert.deepEqual(ids(N.filterNotes(NOTES, "all")), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(ids(N.filterNotes(NOTES, "unpinned")), ["d"]);
  assert.deepEqual(ids(N.filterNotes(NOTES, "removed")), ["e"]);
  assert.deepEqual(ids(N.filterNotes(NOTES, { componentId: "app1" })), ["a", "b"]);
  assert.deepEqual(ids(N.filterNotes(NOTES, { componentId: "gone" })), [], "a removed component is found under 'removed', not under its old id");
  // Every note is in exactly one of: unpinned, removed, or a live component.
  const live = COMPONENTS.flatMap((c) => N.filterNotes(NOTES, { componentId: c.id }));
  assert.equal(live.length + N.filterNotes(NOTES, "unpinned").length + N.filterNotes(NOTES, "removed").length, NOTES.length);
});

test("the filter offers only choices that would show something, with their counts", () => {
  const options = N.filterOptions(NOTES, COMPONENTS);
  assert.deepEqual(options, [
    { value: "all", label: "All notes (5)" },
    { value: "unpinned", label: "About the whole design (1)" },
    { value: "c:app1", label: "App servers (2)" },
    { value: "c:db1", label: "Database (1)" },
    { value: "removed", label: "Component removed (1)" },
  ]);
  assert.ok(!options.some((o) => o.value === "c:cache1"), "a component with no notes is not offered");
  assert.deepEqual(N.filterOptions([], COMPONENTS), [{ value: "all", label: "All notes (0)" }]);
});

test("a filter value reads back to the same filter, and anything unknown means all notes", () => {
  assert.equal(N.parseFilter("all"), "all");
  assert.equal(N.parseFilter("unpinned"), "unpinned");
  assert.equal(N.parseFilter("removed"), "removed");
  assert.deepEqual(N.parseFilter("c:app1"), { componentId: "app1" });
  assert.equal(N.parseFilter("nonsense"), "all");
});
