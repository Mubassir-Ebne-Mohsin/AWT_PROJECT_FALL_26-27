import type { Design } from "@/lib/api/designs";

/**
 * The saved design written in the import format (schemaVersion 1: name, description, nodes, edges, traffic), so a downloaded
 * file can be loaded again with New design, Import JSON. It is built from the saved revision only, never from unsaved edits.
 */
export function designExportText(design: Pick<Design, "name" | "description" | "graph" | "traffic">): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      name: design.name,
      ...(design.description ? { description: design.description } : {}),
      nodes: design.graph.nodes,
      edges: design.graph.edges,
      traffic: design.traffic,
    },
    null,
    2,
  );
}

/** A file name that is safe on every system: letters, digits and dashes only. */
export function designExportFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return (slug || "design") + ".json";
}
