import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Role } from "@/common/enums/role.enum";

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  username: z.string().optional(),
  hasPassword: z.boolean().optional(),
  socialAuthEnabled: z.boolean().optional(),
  role: z.enum(Role),
  createdAt: z.string(),
});

export class UserDto extends createZodDto(userResponseSchema) {}
