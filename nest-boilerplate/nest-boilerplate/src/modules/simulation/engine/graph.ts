import type {
  EngineNode,
  Design,
  Topology,
  Issue,
  Validation,
} from "@/modules/simulation/engine/types";
import { dict } from "@/modules/simulation/engine/types";
import { CATALOG } from "@/modules/simulation/engine/catalog";
export function graph(design: Design): Topology {
  const byId = dict<EngineNode>(),
    out = dict<string[]>(),
    inn = dict<string[]>();
  (design.nodes || []).forEach((n) => {
    byId[n.id] = n;
    out[n.id] = [];
    inn[n.id] = [];
  });
  (design.edges || []).forEach((e) => {
    if (!byId[e.from] || !byId[e.to] || e.from === e.to) return;
    if (out[e.from].indexOf(e.to) === -1) {
      out[e.from].push(e.to);
      inn[e.to].push(e.from);
    }
  });
  return { byId, out, inn };
}
export function findCycle(
  nodes: EngineNode[],
  out: Record<string, string[]>,
): string[] | null {
  const color = dict<number>(),
    stack: string[] = [];
  let found: string[] | null = null;
  function dfs(id: string): void {
    color[id] = 1;
    stack.push(id);
    for (const k of out[id]) {
      if (found) return;
      if (color[k] === 1) {
        found = stack.slice(stack.indexOf(k));
        return;
      }
      if (!color[k]) dfs(k);
    }
    stack.pop();
    color[id] = 2;
  }
  for (const n of nodes) {
    if (!found && !color[n.id]) dfs(n.id);
  }
  return found;
}
export function topoOrder(
  nodes: EngineNode[],
  out: Record<string, string[]>,
  inn: Record<string, string[]>,
) {
  const indeg = dict<number>();
  nodes.forEach((n) => {
    indeg[n.id] = inn[n.id].length;
  });
  const q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id),
    order: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    out[id].forEach((k) => {
      if (--indeg[k] === 0) q.push(k);
    });
  }
  return order;
}
export function issue(
  code: string,
  msg: string,
  fix: string,
  nodeIds: string[] = [],
  level: Issue["level"] = "error",
) {
  return { code, msg, fix, nodeIds: nodeIds || [], level: level || "error" };
}

/* ---------- 1.4 Validation (the "simulation failed" cases) ---------- */
export function validate(design: Design): Validation {
  const errors: Issue[] = [],
    warnings: Issue[] = [];
  const nodes = design.nodes || [];
  if (!nodes.length) {
    errors.push(
      issue(
        "EMPTY",
        "The canvas is empty.",
        "Add a Clients node and at least one server, then connect them.",
      ),
    );
    return { ok: false, errors, warnings };
  }
  const g = graph(design);
  nodes.forEach((n) => {
    if (!CATALOG[n.type])
      errors.push(
        issue(
          "UNKNOWN_TYPE",
          '"' + n.type + '" is not a known component type.',
          "Replace it with a component from the palette.",
          [n.id],
        ),
      );
  });
  const clients = nodes.filter((n) => n.type === "client");
  if (!clients.length)
    errors.push(
      issue(
        "NO_ENTRY",
        "There is no traffic entry.",
        "Add a Clients node so requests have somewhere to start.",
      ),
    );
  clients.forEach((c) => {
    if (!g.out[c.id].length)
      errors.push(
        issue(
          "ENTRY_UNCONNECTED",
          c.label + " is not connected to anything.",
          "Draw an edge from it to your first server.",
          [c.id],
        ),
      );
    if (g.inn[c.id].length)
      errors.push(
        issue(
          "EDGE_INTO_ENTRY",
          "An edge points into " + c.label + ".",
          "Clients only send traffic. Delete the edge that ends at it.",
          [c.id].concat(g.inn[c.id]),
        ),
      );
  });
  const cyc = findCycle(nodes, g.out);
  if (cyc) {
    const names = cyc.map((id) => g.byId[id].label);
    errors.push(
      issue(
        "CYCLE",
        "Cycle found: " + names.join(" → ") + " → " + names[0] + ".",
        "Requests would loop forever. Delete one of these edges.",
        cyc,
      ),
    );
  }
  if (!errors.length) {
    const seen = new Set(),
      st = clients.map((c) => c.id);
    while (st.length) {
      const id = st.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      g.out[id].forEach((k) => st.push(k));
    }
    const orphans = nodes.filter((n) => !seen.has(n.id));
    if (orphans.length)
      warnings.push(
        issue(
          "UNREACHABLE",
          orphans.map((o) => o.label).join(", ") +
            (orphans.length > 1 ? " receive" : " receives") +
            " no traffic.",
          "Connect " +
            (orphans.length > 1 ? "them" : "it") +
            " to the rest of the design, or delete " +
            (orphans.length > 1 ? "them." : "it."),
          orphans.map((o) => o.id),
          "warning",
        ),
      );
    nodes
      .filter((n) => n.type === "queue")
      .forEach((q) => {
        if (!g.out[q.id].some((k) => g.byId[k].type === "worker"))
          warnings.push(
            issue(
              "QUEUE_NO_CONSUMER",
              q.label + " has no workers.",
              "Messages pile up and are never processed. Connect a Worker to it.",
              [q.id],
              "warning",
            ),
          );
      });
    nodes
      .filter((n) => n.type === "app")
      .forEach((a) => {
        const kids = g.out[a.id].map((k) => g.byId[k].type);
        if (
          kids.indexOf("replica") !== -1 &&
          kids.indexOf("db") === -1 &&
          kids.indexOf("queue") === -1
        )
          warnings.push(
            issue(
              "WRITES_TO_REPLICA",
              a.label + " sends writes to a read replica.",
              "Replicas are read-only and reject writes. Connect the primary Database too.",
              [a.id],
              "warning",
            ),
          );
        else if (
          !kids.some(
            (t) =>
              ["db", "queue", "app", "lb", "gateway", "replica"].indexOf(t) !==
              -1,
          )
        )
          warnings.push(
            issue(
              "NO_WRITE_TARGET",
              a.label + " has nowhere to store writes.",
              "The model treats writes as handled in memory. Connect a Database or a Queue.",
              [a.id],
              "info",
            ),
          );
      });
  }
  return { ok: !errors.length, errors, warnings };
}
