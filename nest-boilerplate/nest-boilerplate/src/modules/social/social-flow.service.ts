import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppException } from "@/common/errors";
import { AuthService } from "@/modules/auth/auth.service";
import { UsersService } from "@/modules/users/users.service";
import { User } from "@/modules/users/entities/user.entity";
import { SocialStore, secret, digest } from "@/modules/social/social-store";
import {
  ProviderClient,
  ProviderTransaction,
} from "@/modules/social/provider-client";
import {
  Provider,
  VerifiedIdentity,
  SocialAction,
  safeReturn,
} from "@/modules/social/social.types";
import { socialRegistrationSchema } from "@/common/contracts/phase3/social.schema";

export type Flow = ProviderTransaction & {
  binding: string;
  purpose: "login" | "link" | "reauth";
  owner?: string;
  family?: string;
  action?: SocialAction;
  next: string;
};
export type Proof = {
  owner: string;
  family: string;
  binding: string;
  action: SocialAction;
};
export type Pending = {
  identity: VerifiedIdentity;
  binding: string;
  next: string;
  csrf: string;
};
export type Completion = {
  kind: "login" | "linked" | "proof";
  next: string;
  proof?: string;
  owner?: string;
  action?: SocialAction;
  binding: string;
};

@Injectable()
export class SocialFlowService {
  constructor(
    readonly store: SocialStore,
    readonly provider: ProviderClient,
    readonly db: DataSource,
    readonly auth: AuthService,
    readonly users: UsersService,
  ) {}
  async start(
    provider: Provider,
    browser: string,
    next: unknown,
    purpose: Flow["purpose"] = "login",
    who?: { owner: string; family: string; action: SocialAction },
  ) {
    if (!this.provider.enabled(provider))
      throw new AppException(
        "UNAVAILABLE",
        "This sign-in provider is not configured",
      );
    const flow = {
      provider,
      binding: digest(browser),
      purpose,
      verifier: secret(),
      nonce: secret(),
      next: safeReturn(next),
      ...who,
    };
    const state = await this.store.put("state", flow);
    return this.provider.authorize({ ...flow, state });
  }
  async takeState(provider: Provider, state: unknown, browser: string) {
    const flow = await this.store.read<Omit<Flow, "state">>("state", state);
    if (flow.provider !== provider || flow.binding !== digest(browser))
      throw new AppException(
        "UNAUTHENTICATED",
        "Sign-in browser or provider changed",
      );
    await this.store.read("state", state, true);
    return { ...flow, state: state as string };
  }
  async callback(
    flow: Flow,
    query: Record<string, unknown>,
    browser: string,
    refresh?: string,
  ) {
    const identity = await this.provider.exchange(flow, query);
    if (flow.purpose !== "login") {
      if (
        !flow.owner ||
        !flow.family ||
        !flow.action ||
        (await this.auth.socialSessionFamily(refresh, flow.owner)) !==
          flow.family
      )
        throw new AppException(
          "UNAUTHENTICATED",
          "Your account session changed",
        );
      if (flow.purpose === "link") {
        await this.link(flow.owner, identity);
        return {
          completion: await this.store.put(
            "completion",
            {
              kind: "linked",
              next: "/settings/security",
              binding: flow.binding,
            } satisfies Completion,
            60,
          ),
        };
      }
      const [linked] = await this.db.query(
        "SELECT user_id FROM external_identities WHERE provider=$1 AND provider_subject=$2",
        [identity.provider, identity.subject],
      );
      if (linked?.user_id !== flow.owner)
        throw new AppException(
          "FORBIDDEN",
          "Authenticate with a provider already connected to this account",
        );
      const proof = await this.store.put(
        "proof",
        {
          owner: flow.owner,
          family: flow.family,
          binding: flow.binding,
          action: flow.action,
        } satisfies Proof,
        300,
      );
      return {
        completion: await this.store.put(
          "completion",
          {
            kind: "proof",
            next: "/settings/security",
            proof,
            owner: flow.owner,
            action: flow.action,
            binding: flow.binding,
          } satisfies Completion,
          60,
        ),
      };
    }
    const [linked] = await this.db.query(
      "SELECT user_id FROM external_identities WHERE provider=$1 AND provider_subject=$2",
      [identity.provider, identity.subject],
    );
    if (linked) {
      const user = await this.users.findById(linked.user_id);
      this.active(user);
      await this.db.query(
        "UPDATE external_identities SET last_used_at=now() WHERE provider=$1 AND provider_subject=$2",
        [identity.provider, identity.subject],
      );
      return {
        session: await this.auth.issue(user!, secret()),
        completion: await this.store.put(
          "completion",
          {
            kind: "login",
            next: flow.next,
            binding: flow.binding,
          } satisfies Completion,
          60,
        ),
      };
    }
    if (!identity.verified || !identity.email)
      throw new AppException(
        "VALIDATION_FAILED",
        "A verified primary email is required to create an account",
      );
    if (await this.users.findByEmail(identity.email))
      throw new AppException(
        "CONFLICT",
        "An account already uses this email. Sign in and connect the provider in Settings",
      );
    const pending = await this.store.put("pending", {
      identity,
      binding: digest(browser),
      next: flow.next,
      csrf: secret(),
    } satisfies Pending);
    return { pending };
  }
  active(user: User | null) {
    if (!user)
      throw new AppException("UNAUTHENTICATED", "This account is unavailable");
    if (user.accountStatus !== "active")
      throw new AppException(
        "FORBIDDEN",
        "This account is suspended. Contact an administrator",
      );
  }
  async pending(ticket: unknown, browser: string) {
    const pending = await this.store.read<Pending>("pending", ticket);
    if (pending.binding !== digest(browser))
      throw new AppException("UNAUTHENTICATED", "Registration browser changed");
    return pending;
  }
  async register(ticket: unknown, browser: string, raw: unknown) {
    const parsed = socialRegistrationSchema.safeParse(raw);
    if (!parsed.success)
      throw new AppException(
        "VALIDATION_FAILED",
        "Check your registration fields",
        {
          fields: parsed.error.issues.map((i) => ({
            path: String(i.path[0]),
            message: i.message,
          })),
        },
      );
    const pending = await this.pending(ticket, browser);
    if (parsed.data.csrf !== pending.csrf)
      throw new AppException("FORBIDDEN", "Registration confirmation expired");
    if (
      parsed.data.username &&
      !(await this.users.usernameAvailable(parsed.data.username))
    )
      throw new AppException(
        "VALIDATION_FAILED",
        "This username is already taken",
      );
    await this.store.read("pending", ticket, true);
    try {
      const user = await this.db.transaction(async (m) => {
        const repo = m.getRepository(User),
          u = await repo.save(
            repo.create({
              email: pending.identity.email!,
              displayName: parsed.data.displayName,
              username: parsed.data.username ?? null,
              passwordHash: null,
            }),
          );
        await m.query(
          "INSERT INTO external_identities(user_id,provider,provider_subject) VALUES($1,$2,$3)",
          [u.id, pending.identity.provider, pending.identity.subject],
        );
        return u;
      });
      return {
        session: await this.auth.issue(user, secret()),
        next: pending.next,
      };
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "driverError" in e &&
        (e.driverError as { code?: string })?.code === "23505"
      )
        throw new AppException(
          "CONFLICT",
          "That account or username was just registered. Start again or sign in",
        );
      throw e;
    }
  }
  async link(owner: string, identity: VerifiedIdentity) {
    try {
      await this.db.transaction(async (m) => {
        const [u] = await m.query(
          "SELECT account_status FROM users WHERE id=$1 FOR UPDATE",
          [owner],
        );
        if (u?.account_status !== "active")
          throw new AppException("FORBIDDEN", "This account is unavailable");
        await m.query(
          "INSERT INTO external_identities(user_id,provider,provider_subject) VALUES($1,$2,$3)",
          [owner, identity.provider, identity.subject],
        );
      });
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "driverError" in e &&
        (e.driverError as { code?: string })?.code === "23505"
      )
        throw new AppException(
          "CONFLICT",
          "This provider is already connected to an account. Nothing was merged",
        );
      throw e;
    }
  }
  async proof(
    token: unknown,
    browser: string,
    owner: string,
    refresh: string | undefined,
    action: SocialAction,
    consume = true,
  ) {
    // A spent action proof is not an expired login session. Keep access-token
    // refresh handling reserved for failures of the actual account session.
    const readProof = async (once = false) => {
      try {
        return await this.store.read<Proof>("proof", token, once);
      } catch (error) {
        if (error instanceof AppException && error.code === "UNAUTHENTICATED")
          throw new AppException(
            "FORBIDDEN",
            "Authenticate again for this action",
          );
        throw error;
      }
    };
    const p = await readProof();
    if (
      p.binding !== digest(browser) ||
      p.owner !== owner ||
      p.action !== action ||
      p.family !== (await this.auth.socialSessionFamily(refresh, owner))
    )
      throw new AppException(
        "FORBIDDEN",
        "Authenticate again for this account and action",
      );
    if (consume) await readProof(true);
    return p;
  }
}
