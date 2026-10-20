import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Role } from "@/common/enums/role.enum";

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(Role),
  createdAt: z.string(),
});

export class UserDto extends createZodDto(userResponseSchema) {}
