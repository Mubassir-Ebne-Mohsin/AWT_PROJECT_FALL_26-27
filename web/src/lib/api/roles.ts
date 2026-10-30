import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type AccountRoles = components["schemas"]["AccountRoles"];

// A failed roles read must not open a global system screen: the account menu simply shows no extra roles.
const local = { scope: "local" } as const;

export const fetchMyRoles = (signal?: AbortSignal) => api<AccountRoles>("/account/roles", { ...local, signal });
