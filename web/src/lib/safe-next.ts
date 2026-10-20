/** Only same-site paths may be used as a post-login destination (blocks open redirects). */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (raw === "/login" || raw === "/register" || raw.startsWith("/login?") || raw.startsWith("/register?")) return fallback;
  return raw;
}
