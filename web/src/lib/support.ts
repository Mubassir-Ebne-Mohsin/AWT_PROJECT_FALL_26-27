import type { components } from "@/lib/api/phase3-schema";
import { ApiError } from "@/lib/api/errors";

type Schemas = components["schemas"];
export type ReportContext = Schemas["ReportContext"];
export type ReportSummary = Schemas["ReportSummary"];
export type ReportDetail = Schemas["ReportDetail"];
export type InboxItem = Schemas["InboxItem"];
export type InboxDetail = Schemas["InboxDetail"];
export type Category = ReportSummary["category"];
export type Status = ReportSummary["status"];
export type Priority = ReportSummary["priority"];

// ---- Limits (the same numbers the server enforces; the server is the one that decides) -------------------------------------

export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const BODY_MIN = 10;
export const BODY_MAX = 4000;
export const EXPECTED_MAX = 2000;
export const MESSAGE_MAX = 4000;
export const REOPEN_DAYS = 14;

// ---- Words -------------------------------------------------------------------------------------------------------------

export const CATEGORIES: readonly Category[] = ["bug", "wrong_result", "account", "performance", "idea", "other"];
export const CATEGORY_LABEL: Record<Category, string> = {
  bug: "Bug or error",
  wrong_result: "A result looks wrong",
  account: "Account or sign-in",
  performance: "Slow or stuck",
  idea: "Idea or feedback",
  other: "Something else",
};
export const CATEGORY_HINT: Record<Category, string> = {
  bug: "I pressed Run and…",
  wrong_result: "I expected the design to… but the result says…",
  account: "I could not sign in because…",
  performance: "This screen took too long when I…",
  idea: "It would help if…",
  other: "I would like to tell you about…",
};
export const STATUSES: readonly Status[] = ["open", "in_progress", "waiting", "resolved"];
export const STATUS_LABEL: Record<Status, string> = { open: "Open", in_progress: "In progress", waiting: "Waiting for you", resolved: "Resolved" };
/** The same states as Support sees them: "Waiting for the reporter" rather than "for you". */
export const STATUS_LABEL_SUPPORT: Record<Status, string> = { open: "Open", in_progress: "In progress", waiting: "Waiting for the reporter", resolved: "Resolved" };
export const STATUS_TONE: Record<Status, "accent" | "ok" | "warn" | "outline"> = { open: "accent", in_progress: "accent", waiting: "warn", resolved: "ok" };
export const PRIORITIES: readonly Priority[] = ["low", "normal", "high", "urgent"];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
export const PRIORITY_TONE: Record<Priority, "outline" | "accent" | "warn" | "fail"> = { low: "outline", normal: "outline", high: "warn", urgent: "fail" };

// ---- The technical context ----------------------------------------------------------------------------------------------

export const CONTEXT_KEYS = ["page", "app", "browser", "screen", "at", "errorId"] as const;
export type ContextKey = (typeof CONTEXT_KEYS)[number];
export const CONTEXT_LABEL: Record<ContextKey, string> = {
  page: "Screen",
  app: "App version",
  browser: "Browser",
  screen: "Window size",
  at: "Time",
  errorId: "Error reference",
};

