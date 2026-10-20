import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "@/common/decorators/roles.decorator";
import { Role, RoleHierarchy } from "@/common/enums/role.enum";
import { AppException } from "@/common/errors";
import { IRequest } from "@/common/interfaces/request.interface";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<IRequest>().user;
    if (!user) throw new AppException("UNAUTHENTICATED", "You are not signed in");

    const rank = RoleHierarchy[user.role] ?? 0;
    if (!required.some((r) => rank >= RoleHierarchy[r])) {
      throw new AppException("FORBIDDEN", "You do not have permission to do that");
    }
    return true;
  }
}
