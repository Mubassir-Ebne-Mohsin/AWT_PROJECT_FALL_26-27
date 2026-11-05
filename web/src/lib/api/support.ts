import { api } from "@/lib/api/client";
import { inboxQuery, type InboxDetail, type InboxFilters, type InboxItem, type ReportDetail, type ReportRequest, type ReportSummary, type Priority, type Status } from "@/lib/support";

// Support failures stay on the screen that asked: a local scope never opens a global system screen over a form.
const local = { scope: "local" } as const;

export interface InboxPage {
  items: InboxItem[];
  next: { at: string; id: string } | null;
}
export interface SupportAgent {
  id: string;
  displayName: string;
}

export const createReport = (body: ReportRequest) => api<ReportDetail>("/support/reports", { ...local, method: "POST", body });
export const listMyReports = (signal?: AbortSignal) => api<ReportSummary[]>("/support/reports", { ...local, signal });
export const getMyReport = (id: string, signal?: AbortSignal) => api<ReportDetail>(`/support/reports/${id}`, { ...local, signal });
export const addReportMessage = (id: string, text: string) => api<ReportDetail>(`/support/reports/${id}/messages`, { ...local, method: "POST", body: { body: text.trim() } });

export const listInbox = (filters: InboxFilters, after?: { at: string; id: string }, signal?: AbortSignal) => api<InboxPage>(`/support/inbox?${inboxQuery(filters, after)}`, { ...local, signal });
export const getInboxReport = (id: string, signal?: AbortSignal) => api<InboxDetail>(`/support/inbox/${id}`, { ...local, signal });
export const markInboxRead = (id: string) => api<{ read: true }>(`/support/inbox/${id}/read`, { ...local, method: "POST" });
export const replyInbox = (id: string, text: string, internal: boolean) => api<InboxDetail>(`/support/inbox/${id}/messages`, { ...local, method: "POST", body: { body: text.trim(), internal } });
export const updateInbox = (id: string, change: { status?: Status; priority?: Priority; assigneeId?: string | null }) => api<InboxDetail>(`/support/inbox/${id}`, { ...local, method: "PATCH", body: change });
export const listSupportAgents = (signal?: AbortSignal) => api<SupportAgent[]>("/support/agents", { ...local, signal });
