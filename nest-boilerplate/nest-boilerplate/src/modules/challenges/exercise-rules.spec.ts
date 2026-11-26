import { FOUNDATION_PACK } from "@/modules/challenges/foundation-fixtures";
import { verifyFoundationPack } from "@/modules/challenges/foundation-pack";
import {
  createExerciseRules,
  exerciseIssues,
} from "@/modules/challenges/exercise-rules";
describe("Foundation exercise rules and calibration", () => {
  it("admits six preserved-ID starters and references, with failing starts and passing solutions", () => {
    expect(verifyFoundationPack()).toHaveLength(6);
  });
  it.each(FOUNDATION_PACK)(
    "rejects fixed-capacity, deleted-node, bypass and high-replica shortcuts: $title",
    (c) => {
      const rules = createExerciseRules(c.start, c.policy),
        check = (mutate: (g: typeof c.start) => void) => {
          const g = structuredClone(c.start);
          mutate(g);
          expect(exerciseIssues(c.start, g, rules).length).toBeGreaterThan(0);
        };
      check((g) => {
        g.nodes.find((n) => n.type === "app")!.props = { capacity: 1e9 };
      });
      check((g) => {
        g.nodes = g.nodes.filter((n) => n.type !== "db");
        g.edges = g.edges.filter((e) => g.nodes.some((n) => n.id === e.to));
      });
      check((g) => {
        g.edges.push({
          id: "bad_bypass",
          from: g.nodes.find((n) => n.type === "client")!.id,
          to: g.nodes.find((n) => n.type === "db")!.id,
        });
      });
      check((g) => {
        g.nodes.find((n) => n.type === "app")!.props = {
          ...g.nodes.find((n) => n.type === "app")!.props,
          replicas: 200,
        };
      });
    },
  );
  it("rejects perfect caching, disconnected additions, foreign types and altered client demand", () => {
    const c = FOUNDATION_PACK[1],
      rules = createExerciseRules(c.start, c.policy);
    for (const mutate of [
      (g: typeof c.reference) => {
        g.nodes.find((n) => n.type === "cache")!.props = { hitRatio: 1 };
      },
      (g: typeof c.reference) => {
        g.edges = g.edges.filter(
          (e) => e.to !== g.nodes.find((n) => n.type === "cache")!.id,
        );
      },
      (g: typeof c.reference) => {
        g.nodes.push({
          id: "new_client",
          type: "client",
          label: "Bypass",
          x: 0,
          y: 0,
          props: { share: 0 },
        });
      },
      (g: typeof c.reference) => {
        g.nodes.find((n) => n.type === "client")!.props = { share: 0 };
      },
    ]) {
      const g = structuredClone(c.reference);
      mutate(g);
      expect(exerciseIssues(c.start, g, rules).length).toBeGreaterThan(0);
    }
  });
  it("accepts cosmetic moves/labels and leaves legacy challenge grading unrestricted", () => {
    const c = FOUNDATION_PACK[0],
      g = structuredClone(c.start);
    g.nodes[0].x += 100;
    g.nodes[0].label = "My users";
    expect(
      exerciseIssues(c.start, g, createExerciseRules(c.start, c.policy)),
    ).toEqual([]);
    expect(exerciseIssues(c.start, g, null)).toEqual([]);
  });
});
