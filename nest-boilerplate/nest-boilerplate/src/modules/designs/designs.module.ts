import { DesignVersionsService } from "@/modules/designs/design-versions.service";
import { DesignNotesService } from "@/modules/designs/design-notes.service";
import { DesignLibraryService } from "@/modules/designs/design-library.service";
import { ReportService } from "@/modules/designs/report.service";
import { Module } from "@nestjs/common";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunsService } from "@/modules/designs/runs.service";
import {
  DesignsController,
  DesignCatalogController,
  DesignLibraryController,
} from "@/modules/designs/designs.controller";
import { SimulationModule } from "@/modules/simulation/simulation.module";
@Module({
  imports: [SimulationModule],
  providers: [DesignsService, RunsService, DesignVersionsService, DesignNotesService, DesignLibraryService, ReportService],
  exports: [DesignsService],
  controllers: [DesignsController, DesignCatalogController, DesignLibraryController],
})
export class DesignsModule {}
