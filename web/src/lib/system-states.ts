// Port of the prototype's SYSTEM_STATES (SECTION 6). `code` is the badge on the page;
// `api` is the backend error code that opens the state for real.
export type SystemKind =
  | "404"
  | "403"
  | "500"
  | "waking"
  | "quota"
  | "ratelimited"
  | "session"
  | "simfail"
  | "aiinvalid"
  | "maintenance";

export interface SystemStateDef {
  id: SystemKind;
  code: string;
  label: string;
  icon: string;
  api?: string;
}

export const SYSTEM_STATES: SystemStateDef[] = [
  { id: "404", code: "HTTP 404", label: "Not found", icon: "search", api: "NOT_FOUND" },
  { id: "403", code: "HTTP 403", label: "Not your design", icon: "lock", api: "FORBIDDEN" },
  { id: "500", code: "HTTP 500", label: "Server error", icon: "alert", api: "INTERNAL" },
  { id: "waking", code: "503 cold start", label: "Server waking up", icon: "hourglass", api: "UNAVAILABLE / no response" },
  { id: "ratelimited", code: "HTTP 429", label: "Rate limited", icon: "clock", api: "RATE_LIMITED" },
  { id: "quota", code: "AI quota", label: "AI quota reached", icon: "quota" },
  { id: "session", code: "HTTP 401", label: "Session expired", icon: "key", api: "SESSION_EXPIRED" },
  { id: "simfail", code: "SIM_INVALID", label: "Simulation failed", icon: "xcircle" },
  { id: "aiinvalid", code: "AI_SCHEMA", label: "AI output invalid", icon: "sparkle" },
  { id: "maintenance", code: "503 maint.", label: "Maintenance", icon: "tool" },
];

/**
 * What the "no access" screen says. It states only facts the page knows: whether someone is signed in and as whom. It never names a
 * design, because the screen does not know which one it was (the server answered 403 and said nothing more).
 */
export function forbiddenCopy(email: string | null | undefined): { title: string; body: string; signedIn: boolean } {
  const title = "You do not have access to this.";
  if (email)
    return {
      title,
      signedIn: true,
      body: `You are signed in as ${email}. This page belongs to another account, or needs a role your account does not have. Ask the owner to share a read-only link, or open one of your own designs.`,
    };
  return { title, signedIn: false, body: "You are not signed in. If this design is yours, log in with the account that owns it." };
}

