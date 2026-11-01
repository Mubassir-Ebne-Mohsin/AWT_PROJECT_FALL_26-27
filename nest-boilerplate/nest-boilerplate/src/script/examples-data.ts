import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCatalog, getTemplates } from "@/modules/simulation/engine/templates";
import { findLimits } from "@/modules/simulation/engine/limits";
import { simulate } from "@/modules/simulation/engine/simulate";
import { fixturesMatch } from "@/src/script/learn-fixtures";
import type { Design } from "@/modules/simulation/engine/types";

/**
 * P3 Examples, Templates and Components: everything these three pages show, produced by running the REAL engine on the
 * six templates and reading its catalog. The pages read this one file, so they cannot show a number the engine does not
 * give. Regenerate with `pnpm fixtures:examples`; the spec fails if the stored file is stale.
 */

const bounded = (v: { kind: "finite"; value: number } | { kind: "unbounded" }) => (v.kind === "finite" ? v.value : null);

export function buildExamplesData() {
  const catalog = getCatalog();
  const templates = getTemplates().map((t) => {
    const design = { nodes: t.graph.nodes, edges: t.graph.edges } as unknown as Design;
    const sim = simulate(design, t.traffic);
    if (!sim.ok) throw new Error("Example template is invalid: " + t.id);
    const limits = findLimits(design, t.traffic);
    const label = (id: string | null) => (id ? (t.graph.nodes.find((n) => n.id === id)?.label ?? null) : null);
    return {
      id: t.id,
      name: t.name,
      blurb: t.blurb,
      graph: t.graph,
      traffic: t.traffic,
      /** The design at the traffic it ships with. */
      result: {
        p50: sim.p50,
        p95: sim.p95,
        p99: sim.p99,
        errorRate: sim.errorRate,
        verdict: sim.verdict,
        sloMet: sim.sloMet,
        bottleneckId: sim.bottleneck?.id ?? null,
        bottleneckLabel: label(sim.bottleneck?.id ?? null),
        maxRho: sim.maxRho,
        nodes: sim.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, rho: n.rho, status: n.status })),
      },
      /** Where it first misses its goal, what fails first and why, and how it behaves on the way there. */
      limits: {
        state: limits.state,
        passingRps: limits.state === "found" ? limits.passingRps : null,
        failingRps: limits.state === "found" ? limits.failingRps : null,
        headroom: limits.headroom === null ? null : bounded(limits.headroom as never),
        firstId: limits.firstId,
        firstLabel: label(limits.firstId),
        cause: limits.cause,
        order: limits.order.map((o) => ({ id: o.id, label: o.label, type: o.type, satRps: bounded(o.satRps as never) })),
        curve: limits.curve,
      },
    };
  });
  return {
    note: "Generated from the real engine by `pnpm fixtures:examples`. Do not edit by hand.",
    engineVersion: catalog.engineVersion,
    templates,
    catalog,
  };
}

const destination = resolve(__dirname, "../../../../web/src/lib/examples-data.json");
export const examplesDataText = () => JSON.stringify(buildExamplesData(), null, 2) + "\n";

if (require.main === module) {
  const output = examplesDataText();
  if (process.argv.includes("--check")) {
    if (!fixturesMatch(JSON.parse(readFileSync(destination, "utf8")), JSON.parse(output))) throw new Error("Examples data is stale: run pnpm fixtures:examples");
    console.log("Examples data matches the engine");
  } else {
    writeFileSync(destination, output);
    console.log("Wrote examples data");
  }
}
