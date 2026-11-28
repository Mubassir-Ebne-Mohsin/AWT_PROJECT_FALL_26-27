import { Module } from "@nestjs/common";
import { AuthModule } from "@/modules/auth/auth.module";
import { UsersModule } from "@/modules/users/users.module";
import { AccountModule } from "@/modules/account/account.module";
import { SocialController } from "@/modules/social/social.controller";
import { SocialStore } from "@/modules/social/social-store";
import { ProviderClient } from "@/modules/social/provider-client";
import { SocialFlowService } from "@/modules/social/social-flow.service";
import { SocialAccountService } from "@/modules/social/social-account.service";
@Module({
  imports: [AuthModule, UsersModule, AccountModule],
  controllers: [SocialController],
  providers: [
    SocialStore,
    ProviderClient,
    SocialFlowService,
    SocialAccountService,
  ],
})
export class SocialModule {}
