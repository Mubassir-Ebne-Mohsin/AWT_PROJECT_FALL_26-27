import type {
  FoundationInput,
  ProcessingNode,
} from "@/modules/region-lab/engine/input";

export function service(id = "app", valueMs = 10): ProcessingNode {
  return {
    id,
    replicas: 1,
    slotsPerReplica: 1,
    waitingCapacityPerReplica: 200,
    serviceTime: { kind: "constant", valueMs },
    dispatch: "all",
    downstream: [],
  };
}
export function fixture(): FoundationInput {
  return {
    foundationVersion: 1,
    seed: 42,
    workload: {
      baselineRps: 50,
      arrival: "constant_rate",
      durationMs: 1000,
      warmupMs: 0,
      drainMs: 3000,
      schedule: [
        { atMs: 0, multiplier: 1 },
        { atMs: 1000, multiplier: 1 },
      ],
      origins: [{ id: "us-east", shareBps: 10000, entryNodeId: "app" }],
      operations: [
        {
          id: "browse",
          kind: "read",
          shareBps: 10000,
          deadlineMs: 3000,
          idempotent: true,
          retry: {
            maxAttempts: 1,
            baseBackoffMs: 5,
            maxBackoffMs: 5,
            jitterRatio: 0,
          },
        },
      ],
    },
    nodes: [service()],
    targets: { p95Ms: 300, errorBudgetRatio: 0.01 },
  };
}
export function horizon(input: FoundationInput, durationMs: number) {
  input.workload.durationMs = durationMs;
  input.workload.schedule = [
    { atMs: 0, multiplier: 1 },
    { atMs: durationMs, multiplier: 1 },
  ];
  return input;
}
