// The route registry: one typed description of every screen, extracted from the
// prototype's ROUTES table (SECTION 5). The command palette, breadcrumbs, help
// drawer, placeholders and the auth gate all read from here.
import {
  CHALLENGES,
  EVAL_TABS,
  Fidelity,
  FOREIGN_DESIGNS,
  LEARN_TOPICS,
  SETTINGS_SECTIONS,
  WS_TABS,
  titleCase,
} from "@/lib/catalog";

export type Area = "public" | "app" | "onboarding" | "dev";
export type Params = Record<string, string>;

export interface RouteDef {
  id: string;
  path: string;
  area: Area;
  phase: 1 | 2 | 3 | 4 | 5;
  fidelity: Fidelity;
  title: string | ((p: Params) => string);
  description?: string;
  planned?: string[];
  /** Pure redirect: the screen is only an alias for another URL. */
  redirectTo?: (p: Params) => string;
  /** Extra check for dynamic segments; failing it makes the URL a 404. */
  accepts?: (p: Params) => boolean;
}

const pub = (
  path: string,
  id: string,
  title: RouteDef["title"],
  phase: RouteDef["phase"],
  fidelity: Fidelity,
  description?: string,
  planned?: string[],
): RouteDef => ({ id, path, area: "public", phase, fidelity, title, description, planned });

const app = (
  path: string,
  id: string,
  title: RouteDef["title"],
  phase: RouteDef["phase"],
  fidelity: Fidelity,
  description?: string,
  planned?: string[],
  extra?: Partial<RouteDef>,
): RouteDef => ({ id, path, area: "app", phase, fidelity, title, description, planned, ...extra });

