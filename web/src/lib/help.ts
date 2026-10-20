// Per-screen help copy, ported from the prototype's HELP table (SECTION 6).
// Keys are route ids; workspace tabs use "ws-<tab>".
export interface HelpEntry {
  what: string;
  how: string[];
  concepts: string[];
}

export const HELP: Record<string, HelpEntry> = {
  dashboard: {
    what: "Your designs, which ones fail their targets, and recent test runs.",
    how: [
      "Cards show each design’s live verdict at its own traffic.",
      "“Needs attention” lists designs that miss their p95 or error target right now.",
      "Open a card to edit, or jump straight to its results.",
    ],
    concepts: ["p95", "utilization"],
  },
  new: {
    what: "Four ways to start a design.",
    how: [
      "Describe it in words and get an AI draft (scripted for now).",
      "Start from a template that already works.",
      "Draw on a blank canvas, or import a JSON file.",
    ],
    concepts: [],
  },
  "new-describe": {
    what: "Write a paragraph about your system. The draft picks components, a traffic level and the share of reads.",
    how: [
      "Mention technologies (Postgres, Redis, Kafka) and numbers (200k daily users, 3 app servers).",
      "Every assumption the draft makes is listed so you can correct it.",
      "Open in editor to keep the draft.",
    ],
    concepts: [],
  },
  "new-template": {
    what: "Templates are complete designs with sensible traffic.",
    how: ["Each card shows where that template breaks at its default traffic.", "Select one to preview, then use it."],
    concepts: [],
  },
  "new-blank": {
    what: "Start with an empty canvas and a checklist.",
    how: [
      "Clients is where traffic enters. Keep it unless you are importing later.",
      "The editor shows four steps until your first test runs.",
    ],
    concepts: [],
  },
  "new-import": {
    what: "Paste or load a design file.",
    how: [
      "The format has nodes (id, type, label, x, y, props) and edges (from, to).",
      "Validation runs before anything is created.",
    ],
    concepts: [],
  },
  "ws-edit": {
    what: "Draw the architecture. Numbers update as you edit.",
    how: [
      "Drag a component from the palette onto the canvas, or click it to drop it in the middle.",
      "Drag from the round handle on a component’s right edge to another component to connect them.",
      "Select a component to change capacity, replicas, region and type-specific settings.",
      "Turn on the load overlay to colour components by utilization. The bottom bar moves traffic.",
    ],
    concepts: ["utilization", "load-balancing"],
  },
  "ws-traffic": {
    what: "The traffic scenario every test on this design uses.",
    how: [
      "Presets set rate, bursts, read share and the p95 target together.",
      "Burst multiplier: how far above the average the busiest minute goes.",
      "The p95 target and error budget decide pass or fail.",
    ],
    concepts: ["p95"],
  },
  "ws-results": {
    what: "The stress test at the current traffic, and why it ended the way it did.",
    how: [
      "The verdict compares p95 with your target and errors with your budget.",
      "The bottleneck is the busiest component on the request path.",
      "Request paths show which routes through the system are slow, and how often they happen.",
    ],
    concepts: ["p95", "utilization", "caching"],
  },
  "ws-limits": {
    what: "Traffic ramps up until the design misses its target.",
    how: [
      "The breaking point is the entry traffic where p95 or the error rate first crosses its limit.",
      "Failure order lists when each component would reach 100%.",
      "Headroom compares the breaking point with today’s traffic.",
    ],
    concepts: ["utilization", "queues"],
  },
  login: {
    what: "Log in with the email and password you registered.",
    how: [
      "Use the demo account demo@stressforge.dev if your admin seeded it.",
      "After logging in you return to the page you were trying to open.",
      "Too many attempts in a minute are rate limited.",
    ],
    concepts: [],
  },
  register: {
    what: "Create an account.",
    how: [
      "Use 8 or more characters with at least one letter and one number.",
      "Your email is only used to log in.",
      "You are signed in as soon as the account is created.",
    ],
    concepts: [],
  },
};
