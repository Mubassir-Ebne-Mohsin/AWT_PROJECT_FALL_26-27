import { Injectable } from "@nestjs/common";
import { appConfig } from "@/config";
import { AppException } from "@/common/errors";
import { Provider, VerifiedIdentity } from "@/modules/social/social.types";
import { z } from "zod";
const e = appConfig.env;
export type ProviderTransaction = {
  provider: Provider;
  verifier: string;
  nonce: string;
  state: string;
};
@Injectable()
export class ProviderClient {
  private googleKeys?: ReturnType<
    (typeof import("jose"))["createRemoteJWKSet"]
  >;
  enabled(p: Provider) {
    return p === "google" ? e.GOOGLE_AUTH_ENABLED : e.GITHUB_AUTH_ENABLED;
  }
  config(p: Provider) {
    return p === "google"
      ? {
          id: e.GOOGLE_CLIENT_ID,
          secret: e.GOOGLE_CLIENT_SECRET,
          redirect: e.GOOGLE_REDIRECT_URI,
        }
      : {
          id: e.GITHUB_CLIENT_ID,
          secret: e.GITHUB_CLIENT_SECRET,
          redirect: e.GITHUB_REDIRECT_URI,
        };
  }
  private metadata(p: Provider) {
    return p === "google"
      ? {
          issuer: "https://accounts.google.com",
          authorization_endpoint:
            "https://accounts.google.com/o/oauth2/v2/auth",
          token_endpoint: "https://oauth2.googleapis.com/token",
        }
      : {
          // Match GitHub RFC 9207 callback issuer exactly; do not discard iss.
          issuer: "https://github.com/login/oauth",
          authorization_endpoint: "https://github.com/login/oauth/authorize",
          token_endpoint: "https://github.com/login/oauth/access_token",
        };
  }
  async authorize(t: ProviderTransaction) {
    if (!this.enabled(t.provider))
      throw new AppException(
        "UNAVAILABLE",
        "This sign-in provider is not configured",
      );
    const oauth = await import("oauth4webapi"),
      url = new URL(this.metadata(t.provider).authorization_endpoint),
      cfg = this.config(t.provider);
    url.search = new URLSearchParams({
      client_id: cfg.id,
      redirect_uri: cfg.redirect,
      response_type: "code",
      scope:
        t.provider === "google"
          ? "openid email profile"
          : "read:user user:email",
      state: t.state,
      code_challenge: await oauth.calculatePKCECodeChallenge(t.verifier),
      code_challenge_method: "S256",
      ...(t.provider === "google"
        ? { nonce: t.nonce, prompt: "select_account" }
        : {}),
    }).toString();
    return url.toString();
  }
  async exchange(
    t: ProviderTransaction,
    query: Record<string, unknown>,
  ): Promise<VerifiedIdentity> {
    if (!this.enabled(t.provider))
      throw new AppException(
        "UNAVAILABLE",
        "This sign-in provider is not configured",
      );
    try {
      const oauth = await import("oauth4webapi"),
        as = this.metadata(t.provider),
        cfg = this.config(t.provider),
        client = { client_id: cfg.id };
      const params = new URLSearchParams();
      for (const key of ["code", "state", "iss", "error", "error_description"]) {
        const value = query[key];
        if (value !== undefined) {
          if (typeof value !== "string" || (key === "iss" && !value)) throw Error();
          params.set(key, value);
        }
      }
      const checked = oauth.validateAuthResponse(as, client, params, t.state);
      const response = await oauth.authorizationCodeGrantRequest(
        as,
        client,
        oauth.ClientSecretPost(cfg.secret),
        checked,
        cfg.redirect,
        t.verifier,
        { signal: AbortSignal.timeout(8000) },
      );
      const tokens = await oauth.processAuthorizationCodeResponse(
        as,
        client,
        response,
        t.provider === "google"
          ? { expectedNonce: t.nonce, requireIdToken: true }
          : {},
      );
      if (t.provider === "google") {
        const jose = await import("jose");
        this.googleKeys ??= jose.createRemoteJWKSet(
          new URL("https://www.googleapis.com/oauth2/v3/certs"),
          { timeoutDuration: 8000 },
        );
        const { payload: p } = await jose.jwtVerify(
          tokens.id_token!,
          this.googleKeys,
          {
            issuer: ["https://accounts.google.com", "accounts.google.com"],
            audience: cfg.id,
            algorithms: ["RS256"],
            requiredClaims: ["sub", "iat", "exp", "nonce"],
          },
        );
        if (
          p.nonce !== t.nonce ||
          typeof p.sub !== "string" ||
          !p.sub.length ||
          p.sub.length > 255 ||
          (p.azp !== undefined && p.azp !== cfg.id) ||
          (Array.isArray(p.aud) && p.aud.length > 1 && p.azp !== cfg.id)
        )
          throw Error();
        const email = z.email().max(254).safeParse(p.email);
        return {
          provider: t.provider,
          subject: p.sub,
          email: email.success ? email.data.toLowerCase() : null,
          verified: p.email_verified === true,
          name: typeof p.name === "string" ? p.name : "",
        };
      }
      const headers = {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      const [profileResponse, emailResponse] = await Promise.all([
        fetch("https://api.github.com/user", {
          headers,
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        }),
        fetch("https://api.github.com/user/emails?per_page=100", {
          headers,
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        }),
      ]);
      if (!profileResponse.ok || !emailResponse.ok) throw Error();
      const p = z
        .object({
          id: z.number().int().positive(),
          name: z.string().nullable(),
          login: z.string(),
        })
        .parse(await profileResponse.json());
      const emails = z
          .array(
            z.object({
              email: z.email().max(254),
              verified: z.boolean(),
              primary: z.boolean(),
            }),
          )
          .parse(await emailResponse.json()),
        email = emails.find((m) => m.primary && m.verified);
      return {
        provider: t.provider,
        subject: String(p.id),
        email: email?.email.toLowerCase() ?? null,
        verified: !!email,
        name: p.name ?? p.login,
      };
    } catch (error) {
      const e = error as {
        name?: string;
        code?: string;
        response?: { status?: number };
      };
      if (
        error instanceof TypeError ||
        ["AbortError", "TimeoutError"].includes(e.name ?? "") ||
        e.code === "ERR_JWKS_TIMEOUT" ||
        (e.response?.status ?? 0) >= 500 ||
        e.response?.status === 429
      )
        throw new AppException(
          "UNAVAILABLE",
          "The provider is temporarily unavailable. Please retry",
        );
      throw new AppException(
        "UNAUTHENTICATED",
        "The provider could not confirm this sign-in. Please start again",
      );
    }
  }
}
