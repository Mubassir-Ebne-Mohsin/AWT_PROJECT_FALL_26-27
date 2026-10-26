import { z } from "zod";
import type { Design } from "@/lib/api/designs";
export type Traffic = Design["traffic"];
// Mirrors the frozen server envelope; prototype controls use narrower ordinary ranges.
export const trafficSchema = z.object({
  preset: z.enum(["custom", "steady", "evening", "flash", "launch", "ingest"]),
  rps: z.number().min(0).max(1e7),
  burst: z.number().min(1).max(100),
  readRatio: z.number().min(0).max(1),
  sloP95: z.number().min(1).max(60000),
  errorBudget: z.number().min(0).max(1),
  durationMin: z.number().min(1).max(1440),
  shape: z.enum(["steady", "spike", "ramp"]),
});
export const sliderToRps = (v: number) =>
  Math.round(10 * Math.pow(5000, v / 1000));
export const rpsToSlider = (rps: number) =>
  Math.max(
    0,
    Math.min(1000, (1000 * Math.log(Math.max(10, rps) / 10)) / Math.log(5000)),
  );
export function numericTraffic(raw: string, min: number, max: number) {
  const n = Number(raw);
  return raw.trim() && Number.isFinite(n) && n >= min && n <= max
    ? n
    : undefined;
}
