import { Role } from "@/common/enums/role.enum";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
