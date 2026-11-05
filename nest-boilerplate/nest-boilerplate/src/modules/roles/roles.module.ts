import { Module } from "@nestjs/common";
import { AccountRolesService } from "@/modules/roles/account-roles.service";
import { AdminMetricsService } from "@/modules/roles/admin-metrics.service";
import { PermissionGuard } from "@/modules/roles/permission.guard";
import { AccountController, AdminController } from "@/modules/roles/roles.controller";

@Module({
  controllers: [AccountController, AdminController],
  providers: [AccountRolesService, AdminMetricsService, PermissionGuard],
  exports: [AccountRolesService, PermissionGuard],
})
export class RolesModule {}
