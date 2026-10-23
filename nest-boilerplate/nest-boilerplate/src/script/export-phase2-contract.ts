import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { phase2OpenApi } from "@/common/contracts/phase2/openapi";

import { phase2Examples } from "@/src/script/phase2-examples";

const destination = resolve(__dirname, "../../../../docs/contracts/phase2.openapi.json");
const output = JSON.stringify(phase2OpenApi(), null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8").replace(/\r\n/g, "\n") !== output) {
    throw new Error("Phase 2 OpenAPI is stale; run pnpm contract:phase2");
  }
  console.log("Phase 2 OpenAPI matches canonical Zod schemas");
} else {
  writeFileSync(destination, output);
  console.log("Exported planned Phase 2 OpenAPI (no live endpoints added)");
}

const examplesDestination = resolve(__dirname, "../../../../docs/contracts/examples.json");
const examples = JSON.stringify(phase2Examples(), null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(examplesDestination, "utf8").replace(/\r\n/g, "\n") !== examples) throw new Error("Phase 2 examples are stale");
  console.log("Source-derived contract examples match schemas");
} else { writeFileSync(examplesDestination, examples); }
