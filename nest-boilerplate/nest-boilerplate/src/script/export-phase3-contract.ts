import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { phase3OpenApi } from "@/common/contracts/phase3/openapi";
const destination = resolve(
  __dirname,
  "../../../../docs/contracts/phase3.openapi.json",
);
const output = JSON.stringify(phase3OpenApi(), null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8").replace(/\r\n/g, "\n") !== output)
    throw new Error("Phase3 contract is stale");
} else writeFileSync(destination, output);
console.log("M11 contract matches canonical Zod schemas");
