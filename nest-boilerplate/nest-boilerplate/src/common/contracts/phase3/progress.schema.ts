import { z } from "zod";
export const activityDateSchema = z.iso.date();
export const activityEventSchema = z.strictObject({
  id: z.uuid(), kind: z.enum(["simulation", "limits", "challenge"]),
  at: z.iso.datetime(), label: z.string(), href: z.string().startsWith("/"),
});
export const activityDaySchema = z.strictObject({
  date: activityDateSchema, simulation: z.number().int().nonnegative(),
  limits: z.number().int().nonnegative(), challenge: z.number().int().nonnegative(),
});
export const progressActivitySchema = z.strictObject({
  windowStart: z.iso.datetime(), windowEnd: z.iso.datetime(), timeZone: z.literal("UTC"),
  days: z.array(activityDaySchema).max(365),
  designsTested: z.number().int().nonnegative(), recent: z.array(activityEventSchema).max(12),
});
export const progressDaySchema = z.strictObject({
  date: activityDateSchema, events: z.array(activityEventSchema).max(100), hasMore: z.boolean(),
});
