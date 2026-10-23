import { BOUNDS, importSchema } from "@/common/contracts/phase2/graph.schema";

/** Boundary parsing only. Layout/default completion belongs to M2/M4. */
export function parseImportText(text: string) {
  if (Buffer.byteLength(text, "utf8") > BOUNDS.importBytes) throw new RangeError("Import exceeds 64 KiB");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new SyntaxError("Invalid design JSON"); }
  return importSchema.parse(value);
}
