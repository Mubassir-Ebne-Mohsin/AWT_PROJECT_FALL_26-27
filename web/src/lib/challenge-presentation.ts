import { ApiError } from "@/lib/api/errors";

export const TITLE_MAX = 80;
export const SUMMARY_MAX = 2000;
export const SHAPES = ["steady", "ramp", "spike"] as const;
export type Shape = (typeof SHAPES)[number];

/** Everything on the challenge form, as the text boxes hold it. Percentages are typed as percentages. */
export type FormValues = {
  title: string;
  summary: string;
  designId: string;
  p95Ms: string;
  errorPct: string;
  rps: string;
  burst: string;
  readPct: string;
  durationMin: string;
  shape: Shape;
};

export const EMPTY_FORM: FormValues = { title: "", summary: "", designId: "", p95Ms: "300", errorPct: "1", rps: "500", burst: "1.5", readPct: "80", durationMin: "10", shape: "steady" };

type Goal = { p95Ms: number; errorRate: number };
type Traffic = { rps: number; burst: number; readRatio: number; durationMin: number; shape: string };
type Shown = { title: string; summary: string; goal: Goal; traffic: Traffic };

/** A number with at most two decimals and no trailing zeros: 0.01 -> "1", 0.0125 -> "1.25". */
const trim = (n: number) => String(Math.round(n * 100) / 100);
export const pct = (rate: number) => trim(rate * 100);

/** The form for an existing challenge. The starting design is not sent back to the browser, so it starts empty. */
export function fromChallenge(c: Shown): FormValues {
  return {
    title: c.title,
    summary: c.summary,
    designId: "",
    p95Ms: String(c.goal.p95Ms),
    errorPct: pct(c.goal.errorRate),
    rps: String(c.traffic.rps),
    burst: String(c.traffic.burst),
    readPct: pct(c.traffic.readRatio),
    durationMin: String(c.traffic.durationMin),
    shape: (SHAPES as readonly string[]).includes(c.traffic.shape) ? (c.traffic.shape as Shape) : "steady",
  };
}

export type Body = {
  title: string;
  summary: string;
  goal: { p95Ms: number; errorRate: number };
  traffic: { preset: "custom"; rps: number; burst: number; readRatio: number; durationMin: number; shape: Shape };
  from?: { designId: string };
};
export type Converted = { ok: true; body: Body } | { ok: false; errors: Partial<Record<keyof FormValues, string>> };

const num = (raw: string) => (raw.trim() === "" ? NaN : Number(raw));

/** The same limits the server enforces, so a mistake is explained next to its box instead of after a round trip. */
export function toBody(v: FormValues, options: { needDesign: boolean }): Converted {
  const errors: Partial<Record<keyof FormValues, string>> = {};
  const title = v.title.trim();
  const summary = v.summary.trim();
  if (title.length < 1 || title.length > TITLE_MAX) errors.title = `Give it a title of 1 to ${TITLE_MAX} characters.`;
  if (summary.length < 1 || summary.length > SUMMARY_MAX) errors.summary = `Describe it in 1 to ${SUMMARY_MAX.toLocaleString("en-US")} characters.`;
  if (options.needDesign && !v.designId) errors.designId = "Choose the design learners will start from.";
  const p95Ms = num(v.p95Ms);
  if (!(p95Ms >= 1 && p95Ms <= 60000)) errors.p95Ms = "Use a p95 goal between 1 and 60,000 ms.";
  const errorPct = num(v.errorPct);
  if (!(errorPct >= 0 && errorPct <= 100)) errors.errorPct = "Use an error limit between 0 and 100 percent.";
  const rps = num(v.rps);
  if (!(rps >= 0 && rps <= 1e7)) errors.rps = "Use requests per second between 0 and 10,000,000.";
  const burst = num(v.burst);
  if (!(burst >= 1 && burst <= 100)) errors.burst = "Use a burst multiplier between 1 and 100.";
  const readPct = num(v.readPct);
  if (!(readPct >= 0 && readPct <= 100)) errors.readPct = "Use a read share between 0 and 100 percent.";
  const durationMin = num(v.durationMin);
  if (!(durationMin >= 1 && durationMin <= 1440)) errors.durationMin = "Use a duration between 1 and 1,440 minutes.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    body: {
      title,
      summary,
      goal: { p95Ms, errorRate: errorPct / 100 },
      traffic: { preset: "custom", rps, burst, readRatio: readPct / 100, durationMin, shape: v.shape },
      ...(v.designId ? { from: { designId: v.designId } } : {}),
    },
  };
}

