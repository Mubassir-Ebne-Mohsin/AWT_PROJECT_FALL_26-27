import { ApiError } from "@/lib/api/errors";
import { ROLE_LABEL, type RoleName } from "@/lib/roles-presentation";

type Party = { id: string | null; email: string };
export type AuditLike = { action: string; role: string | null; actor: Party; target: Party };

const roleLabel = (role: string | null) => (role && role in ROLE_LABEL ? ROLE_LABEL[role as RoleName] : "a role");
/** Server-side commands (the first-Admin command, the demo seed) are recorded under the name "operator". */
const who = (party: Party) => (party.id === null && party.email === "operator" ? "The server operator" : party.email);

/** One plain sentence for an audit entry. */
export function auditText(entry: AuditLike): string {
  const actor = who(entry.actor);
  const target = entry.target.email;
  switch (entry.action) {
    case "grant":
      return actor === target ? `${actor} gave themselves the ${roleLabel(entry.role)} role` : `${actor} gave the ${roleLabel(entry.role)} role to ${target}`;
    case "revoke":
      return `${actor} removed the ${roleLabel(entry.role)} role from ${target}`;
    case "bootstrap":
      return `${actor} made ${target} the first Admin`;
    case "suspend":
      return `${actor} suspended ${target}`;
    case "restore":
      return `${actor} restored ${target}`;
    default:
      return `${actor} changed ${target}`;
  }
}

export const statusLabel = (status: string) => (status === "suspended" ? "Suspended" : "Active");

/** Why an Admin action failed, in words that say what to do. Nothing is shown from the server's raw message. */
export function adminErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason === "LAST_ADMIN") return "That is the last working Admin, so it cannot be removed or suspended. Make another Admin first.";
    if (reason === "SELF") return "You cannot suspend your own account.";
    if (e.status === 403) return "Only Admins can do that.";
    if (e.status === 404) return "That account no longer exists.";
    if (e.status === 422) return "That search or choice was not valid. Check it and try again.";
    if (e.code === "NETWORK") return "The server could not be reached. Nothing was changed.";
  }
  return "That did not work. Nothing was changed.";
}

/** The search box needs at least two characters; shorter text is not sent. */
export const MIN_SEARCH = 2;
export const searchTerm = (raw: string) => raw.trim();
export const canSearch = (raw: string) => searchTerm(raw).length >= MIN_SEARCH;
