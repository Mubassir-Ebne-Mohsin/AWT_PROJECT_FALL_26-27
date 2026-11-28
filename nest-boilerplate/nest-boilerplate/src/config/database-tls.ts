import { readFileSync } from "node:fs";
/** Never allow certificate verification to be disabled for a managed database. */
export function databaseTls(enabled: boolean, caFile = "") {
  if (!enabled) return false;
  try { return { rejectUnauthorized: true, ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}) }; }
  catch { throw new Error("Cannot load DB_TLS_CA_FILE"); }
}
