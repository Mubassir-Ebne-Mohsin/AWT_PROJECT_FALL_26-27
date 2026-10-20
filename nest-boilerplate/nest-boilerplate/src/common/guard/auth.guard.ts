import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService, TokenExpiredError } from "@nestjs/jwt";
import { IS_PUBLIC_KEY } from "@/common/decorators/public.decorator";
import { AppException } from "@/common/errors";
import { IRequest } from "@/common/interfaces/request.interface";
import { AccessTokenPayload } from "@/modules/auth/auth.types";
import { TokenStore } from "@/modules/auth/token-store.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly tokens: TokenStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<IRequest>();
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new AppException("UNAUTHENTICATED", "You are not signed in");
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch (e) {
      if (e instanceof TokenExpiredError) {
        throw new AppException("SESSION_EXPIRED", "Your session has expired");
      }
      throw new AppException("UNAUTHENTICATED", "Invalid access token");
    }

    if (
      payload.typ !== "access" ||
      (await this.tokens.isAccessRevoked(payload.jti))
    ) {
      throw new AppException("UNAUTHENTICATED", "Invalid access token");
    }

    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return true;
  }
}
