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
