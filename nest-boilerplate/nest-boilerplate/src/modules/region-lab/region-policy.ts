import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  adaptRegionalScenario,
  draftScenarioSchema,
} from "@/modules/region-lab/engine/regional-scenario";
import {
  canonical as normalizeRegional,
  REGIONAL_ENGINE_VERSION,
} from "@/modules/region-lab/engine/regional-engine";
import { ArrivalSchedule } from "@/modules/region-lab/engine/arrivals";
import { FOUNDATION_LIMITS } from "@/modules/region-lab/engine/engine";
import { AppException } from "@/common/errors";
import { z } from "zod";
export const REGION_POLICY = Object.freeze({
  maxInputBytes: 90 * 1024,
  maxExperiments: 100,
  maxVersions: 1000,
  maxRuns: 100,
  ownerQueued: 2,
  globalQueued: 64,
  wallMs: 45000,
  rssBytes: 256 * 1024 * 1024,
  leaseMs: 60000,
  pollMs: 250,
});
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  return value;
}
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const service = {
  serviceTime: { kind: "constant", valueMs: 10 },
  serviceSlotsPerReplica: 4,
  waitingCapacity: 100,
};
const rw = {
  readServiceTime: { kind: "constant", valueMs: 3 },
  writeServiceTime: { kind: "constant", valueMs: 7 },
  serviceSlotsPerReplica: 4,
  waitingCapacity: 100,
};
const definitions: Record<string, unknown> = {
  app: service,
  lb: { ...service, serviceTime: { kind: "constant", valueMs: 1 } },
  gateway: { ...service, rateLimitRps: 1000, rateLimitBurstRequests: 1000 },
  cdn: { ...service, hitRatio: 0.8, hitTime: { kind: "constant", valueMs: 2 } },
  cache: {
    ...service,
    hitRatio: 0.8,
    hitTime: { kind: "constant", valueMs: 1 },
  },
  db: rw,
  replica: {
    ...service,
    replicationApplyTime: { kind: "constant", valueMs: 4 },
  },
  queue: {
    maxDepthJobs: 100,
    ackTime: { kind: "constant", valueMs: 2 },
    overflowPolicy: "reject_new",
    maxDeliveryAttempts: 3,
    redeliveryDelayMs: 100,
  },
  worker: { ...service, waitingCapacity: 0 },
  storage: { ...rw, aggregateBandwidthMbps: 100 },
  external: { ...service, rateLimitRps: 100, rateLimitBurstRequests: 100 },
};
const registry = Object.entries(definitions).map(([component, properties]) => ({
  id: "sf_region_" + component,
  version: 1,
  label: "Region Lab " + component + " reference",
  origin: "reference",
  provenance:
    "StressForge explicit engineering assumption v1; uncalibrated, not a hardware benchmark",
  component,
  properties,
}));
export const REGISTRY_DIGEST = hash(registry);
export const profiles = () => structuredClone(registry);
export type Scenario = z.infer<typeof draftScenarioSchema>;
export function codeDigest() {
  const extension = __filename.endsWith(".ts") ? "ts" : "js";
  return hash(
    [
      "input",
      "heap",
      "arrivals",
      "random",
      "engine",
      "component-input",
      "component-engine",
      "component-resources",
      "regional-input",
      "regional-runtime",
      "regional-engine",
      "regional-scenario",
      "../results/result-codec",
    ].map((name) => [
      name,
      createHash("sha256")
        .update(
          readFileSync(resolve(__dirname, "engine", name + "." + extension)),
        )
        .digest("hex"),
    ]),
  );
}
export function resolveScenario(raw: unknown) {
  try {
    if (Buffer.byteLength(JSON.stringify(raw)) > REGION_POLICY.maxInputBytes)
      throw new Error("large");
  } catch {
    throw new AppException(
      "VALIDATION_FAILED",
      "Region Lab input exceeds the bounded JSON allowance",
    );
  }
  let scenario: Scenario,
    input: ReturnType<typeof adaptRegionalScenario>["input"];
  try {
    ({ scenario, input } = adaptRegionalScenario(raw));
  } catch {
    throw new AppException(
      "VALIDATION_FAILED",
      "Invalid or unsupported Region Lab scenario",
      { reason: "REGION_SCENARIO_INVALID" },
    );
  }
  for (const p of scenario.profiles)
    if (p.origin !== "custom") {
      const trusted = registry.find(
        (r) => r.id === p.id && r.version === p.version,
      );
      if (!trusted || hash(trusted) !== hash(p))
        throw new AppException(
          "VALIDATION_FAILED",
          "Unknown or modified operator profile",
          { reason: "REGION_PROFILE_UNTRUSTED", profileId: p.id },
        );
    }
  const memo = new Map<string, number>();
  const visits = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    const n = input.nodes.find((n) => n.id === id)!;
    let v =
      1 +
      input.edges
        .filter((e) => e.from === id)
        .reduce((sum, e) => sum + visits(e.to), 0);
    if (n.type === "queue") v *= n.properties.maxDeliveryAttempts;
    if (n.type === "db")
      v += input.nodes.filter((n) => n.type === "replica").length;
    memo.set(id, v);
    return v;
  };
  const mass = new ArrivalSchedule(input.workload).totalMass;
  const roots =
    mass === 0
      ? 0
      : input.workload.arrival === "constant_rate"
        ? Math.floor(mass + 0.5)
        : Math.ceil(mass + 10 * Math.sqrt(mass) + 32);
  const estimatedEvents =
    (100 +
      roots *
        (5 +
          12 *
            Math.max(
              ...input.workload.operations.map((o) => o.retry.maxAttempts),
            ) *
            Math.max(
              ...input.routing
                .flatMap((r) => [
                  r.primaryEntryNodeId,
                  ...r.fallbackEntryNodeIds,
                ])
                .map(visits),
            ))) *
    scenario.runOptions.repetitions *
    (scenario.runOptions.mode === "paired" ? 2 : 1);
  if (estimatedEvents > FOUNDATION_LIMITS.maxEvents)
    throw new AppException(
      "VALIDATION_FAILED",
      "Region Lab expanded work exceeds admission limits",
      { reason: "REGION_ADMISSION_LIMIT" },
    );
  normalizeRegional(input);
  const numerical = {
    ...input,
    network: input.network.map(({ provenance: _p, ...n }) => n),
    runOptions: scenario.runOptions,
    engineVersion: REGIONAL_ENGINE_VERSION,
    budgets: FOUNDATION_LIMITS,
  };
  return {
    scenario: structuredClone(scenario),
    inputHash: hash(numerical),
    estimatedEvents,
  };
}
export function frozenSnapshot(raw: unknown) {
  const resolved = resolveScenario(raw),
    engineDigest = codeDigest();
  return {
    ...resolved,
    inputHash: hash({ numerical: resolved.inputHash, engineDigest }),
    engineVersion: REGIONAL_ENGINE_VERSION,
    engineDigest,
    registryDigest: REGISTRY_DIGEST,
    budgets: { ...FOUNDATION_LIMITS },
  };
}
export type FrozenRegionSnapshot = ReturnType<typeof frozenSnapshot> & {
  metadata?: { name: string; description: string; sourceDesign: unknown };
};
export function cursor(
  owner: string,
  scope: string,
  row: { created_at: Date; id: string; cursor_at?: string },
) {
  return Buffer.from(
    JSON.stringify({
      owner,
      scope,
      at: row.cursor_at ?? row.created_at.toISOString(),
      id: row.id,
    }),
  ).toString("base64url");
}
export function parseCursor(value: unknown, owner: string, scope: string) {
  if (value === undefined) return null;
  try {
    if (typeof value !== "string" || value.length > 512) throw Error();
    const p = z
      .strictObject({
        owner: z.uuid(),
        scope: z.string(),
        at: z.iso.datetime(),
        id: z.uuid(),
      })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString()));
    if (p.owner !== owner || p.scope !== scope) throw Error();
    return p;
  } catch {
    throw new AppException("VALIDATION_FAILED", "Invalid owner-scoped cursor");
  }
}
