import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { readFileSync } from "node:fs";
import {
  SimulationExecutor,
  EXECUTION_BOUNDS,
} from "@/modules/simulation/worker/simulation-executor";
import {
  createComputeWorker,
  WORKER_RESOURCES,
} from "@/modules/simulation/worker/worker-factory";
import { calculate, Calculation } from "@/modules/simulation/engine/compute";

jest.setTimeout(20000);
const fixture = resolve(
  __dirname,
  "../../../../test/fixtures/compute-fault.cjs",
);
const evidence = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      "../../../../../../docs/contracts/reference-fixtures.json",
    ),
    "utf8",
  ),
);
const job: Calculation = {
  kind: "simulation",
  snapshot: evidence.templates.find((t: any) => t.id === "mvp").input,
};
const preview: Calculation = { ...job, kind: "preview" };
const admission = () => ({ editorSessionId: randomUUID(), sequence: 0 });
let executor: SimulationExecutor | undefined;
afterEach(async () => {
  jest.useRealTimers();
  await executor?.close();
  executor = undefined;
});
const waitBusy = async (flag: SharedArrayBuffer) => {
  const until = Date.now() + 3000;
  while (!Atomics.load(new Int32Array(flag), 0)) {
    if (Date.now() > until) throw new Error("Test worker did not start");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
function onceFault(mode: string, signal?: SharedArrayBuffer, result?: unknown) {
  let count = 0;
  return () =>
    ++count === 1
      ? new Worker(fixture, { workerData: { mode, signal, result } })
      : createComputeWorker();
}
describe("Bounded real worker execution", () => {
  it("runs the actual TS worker deterministically and enforces resource limits", async () => {
    const worker = createComputeWorker();
    expect(worker.resourceLimits?.maxOldGenerationSizeMb).toBe(
      WORKER_RESOURCES.maxOldGenerationSizeMb,
    );
    await worker.terminate();
    executor = new SimulationExecutor();
    const first = await executor.submit("a", job),
      second = await executor.submit("a", job);
    expect(first).toEqual(second);
    expect(first.output?.kind).toBe("simulation");
    expect(executor.state.reservations).toBe(0);
  });
  it.each(["crash", "throw", "malformed"])(
    "recovers after a %s without poisoning the next job",
    async (mode) => {
      executor = new SimulationExecutor(onceFault(mode));
      await expect(executor.submit("a", job)).rejects.toMatchObject({
        code: "WORKER_CRASH",
      });
      expect((await executor.submit("b", job)).output?.kind).toBe("simulation");
    },
  );
  it("rejects a schema-valid reply with the wrong input fingerprint", async () => {
    const wrong = calculate(job);
    wrong.fingerprint = "f".repeat(64);
    executor = new SimulationExecutor(onceFault("wrong", undefined, wrong));
    await expect(executor.submit("a", job)).rejects.toMatchObject({
      code: "WORKER_CRASH",
    });
    expect((await executor.submit("a", job)).output?.kind).toBe("simulation");
  });
  it("times out a CPU-bound worker without blocking the main event loop and replaces it", async () => {
    const flag = new SharedArrayBuffer(4);
    executor = new SimulationExecutor(onceFault("hang", flag));
    const rejected = expect(executor.submit("a", job)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    await waitBusy(flag);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    await rejected;
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(20);
    expect((await executor.submit("b", job)).output?.kind).toBe("simulation");
  });
  it("enforces four queued jobs and one pending durable job per owner", async () => {
    const flag = new SharedArrayBuffer(4);
    executor = new SimulationExecutor(onceFault("hang", flag));
    const running = executor.submit("a", job);
    await waitBusy(flag);
    const queued = Array.from({ length: 4 }, (_, i) =>
      executor!.submit("q" + i, job),
    );
    expect(executor.state.queued).toBe(4);
    expect(() => executor!.submit("overflow", job)).toThrow("capacity");
    expect(() => executor!.submit("a", job)).toThrow("capacity");
    executor.cancelOwner("a");
    await expect(running).rejects.toMatchObject({ code: "CANCELLED" });
    const results = await Promise.all(queued);
    expect(results.every((r) => r.output?.kind === "simulation")).toBe(true);
  });
  it("preempts a running preview and evicts a full preview queue before rejecting durable admission", async () => {
    const flag = new SharedArrayBuffer(4);
    executor = new SimulationExecutor(onceFault("hang", flag));
    const previews = [executor.submit("p", preview, admission())];
    await waitBusy(flag);
    for (let i = 0; i < 4; i++)
      previews.push(executor.submit("p" + i, preview, admission()));
    expect(executor.state.queued).toBe(4);
    const durable = executor.submit("durable", job);
    expect(executor.state.queued).toBeLessThanOrEqual(4);
    expect((await durable).output?.kind).toBe("simulation");
    await executor.close();
    const states = await Promise.allSettled(previews);
    expect(
      states.filter((s) => s.status === "rejected").length,
    ).toBeGreaterThanOrEqual(2);
  });
  it("cancels preview on abort/supersession, but an accepted durable job survives disconnect", async () => {
    executor = new SimulationExecutor();
    const accepted = new AbortController();
    const durable = executor.submit("d", job, { signal: accepted.signal });
    accepted.abort();
    expect((await durable).output?.kind).toBe("simulation");
    const already = new AbortController();
    already.abort();
    expect(() =>
      executor!.submit("p", preview, {
        ...admission(),
        signal: already.signal,
      }),
    ).toThrow("cancelled");
    const editor = admission(),
      older = executor.submit("p", preview, editor);
    const newer = executor.submit("p", preview, { ...editor, sequence: 1 });
    await expect(older).rejects.toMatchObject({ code: "CANCELLED" });
    expect((await newer).preview).not.toBeNull();
    expect(() => executor!.submit("p", preview, editor)).toThrow("cancelled");
  });
  it("releases unused provisional reservations at the queue-inclusive deadline", async () => {
    jest.useFakeTimers();
    executor = new SimulationExecutor();
    const reservation = executor.reserve("a", "durable");
    const failure = expect(reservation.result).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    jest.advanceTimersByTime(EXECUTION_BOUNDS.durableMs - 100);
    reservation.start(job);
    jest.advanceTimersByTime(101);
    await failure;
    expect(executor.state.reservations).toBe(0);
    expect(() => reservation.start(job)).toThrow("deadline");
  });
  it("bounds/ages preview metadata and rejects stale sequences without discarding newer work", async () => {
    jest.useFakeTimers();
    executor = new SimulationExecutor();
    for (let i = 0; i < EXECUTION_BOUNDS.previewEntries; i++)
      executor.reserve("p", "preview", admission()).release();
    expect(executor.state.previewEntries).toBe(EXECUTION_BOUNDS.previewEntries);
    expect(() => executor!.reserve("p", "preview", admission())).toThrow(
      "capacity",
    );
    jest.advanceTimersByTime(EXECUTION_BOUNDS.previewTtlMs + 1);
    executor.reserve("p", "preview", admission()).release();
    expect(executor.state.previewEntries).toBe(1);
  });
  it("rejects an expired reservation even when its timer callback has not run", async () => {
    jest.useFakeTimers();
    executor = new SimulationExecutor();
    const reservation = executor.reserve("late", "durable");
    const rejected = expect(reservation.result).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    jest.setSystemTime(Date.now() + EXECUTION_BOUNDS.durableMs + 1);
    expect(() => reservation.start(job)).toThrow("deadline");
    await rejected;
    expect(executor.state.reservations).toBe(0);
  });
  it("releases capacity after invalid start, cancellation and shutdown", async () => {
    executor = new SimulationExecutor();
    const reservation = executor.reserve("a", "durable");
    reservation.release();
    expect(executor.state.reservations).toBe(0);
    const invalid = executor.reserve("a", "durable");
    expect(() => invalid.start(preview)).toThrow("priority");
    expect(executor.state.reservations).toBe(0);
    await executor.close();
    expect(() => executor!.submit("a", job)).toThrow("shutting down");
  });
});
