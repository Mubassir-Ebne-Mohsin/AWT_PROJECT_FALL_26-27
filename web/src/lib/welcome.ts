import { TEMPLATES } from "@/lib/examples";
import type { Store } from "@/lib/learn-progress";

// P6 Welcome. The tour is plain text; the only decisions are where a new person lands after registering, which template the
// sample design comes from, and whether this browser has already been through the tour (kept here only, per account).

/** The sample design is built from this template. A test pins that it meets its own goal as shipped, so a first run is healthy. */
export const SAMPLE_TEMPLATE_ID = "mvp";
export const sampleTemplate = () => TEMPLATES.find((t) => t.id === SAMPLE_TEMPLATE_ID);

export const TOUR_STEPS = [
  {
    id: "draw",
    title: "Draw your system",
    body: "Put the parts of a system on a canvas, such as app servers, a database and a cache, and connect them in the order a request travels through them. Each part has a capacity and a delay you can change.",
  },
  {
    id: "run",
    title: "Run it and read the result",
    body: "Choose how much traffic arrives and run it. The result shows how slow the slowest 5% of requests are (p95), what share of requests fail, and which part fills up first.",
  },
  {
    id: "improve",
    title: "Change one thing and run again",
    body: "Add a replica, add a cache, or raise the traffic, then run again and compare. Changing one thing at a time shows which change helped.",
  },
] as const;

/**
 * Where to go right after registering. A new person is shown the tour, unless they arrived by following a link to a
 * particular page, in which case that page comes first.
 */
export function afterRegisterPath(requestedNext: string | null | undefined, safeNextPath: string): string {
  return requestedNext ? safeNextPath : "/welcome";
}

// ---------- "have they been through the tour", per account, in this browser ----------

const PREFIX = "sf:welcome:v1:";
const keyFor = (bucket: string) => PREFIX + bucket;

export function rawTourDone(store: Store | null, bucket: string): string | null {
  try {
    return store ? store.getItem(keyFor(bucket)) : null;
  } catch {
    return null;
  }
}

/** Anything other than the exact stored marker counts as "not yet". */
export const parseTourDone = (raw: string | null) => raw === "done";

export function markTourDone(store: Store | null, bucket: string) {
  try {
    store?.setItem(keyFor(bucket), "done");
  } catch {
    /* Storage blocked or full: the tour is simply offered again. */
  }
}
