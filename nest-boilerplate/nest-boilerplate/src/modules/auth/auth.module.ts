import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { appConfig } from "@/config";
import { UsersModule } from "@/modules/users/users.module";
import { AuthController } from "@/modules/auth/auth.controller";
import { AuthService } from "@/modules/auth/auth.service";
import { TokenStore } from "@/modules/auth/token-store.service";

// Global so the app-wide AuthGuard can resolve JwtService and TokenStore.
@Global()
@Module({
  imports: [
    UsersModule,
    // Default secret signs access tokens; refresh tokens pass their own secret.
    JwtModule.register({ secret: appConfig.env.JWT_ACCESS_SECRET }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenStore],
  exports: [JwtModule, TokenStore],
})
export class AuthModule {}
