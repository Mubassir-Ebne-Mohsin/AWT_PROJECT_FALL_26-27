import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { RedisCacheService } from "@/providers/cache/redis/redis-cache.service";
import { AppModule } from "@/src/app.module";
import { configureApp } from "@/src/app.setup";
import { SimulationExecutor } from "@/modules/simulation/worker/simulation-executor";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { createComputeWorker } from "@/modules/simulation/worker/worker-factory";
import { getTemplates } from "@/modules/simulation/engine/templates";
import type { AddressInfo } from "node:net";

async function main() {
  const flag = new SharedArrayBuffer(4);
  let spawned = 0;
  const executor = new SimulationExecutor(() => {
    if (++spawned <= 2)
      return new Worker(
        resolve(__dirname, "../../test/fixtures/compute-fault.cjs"),
        {
          workerData: { mode: spawned === 1 ? "hang" : "crash", signal: flag },
        },
      );
    return createComputeWorker();
  });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SimulationExecutor)
    .useValue(executor)
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  const results: Record<string, unknown>[] = [];
  try {
    await app.listen(0, "127.0.0.1");
    const readyUntil = Date.now() + 10000;
    while (!app.get(RedisCacheService).getClient().isReady) {
      if (Date.now() > readyUntil)
        throw new Error("Audit Redis did not become ready");
      await new Promise((r) => setTimeout(r, 20));
    }
    const url =
      "http://127.0.0.1:" +
      (app.getHttpServer().address() as AddressInfo).port +
      "/v1/health";
    const service = app.get(SimulationService),
      template = getTemplates().find((t) => t.id === "mvp")!;
    const snapshot = {
      schemaVersion: template.schemaVersion,
      graph: template.graph,
      traffic: template.traffic,
    };
    const health = async (label: string) => {
      const start = performance.now(),
        response = await fetch(url),
        body = await response.json();
      if (
        response.status !== 200 ||
        body.data?.postgres !== "up" ||
        body.data?.redis !== "up"
      )
        throw new Error("Real-service health failed: " + label);
      const elapsedMs = performance.now() - start;
      if (elapsedMs > 1000)
        throw new Error("Health response exceeded 1000ms during " + label);
      results.push({
        label,
        status: response.status,
        postgres: "up",
        redis: "up",
        elapsedMs,
      });
    };
    await health("before");
    const hung = service
      .run("health-audit", { kind: "simulation", snapshot })
      .then(
        () => {
          throw new Error("Hanging worker unexpectedly completed");
        },
        (error) => {
          if (error.code !== "TIMEOUT") throw error;
          results.push({
            label: "CPU-bound worker terminated",
            code: error.code,
          });
        },
      );
    const until = Date.now() + 3000;
    while (!Atomics.load(new Int32Array(flag), 0)) {
      if (Date.now() > until) throw new Error("Worker did not begin CPU loop");
      await new Promise((r) => setTimeout(r, 10));
    }
    for (let i = 0; i < 5; i++) await health("CPU loop " + i);
    await hung;
    await health("after timeout");
    await service.run("health-audit", { kind: "simulation", snapshot }).then(
      () => {
        throw new Error("Crashing worker completed");
      },
      (error) => {
        if (error.code !== "WORKER_CRASH") throw error;
        results.push({ label: "crashed worker detected", code: error.code });
      },
    );
    await health("after crash");
    const recovered = await service.run("health-audit", {
      kind: "simulation",
      snapshot,
    });
    if (recovered.output?.kind !== "simulation")
      throw new Error("Replacement worker did not recover");
    await health("after recovery");
    const output = {
      date: new Date().toISOString(),
      node: process.version,
      note: "Actual AppModule/HealthController with configured Postgres and Redis. Fault entry is test-only, never an HTTP calculation option. No account/DDL changes.",
      results,
    };
    writeFileSync(
      resolve(__dirname, "../../../../docs/audit/m2-worker-health.json"),
      JSON.stringify(output, null, 2) + "\n",
    );
    console.log(JSON.stringify({ passed: true, checks: results.length }));
  } finally {
    await app.close();
    await executor.close();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Health verification failed",
  );
  process.exitCode = 1;
});
