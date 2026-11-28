import { simulateFoundation } from "@/modules/region-lab/engine/engine";
import {
  fixture,
  horizon,
} from "@/modules/region-lab/engine/foundation.fixture";

describe("Region Lab foundation: analytical queueing references (not real-system calibration)", () => {
  it.each([1, 42, 999])(
    "M/M/1 lambda50/s mu100/s: mean response20ms and utilization0.5, seed%s",
    (seed) => {
      const input = horizon(fixture(), 300000);
      input.seed = seed;
      input.workload.arrival = "poisson";
      input.workload.baselineRps = 50;
      input.workload.warmupMs = 30000;
      input.workload.drainMs = 60000;
      input.workload.operations[0].deadlineMs = 60000;
      input.nodes[0].waitingCapacityPerReplica = 10000;
      input.nodes[0].serviceTime = { kind: "exponential", meanMs: 10 };
      const result = simulateFoundation(input),
        response = result.summary.latency;
      expect(result.summary.successfulRequests).toBe(
        result.summary.offeredRequests,
      );
      expect(response.meanMs).toBeGreaterThan(18);
      expect(response.meanMs).toBeLessThan(22);
      // Exact stationary response distribution Exp(mu-lambda): q95=-ln(.05)/50 seconds.
      expect(response.p95Ms).not.toBeNull();
      expect(
        Math.abs(response.p95Ms! - (-Math.log(0.05) / 50) * 1000) /
          ((-Math.log(0.05) / 50) * 1000),
      ).toBeLessThan(0.15);
      expect(result.nodes[0].utilizationRatio).toBeGreaterThan(0.47);
      expect(result.nodes[0].utilizationRatio).toBeLessThan(0.53);
      expect(result.summary.unresolvedRequests).toBe(0);
    },
    30000,
  );
});
