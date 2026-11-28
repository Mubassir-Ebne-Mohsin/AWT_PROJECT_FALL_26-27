import type {
  ComponentInput,
  ComponentNode,
  ComponentEdge,
} from "@/modules/region-lab/engine/component-input";

export function component(
  type: Exclude<ComponentNode["type"], "client">,
  id = type as string,
): ComponentNode {
  const common = {
    id,
    region: "us-east" as const,
    profileId: id + "_profile",
    profileVersion: 1,
    replicas: 1 as const,
  };
  const service = {
    serviceTime: { kind: "constant" as const, valueMs: 1 },
    serviceSlotsPerReplica: 100,
    waitingCapacity: 1000,
  };
  const rw = {
    readServiceTime: { kind: "constant" as const, valueMs: 3 },
    writeServiceTime: { kind: "constant" as const, valueMs: 7 },
    serviceSlotsPerReplica: 100,
    waitingCapacity: 1000,
  };
  switch (type) {
    case "app":
    case "lb":
      return { ...common, type, properties: service };
    case "worker":
      return {
        ...common,
        type,
        properties: { ...service, waitingCapacity: 0 },
      };
    case "gateway":
    case "external":
      return {
        ...common,
        type,
        properties: {
          ...service,
          rateLimitRps: 10000,
          rateLimitBurstRequests: 10000,
        },
      };
    case "cdn":
    case "cache":
      return {
        ...common,
        type,
        properties: {
          ...service,
          hitRatio: 0,
          hitTime: { kind: "constant", valueMs: 0.25 },
        },
      };
    case "db":
      return { ...common, type, properties: rw };
    case "storage":
      return {
        ...common,
        type,
        properties: { ...rw, aggregateBandwidthMbps: 8 },
      };
    case "replica":
      return {
        ...common,
        type,
        primaryNodeId: "db",
        properties: {
          ...service,
          replicationApplyTime: { kind: "constant", valueMs: 4 },
        },
      };
    case "queue":
      return {
        ...common,
        type,
        properties: {
          maxDepthJobs: 100,
          ackTime: { kind: "constant", valueMs: 2 },
          overflowPolicy: "reject_new",
          maxDeliveryAttempts: 3,
          redeliveryDelayMs: 5,
        },
      };
  }
}
export function edge(
  from: string,
  to: string,
  mode: "sync" | "async" = "sync",
): ComponentEdge {
  return {
    id: "e_" + from + "_" + to,
    from,
    to,
    operationIds: ["browse"],
    mode,
    dispatch: "all",
    weight: 1,
    oneWayDelayMs: 0,
  };
}
export function componentFixture(): ComponentInput {
  return {
    componentVersion: 1,
    seed: 42,
    workload: {
      baselineRps: 100,
      arrival: "constant_rate",
      durationMs: 1000,
      warmupMs: 0,
      drainMs: 5000,
      schedule: [
        { atMs: 0, multiplier: 1 },
        { atMs: 1000, multiplier: 1 },
      ],
      origins: [
        {
          id: "us-east",
          shareBps: 10000,
          clientNodeId: "users",
          entryNodeId: "app",
        },
      ],
      operations: [
        {
          id: "browse",
          kind: "read",
          shareBps: 10000,
          deadlineMs: 5000,
          idempotent: true,
          requestBytes: 0,
          responseBytes: 0,
          retry: {
            maxAttempts: 1,
            baseBackoffMs: 5,
            maxBackoffMs: 20,
            jitterRatio: 0,
          },
        },
      ],
    },
    nodes: [
      { id: "users", type: "client", region: "us-east" },
      component("app"),
      component("db"),
    ],
    edges: [edge("app", "db")],
    targets: { p95Ms: 300, errorBudgetRatio: 0.01 },
  };
}
export function setHorizon(input: ComponentInput, ms: number) {
  input.workload.durationMs = ms;
  input.workload.schedule[1].atMs = ms;
  return input;
}
