import { z } from "zod";
import { createHash } from "node:crypto";
import { componentNodeSchema } from "@/modules/region-lab/engine/component-input";
import {
  regionalInputSchema,
  type RegionalInput,
} from "@/modules/region-lab/engine/regional-input";
import { simulateRegionalExperiment } from "@/modules/region-lab/engine/regional-engine";
import {
  FoundationError,
  FOUNDATION_LIMITS,
  type FoundationOptions,
} from "@/modules/region-lab/engine/engine";
const id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
  .refine((v) => !["constructor", "prototype", "__proto__"].includes(v));
const region = z.enum(["us-east", "eu-west", "ap-south"]);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const geometry = {
  id,
  label: z.string().trim().min(1).max(80),
  x: z.number().min(-100000).max(100000),
  y: z.number().min(-100000).max(100000),
  region,
};
const profiled = {
  ...geometry,
  profileId: id,
  profileVersion: int(1, 1000000),
  replicas: int(1, 200),
};
const graphNode = z.discriminatedUnion("type", [
  z.strictObject({ ...geometry, type: z.literal("client") }),
  z.strictObject({
    ...profiled,
    type: z.enum([
      "cdn",
      "lb",
      "gateway",
      "app",
      "worker",
      "cache",
      "db",
      "queue",
      "storage",
      "external",
    ]),
  }),
  z.strictObject({
    ...profiled,
    type: z.literal("replica"),
    primaryNodeId: id,
  }),
]);
const op = regionalInputSchema.shape.workload.shape.operations.element.extend({
  label: z.string().trim().min(1).max(80),
});
export const draftScenarioSchema = z.strictObject({
  schemaVersion: z.literal(1),
  engineContract: z.literal("region-lab-event-v1-draft"),
  regions: z.array(region).min(1).max(3),
  profiles: z
    .array(
      z.strictObject({
        id,
        version: int(1, 1000000),
        label: z.string().trim().min(1).max(100),
        origin: z.enum(["reference", "measured", "custom"]),
        provenance: z.string().trim().min(1).max(500),
        component: z.enum([
          "cdn",
          "lb",
          "gateway",
          "app",
          "worker",
          "cache",
          "db",
          "replica",
          "queue",
          "storage",
          "external",
        ]),
        properties: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(36),
  graph: z.strictObject({
    nodes: z.array(graphNode).min(2).max(36),
    edges: z
      .array(
        z.strictObject({
          id,
          from: id,
          to: id,
          operationIds: z.array(id).min(1).max(8),
          mode: z.enum(["sync", "async"]),
          dispatch: z.enum(["all", "weighted_one"]),
          weight: int(1, 10000),
        }),
      )
      .max(120),
  }),
  network: regionalInputSchema.shape.network,
  routing: regionalInputSchema.shape.routing,
  workload: z.strictObject({
    baselineRps: z.number().min(0).max(20000),
    arrival: z.enum(["constant_rate", "poisson"]),
    durationSeconds: int(10, 3600),
    warmupSeconds: int(0, 120),
    drainSeconds: int(1, 60),
    regionalShares: z
      .array(z.strictObject({ region, shareBps: int(0, 10000) }))
      .min(1)
      .max(3),
    operations: z.array(op).min(1).max(8),
    schedule: z
      .array(
        z.strictObject({
          atSeconds: int(0, 3600),
          multiplier: z.number().min(0).max(10),
        }),
      )
      .min(2)
      .max(32),
  }),
  outage: z
    .strictObject({
      id,
      scope: z.literal("application_deployment"),
      region,
      affectedNodeIds: z.array(id).min(1).max(12),
      startSeconds: int(0, 3600),
      durationSeconds: int(1, 3600),
      inFlightPolicy: z.literal("abort_at_failed_node"),
    })
    .nullable(),
  targets: z.strictObject({
    p95Ms: z.number().min(1).max(60000),
    errorBudgetRatio: z.number().min(0).max(1),
    perRegion: regionalInputSchema.shape.regionalTargets,
  }),
  runOptions: z.strictObject({
    mode: z.enum(["baseline", "outage", "paired"]),
    seed: int(0, 4294967295),
    repetitions: int(1, 5),
  }),
});
export function adaptRegionalScenario(value: unknown) {
  const parsed = draftScenarioSchema.safeParse(value);
  if (!parsed.success)
    throw new FoundationError(
      "INVALID_INPUT",
      parsed.error.issues
        .slice(0, 8)
        .map((i) => i.message)
        .join("; "),
    );
  if (parsed.data.runOptions.mode !== "baseline" && !parsed.data.outage)
    throw new FoundationError(
      "INVALID_INPUT",
      "Outage/paired mode requires an outage",
    );
  const s = parsed.data,
    profileKeys = s.profiles.map((p) => p.id + "@" + p.version);
  if (
    new Set(profileKeys).size !== profileKeys.length ||
    new Set(s.regions).size !== s.regions.length
  )
    throw new FoundationError(
      "INVALID_INPUT",
      "Duplicate region or profile version",
    );
  const active = new Set(s.graph.nodes.map((n) => n.region));
  if (active.size !== s.regions.length || s.regions.some((r) => !active.has(r)))
    throw new FoundationError(
      "INVALID_INPUT",
      "Declared and used regions must agree",
    );
  // Validate unused profiles too; an unsupported knob is never hidden in the import.
  for (const p of s.profiles) {
    const probe = {
      id: "probe",
      type: p.component,
      region: "us-east",
      profileId: p.id,
      profileVersion: p.version,
      replicas: 1,
      properties: p.properties,
      ...(p.component === "replica" ? { primaryNodeId: "primary" } : {}),
    };
    const zeroDemand = [
      "serviceTime",
      "readServiceTime",
      "writeServiceTime",
    ].some((key) => {
      const d = p.properties[key];
      return (
        d !== null &&
        typeof d === "object" &&
        "kind" in d &&
        d.kind === "constant" &&
        "valueMs" in d &&
        d.valueMs === 0
      );
    });
    const verified = componentNodeSchema.safeParse(probe);
    if (zeroDemand || !verified.success)
      throw new FoundationError(
        "UNSUPPORTED_CAPABILITY",
        "Unsupported typed profile: " + p.id,
      );
    if (verified.data.type !== "client")
      p.properties = { ...verified.data.properties };
  }
  const nodes = s.graph.nodes.map((n) => {
    if (n.type === "client")
      return { id: n.id, type: n.type, region: n.region };
    const p = s.profiles.find(
      (p) => p.id === n.profileId && p.version === n.profileVersion,
    );
    if (!p || p.component !== n.type)
      throw new FoundationError(
        "INVALID_INPUT",
        "Missing or mismatched profile for " + n.id,
      );
    return {
      id: n.id,
      type: n.type,
      region: n.region,
      profileId: n.profileId,
      profileVersion: n.profileVersion,
      replicas: n.replicas,
      properties: p.properties,
      ...(n.type === "replica" ? { primaryNodeId: n.primaryNodeId } : {}),
    };
  });
  const first = [...s.workload.operations].sort((a, b) =>
    a.id < b.id ? -1 : 1,
  )[0].id;
  const input = {
    regionalVersion: 1,
    seed: s.runOptions.seed,
    nodes,
    edges: s.graph.edges.map((e) => ({ ...e, oneWayDelayMs: 0 })),
    network: s.network,
    routing: s.routing,
    workload: {
      baselineRps: s.workload.baselineRps,
      arrival: s.workload.arrival,
      durationMs: s.workload.durationSeconds * 1000,
      warmupMs: s.workload.warmupSeconds * 1000,
      drainMs: s.workload.drainSeconds * 1000,
      schedule: s.workload.schedule.map((k) => ({
        atMs: k.atSeconds * 1000,
        multiplier: k.multiplier,
      })),
      operations: s.workload.operations.map(({ label: _label, ...o }) => o),
      origins: s.workload.regionalShares.map((o) => ({
        id: o.region,
        shareBps: o.shareBps,
        clientNodeId: s.graph.nodes.find(
          (n) => n.type === "client" && n.region === o.region,
        )?.id,
        entryNodeId: s.routing.find(
          (r) => r.originRegion === o.region && r.operationId === first,
        )?.primaryEntryNodeId,
      })),
    },
    outage: s.outage
      ? {
          id: s.outage.id,
          scope: s.outage.scope,
          region: s.outage.region,
          affectedNodeIds: s.outage.affectedNodeIds,
          startMs: s.outage.startSeconds * 1000,
          durationMs: s.outage.durationSeconds * 1000,
          inFlightPolicy: s.outage.inFlightPolicy,
        }
      : null,
    targets: {
      p95Ms: s.targets.p95Ms,
      errorBudgetRatio: s.targets.errorBudgetRatio,
    },
    regionalTargets: s.targets.perRegion,
  };
  const valid = regionalInputSchema.safeParse(input);
  if (!valid.success)
    throw new FoundationError(
      "INVALID_INPUT",
      valid.error.issues
        .slice(0, 8)
        .map((i) => i.message)
        .join("; "),
    );
  return { scenario: s, input: valid.data as RegionalInput };
}
export function simulateRegionLabScenario(
  value: unknown,
  options: FoundationOptions = {},
) {
  const { scenario, input } = adaptRegionalScenario(value);
  const result = simulateRegionalExperiment(
    input,
    scenario.runOptions.mode,
    scenario.runOptions.repetitions,
    options,
  );
  const manifest = structuredClone(scenario);
  manifest.regions.sort();
  manifest.profiles.sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : a.version - b.version,
  );
  manifest.graph.nodes.sort((a, b) => (a.id < b.id ? -1 : 1));
  manifest.graph.edges.sort((a, b) => (a.id < b.id ? -1 : 1));
  manifest.graph.edges.forEach((e) => e.operationIds.sort());
  manifest.workload.operations.sort((a, b) => (a.id < b.id ? -1 : 1));
  manifest.workload.regionalShares.sort((a, b) =>
    a.region < b.region ? -1 : 1,
  );
  manifest.network.sort((a, b) =>
    a.from + ">" + a.to < b.from + ">" + b.to ? -1 : 1,
  );
  manifest.routing.sort((a, b) =>
    a.originRegion + ">" + a.operationId < b.originRegion + ">" + b.operationId
      ? -1
      : 1,
  );
  manifest.targets.perRegion.sort((a, b) => (a.region < b.region ? -1 : 1));
  manifest.outage?.affectedNodeIds.sort();
  const output = {
    ...result,
    scenarioHash: createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex"),
    provenance: manifest.profiles.map((p) => ({
      id: p.id,
      version: p.version,
      origin: p.origin,
      provenance: p.provenance,
    })),
  };
  if (
    Buffer.byteLength(JSON.stringify(output)) >
    (options.limits?.maxResultBytes ?? FOUNDATION_LIMITS.maxResultBytes)
  )
    throw new FoundationError(
      "BUDGET_EXCEEDED",
      "Scenario result exceeds aggregate limit",
    );
  return output;
}
