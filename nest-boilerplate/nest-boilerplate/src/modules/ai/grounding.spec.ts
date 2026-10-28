import type { AiFacts } from "@/common/contracts/phase3/ai.schema";
import {
  evidenceIdsFor,
  groundingViolation,
} from "@/modules/ai/grounding";

// Synthetic facts only. Units: ms for latency, fractions for error and utilization.
const facts: AiFacts = {
  verdict: "fail",
  p95Ms: 2068.67,
  p95TargetMs: 300,
  errorRateFraction: 0.99012,
  errorBudgetFraction: 0.01,
  bottleneck: { id: "app", label: "App servers", utilizationFraction: 99.152 },
};
const none: AiFacts = { ...facts, verdict: "strained", bottleneck: null };

describe("M12 deterministic grounding checks", () => {
  it("offers the bottleneck evidence id only when a bottleneck was identified", () => {
    expect(evidenceIdsFor(facts)).toEqual(["verdict", "p95", "errorRate", "bottleneck"]);
    expect(evidenceIdsFor(none)).toEqual(["verdict", "p95", "errorRate", "noBottleneck"]);
    expect(evidenceIdsFor(none)).not.toContain("bottleneck");
  });
  it("accepts prose with no figures and figures that match the facts at readable precision", () => {
    expect(groundingViolation("The recorded run misses its latency target.", facts, 2)).toBeNull();
    expect(groundingViolation("p95 is about 2,069 ms against a 300 ms target.", facts, 2)).toBeNull();
    expect(groundingViolation("Errors are 99% against a 1% budget at revision 2.", facts, 2)).toBeNull();
    expect(groundingViolation("App servers run at 9915% utilization.", facts, 2)).toBeNull();
  });
  it("rejects a figure that is not a server fact, including unit confusion", () => {
    expect(groundingViolation("p95 is 450 ms.", facts, 2)).toMatch(/450/);
    expect(groundingViolation("The error rate is 0.99 percent.", facts, 2)).toMatch(/0\.99/);
    expect(groundingViolation("Latency is 2.1 seconds.", facts, 2)).toMatch(/2\.1/);
    expect(groundingViolation("About 5000 requests per second.", facts, 2)).toMatch(/5000/);
  });
  it("does not mistake metric names such as p95 or p99 for figures, or accept a utilization with no bottleneck", () => {
    expect(groundingViolation("p50, p95 and p99 are recorded.", facts, 2)).toBeNull();
    expect(groundingViolation("Utilization is 80%.", none, 2)).toMatch(/80/);
  });
  it("treats a figure matching only the wrong revision as ungrounded", () => {
    expect(groundingViolation("This is revision 7.", facts, 2)).toMatch(/7/);
  });
});
