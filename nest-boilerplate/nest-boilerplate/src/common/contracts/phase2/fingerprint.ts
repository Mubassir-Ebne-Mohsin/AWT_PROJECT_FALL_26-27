import { createHash } from "node:crypto";
import { MODEL_VERSION, Snapshot, snapshotSchema } from "@/common/contracts/phase2/graph.schema";

// Object insertion order must not affect identity; array order intentionally does.
// Explicit property values remain distinct from omitted defaults, preserving source seeds.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort().map(key => JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
}
export function inputFingerprint(input: Snapshot, engineVersion = MODEL_VERSION): string {
  const parsed = snapshotSchema.parse(input);
  const semantic = {
    schemaVersion: parsed.schemaVersion, engineVersion, traffic: parsed.traffic,
    nodes: parsed.graph.nodes.map(({ id, type, label, props }) => ({ id, type, label, props })),
    edges: parsed.graph.edges.map(({ from, to }) => ({ from, to })),
  };
  return createHash("sha256").update(canonical(semantic)).digest("hex");
}
