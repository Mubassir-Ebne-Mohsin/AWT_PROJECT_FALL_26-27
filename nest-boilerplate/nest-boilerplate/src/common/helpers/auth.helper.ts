import { IRequest } from "@/common/interfaces/request.interface";
import { AuthUser } from "@/common/interfaces/auth-user.interface";

export const getCurrentUser = (req: IRequest): AuthUser | null =>
  req.user?.id ? req.user : null;
