import { Module } from "@nestjs/common";
import { UsersModule } from "@/modules/users/users.module";
import { AccountController } from "@/modules/account/account.controller";
import { AccountService } from "@/modules/account/account.service";

// TokenStore comes from the global AuthModule.
@Module({
  imports: [UsersModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
