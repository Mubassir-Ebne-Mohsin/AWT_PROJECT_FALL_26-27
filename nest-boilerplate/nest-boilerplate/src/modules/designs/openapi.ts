import type { OpenAPIObject } from "@nestjs/swagger";
import { phase2OpenApi } from "@/common/contracts/phase2/openapi";
/** Reuse frozen contracts only for mounted operations. Preview/Limits stay planned. */
export function documentDesigns(document: OpenAPIObject) {
  const contract = phase2OpenApi();
  document.openapi = "3.1.0";
  const excluded = new Set(["/simulation/preview", "/designs/{id}/limits"]);
  for (const [path, value] of Object.entries(contract.paths)) {
    if (excluded.has(path)) continue;
    const actual = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    for (const method of ["get", "post", "patch", "delete"]) {
      const operation = actual[method] as Record<string, unknown> | undefined;
      if (operation) operation["x-implementation-status"] = "implemented";
    }
    document.paths["/v1" + path] = actual;
  }
  Object.assign(document.components!.schemas!, contract.components.schemas);
}
