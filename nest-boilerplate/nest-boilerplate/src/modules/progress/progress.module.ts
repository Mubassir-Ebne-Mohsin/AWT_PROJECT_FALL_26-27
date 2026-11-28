import { Module } from "@nestjs/common";
import { ProgressController } from "@/modules/progress/progress.controller";
import { ProgressService } from "@/modules/progress/progress.service";
@Module({ controllers:[ProgressController], providers:[ProgressService] })
export class ProgressModule {}
