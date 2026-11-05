import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { RequirePermission } from "@/common/decorators/permission.decorator";
import { Permission } from "@/common/enums/account-role.enum";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { SupportService } from "@/modules/support/support.service";

/** Any signed-in account may write a report and read its own. There is no route here that reaches another account's report. */
@ApiTags("support")
@ApiBearerAuth()
@Controller("support/reports")
export class SupportReportsController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.support.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.support.listOwn(user.id);
  }

  @Get(":id")
  one(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.support.own(user.id, id);
  }

  @Post(":id/messages")
  message(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.support.addMessage(user, id, body);
  }
}

/** The Support inbox. Every route declares its permission; the Admin role holds neither, so an Admin alone is refused. */
@ApiTags("support")
@ApiBearerAuth()
@Controller("support")
export class SupportInboxController {
  constructor(private readonly support: SupportService) {}

  @Get("agents")
  @RequirePermission(Permission.SUPPORT_INBOX_READ)
  agents() {
    return this.support.agents();
  }

  @Get("inbox")
  @RequirePermission(Permission.SUPPORT_INBOX_READ)
  inbox(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.support.inbox(user, query);
  }

  @Get("inbox/:id")
  @RequirePermission(Permission.SUPPORT_INBOX_READ)
  detail(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.support.detail(user, id);
  }

  @Post("inbox/:id/read")
  @HttpCode(200)
  @RequirePermission(Permission.SUPPORT_INBOX_READ)
  read(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.support.markRead(user, id);
  }

  @Post("inbox/:id/messages")
  @RequirePermission(Permission.SUPPORT_INBOX_REPLY)
  reply(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.support.reply(user, id, body);
  }

  @Patch("inbox/:id")
  @RequirePermission(Permission.SUPPORT_INBOX_REPLY)
  update(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.support.update(user, id, body);
  }
}
