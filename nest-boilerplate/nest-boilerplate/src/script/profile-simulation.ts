import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { getTemplates } from "@/modules/simulation/engine/templates";
import { SimulationExecutor } from "@/modules/simulation/worker/simulation-executor";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";
import { ENGINE_BOUNDS } from "@/modules/simulation/engine/budget";
import { WORKER_RESOURCES } from "@/modules/simulation/worker/worker-factory";
import {
  snapshotSchema,
  Snapshot,
  TRAFFIC_DEFAULTS,
} from "@/common/contracts/phase2/graph.schema";
import type { Graph } from "@/common/contracts/phase2/graph.schema";
import type { Calculation } from "@/modules/simulation/engine/compute";

export function ladder(layers: number, width: number): Snapshot {
  const nodes: Graph["nodes"] = [
    { id: "client", type: "client", label: "Users", x: 0, y: 0, props: {} },
  ];
  const edges: Graph["edges"] = [];
  let previous = ["client"];
  for (let layer = 0; layer < layers; layer++) {
    const next = Array.from({ length: width }, (_, i) => "a" + layer + "_" + i);
    for (const id of next)
      nodes.push({
        id,
        type: "app",
        label: id,
        x: layer * 240,
        y: 0,
        props: { capacity: 1e9, latency: 1 },
      });
    for (const from of previous)
      for (const to of next) edges.push({ id: "e" + edges.length, from, to });
    previous = next;
  }
  return snapshotSchema.parse({
    schemaVersion: 1,
    graph: { nodes, edges },
    traffic: TRAFFIC_DEFAULTS,
  });
}
async function main() {
  const executor = new SimulationExecutor(),
    records: Record<string, unknown>[] = [];
  let ticks = 0,
    maxTickGapMs = 0,
    last = performance.now();
  const heartbeat = setInterval(() => {
    const now = performance.now();
    maxTickGapMs = Math.max(maxTickGapMs, now - last);
    last = now;
    ticks++;
  }, 10);
  try {
    const cases: {
      name: string;
      kind: Calculation["kind"];
      snapshot: Snapshot;
      expectedError?: string;
    }[] = [];
    for (const template of getTemplates())
      for (const kind of ["simulation", "limits"] as const)
        cases.push({
          name: template.id,
          kind,
          snapshot: {
            schemaVersion: template.schemaVersion,
            graph: template.graph,
            traffic: template.traffic,
          },
        });
    cases.push({
      name: "50-node-chain",
      kind: "simulation",
      snapshot: ladder(49, 1),
    });
    cases.push({
      name: "49-node-chain-limits",
      kind: "limits",
      snapshot: ladder(48, 1),
    });
    cases.push({
      name: "13-node-branching",
      kind: "simulation",
      snapshot: ladder(4, 3),
    });
    cases.push({
      name: "49-node-dense-branching",
      kind: "simulation",
      snapshot: ladder(16, 3),
      expectedError: "COMPLEXITY_LIMIT",
    });
    for (const item of cases) {
      const started = performance.now();
      try {
        const result = await executor.submit("profile", {
          kind: item.kind,
          snapshot: item.snapshot,
        });
        if (item.expectedError)
          throw new Error("Expected complexity rejection for " + item.name);
        records.push({
          name: item.name,
          kind: item.kind,
          status: "completed",
          elapsedMs: performance.now() - started,
          nodes: item.snapshot.graph.nodes.length,
          edges: item.snapshot.graph.edges.length,
          resultBytes: Buffer.byteLength(JSON.stringify(result)),
          ...result.stats,
          worker: executor.diagnostics,
        });
      } catch (error) {
        if (
          !(error instanceof ExecutionError) ||
          error.code !== item.expectedError
        )
          throw error;
        records.push({
          name: item.name,
          kind: item.kind,
          status: error.code,
          elapsedMs: performance.now() - started,
          nodes: item.snapshot.graph.nodes.length,
          edges: item.snapshot.graph.edges.length,
        });
      }
    }
    const mode = __filename.endsWith(".js") ? "compiled" : "source";
    const output = {
      date: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      mode,
      engineBounds: ENGINE_BOUNDS,
      workerResources: WORKER_RESOURCES,
      note: "Local measurements, not portable guarantees. Worker heap is post-calculation, not peak/RSS. First case includes startup. Dense valid drafts may exceed supported compute complexity.",
      heartbeat: { ticks, maxTickGapMs },
      records,
    };
    // Later acceptance runs must not overwrite an earlier milestone's evidence.
    const evidenceName =
      process.env.SF_PROFILE_OUTPUT ?? `m2-profile-${mode}.json`;
    if (!/^[a-z0-9][a-z0-9-]*\.json$/.test(evidenceName))
      throw new Error(
        "SF_PROFILE_OUTPUT must be a JSON basename inside docs/audit",
      );
    writeFileSync(
      resolve(__dirname, "../../../../docs/audit/", evidenceName),
      JSON.stringify(output, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({
        mode,
        cases: records.length,
        completed: records.filter((r) => r.status === "completed").length,
        rejected: records.filter((r) => r.status === "COMPLEXITY_LIMIT").length,
        heartbeat: output.heartbeat,
      }),
    );
  } finally {
    clearInterval(heartbeat);
    await executor.close();
  }
}
if (require.main === module)
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Profile failed");
    process.exitCode = 1;
  });
