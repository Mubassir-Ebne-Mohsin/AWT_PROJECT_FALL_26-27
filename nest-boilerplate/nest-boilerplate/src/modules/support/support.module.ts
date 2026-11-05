import { Module } from "@nestjs/common";
import { RolesModule } from "@/modules/roles/roles.module";
import { SupportInboxController, SupportReportsController } from "@/modules/support/support.controller";
import { SupportService } from "@/modules/support/support.service";

@Module({
  imports: [RolesModule],
  controllers: [SupportReportsController, SupportInboxController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
