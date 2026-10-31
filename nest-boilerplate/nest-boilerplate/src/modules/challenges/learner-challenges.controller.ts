import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  HttpCode,
} from "@nestjs/common";
import { CurrentUser } from "@/common/decorators";
import { Public } from "@/common/decorators/public.decorator";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { AppException } from "@/common/errors";
import { submitAttemptSchema } from "@/common/contracts/phase3/attempts.schema";
import { LearnerChallengesService } from "@/modules/challenges/learner-challenges.service";
@Controller()
export class LearnerChallengesController {
  constructor(private readonly learners: LearnerChallengesService) {}
  @Public() @Get("challenges") list() {
    return this.learners.list();
  }
  @Public() @Get("challenges/:id") detail(
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.learners.detail(id);
  }
  @Post("challenges/:id/attempt")
  @HttpCode(200)
  start(@CurrentUser() u: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.learners.start(u.id, id);
  }
  @Get("attempts/:id") own(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.learners.own(u.id, id);
  }
  @Post("attempts/:id/submissions")
  @HttpCode(202)
  submit(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = submitAttemptSchema.safeParse(body);
    if (!parsed.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "A saved revision and request identity are required",
      );
    return this.learners.submit(u.id, id, parsed.data);
  }
  @Get("progress/challenges") progress(@CurrentUser() u: AuthUser) {
    return this.learners.progress(u.id);
  }
}
