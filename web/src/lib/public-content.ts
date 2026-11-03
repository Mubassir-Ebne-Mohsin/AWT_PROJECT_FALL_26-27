// P1 public pages: the words, as typed data. Every claim here is checked against docs/SIMULATION-MODEL.md or the code
// (see tests/p1-public.test.cjs). Edit the words here; the components only lay them out.

export type Section = { id: string; heading: string; body: string[]; items?: string[] };

export const MODEL_BOUNDS = { components: 50, connections: 200, namedPaths: 6, timelinePoints: 48, limitsSearchRps: "10 million" } as const;

export const HOW_INTRO =
  "StressForge does not send traffic to real servers. It runs a mathematical model of the design you draw, so every number is an estimate that helps you compare designs and find weak points. It is not a measurement of real infrastructure.";

export const HOW_SECTIONS: Section[] = [
  {
    id: "request",
    heading: "How a request travels",
    body: [
      "Traffic starts at the Clients component and is split into reads, writes and background work. Each kind follows the connections you drew, through routing, compute and data components, and the load on every component is added up.",
    ],
  },
  {
    id: "utilization",
    heading: "Utilization and waiting",
    body: [
      "For each component the model divides the load arriving by what the component can handle (its capacity times its replicas). That ratio is the utilization, written ρ. Waiting time stays small while ρ is low and grows sharply as ρ approaches 1.",
      "For one server the expected wait is the service time S times ρ divided by 1 minus ρ. With several parallel servers the model uses a standard queueing approximation (Sakasegawa). Near saturation the result is clamped, so a component that cannot keep up is reported as saturated instead of producing an infinite number.",
    ],
  },
  {
    id: "percentiles",
    heading: "From waiting to p50, p95 and p99",
    body: [
      "Component times are added along each path a request can take. Fixed round-trip times are added when a path crosses regions. The paths are then combined into a distribution of total times, from which p50, p95 and p99 are read. The six most important paths are shown by name so you can see where the time goes.",
      "These percentiles come from the model's own distribution. They are not exact queueing-theory quantiles and they are not measured latencies.",
    ],
  },
  {
    id: "timeline",
    heading: "The timeline",
    body: [
      "The timeline shows 48 points sampled from the traffic profile with a fixed seed, so it looks the same each time. It is an illustration of how load changes. It is not a simulation of a queue evolving over time.",
    ],
  },
  {
    id: "limits",
    heading: "Limits: where a design breaks",
    body: [
      "The Limits view searches for the load at which your design first misses its targets. The search goes up to 10 million requests per second. If the design already fails at 1 request per second, it says so and gives no headroom. If it never fails within the search range, it reports that the break was not reached, which is not a claim of unlimited capacity.",
    ],
  },
  {
    id: "bounds",
    heading: "Sizes and repeatability",
    body: [
      "A design can have up to 50 components and 200 connections. Some dense designs are too expensive to calculate even below those limits; the app then says the calculation could not finish and never shows a partial answer. The same design with the same traffic always gives the same result.",
    ],
  },
  {
    id: "leaves-out",
    heading: "What the model leaves out",
    body: ["Real systems misbehave in ways this model does not represent. In particular, it has no:"],
    items: [
      "garbage-collection or other pauses",
      "cold caches after a restart or deploy",
      "retry storms, where failures create extra load",
      "differences between real machines and networks",
    ],
  },
  {
    id: "calibration",
    heading: "Has it been compared with reality?",
    body: [
      "Only a first, small comparison. The model has been compared with one simple test service on one laptop (see the Calibration tab on the Evaluation page), but no real application has been load-tested and compared with the model's prediction. The formulas are also tested against their own mathematics. Treat the numbers as a way to reason about designs, and confirm anything important with a real load test.",
    ],
  },
];

