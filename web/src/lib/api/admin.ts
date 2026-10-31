import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

type Schemas = components["schemas"];
export type AdminUser = Schemas["AdminUser"];
export type RoleChange = Schemas["RoleChange"];
export type AuditEntry = Schemas["AuditEntry"];
export type StatusChange = Schemas["StatusChange"];
export type GrantableRole = "instructor" | "reviewer" | "admin";

// Admin failures stay on the admin screen: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export const AUDIT_PAGE = 20;

export const searchUsers = (q: string, signal?: AbortSignal) => api<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}`, { ...local, signal });
export const grantRole = (id: string, role: GrantableRole) => api<RoleChange>(`/admin/users/${id}/roles`, { ...local, method: "POST", body: { role } });
export const revokeRole = (id: string, role: GrantableRole) => api<RoleChange>(`/admin/users/${id}/roles/${role}`, { ...local, method: "DELETE" });
export const suspendUser = (id: string) => api<StatusChange>(`/admin/users/${id}/suspend`, { ...local, method: "POST" });
export const restoreUser = (id: string) => api<StatusChange>(`/admin/users/${id}/restore`, { ...local, method: "POST" });

/** Newest first. The cursor is the last entry already shown, so entries in the same millisecond are never skipped. */
export function fetchAudit(after?: { at: string; id: string }, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: String(AUDIT_PAGE) });
  if (after) {
    query.set("before", after.at);
    query.set("beforeId", after.id);
  }
  return api<AuditEntry[]>(`/admin/audit?${query.toString()}`, { ...local, signal });
}
