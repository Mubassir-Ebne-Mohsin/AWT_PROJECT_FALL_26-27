import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { RequirePermission } from "@/common/decorators/permission.decorator";
import { Permission } from "@/common/enums/account-role.enum";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { ReviewCommentsService } from "@/modules/reviews/review-comments.service";
import { ReviewGrantsService } from "@/modules/reviews/review-grants.service";

/** The design owner's side: share one frozen revision with one named Reviewer, list who has it, revoke at any time. */
@ApiTags("reviews")
@ApiBearerAuth()
@Controller("designs")
export class DesignReviewsController {
  constructor(
    private readonly grants: ReviewGrantsService,
    private readonly comments: ReviewCommentsService,
  ) {}

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

  /** The owner always reads the thread, even after the review is stopped. */
  @Get(":id/reviews/:grantId/comments")
  @Header("Cache-Control", "no-store")
  threadForOwner(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Param("grantId", ParseUUIDPipe) grantId: string) {
    return this.comments.listForOwner(u.id, id, grantId);
  }

  /** The owner replies to a Reviewer's comment; replies close when the review is stopped. */
  @Post(":id/reviews/:grantId/comments")
  reply(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("grantId", ParseUUIDPipe) grantId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.comments.reply(u.id, id, grantId, body);
  }
}

/** The Reviewer's side. Only the Reviewer role may call these, and only for grants made to their own account. */
@ApiTags("reviews")
@ApiBearerAuth()
@Controller("reviews")
export class ReviewsController {
  constructor(
    private readonly grants: ReviewGrantsService,
    private readonly comments: ReviewCommentsService,
  ) {}

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

  @Get(":id/comments")
  @RequirePermission(Permission.REVIEW_READ)
  @Header("Cache-Control", "no-store")
  thread(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.comments.listForReviewer(u.id, id);
  }

  @Post(":id/comments")
  @RequirePermission(Permission.REVIEW_READ)
  comment(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    return this.comments.create(u.id, id, body);
  }

  @Patch(":id/comments/:commentId")
  @RequirePermission(Permission.REVIEW_READ)
  edit(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("commentId", ParseUUIDPipe) commentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.comments.edit(u.id, id, commentId, body);
  }

  @Delete(":id/comments/:commentId")
  @HttpCode(200)
  @RequirePermission(Permission.REVIEW_READ)
  remove(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Param("commentId", ParseUUIDPipe) commentId: string) {
    return this.comments.remove(u.id, id, commentId);
  }
}