export const ABOUT_SECTIONS: Section[] = [
  {
    id: "why",
    heading: "Why this exists",
    body: [
      "StressForge is an architecture drawing and simulation lab for students and developers. You draw a system, choose a traffic profile, and see which component gives way first, then change the design and run it again.",
      "It was built as a course project for Advanced Web Technologies (Fall 2026-27) to practise a complete web application: accounts, saved designs, a calculation engine, sharing and review.",
    ],
  },
  {
    id: "who",
    heading: "Who it is for",
    body: ["Four kinds of account share the same app:"],
    items: [
      "Everyone can draw, run, save, compare and report on their own designs, and try published challenges.",
      "Reviewers read designs that an owner chose to share with them and leave comments.",
      "Instructors publish challenges and read the submissions to their own challenges.",
      "Admins manage accounts and roles. Admins cannot read anyone's designs.",
    ],
  },
  {
    id: "stack",
    heading: "What it is built with",
    body: ["A web app in Next.js and React, an API in NestJS, both in TypeScript, with PostgreSQL for data and Redis for short-lived state. The calculation runs on the server in the NestJS API."],
  },
  {
    id: "honest",
    heading: "What to keep in mind",
    body: ["The numbers are model estimates, not measurements. The AI features are switched off in this version and nothing you create is sent to an AI service."],
  },
  {
    id: "source",
    heading: "Source",
    body: ["The project source is on GitHub at Mubassir-Ebne-Mohsin/AWT_PROJECT_FALL_26-27."],
  },
];

export const SOURCE_URL = "https://github.com/Mubassir-Ebne-Mohsin/AWT_PROJECT_FALL_26-27";

export type Stored = { what: string; detail: string; who: string };

export const PRIVACY_INTRO =
  "This page says what StressForge keeps about you and who can see it. It describes this version of the app, which is a course project.";

export const PRIVACY_STORED: Stored[] = [
  { what: "Your account", detail: "Email, display name, roles, and a salted hash of your password (never the password itself).", who: "You. Admins can see your email, name and roles, and suspend the account." },
  { what: "Your designs", detail: "Each design, its saved versions, notes, and the results of runs.", who: "Only you, plus anyone you choose to share with. Admins cannot read designs." },
  { what: "Share links", detail: "A link you create is stored as a one-way hash, with its expiry and whether it was revoked.", who: "Anyone with the link, until you revoke it or it expires." },
  { what: "Reviews", detail: "A frozen copy of one revision you share with a named Reviewer, and the comment thread.", who: "You and that Reviewer, who sees your display name but not your email. Access ends when you stop sharing." },
  { what: "Challenges", detail: "As an Instructor: your challenges. As a learner: your private attempt, each submission with its judged result, and any feedback you received.", who: "Learners see their own attempts. Instructors see graded submissions to their own challenges, with your display name but not your email." },
  { what: "Sign-in", detail: "A refresh cookie that keeps you signed in, and a plain marker cookie that only says someone signed in on this browser.", who: "Your browser and the server." },
  { what: "Role history", detail: "A record of who gave or removed a role, and when, with the email text of the accounts involved.", who: "Admins. It is kept after an account is deleted." },
];

export const PRIVACY_AI =
  "The AI features are switched off. Nothing you draw, write or run is sent to any AI service.";
export const PRIVACY_CONTROL =
  "You can revoke share links and reviews at any time. In Settings, under Data, you can download everything you have stored and delete your account. Deleting removes your designs and their results; a challenge other people have attempted is kept without an owner so their results survive, and the history of role changes is kept as an audit log.";

export const TERMS_SECTIONS: Section[] = [
  {
    id: "estimates",
    heading: "Results are estimates",
    body: ["Everything StressForge reports comes from a mathematical model. It is not a measurement of real systems. Do not rely on it for decisions that affect production systems without testing them for real."],
  },
  {
    id: "use",
    heading: "Using the service",
    body: ["You are responsible for what you put in your designs, notes and comments, and for keeping your password private. Do not try to read other people's data, overload the service or get around its limits."],
  },
  {
    id: "limits",
    heading: "Limits",
    body: ["The app limits sizes and request rates to stay usable for everyone: for example 50 components and 200 connections per design, 20 graded submissions per challenge attempt and 20 feedback notes per submission."],
  },
  {
    id: "accounts",
    heading: "Accounts and sharing",
    body: ["An Admin can suspend an account that breaks these terms. What you share, you share on purpose: a share link shows your design to anyone who has it until you revoke it."],
  },
  {
    id: "warranty",
    heading: "No warranty",
    body: ["This is a course project provided as it is, without any promise that it will be available, accurate or free of mistakes."],
  },
];
