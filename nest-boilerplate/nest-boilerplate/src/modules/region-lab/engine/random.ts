import { createHash } from "node:crypto";
import type { Distribution } from "@/modules/region-lab/engine/input";

/** Portable, stateless keyed stream: SHA256(UTF8(JSON.stringify([seed,...keys]))), first BE uint32. */
export function uniform(seed: number, ...keys: (string | number)[]): number {
  const bytes = createHash("sha256")
    .update(JSON.stringify([seed, ...keys]), "utf8")
    .digest();
  return (bytes.readUInt32BE(0) + 0.5) / 4294967296;
}

export function sample(
  distribution: Distribution,
  seed: number,
  ...keys: (string | number)[]
): number {
  if (distribution.kind === "constant") return distribution.valueMs;
  const u = uniform(seed, ...keys, "u");
  if (distribution.kind === "exponential")
    return -Math.log(u) * distribution.meanMs;
  const sigma2 = Math.log(1 + distribution.coefficientOfVariation ** 2);
  const normal =
    Math.sqrt(-2 * Math.log(u)) *
    Math.cos(2 * Math.PI * uniform(seed, ...keys, "v"));
  return Math.exp(
    Math.log(distribution.meanMs) - sigma2 / 2 + Math.sqrt(sigma2) * normal,
  );
}

export function choose<T>(
  items: readonly T[],
  weight: (item: T) => number,
  u: number,
): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let needle = u * total;
  for (const item of items) {
    needle -= weight(item);
    if (needle < 0) return item;
  }
  return items[items.length - 1];
}
