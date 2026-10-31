import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { RequirePermission } from "@/common/decorators/permission.decorator";
import { Permission } from "@/common/enums/account-role.enum";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { InstructorSubmissionsService } from "@/modules/challenges/instructor-submissions.service";

/** R5.3: the Instructor reads graded submissions to their own challenges and leaves one-way feedback. */
@ApiTags("instructor")
@ApiBearerAuth()
@Controller("instructor")
export class InstructorSubmissionsController {
  constructor(private readonly submissions: InstructorSubmissionsService) {}

  @Get("challenges/:id/submissions")
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  list(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.submissions.list(u.id, id);
  }

  @Get("submissions/:id")
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  detail(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.submissions.detail(u.id, id);
  }

  @Post("submissions/:id/feedback")
  @RequirePermission(Permission.CHALLENGE_MANAGE)
  feedback(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    return this.submissions.addFeedback(u.id, id, body);
  }
}
