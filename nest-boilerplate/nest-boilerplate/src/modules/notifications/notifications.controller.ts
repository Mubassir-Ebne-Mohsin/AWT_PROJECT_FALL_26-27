import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { NotificationsService } from "@/modules/notifications/notifications.service";
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: Record<string, unknown>) {
    return this.notifications.page(u.id, q);
  }
  @Get("unread-count") async count(@CurrentUser() u: AuthUser) {
    return {
      unreadCount: (await this.notifications.page(u.id, {})).unreadCount,
    };
  }
  @Get("preferences") preferences(@CurrentUser() u: AuthUser) {
    return this.notifications.preferences(u.id);
  }
  @Patch("preferences") preference(
    @CurrentUser() u: AuthUser,
    @Body() b: unknown,
  ) {
    return this.notifications.setPreference(u.id, b);
  }
  @Post("read-all") @HttpCode(200) readAll(@CurrentUser() u: AuthUser) {
    return this.notifications.read(u.id);
  }
  @Post(":id/read") @HttpCode(200) read(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.read(u.id, id);
  }
  @Post(":id/open") @HttpCode(200) open(
    @CurrentUser() u: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.open(u.id, id);
  }
}
