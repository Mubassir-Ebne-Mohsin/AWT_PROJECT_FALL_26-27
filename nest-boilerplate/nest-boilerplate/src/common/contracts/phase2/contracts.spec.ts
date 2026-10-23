import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConflictException } from "@nestjs/common";
import { graphSchema, importSchema, snapshotSchema, trafficSchema, TRAFFIC_DEFAULTS, Snapshot } from "@/common/contracts/phase2/graph.schema";
import { createDesignSchema, patchDesignSchema, runRequestSchema, runSchema } from "@/common/contracts/phase2/api.schema";
import { boundedValue, nodeMetricSchema } from "@/common/contracts/phase2/result.schema";
import { parseImportText } from "@/common/contracts/phase2/import-text";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import { phase2Examples } from "@/src/script/phase2-examples";
import { limitsOutputSchema } from "@/common/contracts/phase2/result.schema";
import { phase2OpenApi } from "@/common/contracts/phase2/openapi";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";

const root = resolve(__dirname, "../../../../../../");
const fixtures = JSON.parse(readFileSync(resolve(root, "docs/contracts/reference-fixtures.json"), "utf8")) as {
  provenance: { engineSha256: string }; templates: { id: string; input: Snapshot; expected: { simulation: { p95: number; verdict: string; nodes: Record<string, unknown>[] } } }[];
  minimumLoadCounterexample: { belowMinimum: { sloMet: boolean }; atMinimum: { sloMet: boolean }; sourceLimits: { floor: boolean; breakRps: number } };
};
const sample = () => structuredClone(fixtures.templates.find(t => t.id === "mvp")!.input);
const uuid = "00000000-0000-4000-8000-000000000001";

