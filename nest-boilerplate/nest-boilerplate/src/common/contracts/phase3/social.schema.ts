import { z } from "zod";
import { registerSchema } from "@/modules/auth/dto/auth.dto";
import { newPasswordSchema } from "@/common/contracts/phase3/account.schema";
import { authSessionSchema } from "@/modules/auth/dto/auth.dto";
export const providerAvailabilitySchema = z.strictObject({
  google: z.boolean(),
  github: z.boolean(),
});
export const identitiesSchema = z.strictObject({
  hasPassword: z.boolean(),
  available: providerAvailabilitySchema,
  providers: z.array(
    z.strictObject({
      provider: z.enum(["google", "github"]),
      enabled: z.boolean(),
      linkedAt: z.iso.datetime(),
      lastUsedAt: z.iso.datetime(),
    }),
  ),
});
export const pendingSocialSchema = z.strictObject({
  email: z.email().nullable(),
  displayName: z.string(),
  csrf: z.string(),
});
export const completionSchema = z.strictObject({
  kind: z.enum(["login", "linked", "proof"]),
  next: z.string(),
  proof: z.string().optional(),
  owner: z.string().optional(),
  action: z.string().optional(),
});
export const proofSchema = z.strictObject({
  proof: z.string(),
  owner: z.string(),
  action: z.string(),
});
export const socialSessionSchema = authSessionSchema.extend({
  next: z.string().optional(),
});

export const socialActionSchema = z.enum([
  "link:google",
  "link:github",
  "unlink:google",
  "unlink:github",
  "set-password",
  "delete",
]);
const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const socialRegistrationSchema = registerSchema
  .omit({ email: true, password: true })
  .extend({ terms: z.literal(true), csrf: z.string().min(1) })
  .strict();
export const socialPasswordProofSchema = z.strictObject({
  password: z.string().min(1).max(128),
  action: socialActionSchema,
});
export const socialProofRequestSchema = z.strictObject({ proof });
export const socialReauthRequestSchema = z.strictObject({
  action: socialActionSchema,
});
export const socialPasswordRequestSchema = z.strictObject({
  proof,
  newPassword: newPasswordSchema,
});
export const socialDeleteRequestSchema = z.strictObject({
  proof,
  confirmation: z.literal("delete my account"),
});
