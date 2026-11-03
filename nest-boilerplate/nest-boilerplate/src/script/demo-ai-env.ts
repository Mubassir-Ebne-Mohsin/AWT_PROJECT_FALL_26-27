import * as dotenv from "dotenv";
import { applyDemoEnv } from "../modules/ai/demo-env";

/**
 * Loads `.env`, then forces the demo AI settings over it. A script imports this FIRST, as a side effect, so the settings are in place
 * before the configuration module reads the environment (it does so once, when it is first imported). Imports run in source order,
 * so this must stay the first import of every demo script.
 */
dotenv.config({ quiet: true });
applyDemoEnv();
