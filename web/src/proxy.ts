import { NextRequest, NextResponse } from "next/server";
import { isProtected, resolveRoute } from "@/lib/routes";
import { SESSION_HINT_COOKIE } from "@/lib/session-hint";

// Next 16 renamed middleware to proxy. This is an optimistic check only: it sends visitors
// without the (non-secret) session hint cookie to /login before a protected page renders.
// The API is the real gate; the client AuthGate and every API call verify the session.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { route } = resolveRoute(pathname);
  if (isProtected(route) && !request.cookies.has(SESSION_HINT_COOKIE)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"],
};
