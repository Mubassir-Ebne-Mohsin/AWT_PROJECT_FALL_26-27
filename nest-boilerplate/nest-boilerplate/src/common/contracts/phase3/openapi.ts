import { z } from "zod";
import {
  aiAcceptedSchema,
  aiEvidenceSchema,
  aiJobSchema,
  aiReadinessSchema,
  aiRequestSchema,
  aiResultSchema,
} from "@/common/contracts/phase3/ai.schema";
import { designVersionSchema } from "@/common/contracts/phase3/version.schema";
import {
  restoreVersionRequestSchema,
  runSummarySchema,
} from "@/common/contracts/phase3/history.schema";
import { comparisonSchema } from "@/common/contracts/phase3/compare.schema";
import {
  createNoteRequestSchema,
  designNoteSchema,
  patchNoteRequestSchema,
} from "@/common/contracts/phase3/notes.schema";
import { designSchema } from "@/common/contracts/phase2/api.schema";
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
    RestoreVersionRequest: restoreVersionRequestSchema,
    RunSummary: runSummarySchema,
    DesignNote: designNoteSchema,
    Comparison: comparisonSchema,
    CreateNoteRequest: createNoteRequestSchema,
    PatchNoteRequest: patchNoteRequestSchema,
    // A distinct component name keeps the frozen phase 2 "Design" schema untouched.
    RestoredDesign: designSchema,
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
  function operation(
    operationId: string,
    result: string,
    request: boolean | string = false,
  ) {
    const requestName = typeof request === "string" ? request : request ? "AiRequest" : null;
    return {
      operationId,
      security: [{ bearer: [] }],
      "x-implementation-status": "implemented",
      ...(requestName
        ? {
            requestBody: { required: true, content: content(ref(requestName)) },
          }
        : {}),
      responses: {
        200: {
          description: "Success or retained terminal replay",
          content: content(envelope(result)),
        },
        ...(request === true
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
      "/v1/designs/{id}/compare": {
        get: {
          ...operation("compareDesignVersions", "Comparison"),
          parameters: [
            parameter,
            { name: "a", in: "query", required: true, schema: { type: "integer", minimum: 1 } },
            { name: "b", in: "query", required: true, schema: { type: "integer", minimum: 1 } },
            { name: "runA", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "runB", in: "query", schema: { type: "string", format: "uuid" } },
          ],
        },
      },
      "/v1/designs/{id}/notes": {
        get: {
          ...operation("listDesignNotes", "DesignNote"),
          parameters: [parameter],
          responses: {
            ...operation("listDesignNotes", "DesignNote").responses,
            200: {
              description: "Notes for this design, newest first (at most 100)",
              content: content({
                type: "object",
                required: ["data"],
                properties: { data: { type: "array", items: ref("DesignNote"), maxItems: 100 } },
              }),
            },
          },
        },
        post: {
          ...operation("createDesignNote", "DesignNote", "CreateNoteRequest"),
          parameters: [parameter],
          responses: {
            ...Object.fromEntries(
              Object.entries(operation("createDesignNote", "DesignNote", "CreateNoteRequest").responses).filter(
                ([code]) => code !== "200",
              ),
            ),
            201: { description: "The saved note", content: content(envelope("DesignNote")) },
          },
        },
      },
      "/v1/designs/{id}/notes/{noteId}": {
        patch: {
          ...operation("patchDesignNote", "DesignNote", "PatchNoteRequest"),
          parameters: [
            parameter,
            { name: "noteId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
        },
        delete: {
          ...operation("deleteDesignNote", "DesignNote"),
          parameters: [
            parameter,
            { name: "noteId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            ...Object.fromEntries(
              Object.entries(operation("deleteDesignNote", "DesignNote").responses).filter(([code]) => code !== "200"),
            ),
            204: { description: "Deleted" },
          },
        },
      },
      "/v1/designs/{id}/runs": {
        get: {
          ...operation("listDesignRuns", "RunSummary"),
          parameters: [
            parameter,
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
            { name: "before", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            ...operation("listDesignRuns", "RunSummary").responses,
            200: {
              description: "Recorded runs of this design, newest first (cursor: before = createdAt)",
              content: content({
                type: "object",
                required: ["data"],
                properties: { data: { type: "array", items: ref("RunSummary") } },
              }),
            },
          },
        },
      },
      "/v1/designs/{id}/versions/{revision}/restore": {
        post: {
          ...operation("restoreDesignVersion", "RestoredDesign", "RestoreVersionRequest"),
          parameters: [
            parameter,
            { name: "revision", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
          ],
          responses: {
            ...operation("restoreDesignVersion", "RestoredDesign", "RestoreVersionRequest").responses,
            200: {
              description: "The restored content, saved as a new revision",
              content: content(envelope("RestoredDesign")),
            },
          },
        },
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
