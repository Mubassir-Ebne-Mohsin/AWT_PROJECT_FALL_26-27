import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { RequirePermission } from "@/common/decorators/permission.decorator";
import { Permission } from "@/common/enums/account-role.enum";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { AccountRolesService } from "@/modules/roles/account-roles.service";

/** The signed-in account's own roles, read from the database. Any signed-in account may ask. */
@ApiTags("account")
@ApiBearerAuth()
@Controller("account")
export class AccountController {
  constructor(private readonly roles: AccountRolesService) {}

  @Get("roles")
  async mine(@CurrentUser() user: AuthUser) {
    return { roles: await this.roles.rolesOf(user.id) };
  }
}

/** Admin-only account and role management. Every route declares its permission; none can read design content. */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
export class AdminController {
  constructor(private readonly roles: AccountRolesService) {}

  @Get("users")
  @RequirePermission(Permission.ADMIN_USERS_READ)
  search(@Query() query: Record<string, unknown>) {
    return this.roles.search(query);
  }

  @Post("users/:id/suspend")
  @HttpCode(200)
  @RequirePermission(Permission.ADMIN_USERS_SUSPEND)
  suspend(@CurrentUser() actor: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.roles.suspend({ id: actor.id, email: actor.email }, id);
  }

  @Post("users/:id/restore")
  @HttpCode(200)
  @RequirePermission(Permission.ADMIN_USERS_SUSPEND)
  restore(@CurrentUser() actor: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.roles.restore({ id: actor.id, email: actor.email }, id);
  }

  @Get("users/lookup")
  @RequirePermission(Permission.ADMIN_USERS_READ)
  lookup(@Query() query: Record<string, unknown>) {
    return this.roles.lookup(query);
  }

  @Get("users/:id/roles")
  @RequirePermission(Permission.ADMIN_USERS_READ)
  rolesOf(@Param("id", ParseUUIDPipe) id: string) {
    return this.roles.rolesFor(id);
  }

  @Post("users/:id/roles")
  @HttpCode(200)
  @RequirePermission(Permission.ADMIN_ROLES_GRANT)
  grant(@CurrentUser() actor: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    return this.roles.grant({ id: actor.id, email: actor.email }, id, body);
  }

  @Delete("users/:id/roles/:role")
  @RequirePermission(Permission.ADMIN_ROLES_GRANT)
  revoke(@CurrentUser() actor: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Param("role") role: string) {
    return this.roles.revoke({ id: actor.id, email: actor.email }, id, role);
  }

  @Get("audit")
  @RequirePermission(Permission.ADMIN_AUDIT_READ)
  audit(@Query() query: Record<string, unknown>) {
    return this.roles.listAudit(query);
  }
}
