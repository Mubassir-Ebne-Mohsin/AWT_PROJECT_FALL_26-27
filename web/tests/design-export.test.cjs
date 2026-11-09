const { test } = require("node:test");
const assert = require("node:assert/strict");
const { designExportText, designExportFilename } = require("../src/lib/design-export.ts");

const design = {
  name: "Shop: v2 / final",
  description: "",
  graph: {
    nodes: [{ id: "c", type: "client", label: "Clients", x: 0, y: 0 }, { id: "a", type: "app", label: "App", x: 200, y: 0, props: { replicas: 2 } }],
    edges: [{ id: "e1", from: "c", to: "a" }],
  },
  traffic: { preset: "custom", rps: 100, burst: 1.1, readRatio: 0.8, sloP95: 300, errorBudget: 0.01, durationMin: 10, shape: "steady" },
};

test("export is the import format: version 1, nodes, edges and traffic, nothing else", () => {
  const out = JSON.parse(designExportText(design));
  assert.deepEqual(Object.keys(out), ["schemaVersion", "name", "nodes", "edges", "traffic"]);
  assert.equal(out.schemaVersion, 1);
  assert.deepEqual(out.nodes, design.graph.nodes);
  assert.deepEqual(out.edges, design.graph.edges);
  assert.deepEqual(out.traffic, design.traffic);
});

test("a description is kept when there is one", () => {
  assert.equal(JSON.parse(designExportText({ ...design, description: "Notes" })).description, "Notes");
});

test("file name is safe and never empty", () => {
  assert.equal(designExportFilename("Shop: v2 / final"), "shop-v2-final.json");
  assert.equal(designExportFilename("???"), "design.json");
  assert.ok(designExportFilename("x".repeat(500)).length <= 65);
});

test("a typical export stays far below the 64 KiB import limit", () => {
  const nodes = Array.from({ length: 50 }, (_, i) => ({ id: "n" + i, type: "app", label: "App " + i, x: i * 10, y: 0, props: { replicas: 2 } }));
  assert.ok(Buffer.byteLength(designExportText({ ...design, graph: { nodes, edges: [] } })) < 65536);
});
