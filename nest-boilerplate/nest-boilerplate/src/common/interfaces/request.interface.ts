import { Request } from "express";
import { AuthUser } from "@/common/interfaces/auth-user.interface";

export interface IRequest extends Request {
  user?: AuthUser;
}
