import type { components } from "@/lib/api/schema";
import { ApiError, ApiErrorCode } from "@/lib/api/errors";
import { apiEvents } from "@/lib/api/events";
import { clearSessionHint, setSessionHint } from "@/lib/session-hint";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001/v1").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 15_000;

export type AuthSession = components["schemas"]["AuthSessionDto"];
export type User = AuthSession["user"];

// The access token lives in memory only: gone on reload, restored by the refresh cookie.
let accessToken: string | null = null;
export const getAccessToken = () => accessToken;

type SessionListener = (user: User | null) => void;
const sessionListeners = new Set<SessionListener>();
export const onSessionChange = (fn: SessionListener) => {
  sessionListeners.add(fn);
  return () => {
    sessionListeners.delete(fn);
  };
};

export function adoptSession(session: AuthSession) {
  accessToken = session.accessToken;
  setSessionHint();
  sessionListeners.forEach((fn) => fn(session.user));
}

/** Explicit sign-out: forget everything and tell the UI. */
export function dropSession() {
  forgetToken();
  sessionListeners.forEach((fn) => fn(null));
}

/** The server no longer honours our session. Forget the token but let the UI decide what to show. */
function forgetToken() {
  accessToken = null;
  clearSessionHint();
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Attach the access token and refresh once on 401. Default true. */
  auth?: boolean;
  /** Skip system-state screens for server errors: the caller shows them inline (forms). */
  silent?: boolean;
  /**
   * "local": failures of this request (network, 403, 404, 429, 5xx) stay with the caller and never open a
   * system-state screen, so an optional feature such as AI cannot replace the workspace. Session expiry is
   * still announced globally so the existing re-authentication flow keeps working. Default "global".
   */
  scope?: "global" | "local";
  /** Return the whole `{ data, meta }` envelope instead of only `data` (paged lists). */
  envelope?: boolean;
  signal?: AbortSignal;
}

const FALLBACK_CODE: Record<number, ApiErrorCode> = {
  409: "CONFLICT",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  422: "VALIDATION_FAILED",
  429: "RATE_LIMITED",
  500: "INTERNAL",
  502: "UNAVAILABLE",
  503: "UNAVAILABLE",
  504: "UNAVAILABLE",
};

async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  try {
    return await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "include",
      signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e; // the caller cancelled: not an outage
    if (opts.scope !== "local") apiEvents.emit("unreachable");
    throw new ApiError("NETWORK", "Could not reach the server", 0);
  }
}

async function toError(res: Response): Promise<ApiError> {
  let body: Partial<components["schemas"]["ErrorResponseDto"]> | null = null;
  try {
    body = await res.json();
  } catch {
    // A proxy or gateway answered with HTML: fall back to the status code.
  }
  const e = body?.error;
  return new ApiError(
    e?.code ?? FALLBACK_CODE[res.status] ?? "INTERNAL",
    e?.message ?? res.statusText ?? "Request failed",
    res.status,
    e?.details,
  );
}

function announce(err: ApiError, silent?: boolean, scope?: "global" | "local") {
  if (silent) return;
  if (scope === "local") {
    if (err.code === "SESSION_EXPIRED") apiEvents.emit("session-expired");
    return;
  }
  if (err.code === "INTERNAL") apiEvents.emit("server-error");
  else if (err.code === "SESSION_EXPIRED") apiEvents.emit("session-expired");
  else if (err.code === "RATE_LIMITED") apiEvents.emit("rate-limited");
  else if (err.code === "NOT_FOUND") apiEvents.emit("not-found");
  else if (err.code === "FORBIDDEN") apiEvents.emit("forbidden");
  else if (err.code === "UNAVAILABLE") apiEvents.emit("unreachable");
}

export type RefreshResult =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: "signed-out" | "unreachable" | "rate-limited" | "failed"; error?: ApiError };

/** Web Locks serialize cookie rotation across same-origin tabs. Each tab gets its own
 * in-memory access token using the latest httpOnly cookie; no token is broadcast or stored.
 * Without Web Locks, the per-module single flight below is the best available fallback.
 */
async function coordinateRefresh<T>(run: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request("stressforge-auth-refresh", run);
  }
  return run();
}

let inflightRefresh: Promise<RefreshResult> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Single-flight: concurrent callers
 * share one request, because the server rotates the cookie and rejects a replay.
 */
export function refreshSession(): Promise<RefreshResult> {
  inflightRefresh ??= coordinateRefresh(async (): Promise<RefreshResult> => {
    try {
      const res = await send("/auth/refresh", { method: "POST", auth: false }, null);
      if (res.ok) {
        const session = ((await res.json()) as { data: AuthSession }).data;
        if (!session || typeof session.accessToken !== "string" || !session.accessToken ||
          !session.user || typeof session.user.id !== "string" || typeof session.user.email !== "string" ||
          typeof session.user.displayName !== "string") {
          throw new Error("Invalid refresh response");
        }
        adoptSession(session);
        return { ok: true, session };
      }
      if (res.status >= 500) {
        apiEvents.emit("unreachable");
        return { ok: false, reason: "unreachable" };
      }
      const error = await toError(res);
      if (res.status === 401) {
        forgetToken();
        return { ok: false, reason: "signed-out", error };
      }
      announce(error);
      return { ok: false, reason: res.status === 429 ? "rate-limited" : "failed", error };
    } catch (error) {
      if (!(error instanceof ApiError && error.code === "NETWORK")) apiEvents.emit("unreachable");
      return { ok: false, reason: "unreachable" };
    }
  }).finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

/** Typed fetch: attaches the token, unwraps `{ data }`, throws ApiError, refreshes once on 401. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const hadSession = accessToken !== null;
  let res = await send(path, opts, accessToken);

  if (res.status === 401 && opts.auth !== false && hadSession) {
    const refreshed = await refreshSession();
    if (refreshed.ok) {
      res = await send(path, opts, accessToken);
      if (res.status === 401) {
        forgetToken();
        apiEvents.emit("session-expired");
        throw await toError(res);
      }
    } else if (refreshed.reason === "signed-out") {
      // One retry is all we do: the session is really gone.
      apiEvents.emit("session-expired");
      throw await toError(res);
    } else {
      // A temporary refresh failure must not masquerade as an invalid session.
      throw refreshed.error ?? new ApiError("NETWORK", "Could not restore the session", 0);
    }
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    const body = (await res.json()) as { data: T };
    return opts.envelope ? (body as T) : body.data;
  }
  const err = await toError(res);
  announce(err, opts.silent, opts.scope);
  throw err;
}
