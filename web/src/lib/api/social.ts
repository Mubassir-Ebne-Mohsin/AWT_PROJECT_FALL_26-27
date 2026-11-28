import { api, adoptSession, type AuthSession } from "@/lib/api/client";
import type { components } from "@/lib/api/phase3-schema";
type S = components["schemas"];
export type Provider = "google" | "github";
export type SocialMethods = S["SocialIdentities"];
export type Proof = {
  proof: string;
  owner: string;
  action: string;
  at: number;
};
let held: Proof | null = null;
export const rememberProof = (p: Omit<Proof, "at">) => {
  held = { ...p, at: Date.now() };
};
export const readProof = (owner?: string) =>
  held && held.owner === owner && Date.now() - held.at < 300000 ? held : null;
export const forgetProof = () => {
  held = null;
};
const local = { scope: "local" } as const;
export const socialMethods = () =>
  api<SocialMethods>("/auth/oauth/identities", local);
export const pendingSocial = () =>
  api<S["SocialPending"]>("/auth/oauth/pending", { ...local, auth: false });
export const socialCompletion = () =>
  api<S["SocialCompletion"]>("/auth/oauth/completion", {
    ...local,
    auth: false,
  });
export async function finishSocial(body: unknown) {
  const session = await api<AuthSession & { next: string }>(
    "/auth/oauth/register",
    { ...local, auth: false, method: "POST", body },
  );
  adoptSession(session);
  return session;
}
export const passwordProof = (password: string, action: string) =>
  api<S["SocialProof"]>("/auth/reauthenticate", {
    ...local,
    method: "POST",
    body: { password, action },
  });
export const startProviderReauth = (provider: Provider, action: string) =>
  api<{ url: string }>(`/auth/oauth/${provider}/reauth`, {
    ...local,
    method: "POST",
    body: { action },
  });
export const linkProvider = (provider: Provider, proof: string) =>
  api<{ url: string }>(`/auth/oauth/${provider}/link`, {
    ...local,
    method: "POST",
    body: { proof },
  });
export const unlinkProvider = (provider: Provider, proof: string) =>
  api<{ disconnected: boolean }>(`/auth/oauth/${provider}/unlink`, {
    ...local,
    method: "POST",
    body: { proof },
  });
export async function setFirstPassword(newPassword: string, proof: string) {
  const session = await api<AuthSession>("/auth/oauth/password", {
    ...local,
    method: "POST",
    body: { newPassword, proof },
  });
  adoptSession(session);
}
export const deleteSocial = (confirmation: string, proof: string) =>
  api<void>("/auth/oauth/delete", {
    ...local,
    method: "POST",
    body: { confirmation, proof },
  });
