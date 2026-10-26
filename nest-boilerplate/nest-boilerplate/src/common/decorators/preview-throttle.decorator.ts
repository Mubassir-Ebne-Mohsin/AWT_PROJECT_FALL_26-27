import { ExecutionContext, SetMetadata } from "@nestjs/common";

const PREVIEW_THROTTLE_KEY = "throttle:previewBucket";
/** Requests per minute per client for live previews. Separate so previews cannot starve autosave/Run. */
export const PREVIEW_THROTTLE_LIMIT = 90;

/** Count this route in the preview bucket instead of the shared default bucket. */
export const PreviewThrottle = () => SetMetadata(PREVIEW_THROTTLE_KEY, true);

export const isPreviewRoute = (context: ExecutionContext) =>
  Reflect.getMetadata(PREVIEW_THROTTLE_KEY, context.getHandler()) === true;
