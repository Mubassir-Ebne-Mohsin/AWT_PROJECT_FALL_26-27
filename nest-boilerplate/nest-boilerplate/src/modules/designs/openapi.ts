import type { OpenAPIObject } from "@nestjs/swagger";
import { z } from "zod";
import {
  prepareDesignSchema,
  preparedDesignSchema,
} from "@/modules/designs/creation.schema";
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
  const json = (schema: unknown) => ({ "application/json": { schema } });
  document.paths["/v1/designs/prepare"] = {
    post: {
      operationId: "prepareDesign",
      security: [{ bearer: [] }],
      "x-implementation-status": "implemented",
      requestBody: {
        required: true,
        content: json(
          z.toJSONSchema(z.strictObject({ input: prepareDesignSchema })),
        ),
      },
      responses: {
        200: {
          description: "Validated draft; nothing persisted",
          content: json({
            type: "object",
            required: ["data"],
            properties: { data: z.toJSONSchema(preparedDesignSchema) },
          }),
        },
        ...Object.fromEntries(
          [401, 422, 429, 500, 503].map((code) => [
            code,
            {
              description: "Stable API error",
              content: json({ $ref: "#/components/schemas/Error" }),
            },
          ]),
        ),
      },
    },
  } as unknown as OpenAPIObject["paths"][string];
  Object.assign(document.components!.schemas!, contract.components.schemas);
}
