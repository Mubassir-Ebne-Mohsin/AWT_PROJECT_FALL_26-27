import { z } from "zod";
import {
  aiAcceptedSchema,
  aiEvidenceSchema,
  aiJobSchema,
  aiReadinessSchema,
  aiRequestSchema,
  aiResultSchema,
  designVersionSchema,
} from "@/common/contracts/phase3/ai.schema";
import { errorResponseSchema } from "@/common/swagger/error-response.dto";
export function phase3OpenApi() {
  const models = {
    AiRequest: aiRequestSchema,
    AiResult: aiResultSchema,
    AiJob: aiJobSchema,
    AiEvidence: aiEvidenceSchema,
    AcceptedAiJob: aiAcceptedSchema,
    AiReadiness: aiReadinessSchema,
    DesignVersion: designVersionSchema,
    Error: errorResponseSchema,
  };
  const schemas = Object.fromEntries(
    Object.entries(models).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema),
    ]),
  );
  const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
  const content = (schema: unknown) => ({ "application/json": { schema } });
  const envelope = (name: string) => ({
    type: "object",
    required: ["data"],
    properties: { data: ref(name) },
  });
  const parameter = {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  };
  function operation(operationId: string, result: string, request = false) {
    return {
      operationId,
      security: [{ bearer: [] }],
      "x-implementation-status": "implemented",
      ...(request
        ? {
            requestBody: { required: true, content: content(ref("AiRequest")) },
          }
        : {}),
      responses: {
        200: {
          description: "Success or retained terminal replay",
          content: content(envelope(result)),
        },
        ...(request
          ? {
              202: {
                description: "Accepted durable local job; poll statusUrl",
                content: content(envelope(result)),
              },
            }
          : {}),
        ...Object.fromEntries(
          [401, 403, 404, 409, 422, 429, 500, 503].map((code) => [
            code,
            { description: "Stable API error", content: content(ref("Error")) },
          ]),
        ),
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "StressForge M11 experimental AI foundation",
      version: "1.0.0",
      description:
        "Opt-in backend only. M10 quality gate failed; model prose remains experimental. No AI UI or mutation endpoint.",
    },
    paths: {
      "/v1/ai/readiness": { get: operation("aiReadiness", "AiReadiness") },
      "/v1/ai/jobs": { post: operation("submitAiJob", "AcceptedAiJob", true) },
      "/v1/ai/jobs/{id}": {
        get: { ...operation("getAiJob", "AiJob"), parameters: [parameter] },
      },
      "/v1/ai/jobs/{id}/evidence": {
        get: {
          ...operation("getAiJobEvidence", "AiEvidence"),
          parameters: [parameter],
        },
      },
      "/v1/ai/jobs/{id}/cancel": {
        post: { ...operation("cancelAiJob", "AiJob"), parameters: [parameter] },
      },
      "/v1/designs/{id}/versions": {
        get: {
          ...operation("listDesignVersions", "DesignVersion"),
          parameters: [
            parameter,
            {
              name: "beforeRevision",
              in: "query",
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
            },
          ],
          responses: {
            ...operation("listDesignVersions", "DesignVersion").responses,
            200: {
              description:
                "Retained versions, descending revision (cursor pagination)",
              content: content({
                type: "object",
                required: ["data"],
                properties: {
                  data: { type: "array", items: ref("DesignVersion") },
                },
              }),
            },
          },
        },
      },
    },
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      schemas,
    },
  };
}
