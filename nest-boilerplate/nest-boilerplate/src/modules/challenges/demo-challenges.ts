import { DataSource } from "typeorm";
import { calculate } from "@/modules/simulation/engine/compute";
import { getTemplates } from "@/modules/simulation/engine/templates";
import { judgeChallenge } from "@/modules/challenges/judge-challenge";
/** Four bounded offline calculations, dev only. Existing published copies are never rewritten. */
export async function seedDemoChallenges(db: DataSource, production: boolean) {
  if (production)
    throw new Error("Demo challenges are never created in production");
  const [teacher] = await db.query(
    "SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.email='demo-instructor@example.test' AND r.role='instructor'",
  );
  if (!teacher) throw new Error("Seed the demo Instructor first");
  const starters = [
    {
      id: "55555555-5555-4555-8555-555555555501",
      title: "Flash sale",
      template: "mvp",
      rps: 1200,
      burst: 3,
      target: 300,
    },
    {
      id: "55555555-5555-4555-8555-555555555502",
      title: "p95 under 100 ms",
      template: "three-tier",
      rps: 400,
      burst: 1,
      target: 100,
    },
    {
      id: "55555555-5555-4555-8555-555555555503",
      title: "Cross-region",
      template: "three-tier",
      rps: 600,
      burst: 1.2,
      target: 200,
    },
    {
      id: "55555555-5555-4555-8555-555555555504",
      title: "Launch at 10x",
      template: "mvp",
      rps: 5000,
      burst: 1,
      target: 300,
    },
  ];
  return db.transaction(async (m) => {
    await m.query(
      "SELECT pg_advisory_xact_lock(hashtext('sf-demo-challenges'))",
    );
    for (const c of starters) {
      const [old] = await m.query(
        "SELECT instructor_id FROM challenges WHERE id=$1",
        [c.id],
      );
      if (old) {
        if (old.instructor_id !== teacher.id)
          throw new Error("Demo identity collision");
        continue;
      }
      const template = getTemplates().find((t) => t.id === c.template);
      if (!template) throw new Error("Missing demo template");
      const graph = structuredClone(template.graph);
      if (c.title === "Cross-region") {
        const app = graph.nodes.find((n) => n.type === "app");
        if (app) app.props.region = "eu-west";
      }
      const traffic = {
        ...template.traffic,
        preset: "custom",
        rps: c.rps,
        burst: c.burst,
        sloP95: c.target,
        errorBudget: 0.01,
      };
      const result = calculate({
        kind: "simulation",
        snapshot: { schemaVersion: 1, graph, traffic },
      });
      if (!result.output || result.output.kind !== "simulation")
        throw new Error("Invalid demo starting graph");
      const s = result.output.summary;
      const baseline = {
        ...judgeChallenge(s.p95, s.errorRate, {
          p95Ms: c.target,
          errorRate: 0.01,
        }),
        engineVersion: result.engineVersion,
      };
      await m.query(
        `INSERT INTO challenges(id,instructor_id,title,summary,goal_p95_ms,goal_error_rate,traffic,starting_graph,status,baseline,created_at,updated_at,published_at)
        VALUES($1,$2,$3,$4,$5,0.01,$6,$7,'published',$8,now(),now(),now())`,
        [
          c.id,
          teacher.id,
          c.title,
          "Meet the stated latency and error targets under the fixed traffic. Model estimates only.",
          c.target,
          JSON.stringify(traffic),
          JSON.stringify(graph),
          JSON.stringify(baseline),
        ],
      );
    }
    return starters.length;
  });
}
