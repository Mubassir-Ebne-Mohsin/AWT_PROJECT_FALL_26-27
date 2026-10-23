import { parentPort } from "node:worker_threads";
import { z } from "zod";
import {
  calculate,
  calculationSchema,
} from "@/modules/simulation/engine/compute";
import { EngineFault } from "@/modules/simulation/engine/budget";

const messageSchema = z.strictObject({
  id: z.uuid(),
  calculation: calculationSchema,
});
if (!parentPort) throw new Error("Compute worker requires a parent port");
parentPort.on("message", (value: unknown) => {
  const parsed = messageSchema.safeParse(value);
  if (!parsed.success) {
    parentPort!.postMessage({ id: null, error: { code: "COMPUTE_FAILED" } });
    return;
  }
  const { id, calculation } = parsed.data;
  try {
    const started = performance.now(),
      result = calculate(calculation);
    parentPort!.postMessage({
      id,
      result,
      diagnostics: {
        elapsedMs: performance.now() - started,
        postCalculationHeapBytes: process.memoryUsage().heapUsed,
      },
    });
  } catch (error) {
    // Never send graph values, input text, raw exception messages or stacks.
    parentPort!.postMessage({
      id,
      error: {
        code: error instanceof EngineFault ? error.code : "COMPUTE_FAILED",
      },
    });
  }
});
