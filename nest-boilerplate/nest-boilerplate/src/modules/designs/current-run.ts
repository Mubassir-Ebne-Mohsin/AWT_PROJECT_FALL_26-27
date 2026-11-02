import { AppException } from "@/common/errors";
import { inputFingerprint } from "@/common/contracts/phase2/fingerprint";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunsService } from "@/modules/designs/runs.service";

/**
 * The checks every "what about this result?" feature needs before it computes anything: the design is the caller's, the revision
 * they saw is the saved one, and the run is a completed test run of exactly the saved design. Fix suggestions and the load ladder
 * both start here, so they cannot disagree about what counts as a current result.
 */
export async function currentSimulationRun(designs: DesignsService, runs: RunsService, owner: string, id: string, request: { expectedRevision: number; runId: string }) {
  const design = await designs.owned(owner, id);
  designs.revision(design, request.expectedRevision);
  const run = await runs.get(owner, id, request.runId);
  if (run.kind !== "simulation" || run.status !== "completed" || run.result.kind !== "simulation")
    throw new AppException("VALIDATION_FAILED", "This needs a completed test run", { reason: "RUN_NOT_USABLE" });
  const snapshot = { schemaVersion: design.schemaVersion, graph: design.graph, traffic: design.traffic };
  if (run.designRevision !== design.revision || run.fingerprint !== inputFingerprint(snapshot, run.engineVersion))
    throw new AppException("VALIDATION_FAILED", "That run is not for the current saved design. Run the test again first.", { reason: "RUN_NOT_CURRENT" });
  return { design, run, summary: run.result.summary };
}
