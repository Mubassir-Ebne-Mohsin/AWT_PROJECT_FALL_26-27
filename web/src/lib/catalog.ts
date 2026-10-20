// Fixed vocabularies from the prototype (SECTION 3 and SECTION 5). They decide which
// dynamic URL segments are valid and what their titles and breadcrumbs say.

export const LEARN_TOPICS: Record<string, string> = {
  p95: "p95 latency",
  caching: "Caching",
  queues: "Queues",
  replicas: "Read replicas",
  "load-balancing": "Load balancing",
  utilization: "Utilization (ρ)",
  cdn: "CDNs",
  regions: "Regions and latency",
};

export const CHALLENGES: Record<string, string> = {
  "flash-sale": "Survive a flash sale",
  "p95-100": "Get p95 under 100 ms",
  "cross-region": "Fix a cross-region app",
  "launch-10x": "Handle 10x launch traffic",
};

export const EVAL_TABS: Record<string, string> = {
  simulator: "Simulator",
  calibration: "Calibration",
  ai: "AI",
};

export const SETTINGS_SECTIONS: Record<string, string> = {
  profile: "Profile",
  security: "Security",
  "ai-usage": "AI usage",
  data: "Data",
  appearance: "Appearance",
  preferences: "Preferences",
};

export const FOREIGN_DESIGNS: Record<string, string> = {
  "acme-legacy": "Legacy billing (owned by another account)",
};

export type Fidelity = "C" | "P" | "S";

export const FIDELITY_LABEL: Record<Fidelity, string> = {
  C: "Complex · full interaction",
  P: "Partial · realistic layout",
  S: "Simple · static",
};

export const PHASE_NAMES: Record<number, string> = {
  1: "Foundation",
  2: "Core loop",
  3: "Improve and history",
  4: "Public and learning pages",
  5: "Evaluation, settings, onboarding and developer screens",
};

export interface WorkspaceTab {
  id: string;
  label: string;
  icon: string;
  phase: number;
  fid: Fidelity;
  desc?: string;
  planned?: string[];
}

export const WS_TABS: WorkspaceTab[] = [
  { id: "edit", label: "Edit", icon: "pencil", phase: 2, fid: "C" },
  { id: "traffic", label: "Traffic", icon: "wave", phase: 2, fid: "P" },
  { id: "results", label: "Results", icon: "bars", phase: 2, fid: "C" },
  { id: "limits", label: "Limits", icon: "gauge", phase: 2, fid: "P" },
  {
    id: "improve",
    label: "Improve",
    icon: "sparkle",
    phase: 3,
    fid: "C",
    desc: "The AI improvement loop: suggestions chosen by the real bottleneck, applied to the canvas, with a before and after comparison.",
    planned: [
      "Suggestions ranked by impact, streamed in with reasoning",
      "Apply one to see it on the canvas with a before and after diff",
      "Keep, revert or try the next suggestion; each step is a version",
    ],
  },
  {
    id: "history",
    label: "History",
    icon: "history",
    phase: 3,
    fid: "P",
    desc: "Every version of the design and every test run, with what changed between them.",
    planned: [
      "Timeline of versions and runs",
      "Restore any version",
      "Pick two versions to open in Compare",
    ],
  },
  {
    id: "notes",
    label: "Notes",
    icon: "note",
    phase: 3,
    fid: "S",
    desc: "A log of assumptions and decisions: why the cache is 80%, why the DB is in EU West.",
    planned: [
      "Assumptions the AI made when drafting",
      "Your decision records, linked to versions",
      "Exported into the report",
    ],
  },
];

export const titleCase = (s: string) =>
  String(s)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
