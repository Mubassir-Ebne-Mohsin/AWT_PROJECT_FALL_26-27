// Verifies that every path in the route registry (src/lib/routes.ts) has a page file in
// src/app, so no registry entry can silently become a 404. `--write` creates the missing
// ones as placeholder pages.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(join(root, "src/lib/routes.ts"), "utf8");
const paths = [...source.matchAll(/^\s*(?:pub|app)\(\s*"([^"]+)"/gm)].map((m) => m[1]);

const PLACEHOLDER = `import { RoutePlaceholder } from "@/components/placeholder";

export default function Page() {
  return <RoutePlaceholder />;
}
`;

const toFile = (p) => join(root, "src/app", p === "/" ? "" : p.replace(/:([a-z]+)/g, "[$1]"), "page.tsx");

let missing = 0;
for (const p of paths) {
  const file = toFile(p);
  if (existsSync(file)) continue;
  if (process.argv.includes("--write")) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, PLACEHOLDER);
    console.log("created", file.replace(root, ""));
  } else {
    missing++;
    console.error("missing page for", p);
  }
}
if (missing) process.exit(1);
console.log(`${paths.length} registry routes, all have a page file`);
