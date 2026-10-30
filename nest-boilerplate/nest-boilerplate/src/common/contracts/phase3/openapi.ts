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
import { reportSchema } from "@/common/contracts/phase3/report.schema";
import { accountRolesSchema, adminUserSchema, auditEntrySchema, grantRoleRequestSchema, roleChangeSchema } from "@/common/contracts/phase3/roles.schema";
import { createShareRequestSchema, openShareRequestSchema, shareCreatedSchema, shareSchema, sharedViewSchema } from "@/common/contracts/phase3/share.schema";
import { archiveStateSchema, libraryListSchema } from "@/common/contracts/phase3/library.schema";
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
    DesignReport: reportSchema,
    CreateShareRequest: createShareRequestSchema,
    OpenShareRequest: openShareRequestSchema,
    ShareLink: shareSchema,
    ShareCreated: shareCreatedSchema,
    SharedView: sharedViewSchema,
    AccountRoles: accountRolesSchema,
    GrantRoleRequest: grantRoleRequestSchema,
    AdminUser: adminUserSchema,
    RoleChange: roleChangeSchema,
    AuditEntry: auditEntrySchema,
    DesignLibraryList: libraryListSchema,
    ArchiveState: archiveStateSchema,
    // Distinct component name keeps the frozen phase 2 "Design" schema untouched.
    DuplicatedDesign: designSchema,
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
      "/v1/library/designs": {
        get: {
          ...operation("listDesignLibrary", "DesignLibraryList"),
          parameters: [
            { name: "q", in: "query", schema: { type: "string", maxLength: 100 } },
            { name: "sort", in: "query", schema: { type: "string", enum: ["updated", "name", "lastRun"], default: "updated" } },
            { name: "verdict", in: "query", schema: { type: "string", enum: ["pass", "strained", "fail", "none"] } },
            { name: "archived", in: "query", schema: { type: "string", enum: ["active", "archived", "all"], default: "active" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
          ],
          responses: {
            ...operation("listDesignLibrary", "DesignLibraryList").responses,
            200: { description: "Owned designs with filters, sorting and paging", content: content(ref("DesignLibraryList")) },
          },
        },
      },
      "/v1/designs/{id}/duplicate": {
        post: {
          ...operation("duplicateDesign", "DuplicatedDesign"),
          parameters: [parameter],
          responses: {
            ...Object.fromEntries(Object.entries(operation("duplicateDesign", "DuplicatedDesign").responses).filter(([code]) => code !== "200")),
            201: { description: "A new design with the same content, revision 1", content: content(envelope("DuplicatedDesign")) },
          },
        },
      },
      "/v1/designs/{id}/archive": {
        post: { ...operation("archiveDesign", "ArchiveState"), parameters: [parameter] },
      },
      "/v1/designs/{id}/unarchive": {
        post: { ...operation("unarchiveDesign", "ArchiveState"), parameters: [parameter] },
      },
      "/v1/designs/{id}/shares": {
        get: {
          ...operation("listDesignShares", "ShareLink"),
          parameters: [parameter],
          responses: {
            ...operation("listDesignShares", "ShareLink").responses,
            200: {
              description: "Links for this design, newest first (at most 50). Never includes a secret.",
              content: content({ type: "object", required: ["data"], properties: { data: { type: "array", items: ref("ShareLink"), maxItems: 50 } } }),
            },
          },
        },
        post: {
          ...operation("createDesignShare", "ShareCreated", "CreateShareRequest"),
          parameters: [parameter],
          responses: {
            ...Object.fromEntries(Object.entries(operation("createDesignShare", "ShareCreated", "CreateShareRequest").responses).filter(([code]) => code !== "200")),
            201: { description: "The new link. The secret is shown only in this response.", content: content(envelope("ShareCreated")) },
          },
        },
      },
      "/v1/designs/{id}/shares/{shareId}/revoke": {
        post: {
          ...operation("revokeDesignShare", "ShareLink"),
          parameters: [parameter, { name: "shareId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        },
      },
      "/v1/account/roles": {
        get: operation("getAccountRoles", "AccountRoles"),
      },
      "/v1/admin/users/lookup": {
        get: {
          ...operation("lookupAdminUser", "AdminUser"),
          parameters: [{ name: "email", in: "query", required: true, schema: { type: "string", minLength: 3, maxLength: 254 } }],
        },
      },
      "/v1/admin/users/{id}/roles": {
        get: { ...operation("listUserRoles", "RoleChange"), parameters: [parameter] },
        post: { ...operation("grantUserRole", "RoleChange", "GrantRoleRequest"), parameters: [parameter] },
      },
      "/v1/admin/users/{id}/roles/{role}": {
        delete: {
          ...operation("revokeUserRole", "RoleChange"),
          parameters: [parameter, { name: "role", in: "path", required: true, schema: { type: "string", enum: ["instructor", "reviewer", "admin"] } }],
        },
      },
      "/v1/admin/audit": {
        get: {
          ...operation("listRoleAudit", "AuditEntry"),
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
            { name: "before", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "beforeId", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            ...operation("listRoleAudit", "AuditEntry").responses,
            200: {
              description: "Role changes, newest first (at most 50 per page)",
              content: content({ type: "object", required: ["data"], properties: { data: { type: "array", items: ref("AuditEntry"), maxItems: 50 } } }),
            },
          },
        },
      },
      "/v1/shares/open": {
        post: {
          ...operation("openSharedView", "SharedView", "OpenShareRequest"),
          security: [],
        },
      },
      "/v1/designs/{id}/report": {
        get: {
          ...operation("getDesignReport", "DesignReport"),
          parameters: [
            parameter,
            { name: "revision", in: "query", schema: { type: "integer", minimum: 1 } },
            { name: "run", in: "query", schema: { type: "string", format: "uuid" } },
          ],
        },
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
