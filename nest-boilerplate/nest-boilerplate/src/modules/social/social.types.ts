import { z } from "zod";
import { AppException } from "@/common/errors";
export const providerSchema = z.enum(["google", "github"]);
export type Provider = z.infer<typeof providerSchema>;
export type VerifiedIdentity = {
  provider: Provider;
  subject: string;
  email: string | null;
  verified: boolean;
  name: string;
};
export { socialActionSchema as actionSchema } from "@/common/contracts/phase3/social.schema";
import { socialActionSchema as actionSchema } from "@/common/contracts/phase3/social.schema";
export type SocialAction = z.infer<typeof actionSchema>;
export function providerOf(raw: unknown): Provider {
  const p = providerSchema.safeParse(raw);
  if (!p.success)
    throw new AppException("VALIDATION_FAILED", "Unsupported sign-in provider");
  return p.data;
}
export function safeReturn(raw: unknown) {
  if (
    typeof raw !== "string" ||
    !raw.startsWith("/") ||
    /[\\\x00-\x20\x7f]/.test(raw)
  )
    return "/dashboard";
  try {
    const u = new URL(raw, "https://stressforge.invalid"),
      p = decodeURIComponent(u.pathname);
    if (
      u.origin !== "https://stressforge.invalid" ||
      p.startsWith("//") ||
      /[\\\x00-\x20\x7f]/.test(p) ||
      /^\/(auth|login|register)(\/|$)/.test(p)
    )
      return "/dashboard";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/dashboard";
  }
}
