import type { appConfig } from "@/config/app.config";
type Environment = typeof appConfig.env;
/** Names/reasons only: never include configured values in an error. */
export function hostingIssues(env: Environment): string[] {
  const issues: string[] = [];
  if (env.NODE_ENV !== "production") issues.push("NODE_ENV must be production");
  let origin: string | undefined;
  try {
    const u = new URL(env.FRONTEND_URL);
    if (!u.hostname.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) || u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.pathname !== "/") throw Error();
    origin = u.origin;
    if (u.hostname !== env.HOSTED_PUBLIC_HOST) issues.push("HOSTED_PUBLIC_HOST must match FRONTEND_URL hostname");
  } catch { issues.push("FRONTEND_URL must be one HTTPS origin"); }
  if (!origin || env.CORS_ORIGIN_LIST.length !== 1 || env.CORS_ORIGIN_LIST[0] !== origin)
    issues.push("CORS_ORIGINS must exactly match FRONTEND_URL");
  if (env.TRUST_PROXY_HOPS !== 1) issues.push("TRUST_PROXY_HOPS must be 1 for the single-proxy topology");
  if (!env.DB_TLS && !(env.HOSTED_PRIVATE_NETWORK && env.DB_HOST === "postgres"))
    issues.push("DB_TLS required outside the explicit private postgres service");
  if (!env.REDIS_TLS && !(env.HOSTED_PRIVATE_NETWORK && env.REDIS_HOST === "redis"))
    issues.push("REDIS_TLS required outside the explicit private redis service");
  for (const name of ["DB_PASSWORD", "REDIS_PASSWORD"] as const)
    if ((env[name]?.length ?? 0) < 24 || /replace.me|change.me/i.test(env[name] ?? ""))
      issues.push(`${name} must be generated privately with at least 24 characters`);
  for (const name of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const)
    if (/change.me|replace.me|example/i.test(env[name])) issues.push(`${name} must be generated privately`);
  return issues;
}
export function assertHostedConfiguration(env: Environment) {
  if (!env.HOSTED_MODE) return;
  const issues = hostingIssues(env);
  if (issues.length) throw new Error("Invalid hosted configuration: " + issues.join("; "));
}
