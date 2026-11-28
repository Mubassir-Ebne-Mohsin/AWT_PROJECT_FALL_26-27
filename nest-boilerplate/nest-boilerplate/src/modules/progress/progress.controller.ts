import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "@/common/decorators";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { ProgressService } from "@/modules/progress/progress.service";
@Controller("progress/activity")
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}
  @Get() activity(@CurrentUser() user: AuthUser) { return this.progress.activity(user.id); }
  @Get("day") day(@CurrentUser() user: AuthUser, @Query("date") date: unknown) { return this.progress.day(user.id,date); }
}
