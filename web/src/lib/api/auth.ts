import { adoptSession, api, AuthSession, dropSession, User } from "@/lib/api/client";

export interface Credentials {
  email: string;
  password: string;
}
export interface Registration extends Credentials {
  displayName: string;
}

// Forms render failures inline, so these calls are `silent` for server-error screens.
export async function login(body: Credentials) {
  const session = await api<AuthSession>("/auth/login", { method: "POST", body, auth: false, silent: true });
  adoptSession(session);
  return session;
}

export async function register(body: Registration) {
  const session = await api<AuthSession>("/auth/register", { method: "POST", body, auth: false, silent: true });
  adoptSession(session);
  return session;
}

export async function logout() {
  try {
    await api<void>("/auth/logout", { method: "POST", silent: true });
  } finally {
    // Signing out must always work locally, even if the server could not be told.
    dropSession();
  }
}

export const fetchMe = () => api<User>("/auth/me");
