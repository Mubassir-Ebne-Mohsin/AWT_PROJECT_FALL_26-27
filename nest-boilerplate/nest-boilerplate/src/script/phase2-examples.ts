import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { schemas } from "@/common/contracts/phase2/api.schema";
import { graphNode, MODEL_VERSION } from "@/common/contracts/phase2/graph.schema";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";

// Documentation-only conversion of frozen oracle evidence. Never imported by the app.
// M2 must implement and independently verify the production wire adapter.
export function phase2Examples() {
  const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../../../docs/contracts/reference-fixtures.json"), "utf8"));
  const template = fixture.templates.find((t: any) => t.id === "mvp");
  const input = template.input;
  const id = "00000000-0000-4000-8000-000000000001";
  const now = "2026-10-24T00:00:00Z";
  const bound = (v: any) => v?.$number === "Infinity" ? { kind: "unbounded" } : { kind: "finite", value: v };
  const validation = (v: any) => ({
    ok: v.ok,
    errors: v.errors.map(issue), warnings: v.warnings.map(issue),
  });
  const issue = (i: any) => ({ code: i.code, message: i.msg, repair: i.fix, severity: i.level, nodeIds: i.nodeIds });
  const summary = (s: any) => {
    const { ok: _ok, byId: _byId, bottleneck, ...rest } = s;
    return { ...rest, validation: validation(s.validation), bottleneckId: bottleneck?.id ?? null,
      nodes: s.nodes.map((n: any) => ({ ...n, cap: bound(n.cap), satRps: bound(n.satRps), servers: n.type === "client" ? null : n.servers })),
      queues: s.queues.map((q: any) => ({ ...q, lag: bound(q.lag) })),
      flows: Object.entries(s.flows).map(([edge, rps]) => { const [from, to] = edge.split(">"); return { from, to, rps }; }),
    };
  };
  const simulation = {
    kind: "simulation", summary: summary(template.expected.simulation),
    paths: template.expected.paths.map(({ seq: _seq, ...path }: any) => path),
    timeline: template.expected.timeline, timelineLabel: "illustrative sampled timeline",
  };
  const limitsSource = template.expected.limits;
  const limits = {
    kind: "limits", state: "found", minimumTestedRps: 1,
    maximumTestedRps: Math.max(limitsSource.breakRps, ...limitsSource.curve.map((p: any) => p.rps)),
    searchIterations: 24, current: summary(limitsSource.current), headroom: bound(limitsSource.headroom),
    firstId: limitsSource.firstId, cause: limitsSource.cause,
    orderLabel: "predicted saturation under unshed demand",
    order: limitsSource.order.map((n: any) => ({ ...n, satRps: bound(n.satRps) })),
    curve: limitsSource.curve,
    // A deliberately loose bracket: source findLimits first proves 1rps passes.
    passingRps: 1, failingRps: limitsSource.breakRps, at: summary(limitsSource.at),
  };
  const create = { ...input, name: template.name, description: "", source: "template", templateId: "mvp" };
  const design = { ...create, id, revision: 1, createdAt: now, updatedAt: now };
  const pending = { id, designId: id, requestId: id, designRevision: 1, fingerprint: inputFingerprint(input),
    engineVersion: MODEL_VERSION, kind: "simulation", snapshot: input, createdAt: now,
    status: "pending", completedAt: null, result: null, failure: null };
  const latest = { id, kind: "simulation", status: "completed", designRevision: 1, createdAt: now, verdict: simulation.summary.verdict, p95: simulation.summary.p95 };
  const designSummary = { id, name: design.name, description: "", source: "template", templateId: "mvp",
    revision: 1, createdAt: now, updatedAt: now, nodeCount: input.graph.nodes.length, edgeCount: input.graph.edges.length, latestRun: latest };
  const catalog = {
    engineVersion: MODEL_VERSION,
    components: Object.entries(fixture.catalog).map(([type, c]: [string, any]) => ({
      type, label: c.label, short: c.short, category: c.category, capacity: bound(c.capacity),
      latency: c.latency, behavior: c.behavior, blurb: c.blurb, defaults: { replicas: 1, ...c.defaults },
      editableProperties: Object.keys(graphNode.options.find(n => n.shape.type.value === type)!.shape.props.shape),
    })),
    regions: Object.entries(fixture.regions).map(([id, label]) => ({ id, label })),
    trafficDefaults: fixture.trafficDefaults,
    presets: fixture.presets.map((p: any) => { const { id, name, note, ...traffic } = p; return { id, name, note, traffic: { ...fixture.trafficDefaults, ...traffic, preset: id } }; }),
  };
  const examples: { flow: string; schema: keyof typeof schemas; value: unknown }[] = [
    { flow: "GET catalog data", schema: "Catalog", value: catalog },
    ...fixture.templates.map((t: any) => ({ flow: "GET templates data item " + t.id, schema: "Template", value: { id: t.id, name: t.name, blurb: t.blurb, ...t.input } })),
    { flow: "POST designs request", schema: "CreateDesign", value: create },
    { flow: "GET or POST designs data", schema: "Design", value: design },
    { flow: "PATCH designs request", schema: "PatchDesign", value: { expectedRevision: 1, name: "Updated MVP" } },
    { flow: "POST validate request", schema: "ValidateRequest", value: { expectedRevision: 1 } },
    { flow: "POST validate data", schema: "Validation", value: validation(template.expected.validation) },
    { flow: "POST simulate or limits request", schema: "RunRequest", value: { expectedRevision: 1, requestId: id } },
    { flow: "POST simulate 202 data", schema: "AcceptedRun", value: { run: pending, statusUrl: "/v1/designs/" + id + "/runs/" + id } },
    { flow: "GET run pending data", schema: "Run", value: pending },
    { flow: "GET run complete data", schema: "Run", value: { ...pending, status: "completed", completedAt: now, result: simulation } },
    { flow: "GET run failed data", schema: "Run", value: { ...pending, status: "failed", completedAt: now, failure: { code: "INTERRUPTED", message: "Calculation interrupted; retry deliberately." } } },
    { flow: "Simulation result", schema: "SimulationOutput", value: simulation },
    { flow: "Limits result (loose documented example bracket)", schema: "LimitsOutput", value: limits },
    { flow: "GET designs full envelope", schema: "DesignList", value: { data: [designSummary], meta: { page: 1, pageSize: 20, total: 1 } } },
    { flow: "GET dashboard data", schema: "Dashboard", value: { designs: [designSummary], recentRuns: [{ ...latest, designId: id, designName: design.name }], counts: { designs: 1, retainedRuns: 1 }, countsLabel: "Runs in the retained window" } },
    { flow: "POST preview request", schema: "PreviewRequest", value: { ...input, editorSessionId: id, sequence: 1 } },
    { flow: "POST preview data", schema: "PreviewResponse", value: { editorSessionId: id, sequence: 1, fingerprint: inputFingerprint(input), engineVersion: MODEL_VERSION, validation: validation(template.expected.validation), summary: simulation.summary } },
    { flow: "409 revision error details", schema: "ConflictDetails", value: { reason: "REVISION_MISMATCH", currentRevision: 2 } },
    { flow: "409 request reuse details", schema: "ConflictDetails", value: { reason: "REQUEST_ID_REUSED" } },
    { flow: "409 preview superseded details", schema: "PreviewErrorDetails", value: { reason: "PREVIEW_SUPERSEDED" } },
    { flow: "429 preview paused by the owner's pending Run/Limits", schema: "PreviewErrorDetails", value: { reason: "DURABLE_PENDING" } },
    { flow: "422 preview complexity limit", schema: "PreviewErrorDetails", value: { reason: "COMPLEXITY_LIMIT" } },
    { flow: "503 preview deadline exceeded", schema: "PreviewErrorDetails", value: { reason: "PREVIEW_TIMEOUT" } },
    { flow: "Legacy import request", schema: "Import", value: { nodes: [{ id: "u", type: "client" }, { id: "a", type: "app" }], edges: [{ from: "u", to: "a" }] } },
  ];
  for (const example of examples) {
    const parsed = schemas[example.schema].safeParse(example.value);
    if (!parsed.success) throw new Error(example.flow + ": " + parsed.error.message);
  }
  return { note: "Documentation-only source-derived payloads. No running Phase 2 service is implied. DELETE success is 204 with no body; other payloads are wrapped in data unless explicitly marked full envelope. Error examples are in the contract guide.", examples };
}
