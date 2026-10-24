let check: (() => boolean) | undefined;
export function registerDraftGuard(guard: () => boolean) {
  check = guard;
  return () => { if (check === guard) check = undefined; };
}
export function confirmDraftNavigation(path: string) {
  if (typeof window === "undefined" || !check?.()) return true;
  const current = location.pathname.match(/^\/designs\/([^/]+)/)?.[1];
  const next = new URL(path, location.href);
  if (current && next.origin === location.origin && next.pathname.startsWith("/designs/" + current + "/")) return true;
  return window.confirm("Leave with unsaved changes or an unconfirmed calculation? Memory-only recovery cannot survive a page reload.");
}
