import { z } from "zod";
import { schemas, listQuerySchema } from "@/common/contracts/phase2/api.schema";
import { errorResponseSchema } from "@/common/swagger/error-response.dto";

const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
const json = (schema: unknown) => ({ "application/json": { schema } });
const envelope = (name: string) => ({ type: "object", required: ["data"], additionalProperties: false, properties: { data: ref(name) } });
type Operation = Record<string, unknown>;
export function phase2OpenApi() {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries({ ...schemas, Error: errorResponseSchema, ListQuery: listQuerySchema })) registry.add(schema, { id });
  const generated = z.toJSONSchema(registry, { target: "draft-2020-12", reused: "inline", uri: id => "#/components/schemas/" + id }).schemas;
  for (const schema of Object.values(generated)) { delete schema.$schema; delete schema.$id; }
  function operation(id: string, success: string, status: number, request?: string, extra?: number): Operation {
    const responses: Record<string, unknown> = {
      [status]: { description: status === 204 ? "Deleted" : "Success", ...(status === 204 ? {} : { content: json(success === "DesignList" ? ref(success) : envelope(success)) }) },
    };
    if (extra) responses[extra] = { description: "Retained terminal request replay", content: json(envelope(success)) };
    for (const code of [401, 403, 404, 409, 422, 429, 500, 503]) responses[code] = { description: "Stable API error; 409/422/preview pressure stay inline", content: json(ref("Error")) };
    return { operationId: id, "x-implementation-status": "planned", security: [{ bearer: [] }], responses,
      ...(request ? { requestBody: { required: true, content: json(ref(request)) } } : {}) };
  }
  const pathId = (name: string) => ({ name, in: "path", required: true, schema: { type: "string", format: "uuid" } });
  const designParameters = [pathId("id")];
  const templates = operation("getTemplates", "Template", 200);
  (templates.responses as Record<string, unknown>)["200"] = { description: "Six source templates", content: json({ type: "object", required: ["data"], properties: { data: { type: "array", minItems: 6, maxItems: 6, items: ref("Template") } } }) };
  const list = operation("listDesigns", "DesignList", 200);
  list.parameters = ["page", "pageSize"].map(name => ({
    name, in: "query", schema: { type: "integer", minimum: 1, maximum: name === "pageSize" ? 50 : undefined, default: name === "pageSize" ? 20 : 1 },
  }));
  return {
    openapi: "3.1.0", info: { title: "StressForge Phase 2 contract", version: "1.0.0",
      description: "M1 contract only. Routes are not mounted yet. Zod schemas are authoritative; cross-field refinements are verified by contract tests." },
    servers: [{ url: "/v1" }], "x-implementation-status": "planned",
    paths: {
      "/simulation/catalog": { get: operation("getSimulationCatalog", "Catalog", 200) },
      "/templates": { get: templates },
      "/designs": { get: list, post: operation("createDesign", "Design", 201, "CreateDesign") },
      "/designs/{id}": { parameters: designParameters, get: operation("getDesign", "Design", 200),
        patch: operation("patchDesign", "Design", 200, "PatchDesign"), delete: operation("deleteDesign", "", 204) },
      "/designs/{id}/validate": { parameters: designParameters, post: operation("validateDesign", "Validation", 200, "ValidateRequest") },
      "/designs/{id}/simulate": { parameters: designParameters, post: operation("simulateDesign", "AcceptedRun", 202, "RunRequest", 200) },
      "/designs/{id}/limits": { parameters: designParameters, post: operation("findDesignLimits", "AcceptedRun", 202, "RunRequest", 200) },
      "/designs/{id}/runs/{runId}": { parameters: [...designParameters, pathId("runId")], get: operation("getDesignRun", "Run", 200) },
      "/simulation/preview": { post: operation("previewSimulation", "PreviewResponse", 200, "PreviewRequest") },
      "/dashboard": { get: operation("getDashboard", "Dashboard", 200) },
    },
    components: { schemas: generated, securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
  };
}
