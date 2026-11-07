import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { Module } from "@nestjs/common";
import { RolesModule } from "@/modules/roles/roles.module";
import { SupportInboxController, SupportReportsController } from "@/modules/support/support.controller";
import { SavedRepliesService } from "@/modules/support/saved-replies.service";
import { MergeService } from "@/modules/support/merge.service";
import { SavedRepliesController } from "@/modules/support/saved-replies.controller";
import { SupportService } from "@/modules/support/support.service";

@Module({
  imports: [RolesModule, NotificationsModule],
  controllers: [SupportReportsController, SupportInboxController, SavedRepliesController],
  providers: [SupportService, SavedRepliesService, MergeService],
  exports: [SupportService],
})
export class SupportModule {}
