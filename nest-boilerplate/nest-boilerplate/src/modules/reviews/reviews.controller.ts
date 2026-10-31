import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { RequirePermission } from "@/common/decorators/permission.decorator";
import { Permission } from "@/common/enums/account-role.enum";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { ReviewGrantsService } from "@/modules/reviews/review-grants.service";

/** The design owner's side: share one frozen revision with one named Reviewer, list who has it, revoke at any time. */
@ApiTags("reviews")
@ApiBearerAuth()
@Controller("designs")
export class DesignReviewsController {
  constructor(private readonly grants: ReviewGrantsService) {}

  @Post(":id/reviews")
  create(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    return this.grants.create(u.id, id, body);
  }

  @Get(":id/reviews")
  list(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.grants.list(u.id, id);
  }

  @Post(":id/reviews/:grantId/revoke")
  @HttpCode(200)
  revoke(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Param("grantId", ParseUUIDPipe) grantId: string) {
    return this.grants.revoke(u.id, id, grantId);
  }
}

/** The Reviewer's side. Only the Reviewer role may call these, and only for grants made to their own account. */
@ApiTags("reviews")
@ApiBearerAuth()
@Controller("reviews")
export class ReviewsController {
  constructor(private readonly grants: ReviewGrantsService) {}

  @Get("shared-with-me")
  @RequirePermission(Permission.REVIEW_READ)
  @Header("Cache-Control", "no-store")
  sharedWithMe(@CurrentUser() u: AuthUser) {
    return this.grants.sharedWithMe(u.id);
  }

  @Get(":id")
  @RequirePermission(Permission.REVIEW_READ)
  @Header("Cache-Control", "no-store")
  view(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.grants.view(u.id, id);
  }
}
