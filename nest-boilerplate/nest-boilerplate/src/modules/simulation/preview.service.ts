import { Injectable } from "@nestjs/common";
import { AppException } from "@/common/errors";
import {
  previewResponseSchema,
  PreviewRequest,
} from "@/common/contracts/phase2/api.schema";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { ExecutionError } from "@/modules/simulation/worker/executor-error";

/**
 * Transient, owner-scoped model preview. Nothing is persisted: no run row, retained count or dashboard entry.
 * Identity (owner + editor session + increasing sequence) and supersession are enforced by the executor.
 */
@Injectable()
export class PreviewService {
  constructor(private readonly simulation: SimulationService) {}

  async preview(owner: string, request: PreviewRequest, signal: AbortSignal) {
    const { editorSessionId, sequence, ...snapshot } = request;
    try {
      const result = await this.simulation.run(
        owner,
        { kind: "preview", snapshot },
        { editorSessionId, sequence, signal },
      );
      return previewResponseSchema.parse({
        editorSessionId,
        sequence,
        fingerprint: result.fingerprint,
        engineVersion: result.engineVersion,
        validation: result.validation,
        summary: result.preview,
      });
    } catch (error) {
      throw toPreviewError(error);
    }
  }
}

export function toPreviewError(error: unknown): unknown {
  if (!(error instanceof ExecutionError)) return error;
  switch (error.code) {
    case "CANCELLED":
      return new AppException("CONFLICT", "A newer preview replaced this one", {
        reason: "PREVIEW_SUPERSEDED",
      });
    case "RATE_LIMITED":
      return error.reason === "DURABLE_PENDING"
        ? new AppException(
            "RATE_LIMITED",
            "Live preview is paused while your calculation is pending",
            { reason: "DURABLE_PENDING" },
          )
        : new AppException(
            "RATE_LIMITED",
            "Calculation capacity is busy. Retry the preview shortly.",
          );
    case "COMPLEXITY_LIMIT":
      return new AppException(
        "VALIDATION_FAILED",
        "This design exceeds the supported calculation budget. Simplify its branching.",
        { reason: "COMPLEXITY_LIMIT" },
      );
    case "TIMEOUT":
      return new AppException(
        "UNAVAILABLE",
        "The preview did not finish within its deadline",
        { reason: "PREVIEW_TIMEOUT" },
      );
    default:
      return new AppException("UNAVAILABLE", "The preview could not be calculated", {
        reason: "PREVIEW_FAILED",
      });
  }
}
