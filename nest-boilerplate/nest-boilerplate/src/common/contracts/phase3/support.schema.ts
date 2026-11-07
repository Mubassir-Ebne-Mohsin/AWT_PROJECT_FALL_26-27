import { z } from "zod";
import { mergeLinkSchema } from "@/common/contracts/phase3/support-extras.schema";

// Support role and problem reports (docs/SUPPORT-SYSTEM-SCOPE.md). Core product contracts. Everything a person types is plain text:
// bounded, with control characters refused, and shown as text, never as HTML. The technical context is a fixed list of fields; any
// other key is refused, so nothing sensitive can be sent along with a report.

export const SUPPORT_CATEGORIES = ["bug", "wrong_result", "account", "performance", "idea", "other"] as const;
export const SUPPORT_STATUSES = ["open", "in_progress", "waiting", "resolved"] as const;
export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const TITLE_MAX = 120;
export const TITLE_MIN = 3;
export const BODY_MIN = 10;
export const BODY_MAX = 4000;
export const EXPECTED_MAX = 2000;
export const MESSAGE_MAX = 4000;
/** A resolved report can be reopened by its author for this long. */
export const REOPEN_DAYS = 14;
/** Per account, held on the server. */
export const REPORTS_PER_HOUR = 5;
export const REPORTS_PER_DAY = 20;
export const MESSAGES_PER_HOUR = 30;

export const categorySchema = z.enum(SUPPORT_CATEGORIES);
export const statusSchema = z.enum(SUPPORT_STATUSES);
export const prioritySchema = z.enum(SUPPORT_PRIORITIES);

// Tab, line feed and carriage return are allowed; every other control character (NUL included) is refused.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const noControl = (value: string) => !CONTROL.test(value);
const plain = (min: number, max: number) => z.string().trim().min(min).max(max).refine(noControl, "Control characters are not allowed");

/**
 * What the report form may send about the person's browser and page, each item optional because the person can remove any of
 * them before sending. The page is a path only: a query string or fragment can carry tokens, so one is refused, not trimmed.
 */
export const reportContextSchema = z.strictObject({
  page: z
    .string()
    .max(200)
    .regex(/^\/[^?#\s]*$/, "A page path only, with no query string or fragment")
    .refine(noControl)
    .optional(),
  app: z
    .string()
    .max(40)
    .regex(/^[A-Za-z0-9._+-]+$/)
    .optional(),
  browser: z.string().trim().min(1).max(200).refine(noControl).optional(),
  screen: z.strictObject({ width: z.number().int().min(1).max(20000), height: z.number().int().min(1).max(20000) }).optional(),
  at: z.iso.datetime().optional(),
  errorId: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/)
    .optional(),
});

export const createReportSchema = z.strictObject({
  category: categorySchema,
  title: plain(TITLE_MIN, TITLE_MAX),
  body: plain(BODY_MIN, BODY_MAX),
  expected: plain(1, EXPECTED_MAX).optional(),
  context: reportContextSchema.default({}),
  /** Set after the person has been told they already have an open report with this title. */
  confirmDuplicate: z.boolean().optional(),
});

export const messageRequestSchema = z.strictObject({ body: plain(1, MESSAGE_MAX) });
export const supportMessageRequestSchema = z.strictObject({ body: plain(1, MESSAGE_MAX), internal: z.boolean().default(false) });

export const ticketUpdateSchema = z
  .strictObject({ status: statusSchema.optional(), priority: prioritySchema.optional(), assigneeId: z.uuid().nullable().optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

const flag = z.enum(["true"]).transform(() => true);
export const inboxQuerySchema = z
  .strictObject({
    status: statusSchema.optional(),
    category: categorySchema.optional(),
    priority: prioritySchema.optional(),
    assignee: z.union([z.enum(["me", "none"]), z.uuid()]).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    unread: flag.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    before: z.iso.datetime().optional(),
    beforeId: z.uuid().optional(),
  })
  .refine((q) => q.beforeId === undefined || q.before !== undefined, "beforeId needs before");

const code = z.string().regex(/^SF-\d{4,}$/);

export const reportSummarySchema = z.strictObject({
  id: z.uuid(),
  ref: z.number().int().min(1001),
  code,
  category: categorySchema,
  title: z.string(),
  status: statusSchema,
  priority: prioritySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
  mergedInto: mergeLinkSchema.nullable().optional(),
});

/** The author's thread. Internal notes are not part of this shape at all, so no filter or query can return one. */
export const reportMessageSchema = z.strictObject({
  id: z.uuid(),
  from: z.enum(["you", "support"]),
  body: z.string(),
  at: z.iso.datetime(),
});

export const reportDetailSchema = reportSummarySchema.extend({
  body: z.string(),
  expected: z.string().nullable(),
  context: reportContextSchema,
  messages: z.array(reportMessageSchema),
  /** Set while the author can still reopen it by writing a message. */
  reopenUntil: z.iso.datetime().nullable(),
});

export const reportListSchema = z.array(reportSummarySchema).max(100);

/** What Support sees in the inbox. `authorName` is null once the author has deleted their account (reports are anonymised). */
export const inboxItemSchema = reportSummarySchema.extend({
  authorName: z.string().nullable(),
  assigneeId: z.uuid().nullable(),
  assigneeName: z.string().nullable(),
  unread: z.boolean(),
});

export const inboxMessageSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["user", "support", "note"]),
  authorName: z.string().nullable(),
  body: z.string(),
  at: z.iso.datetime(),
});

export const inboxDetailSchema = inboxItemSchema.extend({
  duplicates: z.array(mergeLinkSchema).optional(),
  body: z.string(),
  expected: z.string().nullable(),
  context: reportContextSchema,
  messages: z.array(inboxMessageSchema),
});

export const inboxPageSchema = z.strictObject({ items: z.array(inboxItemSchema).max(50), next: z.strictObject({ at: z.iso.datetime(), id: z.uuid() }).nullable() });
export const supportAgentSchema = z.strictObject({ id: z.uuid(), displayName: z.string() });
export const supportAgentsSchema = z.array(supportAgentSchema).max(200);

export type ReportContext = z.infer<typeof reportContextSchema>;
export type ReportDetail = z.infer<typeof reportDetailSchema>;
export type InboxDetail = z.infer<typeof inboxDetailSchema>;
