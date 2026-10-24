import { z } from "zod";
import { createDesignSchema } from "@/common/contracts/phase2/api.schema";
import { region } from "@/common/contracts/phase2/graph.schema";
export const prepareDesignSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("blank"),
    name: z.string().trim().min(1).max(100),
    region,
    start: z.enum(["clients", "empty"]),
    preset: z.enum(["steady", "evening", "flash", "launch", "ingest"]),
  }),
  z.strictObject({ source: z.literal("import"), text: z.string().max(65536) }),
  z.strictObject({
    source: z.literal("scripted"),
    text: z.string().trim().min(1).max(1000),
  }),
]);
export const preparedDesignSchema = z.strictObject({
  design: createDesignSchema,
  assumptions: z.array(z.string().max(300)).max(10),
});
export type PrepareDesign = z.infer<typeof prepareDesignSchema>;
