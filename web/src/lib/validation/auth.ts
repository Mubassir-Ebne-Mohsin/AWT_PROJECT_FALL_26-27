import { z } from "zod";

// Mirrors the API's rules (nest-boilerplate/src/modules/auth/dto/auth.dto.ts) so
// mistakes are caught before a request is sent. The server stays the authority.
const email = z.string().trim().toLowerCase().min(1, "Enter your email").email("Enter a valid email address");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name").max(60, "Use 60 characters or fewer"),
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128, "Use at most 128 characters")
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "Include at least one letter and one number"),
  terms: z.literal(true, { error: "Accept the terms to create an account." }),
});

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** First message per field from a zod failure. */
export function fieldErrors<K extends string>(error: z.ZodError): FieldErrors<K> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    out[key] ??= issue.message;
  }
  return out as FieldErrors<K>;
}

export function passwordStrength(pw: string) {
  const score =
    (pw.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(pw) && /[a-z]/.test(pw) ? 1 : 0) +
    (/\d/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14 ? 1 : 0);
  return { score, word: ["Too short", "Weak", "Fair", "Good", "Strong"][pw ? score : 0] };
}
