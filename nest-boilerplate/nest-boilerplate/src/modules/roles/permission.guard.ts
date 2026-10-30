import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_KEY } from "@/common/decorators/permission.decorator";
import { Permission, hasPermission } from "@/common/enums/account-role.enum";
import { AppException } from "@/common/errors";
import { IRequest } from "@/common/interfaces/request.interface";
import { AccountRolesService } from "@/modules/roles/account-roles.service";

/**
 * Enforces `@RequirePermission`. The account's roles come from the database on every call (never the token), so
 * revoking a role takes effect at once even while the account still holds a valid token. A route that declares no
 * permission is untouched, and the legacy ranked `RolesGuard` keeps its own behaviour.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly roles: AccountRolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const needed = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!needed) return true;
    const user = context.switchToHttp().getRequest<IRequest>().user;
    if (!user) throw new AppException("UNAUTHENTICATED", "You are not signed in");
    if (!hasPermission(await this.roles.rolesOf(user.id), needed)) throw new AppException("FORBIDDEN", "You do not have permission to do that");
    return true;
  }
}
