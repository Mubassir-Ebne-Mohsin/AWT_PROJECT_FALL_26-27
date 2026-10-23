import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { snapshotSchema } from "@/common/contracts/phase2/graph.schema";
import { validate } from "@/modules/simulation/engine/graph";
import { toValidation } from "@/modules/simulation/engine/wire";
import {
  SimulationExecutor,
  Admission,
} from "@/modules/simulation/worker/simulation-executor";
import type { Calculation } from "@/modules/simulation/engine/compute";
@Injectable()
export class SimulationService implements OnModuleDestroy {
  constructor(readonly executor: SimulationExecutor) {}
  validate(snapshot: unknown) {
    return toValidation(validate(snapshotSchema.parse(snapshot).graph));
  }
  run(ownerId: string, calculation: Calculation, admission?: Admission) {
    return this.executor.submit(ownerId, calculation, admission);
  }
  onModuleDestroy() {
    return this.executor.close();
  }
}
