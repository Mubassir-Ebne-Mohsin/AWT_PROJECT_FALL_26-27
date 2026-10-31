import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { RequirePermission } from "@/common/decorators/permission.decorator";
import { Permission } from "@/common/enums/account-role.enum";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { ChallengesService } from "@/modules/challenges/challenges.service";

/** The Instructor's own challenges. Every route needs the Instructor permission, and only the owner can see a challenge. */
@ApiTags("instructor")
@ApiBearerAuth()
@Controller("instructor/challenges")
export class InstructorChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Post()
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  create(@CurrentUser() u: AuthUser, @Body() body: Record<string, unknown>) {
    return this.challenges.create(u.id, body);
  }

  @Get()
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  list(@CurrentUser() u: AuthUser) {
    return this.challenges.list(u.id);
  }

  @Get(":id")
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  get(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.challenges.get(u.id, id);
  }

  @Patch(":id")
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  patch(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    return this.challenges.patch(u.id, id, body);
  }

  @Post(":id/publish")
  @HttpCode(200)
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  publish(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.challenges.publish(u.id, id);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  archive(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.challenges.archive(u.id, id);
  }

  @Post(":id/duplicate")
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  duplicate(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.challenges.duplicate(u.id, id);
  }
}
