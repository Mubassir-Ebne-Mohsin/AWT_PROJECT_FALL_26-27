/**
 * Email text for the two reporter-facing events. Nothing a person typed is ever included: only a fixed sentence, the
 * public report number, a status word from a closed list and a link back into the app.
 */
export const MAIL_KINDS = ["support_reply", "report_status"] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

const STATUS_WORDS: Record<string, string> = {
  open: "open",
  in_progress: "in progress",
  waiting: "waiting for your reply",
  resolved: "resolved",
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function reportUrl(frontendUrl: string, ticketId: string) {
  return `${frontendUrl.replace(/\/+$/, "")}/reports/${encodeURIComponent(ticketId)}`;
}

export function renderMail(kind: MailKind, input: { ref: number; status: string; url: string }) {
  const ref = `SF-${Math.trunc(Number(input.ref))}`;
  const status = STATUS_WORDS[input.status] ?? "updated";
  const subject =
    kind === "support_reply" ? `Support replied to your report ${ref}` : `Your report ${ref} is now ${status}`;
  const line =
    kind === "support_reply"
      ? `Support has replied to your report ${ref}.`
      : `The status of your report ${ref} changed. It is now ${status}.`;
  const text = `${line}\n\nOpen it here: ${input.url}\n\nYou can mute these notifications in Settings. This message does not contain the text of your report.`;
  const html =
    `<p>${escapeHtml(line)}</p>` +
    `<p><a href="${escapeHtml(input.url)}">Open the report</a></p>` +
    `<p style="color:#666;font-size:12px">You can mute these notifications in Settings. This message does not contain the text of your report.</p>`;
  return { subject, text, html };
}
