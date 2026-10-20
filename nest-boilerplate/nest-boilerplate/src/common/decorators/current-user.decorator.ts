import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { IRequest } from "@/common/interfaces/request.interface";
import { getCurrentUser } from "@/common/helpers/auth.helper";
import { AppException } from "@/common/errors";

/** The authenticated user attached by AuthGuard. Throws 401 if the route was left unguarded. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const user = getCurrentUser(context.switchToHttp().getRequest<IRequest>());
    if (!user) throw new AppException("UNAUTHENTICATED", "You are not signed in");
    return user;
  },
);

export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    getCurrentUser(context.switchToHttp().getRequest<IRequest>()),
);
