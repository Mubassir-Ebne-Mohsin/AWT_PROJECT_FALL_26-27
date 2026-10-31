import { adoptSession, api, updateSessionUser, type AuthSession, type User } from "@/lib/api/client";
import { clearSessionHint } from "@/lib/session-hint";
import type { components } from "@/lib/api/phase3-schema";

type S = components["schemas"];
export type AccountExport = S["AccountExport"];

// Account failures stay on the Settings screen: a local scope never opens a global system screen.
const local = { scope: "local" } as const;

export async function changeDisplayName(displayName: string): Promise<User> {
  const user = await api<User>("/account/profile", { ...local, method: "PATCH", body: { displayName } });
  updateSessionUser(user);
  return user;
}

/** The server ends every other session and answers with a fresh one for this device; adopt it so nothing here breaks. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const session = await api<AuthSession>("/auth/password", { ...local, method: "POST", body: { currentPassword, newPassword } });
  adoptSession(session);
}

export const exportAccount = () => api<AccountExport>("/account/export", local);

/**
 * Deletes the account; on success the "someone is signed in" marker is cleared. The in-memory session is left for the
 * caller's full page load to discard: telling the app it is signed out would send the person to the login screen.
 */
export async function deleteAccount(password: string, confirmation: string): Promise<void> {
  await api<void>("/account/delete", { ...local, method: "POST", body: { password, confirmation } });
  clearSessionHint();
}