export const ROUTES: RouteDef[] = [
  pub("/", "landing", "Architecture Stress Test", 4, "C", "The public architecture lab introduction: draw, model and refine a system, with an illustrated scroll-driven anatomy and account entry.", ["Exploded architecture illustration (not a live simulation)", "Available simulation features and model limitations", "Create an account or log in"]),
  pub("/login", "login", "Log in", 1, "C"),
  pub("/register", "register", "Sign up", 1, "C"),
  pub("/examples", "examples", "Examples", 4, "P", "Example designs anyone can open and stress-test without an account.", ["Six examples, each with its breaking point", "Open an example read-only and move the traffic slider", "Copy it to your account after signing up"]),
  pub("/how-it-works", "how", "How it works", 4, "P", "The model behind the numbers: assumptions, formulas and what the simulator leaves out.", ["Each component as an M/M/c queue, with one diagram", "How request paths combine into p50, p95 and p99", "Known limits: no GC pauses, cold caches or retry storms"]),
  pub("/learn", "learn", "Learn", 4, "P", "A concept library for the ideas behind the results.", ["Cards for p95, caching, queues, replicas, load balancing, CDNs and regions", "Each card links to the place it shows up in your results", "Progress marks for concepts you have opened"]),
  pub("/learn/:topic", "learn-topic", (p) => LEARN_TOPICS[p.topic] ?? titleCase(p.topic), 4, "P", "One concept, explained in plain words, with a live mini-demo you can drag.", ["A slider demo, such as cache hit rate against database load", "Where this concept shows up in your own designs", "A two-question check at the end"]),
  pub("/challenges", "challenges", "Challenges", 4, "P", "Practice scenarios with a broken design and a goal to hit.", ["Four starter challenges, from easy to hard", "Each shows the goal, the budget and the best score", "Open one to start the practice workspace"]),
  pub("/share/:token", "share-view", "Shared design", 3, "S", "A read-only view of a design or report someone shared with a link.", ["Canvas and latest results, read-only", "Owner, date and the traffic it was tested at", "Copy to your account"]),
  pub("/about", "about", "About", 4, "P", "The project, the stack, credits and the source.", ["Why this exists and who it is for", "Stack: Next.js, NestJS, TypeScript", "Credits and a link to the source"]),
  pub("/privacy", "privacy", "Privacy", 4, "P", "What is stored, and exactly what is sent to the AI.", ["Stored: your designs, runs and notes", "Sent to the AI: the design graph and your description, never your email", "How to export or delete everything"]),
  pub("/terms", "terms", "Terms", 4, "S", "Usage terms and the limits of the model.", ["Results are estimates from a model, not measurements", "Fair-use limits for AI calls", "No warranty for production decisions"]),
  app("/welcome", "welcome", "Welcome", 5, "P", "A first-run tour with a sample design you can break in under a minute.", ["Three-step tour of the editor, results and improve loop", "A sample design preloaded and ready to run", "Pick what you want to learn first"], { area: "onboarding" }),
  app("/dashboard", "dashboard", "Dashboard", 2, "C"),
  app("/new", "new", "New design", 2, "C", "Choose how to start a design.", ["Describe a system in words, choose a template, start blank or import JSON", "Open the resulting design in the editor"]),
  app("/new/describe", "new-describe", "Describe in words", 2, "C", "Draft an architecture from a paragraph.", ["Mention technologies, traffic and server counts", "Review and correct the draft assumptions before opening the editor"]),
  app("/new/template", "new-template", "Pick a template", 2, "P", "Start from a complete design with sensible traffic.", ["Preview templates and their breaking points", "Use the selected template as a new design"]),
  app("/new/blank", "new-blank", "Blank canvas", 2, "C", "Start with an empty canvas and a first-run checklist.", ["Keep the Clients entry point and add components", "Follow four steps to the first stress test"]),
  app("/new/import", "new-import", "Import JSON", 2, "S", "Load a saved design file.", ["Paste JSON or choose a design file with nodes and edges", "Validate the graph before creating the design"]),
  app("/designs", "designs", "Designs", 3, "P", "Every design you own, with search, filters and each one’s latest result.", ["Search, sort by last run or by breaking point", "Filter: failing, strained, passing", "Duplicate, rename, archive"]),
  app("/designs/:id/report", "report", "Report", 3, "P", "A printable report of the latest stress test.", ["Summary, verdict and the breaking point", "Charts, component table and the decisions log", "Download as PDF"]),
  app("/designs/:id/share", "share", "Share settings", 3, "S", "Control who can see this design.", ["Create or revoke a read-only link", "Choose: design only, or design plus report", "See when the link was last opened"]),
  app("/designs/:id/:tab", "workspace", (p) => WS_TABS.find((tab) => tab.id === p.tab)?.label ?? "Workspace", 2, "C", undefined, undefined, { accepts: (p) => WS_TABS.some((t) => t.id === p.tab) }),
  app("/designs/:id", "workspace-root", "Workspace", 2, "C", undefined, undefined, { redirectTo: (p) => `/designs/${p.id}/edit` }),
  app("/compare", "compare", "Compare versions", 3, "P", "Two versions of a design side by side, run against the same traffic.", ["Pick any two versions or designs", "Canvas diff: added, removed and changed components", "Metrics side by side with the change highlighted"]),
  app("/templates", "templates", "Templates", 4, "P", "The template library.", ["All templates with tags and breaking points", "Preview before using", "Start a design from any of them"]),
  app("/components", "components", "Components", 4, "P", "The component catalog: what each block models, and presets for common products.", ["Capacity and latency defaults for every type", "Presets such as Postgres on a 4-core box or Redis cluster", "How each type fails under overload"]),
  app("/challenges/:id", "challenge", (p) => CHALLENGES[p.id] ?? titleCase(p.id), 4, "P", "A practice workspace with a goal, a budget and a score.", ["A starting design that fails the goal", "Live goal checklist as you edit", "Score and a short debrief when you pass"]),
  app("/progress", "progress", "Progress", 5, "S", "Challenges passed and concepts learned.", ["Challenge results with scores", "Concepts opened and quiz results", "Streak and next suggestion"]),
  app("/evaluation", "evaluation-root", "Evaluation", 5, "C", undefined, undefined, { redirectTo: () => "/evaluation/simulator" }),
  app("/evaluation/:tab", "evaluation", (p) => `Evaluation: ${EVAL_TABS[p.tab] ?? titleCase(p.tab)}`, 5, "C", "The proof page. Every number here will be labelled as illustrative mock data in this prototype.", ["Simulator: formula tests against textbook queueing results", "Calibration: a real app load-tested against the simulator’s prediction", "AI: AI suggestions compared with a rule-based baseline"], { accepts: (p) => p.tab in EVAL_TABS }),
  app("/settings", "settings-root", "Settings", 5, "P", undefined, undefined, { redirectTo: () => "/settings/profile" }),
  app("/settings/:section", "settings", (p) => `Settings: ${SETTINGS_SECTIONS[p.section] ?? titleCase(p.section)}`, 5, "P", "Account settings in six sections.", ["Profile, Security, AI usage, Data, Appearance, Preferences", "AI usage shows calls left today and the reset time", "Data: export everything as JSON, or delete the account"], { accepts: (p) => p.section in SETTINGS_SECTIONS }),
  app("/dev/ai-logs", "dev-ai-logs", "AI logs", 5, "S", "Every AI call: prompt size, tokens, latency, and failures.", ["Table of calls with status and token counts", "Open any call to see the validated output", "Filter failures"], { area: "dev" }),
  app("/dev/evaluation-runner", "dev-eval-runner", "Evaluation runner", 5, "S", "Re-run the evaluation scenarios and compare with the last run.", ["Run all scenarios", "Diff against the previous run", "Export results"], { area: "dev" }),
];

