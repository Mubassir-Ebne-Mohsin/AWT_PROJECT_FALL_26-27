import { ApiError } from "@/lib/api/errors";
import type { ShareLink } from "@/lib/api/shares";
import { dateText } from "@/lib/report-presentation";

export const SNAPSHOT_TEXT = "A link shows a frozen copy made now. Later changes to your design, results or notes never appear in it.";
export const BOUNDARY_TEXT = "Revoking a link stops new views straight away. It cannot take back anything someone has already seen, copied or printed.";
export const GONE_TEXT = "This link is no longer available.";
export const ONCE_TEXT = "Copy this link now. For your security it is shown only once and cannot be shown again.";

export const EXPIRY_CHOICES: Array<{ value: 7 | 30 | 90 | null; label: string }> = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days (recommended)" },
  { value: 90, label: "90 days" },
  { value: null, label: "No expiry until I revoke it" },
];

export const scopeLabel = (scope: ShareLink["scope"]) => (scope === "design" ? "Design only" : "Design and report");

export const scopeHelp = (scope: ShareLink["scope"]) =>
  scope === "design"
    ? "Shows the components, connections and traffic. No results, no Limits and no notes."
    : "Shows the design plus the chosen result, the Limits disclosure and the model limitations. Notes are off unless you add your Decision notes.";

export function expiryText(link: Pick<ShareLink, "status" | "expiresAt" | "revokedAt">) {
  if (link.status === "revoked") return link.revokedAt ? `Revoked ${dateText(link.revokedAt)}` : "Revoked";
  if (link.status === "expired") return link.expiresAt ? `Expired ${dateText(link.expiresAt)}` : "Expired";
  return link.expiresAt ? `Expires ${dateText(link.expiresAt)}` : "Does not expire";
}

export function openedText(link: Pick<ShareLink, "openCount" | "lastOpenedAt">) {
  if (link.openCount === 0 || !link.lastOpenedAt) return "Not opened yet";
  return `Opened ${link.openCount} time${link.openCount === 1 ? "" : "s"}, last ${dateText(link.lastOpenedAt)}`;
}

/** The secret becomes part of the page address only for the person it is given to. */
export const shareUrl = (origin: string, token: string) => `${origin}/share/${token}`;

/**
 * A token must look like one before a request is made: anything else is simply an unavailable link. Real tokens are
 * always 32 random bytes in base64url, which is exactly 43 characters, so nothing else is ever worth a request.
 */
export const looksLikeToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export function shareErrorText(e: unknown) {
  if (e instanceof ApiError) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason === "SHARE_LIMIT_REACHED") return "This design already has 5 active links. Revoke one to create another.";
    if (reason === "VERSION_NOT_RETAINED") return "That version is no longer kept, so it cannot be shared.";
    if (e.status === 403) return "This design belongs to another account.";
    if (e.status === 404) return "That design, version or result is no longer available.";
    if (e.status === 422) return "Those choices cannot be shared together. Check them and try again.";
    if (e.code === "NETWORK") return "The server could not be reached. Nothing was changed.";
  }
  return "That did not work. Nothing was changed.";
}