export interface ContextInput {
  /** The route pattern such as "/designs/:id/share", never the address bar: addresses can carry ids and secret links. */
  routePattern: string | null | undefined;
  appVersion: string | null | undefined;
  userAgent: string | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
  now: Date;
  errorId?: string | null;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const ROUTE_PATTERN = /^\/[^?#\s]*$/;
const VERSION = /^[A-Za-z0-9._+-]+$/;
const ERROR_ID = /^[A-Za-z0-9-]+$/;

/**
 * The fixed list of facts that may go with a report. Anything not named here cannot be sent: no token, cookie, request body, design
 * content or stored value is ever read. A value that does not fit the rules is left out rather than trimmed into something else.
 */
export function collectContext(i: ContextInput): ReportContext {
  const out: ReportContext = {};
  const page = i.routePattern ?? "";
  if (page.length <= 200 && ROUTE_PATTERN.test(page) && !CONTROL.test(page)) out.page = page;
  const app = (i.appVersion ?? "").trim();
  if (app.length > 0 && app.length <= 40 && VERSION.test(app)) out.app = app;
  const browser = (i.userAgent ?? "").trim().slice(0, 200);
  if (browser.length > 0 && !CONTROL.test(browser)) out.browser = browser;
  const w = Math.round(i.width ?? 0);
  const h = Math.round(i.height ?? 0);
  if (w >= 1 && w <= 20000 && h >= 1 && h <= 20000) out.screen = { width: w, height: h };
  if (!Number.isNaN(i.now.getTime())) out.at = i.now.toISOString();
  const err = (i.errorId ?? "").trim();
  if (err.length > 0 && err.length <= 64 && ERROR_ID.test(err)) out.errorId = err;
  return out;
}

export interface ContextRow {
  key: ContextKey;
  label: string;
  value: string;
}

/** What the person is shown, one row per item, so each can be switched off before sending. */
export function contextRows(ctx: ReportContext): ContextRow[] {
  const rows: ContextRow[] = [];
  for (const key of CONTEXT_KEYS) {
    const v = ctx[key];
    if (v === undefined) continue;
    rows.push({ key, label: CONTEXT_LABEL[key], value: key === "screen" ? `${(v as { width: number }).width} × ${(v as { height: number }).height}` : key === "at" ? dateTimeText(v as string) : String(v) });
  }
  return rows;
}

export function withoutKeys(ctx: ReportContext, removed: ReadonlySet<string>): ReportContext {
  const out: ReportContext = {};
  for (const key of CONTEXT_KEYS) if (ctx[key] !== undefined && !removed.has(key)) (out as Record<string, unknown>)[key] = ctx[key];
  return out;
}

// ---- The form -----------------------------------------------------------------------------------------------------------

export interface Draft {
  category: Category;
  title: string;
  body: string;
  expected: string;
}
export const emptyDraft = (category: Category = "bug"): Draft => ({ category, title: "", body: "", expected: "" });

export type DraftIssues = Partial<Record<"title" | "body" | "expected", string>>;

/** Mirrors the server's rules so most mistakes are caught before sending. The server still checks everything again. */
export function draftIssues(d: Draft): DraftIssues {
  const issues: DraftIssues = {};
  const title = d.title.trim();
  const body = d.body.trim();
  const expected = d.expected.trim();
  if (title.length < TITLE_MIN) issues.title = `Give the report a short title (at least ${TITLE_MIN} characters).`;
  else if (title.length > TITLE_MAX) issues.title = `Please shorten the title to ${TITLE_MAX} characters or fewer.`;
  else if (CONTROL.test(title)) issues.title = "The title contains a character that cannot be sent.";
  if (body.length < BODY_MIN) issues.body = `Please say a little more (at least ${BODY_MIN} characters).`;
  else if (body.length > BODY_MAX) issues.body = `Please shorten this to ${BODY_MAX} characters or fewer.`;
  else if (CONTROL.test(body)) issues.body = "This text contains a character that cannot be sent.";
  if (expected.length > EXPECTED_MAX) issues.expected = `Please shorten this to ${EXPECTED_MAX} characters or fewer.`;
  else if (CONTROL.test(expected)) issues.expected = "This text contains a character that cannot be sent.";
  return issues;
}

export const messageIssue = (text: string): string | null => {
  const t = text.trim();
  if (t.length === 0) return "Write a message first.";
  if (t.length > MESSAGE_MAX) return `Please shorten this to ${MESSAGE_MAX} characters or fewer.`;
  if (CONTROL.test(t)) return "This text contains a character that cannot be sent.";
  return null;
};

export interface ReportRequest {
  category: Category;
  title: string;
  body: string;
  expected?: string;
  context: ReportContext;
  confirmDuplicate?: boolean;
}

/** An empty "what you expected" is left out, never sent as an empty string. */
export function buildRequest(d: Draft, context: ReportContext, confirmDuplicate = false): ReportRequest {
  const expected = d.expected.trim();
  return { category: d.category, title: d.title.trim(), body: d.body.trim(), ...(expected ? { expected } : {}), context, ...(confirmDuplicate ? { confirmDuplicate: true } : {}) };
}

// ---- Errors, in words that say what to do ----------------------------------------------------------------------------------

const waitText = (seconds: number) => (seconds < 90 ? "a minute" : seconds < 5400 ? `${Math.ceil(seconds / 60)} minutes` : `${Math.ceil(seconds / 3600)} hours`);

export function supportErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const d = (e.details ?? {}) as { reason?: string; retryAfterSeconds?: number };
    if (d.reason === "REPORTS_PER_HOUR") return `You have sent several reports this hour. You can send another in about ${waitText(d.retryAfterSeconds ?? 3600)}.`;
    if (d.reason === "REPORTS_PER_DAY") return "You have reached today's limit for reports. Please try again tomorrow.";
    if (d.reason === "MESSAGES_PER_HOUR") return "You are sending messages quickly. Please wait a little, then try again.";
    if (d.reason === "REOPEN_WINDOW_PASSED") return `This report was resolved more than ${REOPEN_DAYS} days ago, so it cannot be reopened. Please send a new report.`;
    if (e.status === 422) return "Something in the form was not accepted. Check the highlighted fields and try again.";
    if (e.status === 429) return "Too many requests. Please wait a moment and try again.";
    if (e.status === 401) return "Please sign in again to continue.";
    if (e.status === 403) return "You do not have access to that.";
    if (e.status === 404) return "That report no longer exists.";
    if (e.code === "NETWORK") return "The server could not be reached. Nothing was sent. Please try again.";
  }
  return "That did not work. Nothing was sent. Please try again.";
}