interface Compiled {
  route: RouteDef;
  re: RegExp;
  keys: string[];
}

const COMPILED: Compiled[] = ROUTES.map((route) => {
  const keys: string[] = [];
  const pattern = route.path.replace(/\/:([a-z]+)/g, (_m, k: string) => {
    keys.push(k);
    return "/([^/]+)";
  });
  return { route, keys, re: new RegExp(`^${pattern}/?$`) };
});

export interface ResolvedRoute {
  route: RouteDef;
  path: string;
  params: Params;
  title: string;
}

export const NOT_FOUND_ROUTE: RouteDef = {
  id: "notfound",
  path: "",
  area: "public",
  phase: 1,
  fidelity: "S",
  title: "Page not found",
};

export function resolveRoute(pathname: string): ResolvedRoute {
  let path = (pathname || "/").split("?")[0] || "/";
  if (path.length > 1) path = path.replace(/\/+$/, "");
  for (const { route, re, keys } of COMPILED) {
    const m = re.exec(path);
    if (!m) continue;
    const params: Params = {};
    keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1]);
    });
    if (route.accepts && !route.accepts(params)) continue;
    return {
      route,
      path,
      params,
      title: typeof route.title === "function" ? route.title(params) : route.title,
    };
  }
  return { route: NOT_FOUND_ROUTE, path, params: {}, title: NOT_FOUND_ROUTE.title as string };
}

export const isProtected = (route: RouteDef) => route.area !== "public";

export interface Crumb {
  label: string;
  to?: string;
}

export function crumbsFor(r: ResolvedRoute): Crumb[] {
  const { route, params: P } = r;
  const isApp = route.area !== "public";
  const out: Crumb[] = [isApp ? { label: "Dashboard", to: "/dashboard" } : { label: "Home", to: "/" }];
  const designName = (id: string) => FOREIGN_DESIGNS[id] ?? id;
  switch (route.id) {
    case "dashboard":
      return [{ label: "Dashboard" }];
    case "landing":
      return [{ label: "Home" }];
    case "new":
      out.push({ label: "New design" });
      break;
    case "new-describe":
    case "new-template":
    case "new-blank":
    case "new-import":
      out.push({ label: "New design", to: "/new" }, { label: r.title });
      break;
    case "workspace":
      out.push(
        { label: "Designs", to: "/designs" },
        { label: designName(P.id), to: `/designs/${P.id}/edit` },
        { label: WS_TABS.find((t) => t.id === P.tab)?.label ?? P.tab },
      );
      break;
    case "report":
    case "share":
      out.push(
        { label: "Designs", to: "/designs" },
        { label: designName(P.id), to: `/designs/${P.id}/edit` },
        { label: r.title },
      );
      break;
    case "learn-topic":
      out.push({ label: "Learn", to: "/learn" }, { label: r.title });
      break;
    case "challenge":
      out.push({ label: "Challenges", to: "/challenges" }, { label: r.title });
      break;
    case "evaluation":
      out.push({ label: "Evaluation", to: "/evaluation/simulator" }, { label: EVAL_TABS[P.tab] });
      break;
    case "settings":
      out.push({ label: "Settings", to: "/settings/profile" }, { label: SETTINGS_SECTIONS[P.section] });
      break;
    case "dev-ai-logs":
    case "dev-eval-runner":
      out.push({ label: "Developer" }, { label: r.title });
      break;
    default:
      out.push({ label: r.title });
  }
  return out;
}

/** Routes with no dynamic segment and no redirect: what the command palette lists. */
export const STATIC_ROUTES = ROUTES.filter(
  (r) => !r.path.includes(":") && !r.redirectTo,
);

export const sectionOf = (path: string) => `/${(path || "/").split("/")[1] ?? ""}`;
