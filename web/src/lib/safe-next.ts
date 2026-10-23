/** Only normalized, same-origin app paths are allowed as post-login destinations. */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/") || /[\\\x00-\x20\x7f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, "https://stressforge.invalid");
    if (url.origin !== "https://stressforge.invalid") return fallback;
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "");
    if (path === "/login" || path === "/register" || path.startsWith("//") || path.includes("\\")) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

export function authLink(path: "/login" | "/register", next: string) {
  return `${path}?next=${encodeURIComponent(safeNext(next))}`;
}