describe("Phase 2 contract boundaries (not engine implementation)", () => {
  it.each(fixtures.templates)("source template $id fits safe graph/traffic bounds", template => {
    expect(snapshotSchema.parse(template.input)).toEqual(template.input);
    expect(Number.isFinite(template.expected.simulation.p95)).toBe(true);
  });
  it("accepts empty and cyclic drafts without claiming they are runnable", () => {
    expect(graphSchema.parse({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
    const graph = sample().graph;
    graph.edges.push({ id: "cycle", from: graph.nodes[2].id, to: graph.nodes[1].id });
    expect(graphSchema.safeParse(graph).success).toBe(true);
  });
  it.each(["constructor", "__proto__", "prototype", "toString", "a>b", "a|b"])("rejects unsafe identifier %s", id => {
    const graph = sample().graph; graph.nodes[0].id = id;
    expect(graphSchema.safeParse(graph).success).toBe(false);
  });
  it.each(["duplicate-node", "duplicate-edge-id", "duplicate-pair", "self", "dangling"])("rejects %s", mode => {
    const graph = sample().graph;
    if (mode === "duplicate-node") graph.nodes.push(graph.nodes[0]);
    if (mode === "duplicate-edge-id") graph.edges[0].id = graph.nodes[0].id;
    if (mode === "duplicate-pair") graph.edges.push({ ...graph.edges[0], id: "another" });
    if (mode === "self") graph.edges[0].to = graph.edges[0].from;
    if (mode === "dangling") graph.edges[0].to = "missing";
    expect(graphSchema.safeParse(graph).success).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity, 100001])("rejects invalid supplied position %s", x => {
    const graph = sample().graph; graph.nodes[0].x = x;
    expect(graphSchema.safeParse(graph).success).toBe(false);
  });
  it("enforces graph size and type-specific property allowlists", () => {
    const graph = sample().graph;
    expect(graphSchema.safeParse({ nodes: Array.from({ length: 51 }, (_, i) => ({ ...graph.nodes[1], id: "a" + i })), edges: [] }).success).toBe(false);
    const invalid = { ...graph, nodes: [{ ...graph.nodes[0], props: { capacity: 100 } }, ...graph.nodes.slice(1)] };
    expect(graphSchema.safeParse(invalid).success).toBe(false);
    expect(graphSchema.safeParse({ ...graph, ownerId: uuid }).success).toBe(false);
  });
  it("preserves zero client share and the source 200 replica maximum", () => {
    const graph = sample().graph;
    graph.nodes[0].props = { share: 0 };
    graph.nodes[1].props = { replicas: 200 };
    expect(graphSchema.safeParse(graph).success).toBe(true);
    graph.nodes[1].props = { replicas: 201 };
    expect(graphSchema.safeParse(graph).success).toBe(false);
  });
  it("accepts versionless and version-one imports with omitted layout fields", () => {
    const legacy = { nodes: [{ id: "u", type: "client" }, { id: "a", type: "app" }], edges: [{ from: "u", to: "a" }] };
    expect(importSchema.safeParse(legacy).success).toBe(true);
    expect(importSchema.safeParse({ ...legacy, schemaVersion: 1 }).success).toBe(true);
    expect(importSchema.safeParse({ nodes: [] }).success).toBe(true);
    expect(importSchema.safeParse({ ...legacy, schemaVersion: 2 }).success).toBe(false);
    expect(importSchema.safeParse({ nodes: [{ id: "u", type: "client", x: null }] }).success).toBe(false);
    expect(importSchema.safeParse({ nodes: [{ id: "u", type: "client", props: { capacity: 1 } }] }).success).toBe(false);
  });
  it("checks raw UTF-8 import size before parsing without echoing submitted text", () => {
    expect(parseImportText('{"nodes":[]}')).toBeDefined();
    expect(() => parseImportText(" ".repeat(65537))).toThrow("64 KiB");
    expect(() => parseImportText("é".repeat(32769))).toThrow("64 KiB");
    expect(() => parseImportText("secret broken json")).toThrow("Invalid design JSON");
  });
  it.each([{ rps: -1 }, { burst: 0 }, { sloP95: 0 }, { errorBudget: 1.1 }, { durationMin: Infinity }, { shape: "random" }])("rejects invalid traffic %j without clamping", patch => {
    expect(trafficSchema.safeParse({ ...TRAFFIC_DEFAULTS, ...patch }).success).toBe(false);
  });
  it("rejects injected ownership and validates write/run identities", () => {
    const create = { ...sample(), name: "MVP", description: "", source: "template", templateId: "mvp" };
    expect(createDesignSchema.safeParse(create).success).toBe(true);
    expect(createDesignSchema.safeParse({ ...create, ownerId: uuid }).success).toBe(false);
    expect(createDesignSchema.safeParse({ ...create, source: "blank" }).success).toBe(false);
    expect(patchDesignSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(patchDesignSchema.safeParse({ expectedRevision: 1, graph: sample().graph }).success).toBe(true);
    expect(runRequestSchema.safeParse({ expectedRevision: 1, requestId: uuid }).success).toBe(true);
    expect(runRequestSchema.safeParse({ expectedRevision: 0, requestId: "new-every-retry" }).success).toBe(false);
  });
  it("fingerprints ignore positions/edge ids and object-key insertion order, but preserve semantic array order", () => {
    const original = sample(), moved = sample();
    moved.graph.nodes[0].x += 100;
    moved.graph.edges[0].id = "renamed";
    expect(inputFingerprint(moved)).toBe(inputFingerprint(original));
    moved.graph.nodes[1].props = { region: "us-east", replicas: 1 };
    const reordered = structuredClone(moved);
    reordered.graph.nodes[1].props = { replicas: 1, region: "us-east" };
    expect(inputFingerprint(moved)).toBe(inputFingerprint(reordered));
    const shuffled = sample(); shuffled.graph.nodes.reverse();
    expect(inputFingerprint(shuffled)).not.toBe(inputFingerprint(original));
    expect(inputFingerprint(original, "next-engine")).not.toBe(inputFingerprint(original));
  });
  it("traffic/property/label changes invalidate a fingerprint", () => {
    const original = sample();
    const mutations: ((s: Snapshot) => void)[] = [
      s => { s.traffic.rps++; }, s => { s.graph.nodes[1].props = { replicas: 2 }; },
      s => { s.graph.nodes[0].label = "Renamed"; },
    ];
    for (const mutate of mutations) { const next = sample(); mutate(next); expect(inputFingerprint(next)).not.toBe(inputFingerprint(original)); }
  });
  it("uses explicit unbounded values; only Clients have no server count", () => {
    expect(boundedValue.safeParse({ kind: "unbounded" }).success).toBe(true);
    expect(boundedValue.safeParse({ kind: "finite", value: Infinity }).success).toBe(false);
    const metric = { ...fixtures.templates[4].expected.simulation.nodes[0], cap: { kind: "unbounded" }, satRps: { kind: "unbounded" }, servers: null };
    expect(nodeMetricSchema.safeParse(metric).success).toBe(true);
    expect(nodeMetricSchema.safeParse({ ...metric, servers: NaN }).success).toBe(false);
    expect(nodeMetricSchema.safeParse({ ...metric, type: "app" }).success).toBe(false);
  });
  it("keeps the known one-rps floor defect as an explicit future port exception", () => {
    const counter = fixtures.minimumLoadCounterexample;
    expect(counter.belowMinimum.sloMet).toBe(true); expect(counter.atMinimum.sloMet).toBe(false);
    expect(counter.sourceLimits.floor).toBe(true); expect(counter.sourceLimits.breakRps).toBe(0);
  });
  it("rejects contradictory pending/failed run envelopes", () => {
    const base = { id: uuid, designId: uuid, requestId: uuid, designRevision: 1,
      fingerprint: inputFingerprint(sample()), engineVersion: "reference-port-v1", kind: "simulation",
      snapshot: sample(), createdAt: "2026-10-24T00:00:00Z",
      status: "pending", completedAt: null, result: null, failure: null };
    expect(runSchema.safeParse(base).success).toBe(true);
    expect(runSchema.safeParse({ ...base, status: "failed" }).success).toBe(false);
    expect(runSchema.safeParse({ ...base, result: {} }).success).toBe(false);
  });
  it("normalizes framework 409 to CONFLICT without changing system states", () => {
    let actual: unknown;
    new AllExceptionsFilter().catch(new ConflictException("Stale revision"), {
      switchToHttp: () => ({ getResponse: () => ({ status: (status: number) => ({ json: (body: unknown) => { actual = { status, body }; } }) }) }),
    } as never);
    expect(actual).toEqual({ status: 409, body: { error: { code: "CONFLICT", message: "Stale revision" } } });
  });
  it("validates source-derived request/response examples for every planned flow", () => {
    const output = phase2Examples();
    expect(output.examples.length).toBeGreaterThan(20);
    expect(JSON.parse(readFileSync(resolve(root, "docs/contracts/examples.json"), "utf8"))).toEqual(output);
    const example = output.examples.find(e => e.schema === "LimitsOutput")!.value as Record<string, unknown>;
    expect(limitsOutputSchema.safeParse({ ...example, passingRps: 10, failingRps: 5 }).success).toBe(false);
    const { passingRps: _passing, failingRps: _failing, ...other } = example;
    expect(limitsOutputSchema.safeParse({ ...other, state: "failsAtMinimumLoad", lowerThreshold: "unknown", headroom: null }).success).toBe(true);
    expect(limitsOutputSchema.safeParse({ ...other, state: "notReachedWithinRange", at: null, headroom: 2, headroomIsLowerBound: true }).success).toBe(true);
  });
  it("exports only planned operations with resolvable local schema refs", () => {
    const document = phase2OpenApi();
    const all = document as unknown as Record<string, unknown>;
    function visit(value: unknown) {
      if (!value || typeof value !== "object") return;
      if ("$ref" in value) {
        const ref = (value as { $ref: string }).$ref;
        expect(ref.startsWith("#/components/schemas/")).toBe(true);
        let found: unknown = all;
        for (const part of ref.slice(2).split("/")) found = (found as Record<string, unknown>)[part];
        expect(found).toBeDefined();
      }
      for (const child of Object.values(value)) visit(child);
    }
    visit(document);
    const operations = Object.values(document.paths).flatMap(path => Object.entries(path).filter(([method]) => method !== "parameters").map(([, op]) => op as Record<string, unknown>));
    expect(operations).toHaveLength(13);
    expect(operations.every(op => op["x-implementation-status"] === "planned")).toBe(true);
    expect(JSON.stringify(document)).toContain("CONFLICT");
    const committed = JSON.parse(readFileSync(resolve(root, "docs/contracts/phase2.openapi.json"), "utf8"));
    expect(committed).toEqual(document);
  });
});
