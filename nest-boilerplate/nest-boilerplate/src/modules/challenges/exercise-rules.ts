import type { Graph } from "@/common/contracts/phase2/graph.schema";
import {
  challengeRulesSchema,
  type ChallengeRules,
  type ExerciseProfile,
} from "@/common/contracts/phase3/challenge-learning.schema";
import { CATALOG } from "@/modules/simulation/engine/catalog";
import { AppException } from "@/common/errors";
type Node = Graph["nodes"][number];
function props(n: Node): Record<string, unknown> {
  const c = CATALOG[n.type];
  return {
    replicas: 1,
    capacity: c.capacity,
    latency: c.latency,
    region: "us-east",
    ...c.defaults,
    ...(n.type === "client" ? { share: 1 } : {}),
    ...n.props,
  };
}
export function createExerciseRules(
  g: Graph,
  profile: ExerciseProfile,
): ChallengeRules {
  const apps = g.nodes.filter((n) => n.type === "app");
  if (apps.length !== 1)
    throw new AppException(
      "VALIDATION_FAILED",
      "This exercise profile needs exactly one starting app tier",
    );
  const editable: ChallengeRules["editable"] = [],
    additions: ChallengeRules["additions"] = [];
  if (profile === "scale-app") {
    if (Number(props(apps[0]).replicas) > 3)
      throw new AppException(
        "VALIDATION_FAILED",
        "Scaling profile starts with at most three app replicas",
      );
    editable.push({ nodeId: apps[0].id, property: "replicas", min: 1, max: 3 });
  }
  if (profile === "co-locate")
    editable.push({
      nodeId: apps[0].id,
      property: "region",
      choices: ["us-east", "eu-west", "ap-south"],
    });
  if (profile === "add-cache" || profile === "media-edge")
    additions.push({
      type: "cache",
      maxNodes: 1,
      maxHitRatio: profile === "media-edge" ? 0.8 : 0.85,
    });
  if (profile === "edge-cache" || profile === "media-edge")
    additions.push({ type: "cdn", maxNodes: 1, maxHitRatio: 0.8 });
  if (profile === "read-replicas")
    additions.push({ type: "replica", maxNodes: 2 });
  const caps: Record<string, number> = {};
  for (const n of g.nodes)
    caps[n.type] = (caps[n.type] ?? 0) + Number(props(n).replicas);
  if (profile === "scale-app") caps.app = 3;
  for (const a of additions) caps[a.type] = (caps[a.type] ?? 0) + a.maxNodes;
  return challengeRulesSchema.parse({
    version: 1,
    profile,
    editable,
    additions,
    replicaCaps: caps,
  });
}
/** Check exercise semantics before allocating a graded submission. Positions/labels are cosmetic. */
export function exerciseIssues(
  start: Graph,
  current: Graph,
  raw: unknown,
): { nodeId?: string; message: string }[] {
  if (raw === null || raw === undefined) return [];
  const rules = challengeRulesSchema.parse(raw),
    issues: { nodeId?: string; message: string }[] = [],
    base = new Map(start.nodes.map((n) => [n.id, n])),
    now = new Map(current.nodes.map((n) => [n.id, n]));
  const out = (id: string) =>
      current.edges.filter((e) => e.from === id).map((e) => e.to),
    inn = (id: string) =>
      current.edges.filter((e) => e.to === id).map((e) => e.from);
  const add = (message: string, nodeId?: string) =>
    issues.push({ message, ...(nodeId ? { nodeId } : {}) });
  for (const n of start.nodes) {
    const v = now.get(n.id);
    if (!v || v.type !== n.type) {
      add("Keep every required starting component and its type", n.id);
      continue;
    }
    const a = props(n),
      b = props(v);
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const edit = rules.editable.find(
        (e) => e.nodeId === n.id && e.property === key,
      );
      if (!edit) {
        if (a[key] !== b[key])
          add(`The starting ${key} is fixed for this exercise`, n.id);
      } else if (
        edit.property === "replicas" &&
        (!(typeof b[key] === "number") ||
          Number(b[key]) < edit.min ||
          Number(b[key]) > edit.max)
      )
        add(`Use ${edit.min}–${edit.max} replicas`, n.id);
      else if (
        edit.property === "region" &&
        !edit.choices.includes(b[key] as never)
      )
        add("Choose a supported region", n.id);
    }
  }
  const counts: Record<string, number> = {},
    totals: Record<string, number> = {};
  for (const n of current.nodes) {
    const p = props(n);
    totals[n.type] = (totals[n.type] ?? 0) + Number(p.replicas);
    if (base.has(n.id)) continue;
    const a = rules.additions.find((a) => a.type === n.type);
    counts[n.type] = (counts[n.type] ?? 0) + 1;
    if (!a || counts[n.type] > a.maxNodes) {
      add("This extra component is outside the exercise rules", n.id);
      continue;
    }
    const defaults = props({ ...n, props: {} } as Node);
    for (const k of new Set([...Object.keys(defaults), ...Object.keys(p)])) {
      if (k === "hitRatio" && a.maxHitRatio !== undefined) {
        if (
          typeof p[k] !== "number" ||
          Number(p[k]) < 0 ||
          Number(p[k]) > a.maxHitRatio
        )
          add(`Hit ratio must be at most ${a.maxHitRatio * 100}%`, n.id);
      } else if (p[k] !== defaults[k])
        add(`Added components use the default ${k}`, n.id);
    }
    if (
      n.type === "cache" &&
      (!inn(n.id).length ||
        inn(n.id).some((id) => now.get(id)?.type !== "app") ||
        out(n.id).some((id) => now.get(id)?.type !== "db"))
    )
      add(
        "Connect a cache after an app; only database miss destinations are allowed",
        n.id,
      );
    if (
      n.type === "replica" &&
      (!inn(n.id).length ||
        inn(n.id).some((id) => now.get(id)?.type !== "db") ||
        out(n.id).length)
    )
      add("Connect read replicas from the primary database", n.id);
    if (
      n.type === "cdn" &&
      (!inn(n.id).length ||
        inn(n.id).some((id) => now.get(id)?.type !== "client") ||
        out(n.id).length !== 1 ||
        !inn(n.id).every((client) =>
          start.edges.some((e) => e.from === client && e.to === out(n.id)[0]),
        ))
    )
      add(
        "Insert a CDN between the original clients and their original destination",
        n.id,
      );
  }
  for (const [type, total] of Object.entries(totals))
    if (total > (rules.replicaCaps as Record<string, number>)[type])
      add(`The total ${type} replica limit is exceeded`);
  const originalPairs = new Set(start.edges.map((e) => `${e.from}>${e.to}`));
  for (const e of current.edges)
    if (
      base.has(e.from) &&
      base.has(e.to) &&
      !originalPairs.has(`${e.from}>${e.to}`)
    )
      add("Do not add bypass connections between starting components", e.from);
  function path(from: string, to: string) {
    const seen = new Set<string>(),
      q = [...out(from)];
    while (q.length) {
      const id = q.pop()!;
      if (id === to) return true;
      if (seen.has(id) || base.has(id)) continue;
      seen.add(id);
      q.push(...out(id));
    }
    return false;
  }
  for (const e of start.edges)
    if (!path(e.from, e.to))
      add(
        "Keep each starting connection, or insert an allowed component on it",
        e.from,
      );
  for (const n of start.nodes.filter((n) => n.type === "client"))
    if (out(n.id).length !== start.edges.filter((e) => e.from === n.id).length)
      add("Do not split or bypass the original client entry path", n.id);
  const reached = new Set<string>(),
    todo = current.nodes.filter((n) => n.type === "client").map((n) => n.id);
  while (todo.length) {
    const id = todo.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    todo.push(...out(id));
  }
  for (const n of current.nodes)
    if (!reached.has(n.id))
      add("Every component must remain reachable from a client", n.id);
  return issues.slice(0, 30);
}
