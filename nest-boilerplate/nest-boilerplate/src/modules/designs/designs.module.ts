import { DesignVersionsService } from "@/modules/designs/design-versions.service";
import { DesignNotesService } from "@/modules/designs/design-notes.service";
import { DesignLibraryService } from "@/modules/designs/design-library.service";
import { ReportService } from "@/modules/designs/report.service";
import { DesignSharesService } from "@/modules/designs/design-shares.service";
import { Module } from "@nestjs/common";
import { FixesService } from "@/modules/designs/fixes.service";
import { LadderService } from "@/modules/designs/ladder.service";
import { WhatIfService } from "@/modules/designs/what-if.service";
import { DesignsService } from "@/modules/designs/designs.service";
import { RunsService } from "@/modules/designs/runs.service";
import {
  DesignsController,
  DesignCatalogController,
  DesignLibraryController,
  SharesController,
} from "@/modules/designs/designs.controller";
import { SimulationModule } from "@/modules/simulation/simulation.module";
@Module({
  imports: [SimulationModule],
  providers: [DesignsService, RunsService, FixesService, LadderService, WhatIfService, DesignVersionsService, DesignNotesService, DesignLibraryService, ReportService, DesignSharesService],
  exports: [DesignsService, ReportService],
  controllers: [DesignsController, DesignCatalogController, DesignLibraryController, SharesController],
})
export class DesignsModule {}
