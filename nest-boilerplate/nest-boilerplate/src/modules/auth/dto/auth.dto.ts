import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { userResponseSchema } from "@/modules/users/dto/user.dto";

import { usernameSchema } from "@/common/contracts/username.schema";

const email = z.string().trim().toLowerCase().max(254).email();

const newPassword = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  // One pattern (not two) keeps the generated OpenAPI type a plain string.
  .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "Include at least one letter and one number");

export const registerSchema = z.object({
  email,
  password: newPassword,
  username: usernameSchema.optional(),
  displayName: z.string().trim().min(1, "Enter a display name").max(60),
});

export const loginSchema = z.object({
  email,
  // No strength rules on login: only the stored hash decides.
  password: z.string().min(1, "Enter your password").max(128),
});

export const authSessionSchema = z.object({
  accessToken: z.string(),
  /** Access token lifetime in seconds. */
  expiresIn: z.number().int(),
  user: userResponseSchema,
});

export class RegisterDto extends createZodDto(registerSchema) {}
export class UsernameCheckDto extends createZodDto(z.strictObject({ username: usernameSchema })) {}
export class UsernameAvailabilityDto extends createZodDto(z.object({ available: z.boolean() })) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class AuthSessionDto extends createZodDto(authSessionSchema) {}
