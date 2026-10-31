import { Module } from "@nestjs/common";
import { DesignsModule } from "@/modules/designs/designs.module";
import { RolesModule } from "@/modules/roles/roles.module";
import { ReviewGrantsService } from "@/modules/reviews/review-grants.service";
import { DesignReviewsController, ReviewsController } from "@/modules/reviews/reviews.controller";

@Module({
  imports: [DesignsModule, RolesModule],
  controllers: [DesignReviewsController, ReviewsController],
  providers: [ReviewGrantsService],
})
export class ReviewsModule {}