/** The reference code of an open report with the same title, when the server warns about a duplicate. */
export function duplicateCode(e: unknown): string | null {
  if (e instanceof ApiError && e.status === 409) {
    const d = (e.details ?? {}) as { reason?: string; code?: string };
    if (d.reason === "DUPLICATE_OPEN" && typeof d.code === "string") return d.code;
  }
  return null;
}

// ---- Times and ages -------------------------------------------------------------------------------------------------------

export const dateTimeText = (iso: string) => iso.slice(0, 10) + " " + iso.slice(11, 16) + " UTC";

/** "just now", "5 min", "3 h", "2 d". */
export function sinceText(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

export const AMBER_AFTER_DAYS = 1;
export const RED_AFTER_DAYS = 3;
/** A report that is still waiting on Support turns amber after a day and red after three. Resolved reports never do. */
export function ageTone(createdAt: string, status: Status, now: number): "ok" | "warn" | "fail" {
  if (status === "resolved") return "ok";
  const days = (now - Date.parse(createdAt)) / 86400000;
  return days >= RED_AFTER_DAYS ? "fail" : days >= AMBER_AFTER_DAYS ? "warn" : "ok";
}

// ---- The inbox ------------------------------------------------------------------------------------------------------------

export interface InboxFilters {
  status: Status | "";
  category: Category | "";
  priority: Priority | "";
  assignee: "" | "me" | "none" | string;
  q: string;
  unread: boolean;
}
export const emptyFilters = (): InboxFilters => ({ status: "", category: "", priority: "", assignee: "", q: "", unread: false });
export const hasFilters = (f: InboxFilters) => f.status !== "" || f.category !== "" || f.priority !== "" || f.assignee !== "" || f.q.trim() !== "" || f.unread;

export const INBOX_PAGE = 25;

/** The query string for the inbox: only filters that are set, a fixed list of names, and the cursor of the last row already shown. */
export function inboxQuery(f: InboxFilters, after?: { at: string; id: string }): string {
  const p = new URLSearchParams({ limit: String(INBOX_PAGE) });
  if (f.status) p.set("status", f.status);
  if (f.category) p.set("category", f.category);
  if (f.priority) p.set("priority", f.priority);
  if (f.assignee) p.set("assignee", f.assignee);
  if (f.q.trim()) p.set("q", f.q.trim().slice(0, 100));
  if (f.unread) p.set("unread", "true");
  if (after) {
    p.set("before", after.at);
    p.set("beforeId", after.id);
  }
  return p.toString();
}
