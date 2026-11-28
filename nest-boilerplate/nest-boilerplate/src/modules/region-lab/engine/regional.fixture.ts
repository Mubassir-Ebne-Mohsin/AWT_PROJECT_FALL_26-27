import {
  componentFixture,
  component,
  edge,
} from "@/modules/region-lab/engine/component.fixture";
import type { RegionalInput } from "@/modules/region-lab/engine/regional-input";
export function regionalFixture(): RegionalInput {
  const c = componentFixture();
  const eu = component("app", "app_eu");
  eu.region = "eu-west";
  return {
    regionalVersion: 1,
    seed: c.seed,
    workload: {
      ...c.workload,
      origins: [
        ...c.workload.origins,
        {
          id: "eu-west",
          shareBps: 0,
          clientNodeId: "users_eu",
          entryNodeId: "app",
        },
      ],
    },
    nodes: [
      ...c.nodes,
      { id: "users_eu", type: "client", region: "eu-west" },
      eu,
    ],
    edges: [...c.edges, edge("app_eu", "db")],
    targets: c.targets,
    regionalTargets: [],
    outage: null,
    network: (["us-east", "eu-west"] as const).flatMap((from) =>
      (["us-east", "eu-west"] as const).map((to) => ({
        from,
        to,
        oneWayDelay: {
          kind: "constant" as const,
          valueMs: from === to ? 0 : from === "us-east" ? 10 : 20,
        },
        bandwidthMbps: 8,
        provenance: "Explicit synthetic test assumption",
      })),
    ),
    routing: (["us-east", "eu-west"] as const).map((originRegion) => ({
      originRegion,
      operationId: "browse",
      policy: "explicit" as const,
      primaryEntryNodeId: "app",
      fallbackEntryNodeIds: ["app_eu"],
      detectionMs: 50,
      switchMs: 50,
      failbackMs: 50,
      returnOnRecovery: true,
    })),
  };
}
export function deploymentOutage(s: RegionalInput) {
  s.outage = {
    id: "outage",
    scope: "application_deployment",
    region: "us-east",
    affectedNodeIds: ["app"],
    startMs: 200,
    durationMs: 400,
    inFlightPolicy: "abort_at_failed_node",
  };
  return s;
}
