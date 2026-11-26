import { graphSchema } from "@/common/contracts/phase2/graph.schema";
import { publicChallengeSchema } from "@/common/contracts/phase3/attempts.schema";
/** Publish only bounded starter topology, never properties, solutions, identities or private submissions. */
export function publicChallenge(row: Record<string, unknown>) {
  const graph = graphSchema.safeParse(row.starting_graph);
  return publicChallengeSchema.parse({
    id: row.id,
    title: row.title,
    summary: row.summary,
    goal: row.goal,
    ...(row.traffic ? { traffic: row.traffic } : {}),
    learning: row.learning ?? null,
    rules: row.exercise_rules ?? null,
    baseline: row.baseline ?? null,
    preview: graph.success
      ? {
          nodes: graph.data.nodes.map(({ id, type, label, x, y }) => ({
            id,
            type,
            label,
            x,
            y,
          })),
          edges: graph.data.edges.map(({ id, from, to }) => ({ id, from, to })),
        }
      : null,
  });
}
