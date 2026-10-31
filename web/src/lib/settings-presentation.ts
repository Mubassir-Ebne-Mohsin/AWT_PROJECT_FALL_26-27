import { ApiError } from "@/lib/api/errors";

// P4 Settings: the checks and wording the screen uses. The server enforces every rule again; these exist so a person
// sees what is wrong next to the box instead of after a round trip.

export const DISPLAY_NAME_MAX = 60;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const DELETE_PHRASE = "delete my account";

export const PASSWORD_RULES = "Use 8 to 128 characters, with at least one letter and one number.";

const hasControl = (t: string) => /[\u0000-\u001f\u007f]/.test(t);

export function validateDisplayName(text: string): string | null {
  const t = text.trim();
  if (!t) return "Enter a display name";
  if (t.length > DISPLAY_NAME_MAX) return `Use at most ${DISPLAY_NAME_MAX} characters`;
  if (hasControl(t)) return "Use plain text only";
  return null;
}

export function validateNewPassword(text: string): string | null {
  if (text.length < PASSWORD_MIN) return "Use at least 8 characters";
  if (text.length > PASSWORD_MAX) return "Use at most 128 characters";
  if (!/^(?=.*[A-Za-z])(?=.*\d)/.test(text)) return "Include at least one letter and one number";
  return null;
}

export type PasswordFields = { current: string; next: string; confirm: string };
export type PasswordErrors = Partial<Record<keyof PasswordFields, string>>;

export function validatePasswordChange(v: PasswordFields): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!v.current) errors.current = "Enter your current password";
  const weak = validateNewPassword(v.next);
  if (weak) errors.next = weak;
  else if (v.next === v.current) errors.next = "Choose a password you are not already using";
  if (v.confirm !== v.next) errors.confirm = "The two new passwords do not match";
  return errors;
}

/** Deleting needs the password and the exact words typed; capital letters and spaces around them do not matter. */
export const phraseMatches = (typed: string) => typed.trim().toLowerCase() === DELETE_PHRASE;
export const canDelete = (password: string, typed: string) => password.length > 0 && phraseMatches(typed);

export function exportFileName(now: Date): string {
  return `stressforge-export-${now.toISOString().slice(0, 10)}.json`;
}

/** Counts shown after an export, so the person can see it is the real thing. */
export function exportSummary(data: { designs: unknown[]; challengeAttempts: unknown[]; challengesIManage: unknown[] }): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return `Saved ${n(data.designs.length, "design", "designs")}, ${n(data.challengeAttempts.length, "challenge attempt", "challenge attempts")} and ${n(data.challengesIManage.length, "challenge you manage", "challenges you manage")}.`;
}

export type FieldMap = Record<string, string>;

/** Messages the server attached to boxes, keyed by box name. Nothing else from the server is shown as is. */
export const serverFields = (e: unknown): FieldMap => (e instanceof ApiError ? e.fieldErrors : {});

/** Why an account action failed, in words that say what to do. */
export function accountErrorText(e: unknown, what: "name" | "password" | "export" | "delete"): string {
  if (e instanceof ApiError) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason === "LAST_ADMIN") return "You are the only working Admin, so this account cannot be deleted. Make another account an Admin first.";
    if (e.status === 429) return "Too many tries. Wait a minute and try again.";
    if (e.status === 401) return "Your session has ended. Log in again.";
    if (e.status === 422) return what === "delete" ? "Check the highlighted boxes. Nothing was deleted." : "Check the highlighted boxes and try again.";
    if (e.code === "NETWORK") return "The server could not be reached. Nothing was changed.";
  }
  if (what === "delete") return "That did not work. Nothing was deleted.";
  if (what === "export") return "The export could not be made. Please try again.";
  return "That did not work. Nothing was changed.";
}
