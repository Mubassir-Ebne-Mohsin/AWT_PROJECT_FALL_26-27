import type { components, operations } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
export type CreationInput =
  operations["prepareDesign"]["requestBody"]["content"]["application/json"]["input"];
export type CreationDraft = components["schemas"]["CreateDesign"];
export type Prepared =
  operations["prepareDesign"]["responses"][200]["content"]["application/json"]["data"];
type Design = components["schemas"]["Design"];
export type CreationState = {
  name: string;
  region: "us-east" | "eu-west" | "ap-south";
  start: "clients" | "empty";
  preset: "steady" | "evening" | "flash" | "launch" | "ingest";
  text: string;
  templateId: string;
  prepared?: Prepared;
  pending: boolean;
  error: string;
  uncertain: boolean;
  created?: Design;
};
export function creationError(error: unknown) {
  if (!(error instanceof ApiError))
    return error instanceof Error
      ? error.message
      : "Could not prepare the design";
  const details = error.details as
    | {
        issues?: { path?: string; message?: string }[];
        fields?: { path?: string; message?: string }[];
      }
    | undefined;
  const issues = details?.issues ?? details?.fields;
  return (
    error.message +
    (issues?.length
      ? ": " +
        issues
          .map((i) => [i.path, i.message].filter(Boolean).join(": "))
          .join("; ")
      : "")
  );
}
/** In-memory only. Survives system-screen replacement; disposed on explicit sign-out. */
export class CreationSession {
  private listeners = new Set<() => void>();
  private disposed = false;
  state: CreationState = {
    name: "Untitled design",
    region: "us-east",
    start: "clients",
    preset: "steady",
    text: "",
    templateId: "mvp",
    pending: false,
    error: "",
    uncertain: false,
  };
  constructor(
    private prepareRequest = (input: CreationInput) =>
      api<Prepared>("/designs/prepare", {
        method: "POST",
        body: { input },
        silent: true,
      }),
    private createRequest = (draft: CreationDraft) =>
      api<Design>("/designs", { method: "POST", body: draft, silent: true }),
  ) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private publish(patch: Partial<CreationState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  update(
    patch: Partial<
      Pick<
        CreationState,
        "name" | "region" | "start" | "preset" | "text" | "templateId"
      >
    >,
  ) {
    if (this.state.pending || this.state.uncertain || this.state.created)
      return;
    this.publish({
      ...patch,
      prepared: Object.keys(patch).every((k) => k === "name")
        ? this.state.prepared
        : undefined,
      error: "",
    });
  }
  async prepare(input: CreationInput) {
    if (
      this.state.pending ||
      this.state.uncertain ||
      this.state.created ||
      this.disposed
    )
      return;
    this.publish({ pending: true, error: "", prepared: undefined });
    try {
      const prepared = await this.prepareRequest(input);
      this.publish({ prepared, name: prepared.design.name });
      return this.disposed ? undefined : prepared;
    } catch (e) {
      this.publish({ error: creationError(e) });
    } finally {
      this.publish({ pending: false });
    }
  }
  async create(draft: CreationDraft) {
    if (
      this.state.pending ||
      this.state.uncertain ||
      this.state.created ||
      this.disposed
    )
      return;
    if (!draft.name.trim() || draft.name.trim().length > 100) {
      this.publish({ error: "Name must contain 1–100 characters." });
      return;
    }
    this.publish({ pending: true, error: "" });
    try {
      const created = await this.createRequest({
        ...draft,
        name: draft.name.trim(),
      });
      this.publish({ created });
      return this.disposed ? undefined : created;
    } catch (e) {
      // A timeout, dropped response or server error can occur after INSERT commits.
      const uncertain =
        !(e instanceof ApiError) || e.status === 0 || e.status >= 500;
      this.publish({
        uncertain,
        error: uncertain
          ? "Creation could not be confirmed. It may already be saved. Check your dashboard before creating another copy."
          : creationError(e),
      });
    } finally {
      this.publish({ pending: false });
    }
  }
  clearForNewIntent() {
    if (!this.state.pending)
      this.publish({
        uncertain: false,
        created: undefined,
        prepared: undefined,
        error: "",
      });
  }
  fail(message: string) {
    this.publish({ error: message, prepared: undefined });
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
}
