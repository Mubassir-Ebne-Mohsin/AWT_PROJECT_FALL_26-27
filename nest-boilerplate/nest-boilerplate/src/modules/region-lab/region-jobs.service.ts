import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { RegionStore } from "@/modules/region-lab/region-store.service";
import {
  RegionExecutor,
  RegionExecutionError,
} from "@/modules/region-lab/worker/region-executor";
import { REGION_POLICY } from "@/modules/region-lab/region-policy";
@Injectable()
export class RegionJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("RegionLabJobs");
  private readonly instance = randomUUID();
  private timer?: NodeJS.Timeout;
  private closed = false;
  private ticking = false;
  private backoff = 0;
  private active?: {
    id: string;
    token: string;
    controller: AbortController;
    done: Promise<void>;
  };
  constructor(
    private readonly store: RegionStore,
    private readonly executor: RegionExecutor,
  ) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.tick();
    }, REGION_POLICY.pollMs);
    this.timer.unref();
    void this.tick();
  }
  async tick() {
    if (this.closed || this.ticking || Date.now() < this.backoff) return;
    this.ticking = true;
    try {
      if (this.active) {
        if (!(await this.store.canContinue(this.active.id, this.active.token)))
          this.active.controller.abort();
        return;
      }
      const row = await this.store.claim(this.instance);
      if (!row) return;
      const controller = new AbortController();
      const done = this.executor
        .run(row.id, row.lease_token, row.snapshot, controller.signal)
        .then(
          (result) => this.store.finish(row.id, row.lease_token, { result }),
          (error) =>
            this.store.finish(
              row.id,
              row.lease_token,
              error instanceof RegionExecutionError &&
                error.code === "CANCELLED" &&
                !this.closed
                ? { cancelled: true }
                : {
                    failure: {
                      code:
                        error instanceof RegionExecutionError &&
                        error.code !== "CANCELLED"
                          ? error.code
                          : "WORKER_INTERRUPTED",
                      message:
                        "Isolated execution did not complete; submit a new request to retry",
                    },
                  },
            ),
        )
        .then(() => undefined)
        .catch(() => {
          this.logger.warn(
            "Result was not published; durable lease recovery will fence this run",
          );
        })
        .finally(() => {
          this.active = undefined;
        });
      this.active = { id: row.id, token: row.lease_token, controller, done };
    } catch {
      this.backoff = Date.now() + 5000;
      this.logger.warn(
        "Region Lab dispatch deferred; database and migration must be available",
      );
    } finally {
      this.ticking = false;
    }
  }
  async onModuleDestroy() {
    this.closed = true;
    clearInterval(this.timer);
    this.active?.controller.abort();
    await this.active?.done;
  }
}
