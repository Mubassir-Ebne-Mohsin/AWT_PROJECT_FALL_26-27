import { Module } from "@nestjs/common";
import { SimulationService } from "@/modules/simulation/simulation.service";
import { SimulationExecutor } from "@/modules/simulation/worker/simulation-executor";
import { PreviewService } from "@/modules/simulation/preview.service";
import { PreviewController } from "@/modules/simulation/preview.controller";
@Module({
  providers: [
    { provide: SimulationExecutor, useFactory: () => new SimulationExecutor() },
    SimulationService,
    PreviewService,
  ],
  controllers: [PreviewController],
  exports: [SimulationService],
})
export class SimulationModule {}
