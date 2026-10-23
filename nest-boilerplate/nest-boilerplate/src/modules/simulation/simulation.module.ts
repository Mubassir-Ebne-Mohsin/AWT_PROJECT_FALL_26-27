import { Module } from "@nestjs/common";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { SimulationExecutor } from "@/modules/simulation/worker/simulation-executor";
@Module({
  providers: [
    { provide: SimulationExecutor, useFactory: () => new SimulationExecutor() },
    SimulationService,
  ],
  exports: [SimulationService],
})
export class SimulationModule {}
