import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCatalog } from "@/modules/simulation/engine/templates";

it("the frontend canvas fixture matches the authoritative catalog and allowed properties", () => {
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), "../../web/tests/fixtures/canvas-catalog.json"), "utf8"));
  expect(fixture).toEqual(getCatalog());
});
