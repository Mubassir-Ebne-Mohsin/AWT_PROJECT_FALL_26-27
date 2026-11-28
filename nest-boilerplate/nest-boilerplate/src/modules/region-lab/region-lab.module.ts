import { RegionResults } from "@/modules/region-lab/results/region-results.service";
import { Module } from "@nestjs/common";
import {
  RegionController,
  RegionSchemaGuard,
} from "@/modules/region-lab/region.controller";
import { RegionStore } from "@/modules/region-lab/region-store.service";
import { RegionJobs } from "@/modules/region-lab/region-jobs.service";
import { RegionExecutor } from "@/modules/region-lab/worker/region-executor";
@Module({
  controllers: [RegionController],
  providers: [
    RegionStore,
    RegionResults,
    RegionSchemaGuard,
    RegionJobs,
    { provide: RegionExecutor, useFactory: () => new RegionExecutor() },
  ],
  exports: [RegionStore],
})
export class RegionLabModule {}
