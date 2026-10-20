import { Type, applyDecorators } from "@nestjs/common";
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiCreatedResponse,
  getSchemaPath,
} from "@nestjs/swagger";

const envelope = (model: Type<unknown>) => ({
  type: "object",
  required: ["data"],
  properties: { data: { $ref: getSchemaPath(model) } },
});

/** Documents a success response wrapped as `{ data: Model }`. */
export const ApiOkEnvelope = (model: Type<unknown>) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({ schema: envelope(model) }),
  );

export const ApiCreatedEnvelope = (model: Type<unknown>) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiCreatedResponse({ schema: envelope(model) }),
  );
