import type { OpenAPIObject } from "@nestjs/swagger";
import { phase3OpenApi } from "@/common/contracts/phase3/openapi";
export function documentAi(document: OpenAPIObject) {
  const contract = phase3OpenApi();
  Object.assign(document.paths, contract.paths);
  // Error is shared with Foundation/Phase2; schemas are canonical Zod outputs.
  Object.assign(document.components!.schemas!, contract.components.schemas);
}
