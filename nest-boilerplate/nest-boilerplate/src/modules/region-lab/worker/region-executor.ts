import { performance } from "node:perf_hooks";
import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  REGION_POLICY,
  hash,
  type FrozenRegionSnapshot,
} from "@/modules/region-lab/region-policy";
import { validateRegionResult } from "@/modules/region-lab/worker/region-result";
export type RegionExecutionCode =
  | "BUDGET_EXCEEDED"
  | "DEADLINE_EXCEEDED"
  | "WORKER_INTERRUPTED"
  | "COMPUTE_FAILED"
  | "CANCELLED";
export class RegionExecutionError extends Error {
  constructor(readonly code: RegionExecutionCode) {
    super("Isolated Region Lab execution did not complete");
  }
}
export function regionChildLaunch() {
  const source = __filename.endsWith(".ts");
  const entry = resolve(
    __dirname,
    "region-compute.worker." + (source ? "ts" : "js"),
  );
  return {
    entry,
    options: {
      cwd: resolve(__dirname, "../../../.."),
      execArgv: [
        "--max-old-space-size=160",
        "--max-semi-space-size=16",
        ...(source
          ? [
              "-r",
              resolve(__dirname, "../../simulation/worker/register-source.cjs"),
            ]
          : []),
      ],
      env: {
        NODE_ENV: process.env.NODE_ENV === "test" ? "test" : "production",
        TEMP: tmpdir(),
        TMP: tmpdir(),
        ...(source
          ? { TS_NODE_PROJECT: resolve(__dirname, "../../../../tsconfig.json") }
          : {}),
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"] as [
        "ignore",
        "ignore",
        "ignore",
        "ipc",
      ],
      windowsHide: true,
    },
  };
}
export function spawnRegionChild() {
  const { entry, options } = regionChildLaunch();
  return fork(entry, [], options);
}
/** Parent watchdog is independent of the synchronous simulation event loop. Never resolves before child exit. */
export class RegionExecutor {
  constructor(
    private readonly spawn: () => ChildProcess = spawnRegionChild,
    private readonly wallMs: number = REGION_POLICY.wallMs,
  ) {}
  run(
    id: string,
    token: string,
    snapshot: FrozenRegionSnapshot,
    signal: AbortSignal,
  ) {
    return new Promise<unknown>((yes, no) => {
      if (signal.aborted) {
        no(new RegionExecutionError("CANCELLED"));
        return;
      }
      const began = performance.now(),
        wall = Math.min(this.wallMs, REGION_POLICY.wallMs),
        deadline = Date.now() + wall;
      const child = this.spawn(),
        snapshotHash = hash(snapshot);
      let result: unknown,
        failure: RegionExecutionError | undefined,
        finished = false;
      const stop = (code: RegionExecutionCode) => {
        failure ??= new RegionExecutionError(code);
        child.kill("SIGKILL");
      };
      const aborted = () => stop("CANCELLED");
      signal.addEventListener("abort", aborted, { once: true });
      const timer = setTimeout(
        () => stop("DEADLINE_EXCEEDED"),
        Math.max(1, wall - (performance.now() - began)),
      );
      child.on("message", (message: any) => {
        if (finished) return;
        if (!message || message.id !== id || message.token !== token) {
          stop("COMPUTE_FAILED");
          return;
        }
        if (message.type === "heartbeat") {
          if (
            !Number.isFinite(message.rssBytes) ||
            message.rssBytes > REGION_POLICY.rssBytes
          )
            stop("BUDGET_EXCEEDED");
          return;
        }
        if (message.type === "failure") {
          const allowed: RegionExecutionCode[] = [
            "BUDGET_EXCEEDED",
            "DEADLINE_EXCEEDED",
            "WORKER_INTERRUPTED",
          ];
          stop(
            allowed.includes(message.code) ? message.code : "COMPUTE_FAILED",
          );
          return;
        }
        if (
          message.type !== "result" ||
          result !== undefined ||
          message.snapshotHash !== snapshotHash
        ) {
          stop("COMPUTE_FAILED");
          return;
        }
        try {
          result = validateRegionResult(snapshot, message.result);
        } catch {
          stop("COMPUTE_FAILED");
        }
      });
      child.once("error", () => {
        failure ??= new RegionExecutionError("WORKER_INTERRUPTED");
      });
      child.once("close", (code, exitSignal) => {
        finished = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
        if (failure) no(failure);
        else if (performance.now() - began > wall)
          no(new RegionExecutionError("DEADLINE_EXCEEDED"));
        else if (code !== 0 || exitSignal || result === undefined)
          no(
            new RegionExecutionError(
              code === 134 ? "BUDGET_EXCEEDED" : "WORKER_INTERRUPTED",
            ),
          );
        else yes(result);
      });
      child.send({ id, token, snapshotHash, snapshot, deadline }, (error) => {
        if (error) stop("WORKER_INTERRUPTED");
      });
    });
  }
}
