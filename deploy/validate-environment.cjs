const names = ["POSTGRES_ADMIN_PASSWORD", "APP_DB_PASSWORD", "MIGRATION_DB_PASSWORD", "REDIS_PASSWORD", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
function validate(environment) {
  const issues = [];
  try {
    const url = new URL(environment.PUBLIC_ORIGIN);
    if (!url.hostname.split(".").every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) || url.protocol !== "https:" || url.origin !== environment.PUBLIC_ORIGIN || url.username || url.password || url.hostname !== environment.PUBLIC_HOST || url.pathname !== "/") throw Error();
  } catch { issues.push("PUBLIC_ORIGIN and PUBLIC_HOST must describe the same HTTPS origin/hostname"); }
  const seen = new Set();
  for (const name of names) {
    const value = environment[name] ?? "";
    if (value.length < (name.startsWith("JWT_") ? 32 : 24) || /replace.me|change.me|example/i.test(value)) issues.push(name + " must be generated privately");
    if (seen.has(value)) issues.push(name + " must differ from the other credentials");
    seen.add(value);
  }
  return issues;
}
module.exports = { validate };
if (require.main === module) {
  const issues = validate(process.env);
  if (issues.length) { console.error("Invalid deployment configuration: " + issues.join("; ")); process.exitCode=1; }
  else console.log("Hosting environment validated; no values displayed");
}
