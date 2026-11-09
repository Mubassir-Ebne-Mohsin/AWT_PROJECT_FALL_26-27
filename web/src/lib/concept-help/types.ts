// Concept help content model (docs/CONCEPT-HELP-SCOPE.md). Plain data: no model, no network, nothing that reads the open design.

export type Category =
  | "basics"
  | "results"
  | "components"
  | "traffic"
  | "patterns"
  | "app"
  | "account"
  | "trouble"
  | "ai"
  | "glossary";

export const CATEGORIES: readonly { id: Category; label: string; hint: string }[] = [
  { id: "basics", label: "Basics", hint: "Latency, p95, targets, what the model is" },
  { id: "results", label: "Reading results", hint: "Verdicts, utilization, bottlenecks" },
  { id: "components", label: "Components", hint: "What each building block does" },
  { id: "traffic", label: "Traffic settings", hint: "Rate, burst, read share, shape" },
  { id: "patterns", label: "Design choices", hint: "Cache, replica, queue, regions" },
  { id: "app", label: "Using the app", hint: "Where things are and how to do them" },
  { id: "account", label: "Account and help", hint: "Roles, sharing, reports, email" },
  { id: "trouble", label: "Troubleshooting", hint: "Errors and what to do" },
  { id: "ai", label: "AI and honesty", hint: "What is and is not AI here" },
  { id: "glossary", label: "Glossary", hint: "Short definitions" },
];

export interface Link {
  label: string;
  /** An existing route of the app (checked by a test against the route registry). */
  href: string;
}

export interface Entry {
  id: string;
  category: Category;
  title: string;
  /** Example phrasings: used for matching and offered as "ask this". */
  q: readonly string[];
  /** Words and phrases (a phrase has a space). Compared after the same light stemming as the question. */
  kw: readonly string[];
  /** The answer itself, at most about 70 words. */
  a: string;
  why?: string;
  /** "In the app": real buttons and screens, at most four. */
  steps?: readonly string[];
  example?: string;
  /** Ids of two or three follow-up entries, shown as chips. */
  rel?: readonly string[];
  links?: readonly Link[];
  /** Ask more of these first when the drawer is opened from this kind of screen. */
  screens?: readonly string[];
}

export interface Reply {
  kind: "answer" | "fallback";
  entry?: Entry;
  /** The text shown, flattened (also what the older scriptedReply() returns). */
  text: string;
  /** Other close matches (answers) or the nearest topics (fallback). */
  also: readonly Entry[];
}
