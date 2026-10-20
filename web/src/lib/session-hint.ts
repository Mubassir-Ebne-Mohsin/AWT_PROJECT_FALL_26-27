// A non-secret "someone signed in here" cookie. The real refresh cookie is httpOnly and
// scoped to the API path, so Next's proxy cannot see it; this hint lets the proxy
// redirect signed-out visitors before the page renders. The API still enforces auth.
export const SESSION_HINT_COOKIE = "sf_session";

export function setSessionHint() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_HINT_COOKIE}=1; path=/; max-age=${7 * 86400}; samesite=lax`;
}

export function clearSessionHint() {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_HINT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function hasSessionHint() {
  return typeof document !== "undefined" && document.cookie.split("; ").some((c) => c.startsWith(`${SESSION_HINT_COOKIE}=`));
}
