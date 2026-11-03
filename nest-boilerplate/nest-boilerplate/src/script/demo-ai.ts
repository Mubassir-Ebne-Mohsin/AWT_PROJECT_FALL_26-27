// This import must stay first: it puts the demo settings in place before the configuration module is first imported.
import "./demo-ai-env";
import { demoProblems, demoSummary } from "@/modules/ai/demo-check";

/**
 * Starts the API for the demo with exactly the three AI design tasks (goal box, describe, what-if) switched on and nothing else AI on (docs/DEMO-SCRIPT.md):
 *   pnpm demo:ai       (builds first, then starts the compiled API)
 * It reads `.env` as usual, forces the demo AI settings over it, refuses to start if anything is wrong, and prints the effective
 * settings without the key. The shipped defaults are not changed: without this command every AI feature stays off.
 */
const problems = demoProblems(process.env);
for (const line of demoSummary(process.env)) console.log(line);
if (problems.length) {
  console.error("\nThe demo is NOT started. Fix this first:\n- " + problems.join("\n- "));
  process.exit(2);
}
console.log("\nStarting the API with the three AI design tasks on.\n");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- started only after the check above has passed
require("../main");