export const statusLabel = (status: string) => (status === "published" ? "Published" : status === "archived" ? "Archived" : "Draft");

export const goalText = (g: Goal) => `p95 at or under ${g.p95Ms} ms and errors at or under ${pct(g.errorRate)}%`;
export const trafficText = (t: Traffic) => `${t.rps} requests/s, burst x${t.burst}, ${pct(t.readRatio)}% reads, ${t.durationMin} min, ${t.shape}`;

type Baseline = { p95: number; errorRate: number; passes: boolean } | null;
export function baselineText(b: Baseline) {
  if (!b) return "Not measured yet. Publishing measures the starting design at this traffic.";
  const numbers = `p95 ${Math.round(b.p95 * 10) / 10} ms, ${pct(b.errorRate)}% errors`;
  return b.passes ? `The starting design already meets the goal (${numbers}), so there may be nothing for learners to fix.` : `The starting design does not meet the goal yet (${numbers}).`;
}

export const CHALLENGE_RULES_TEXT = "Learners start from a frozen copy of the design you pick. After you publish, the goal, traffic and starting design cannot change; you can still fix the wording, archive it, or duplicate it into a new draft.";
export const CHALLENGE_TEXT_NOTE = "Titles and descriptions are shown to everyone as plain text.";

/** Why an action failed, in words that say what to do. Nothing is taken from the server's raw message. */
export function challengeErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason === "CHALLENGE_LIMIT_REACHED") return "You already have 50 challenges, the most allowed. Archived ones count too.";
    if (reason === "PUBLISHED_FROZEN") return "A published challenge's goal, traffic and starting design cannot change. Duplicate it to make a new draft.";
    if (reason === "ARCHIVED") return "This challenge is archived, so it cannot be changed or published. Duplicate it to start a new draft.";
    if (reason === "STARTING_DESIGN_INVALID") return "The starting design has problems the model cannot test. Pick another design, or fix it first.";
    if (reason === "STARTING_DESIGN_TOO_COMPLEX") return "The starting design is too complex to test. Simplify it, or pick another.";
    if (reason === "CHANGED_DURING_PUBLISH") return "The challenge changed while it was being checked. Try publishing again.";
    if (reason === "VERSION_NOT_RETAINED") return "That version of the design is no longer kept. Pick the design again.";
    if (e.status === 403) return "You can only use your own designs, and only Instructor accounts can manage challenges.";
    if (e.status === 404) return "That challenge or design is no longer available.";
    if (e.status === 422) return "Check the highlighted boxes and try again.";
    if (e.status === 503 || e.code === "UNAVAILABLE") return "The starting design could not be tested right now. Please try again.";
    if (e.code === "NETWORK") return "The server could not be reached. Nothing was changed.";
  }
  return "That did not work. Nothing was changed.";
}

export const FEEDBACK_MAX = 2000;
export const FEEDBACK_NOTE = "Feedback is plain text. The learner reads it on their attempt page. You cannot edit or remove a note once sent, and each submission takes up to 20.";

/** One line for a graded submission: the outcome and the model's numbers. */
export const outcomeText = (s: { passes: boolean; p95: number; errorRate: number }) =>
  `${s.passes ? "Passed" : "Not passed"} · p95 ${Math.round(s.p95 * 10) / 10} ms · errors ${pct(s.errorRate)}%`;

/** Why feedback could not be sent, in words that say what to do. Nothing is taken from the server's raw message. */
export function feedbackErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason === "FEEDBACK_LIMIT") return "This submission already has 20 notes, the most allowed.";
    if (e.status === 404) return "That submission is no longer available.";
    if (e.status === 403) return "Only the Instructor who owns the challenge can send feedback.";
    if (e.status === 422) return `Write between 1 and ${FEEDBACK_MAX} characters.`;
    if (e.code === "NETWORK") return "The server could not be reached. Your note was not sent.";
  }
  return "That did not work. Your note was not sent.";
}
