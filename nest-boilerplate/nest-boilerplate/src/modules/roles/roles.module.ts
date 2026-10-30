import { Module } from "@nestjs/common";
import { AccountRolesService } from "@/modules/roles/account-roles.service";
import { PermissionGuard } from "@/modules/roles/permission.guard";
import { AccountController, AdminController } from "@/modules/roles/roles.controller";

@Module({
  controllers: [AccountController, AdminController],
  providers: [AccountRolesService, PermissionGuard],
  exports: [AccountRolesService, PermissionGuard],
})
export class RolesModule {}
