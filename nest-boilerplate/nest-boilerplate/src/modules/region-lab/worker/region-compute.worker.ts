import { performance } from "node:perf_hooks";
import {
  frozenSnapshot,
  hash,
  REGION_POLICY,
  type FrozenRegionSnapshot,
} from "@/modules/region-lab/region-policy";
import { simulateRegionLabScenario } from "@/modules/region-lab/engine/regional-scenario";
import { FoundationError } from "@/modules/region-lab/engine/engine";
import {
  createCapture,
  RESULT_FORMAT,
} from "@/modules/region-lab/results/result-codec";
process.once("message", (raw: any) => {
  const send = (message: unknown) => process.send?.(message);
  const final = (message: unknown) => {
    if (!process.send) return;
    process.send(message, (error) => {
      if (error) process.exitCode = 1;
      process.disconnect();
    });
  };
  try {
    const { id, token, snapshot, snapshotHash, deadline } = raw as {
      id: string;
      token: string;
      snapshot: FrozenRegionSnapshot;
      snapshotHash: string;
      deadline: number;
    };
    const { metadata: _metadata, ...executionSnapshot } = snapshot;
    if (
      hash(snapshot) !== snapshotHash ||
      hash(frozenSnapshot(snapshot.scenario)) !== hash(executionSnapshot)
    )
      throw new Error("Snapshot or engine changed");
    let heartbeat = 0;
    const parent = process.ppid;
    const guard = () => {
      if (Date.now() > deadline)
        throw new FoundationError(
          "DEADLINE_EXCEEDED",
          "Wall deadline exceeded",
        );
      const memory = process.memoryUsage();
      if (memory.rss > REGION_POLICY.rssBytes)
        throw new FoundationError("BUDGET_EXCEEDED", "RSS ceiling exceeded");
      if (Date.now() - heartbeat > 250) {
        try {
          process.kill(parent, 0);
        } catch {
          throw new FoundationError("CANCELLED", "Parent exited");
        }
        heartbeat = Date.now();
        send({ type: "heartbeat", id, token, rssBytes: memory.rss });
      }
      return memory.heapUsed;
    };
    guard();
    const capture = createCapture(
      snapshot.scenario.workload.durationSeconds * 1000,
    );
    const native = simulateRegionLabScenario(snapshot.scenario, {
      onSamples: capture.onSamples,
      onRootEvent: capture.onRootEvent,
      limits: snapshot.budgets,
      heapUsed: guard,
      clock: () => {
        guard();
        return performance.now();
      },
    });
    for (const rep of native.repetitions)
      for (const side of [rep.baseline, rep.outage])
        if (side)
          side.limitations = side.limitations.map((note) =>
            note.startsWith("No real-system calibration, HDR")
              ? "No real-system calibration or hosted release acceptance; profiles remain explicit assumptions"
              : note,
          );
    const result = {
      ...native,
      wireVersion: RESULT_FORMAT,
      telemetry: { executions: capture.executions },
    };
    if (
      Buffer.byteLength(JSON.stringify(result)) >
      snapshot.budgets.maxResultBytes
    )
      throw new FoundationError(
        "BUDGET_EXCEEDED",
        "Recorded result exceeds size limit",
      );
    final({ type: "result", id, token, snapshotHash, result });
  } catch (error) {
    final({
      type: "failure",
      id: raw?.id,
      token: raw?.token,
      code:
        error instanceof FoundationError ? error.code : "WORKER_INTERRUPTED",
    });
  }
});
