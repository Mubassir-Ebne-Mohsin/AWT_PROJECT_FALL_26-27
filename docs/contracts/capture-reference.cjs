// Read-only oracle: execute only the local reference engine and SECTION 3 templates.
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createHash } = require("node:crypto");
const vm = require("node:vm");
const root = resolve(__dirname, "../..");
const enginePath = resolve(root, "nest-boilerplate/nest-boilerplate/docs/stressforge/reference/mock-engine.js");
const prototypePath = resolve(root, "nest-boilerplate/nest-boilerplate/docs/stressforge/reference/architecture-stress-test.html");
const backend = resolve(root, "nest-boilerplate/nest-boilerplate");
process.env.TS_NODE_PROJECT = resolve(backend, "tsconfig.json");
require(resolve(backend, "node_modules/ts-node/register"));
const { snapshotSchema } = require(resolve(backend, "src/common/contracts/phase2/graph.schema.ts"));
const engine = readFileSync(enginePath, "utf8").replace(/\r\n/g, "\n");
const html = readFileSync(prototypePath, "utf8").replace(/\r\n/g, "\n");
const start = html.indexOf("const TEMPLATES = [");
const end = html.indexOf("const LEARN_TOPICS", start);
if (start < 0 || end < 0) throw new Error("Reference template section not found");
const templateSource = html.slice(start, end);
const context = vm.createContext({});
vm.runInContext(engine, context, { timeout: 10000 });
vm.runInContext(templateSource + ";globalThis.templates=TEMPLATES;", context, { timeout: 1000 });
const E = context.MockEngine;
const sha = text => createHash("sha256").update(text).digest("hex");
// Oracle tags preserve source Infinity without pretending it is the final API adapter.
const serialize = value => JSON.stringify(value, (_key, v) => {
  if (typeof v !== "number" || Number.isFinite(v)) return v;
  if (v === Infinity) return { $number: "Infinity" };
  return { $number: Number.isNaN(v) ? "NaN" : "-Infinity" };
}, 2) + "\n";
const templates = context.templates.map(t => {
  const { graph, traffic } = snapshotSchema.parse({ schemaVersion: 1, graph: E.buildFromSpec(t.spec), traffic: E.normTraffic({ ...E.TRAFFIC_DEFAULTS, ...t.traffic }) });
  return { id: t.id, name: t.name, blurb: t.blurb,
    input: { schemaVersion: 1, graph, traffic },
    expected: { validation: E.validate(graph), simulation: E.simulate(graph, traffic),
      paths: E.paths(graph, traffic), limits: E.findLimits(graph, traffic), timeline: E.timeline(graph, traffic) } };
});
const floorGraph = E.buildFromSpec({ appReplicas: 1, db: false, appProps: { capacity: 1, latency: 1 } });
const floorTraffic = E.normTraffic({ rps: 1, burst: 2, readRatio: 1, sloP95: 300, errorBudget: 0.01 });
const output = serialize({
  provenance: { engineSha256: sha(engine), templatesSha256: sha(templateSource),
    oracle: "Unmodified prototype JavaScript; source behavior, not calibrated measurements",
    finiteTolerance: { absolute: 1e-6, relative: 1e-6 },
    normalization: "phase2-snapshot-v1 before oracle and port evaluation",
    nonFiniteEncoding: "Tagged Infinity/NaN preserve source evidence; never API values" },
  catalog: E.CATALOG, regions: E.REGIONS, presets: E.PRESETS, trafficDefaults: E.TRAFFIC_DEFAULTS,
  templates,
  minimumLoadCounterexample: {
    input: { schemaVersion: 1, graph: floorGraph, traffic: floorTraffic },
    belowMinimum: E.simulate(floorGraph, floorTraffic, { rps: 0.1 }),
    atMinimum: E.simulate(floorGraph, floorTraffic), sourceLimits: E.findLimits(floorGraph, floorTraffic),
    expectedWireState: "failsAtMinimumLoad", lowerThreshold: "unknown",
  },
});
const destination = resolve(__dirname, "reference-fixtures.json");
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8").replace(/\r\n/g, "\n") !== output) throw new Error("Reference fixtures drifted");
  console.log("Six complete reference fixtures and minimum-load counterexample match source");
} else {
  writeFileSync(destination, output);
  console.log("Captured six full-precision oracle fixtures and minimum-load counterexample");
}
