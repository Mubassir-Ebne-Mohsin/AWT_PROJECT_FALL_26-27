import { ApiError } from "@/lib/api/errors";
import { dateText } from "@/lib/report-presentation";

export const REVIEW_SNAPSHOT_TEXT = "A Reviewer gets a frozen copy of one revision, made now. Whatever you change afterwards stays out of it, and your own notes are never shared.";
export const REVIEW_BOUNDARY_TEXT = "Stopping a review ends the Reviewer's access straight away. It cannot take back anything they have already seen or copied.";
export const REVIEWER_NOTE_TEXT = "You are looking at a read-only copy shared with you. You cannot edit, run or change it, and the owner's contact details are not shown.";
export const NOT_AVAILABLE_TEXT = "This review is no longer available.";

/** Why an owner's share attempt failed, in words that say what to do. Nothing is taken from the server's raw message. */
export function reviewErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason === "NO_REVIEWER") return "No Reviewer account matches that email. The person needs an account that an Admin has given the Reviewer role.";
    if (reason === "SELF") return "You cannot share a design with yourself.";
    if (reason === "ALREADY_SHARED") return "That revision is already shared with this Reviewer.";
    if (reason === "REVIEW_LIMIT_REACHED") return "This design already has 10 active reviews. Stop one to share with someone else.";
    if (reason === "VERSION_NOT_RETAINED") return "That version is no longer kept, so it cannot be shared.";
    if (e.status === 403) return "This design belongs to another account.";
    if (e.status === 404) return "That design, version or result is no longer available.";
    if (e.status === 422) return "Check the email and the choices, then try again.";
    if (e.code === "NETWORK") return "The server could not be reached. Nothing was changed.";
  }
  return "That did not work. Nothing was changed.";
}

/** One line about a grant for its owner. */
export function grantStatusText(grant: { status: string; createdAt: string; revokedAt: string | null }) {
  if (grant.status === "revoked") return grant.revokedAt ? `Stopped ${dateText(grant.revokedAt)}` : "Stopped";
  return `Shared ${dateText(grant.createdAt)}`;
}

// ---- R4 feedback ----

export const COMMENT_MAX_CHARS = 2000;
export const COMMENT_HINT = "Plain text only, up to 2,000 characters. The owner sees your display name, never your email. You can edit or remove your own comments while the owner is still sharing.";
export const OWNER_THREAD_HINT = "Reviewers write; you can reply to each comment while you are sharing. You cannot change what a Reviewer wrote. After you stop sharing you keep everything that was written.";
export const REPLIES_CLOSED_TEXT = "Replies are closed because you stopped sharing. You keep everything that was written.";
export const REMOVED_TEXT = "Comment removed";

/** Characters used and left. Counts what the server counts: the trimmed text. */
export function charCount(raw: string) {
  const used = raw.trim().length;
  return { used, left: COMMENT_MAX_CHARS - used, ok: used >= 1 && used <= COMMENT_MAX_CHARS };
}

export const commentCountText = (n: number) => (n === 0 ? "No feedback yet" : `${n} comment${n === 1 ? "" : "s"}`);

type Threaded = { id: string; parentId: string | null };
/** Top-level comments in the order they were written, each with the replies that point at it. */
export function buildThread<T extends Threaded>(comments: readonly T[]): Array<{ comment: T; replies: T[] }> {
  const tops = comments.filter((c) => c.parentId === null);
  return tops.map((comment) => ({ comment, replies: comments.filter((c) => c.parentId === comment.id) }));
}

/** Why a comment action failed, in words that say what to do. Nothing is taken from the server's raw message. */
export function commentErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason === "COMMENT_LIMIT_REACHED") return "This review already has 50 comments, which is the most it can hold.";
    if (reason === "REVIEW_STOPPED") return "The review was stopped, so replies are closed.";
    if (e.status === 404) return "That comment or review is no longer available.";
    if (e.status === 403) return "You do not have access to this.";
    if (e.status === 422) return "A comment needs 1 to 2,000 characters of text.";
    if (e.code === "NETWORK") return "The server could not be reached. Nothing was changed.";
  }
  return "That did not work. Nothing was changed.";
}

/** The email box needs something email-shaped before a request is made. */
export const looksLikeEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
