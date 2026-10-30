import { SetMetadata } from "@nestjs/common";
import { Permission } from "@/common/enums/account-role.enum";

export const PERMISSION_KEY = "required-permission";

/**
 * Requires a permission from the permission table. Checked against the account's roles in the database on every call
 * (never the token), so a revoked role stops working immediately.
 */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);
