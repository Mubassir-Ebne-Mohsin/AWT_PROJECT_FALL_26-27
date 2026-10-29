import { DesignVersionsService } from "@/modules/designs/design-versions.service";
import { DesignNotesService } from "@/modules/designs/design-notes.service";
import { Module } from "@nestjs/common";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunsService } from "@/modules/designs/runs.service";
import {
  DesignsController,
  DesignCatalogController,
} from "@/modules/designs/designs.controller";
import { SimulationModule } from "@/modules/simulation/simulation.module";
@Module({
  imports: [SimulationModule],
  providers: [DesignsService, RunsService, DesignVersionsService, DesignNotesService],
  exports: [DesignsService],
  controllers: [DesignsController, DesignCatalogController],
})
export class DesignsModule {}
