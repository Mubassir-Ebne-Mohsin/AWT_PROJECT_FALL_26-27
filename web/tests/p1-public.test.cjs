const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const h = React.createElement;

require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => h("a", props, children) } };
const Pages = require("../src/components/public/static-pages.tsx");
const C = require("../src/lib/public-content.ts");
const { resolveRoute } = require("../src/lib/routes.ts");

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const doc = (html) => new JSDOM(html).window.document;
const PAGES = [
  ["/how-it-works", "HowItWorksPage"],
  ["/about", "AboutPage"],
  ["/privacy", "PrivacyPage"],
  ["/terms", "TermsPage"],
];

test("P1: each public page has exactly one h1 that is its registered title, a breadcrumb, headings in order and no placeholder text", () => {
  for (const [route, name] of PAGES) {
    const d = doc(renderToStaticMarkup(h(Pages[name])));
    const h1 = d.querySelectorAll("h1");
    assert.equal(h1.length, 1, route);
    assert.equal(h1[0].textContent, resolveRoute(route).title, route);
    assert.ok(d.querySelector("nav[aria-label='Breadcrumb'] [aria-current='page']"), route + " breadcrumb");
    assert.ok(d.querySelectorAll("h2").length >= 2, route + " has sections");
    assert.doesNotMatch(d.body.textContent, /Planned for this screen|Coming in phase|placeholder/i, route);
    for (const a of d.querySelectorAll("a[target='_blank']")) assert.match(a.getAttribute("rel"), /noopener/);
  }
});

test("P1: the pages need no account and make no request: they are plain server-rendered text", () => {
  for (const [route] of PAGES) {
    const source = read(`web/src/app/${route.slice(1)}/page.tsx`);
    assert.doesNotMatch(source, /use client|useAuth|fetch\(/, route);
  }
  const frame = read("web/src/components/public/static-pages.tsx");
  assert.doesNotMatch(frame, /use client|useAuth|useQuery|fetch\(/);
});

test("P1: how-it-works repeats only what the model document says, and states its limits", () => {
  const model = read("docs/SIMULATION-MODEL.md");
  assert.match(model, /50 nodes\/200 edges/);
  assert.match(model, /6 paths,\s*48 timeline points/);
  assert.match(model, /capped at\s*1e7 base rps/);
  assert.match(model, /Sakasegawa/);
  assert.match(model, /No empirical calibration was performed/);
  const text = C.HOW_SECTIONS.flatMap((s) => [s.heading, ...s.body, ...(s.items ?? [])]).join(" ") + C.HOW_INTRO;
  assert.match(text, /50 components and 200 connections/);
  assert.match(text, /48 points/);
  assert.match(text, /six most important paths/);
  assert.match(text, /10 million requests per second/);
  assert.match(text, /Sakasegawa/);
  assert.match(text, /not a measurement of real infrastructure/);
  assert.match(text, /Not yet\. .*no real application has been load-tested/s);
  for (const missing of ["garbage-collection", "cold caches", "retry storms"]) assert.match(text, new RegExp(missing));
  assert.doesNotMatch(text, /guarantee|accurate prediction|measured latenc(y|ies) of your/i);
  assert.equal(C.MODEL_BOUNDS.components, 50);
  assert.equal(C.MODEL_BOUNDS.connections, 200);
});

test("P1: the limits quoted in the terms are the limits the code enforces", () => {
  const attempts = read("nest-boilerplate/nest-boilerplate/src/common/contracts/phase3/attempts.schema.ts");
  assert.match(attempts, /SUBMISSION_LIMIT = 20/);
  assert.match(attempts, /FEEDBACK_MAX_PER_SUBMISSION = 20/);
  const graph = read("nest-boilerplate/nest-boilerplate/src/common/contracts/phase2/graph.schema.ts");
  assert.match(graph, /BOUNDS = \{ nodes: 50, edges: 200,/);
  assert.match(graph, /nodes: z\.array\(graphNode\)\.max\(BOUNDS\.nodes\)/);
  assert.match(graph, /edges: z\.array\(graphEdge\)\.max\(BOUNDS\.edges\)/);
  const terms = C.TERMS_SECTIONS.flatMap((s) => s.body).join(" ");
  assert.match(terms, /50 components and 200 connections/);
  assert.match(terms, /20 graded submissions/);
  assert.match(terms, /20 feedback notes/);
  assert.match(terms, /not a measurement of real systems/);
  assert.match(terms, /without any promise/);
});

test("P1: the privacy page matches what the app does: hashed passwords and links, no email shown to others, AI off", () => {
  const auth = read("nest-boilerplate/nest-boilerplate/src/modules/auth/auth.service.ts");
  assert.match(auth, /argon2\.hash/);
  const shares = read("nest-boilerplate/nest-boilerplate/src/modules/designs/design-shares.service.ts");
  assert.match(shares, /createHash\("sha256"\)/);
  const rows = Object.fromEntries(C.PRIVACY_STORED.map((r) => [r.what, r]));
  assert.match(rows["Your account"].detail, /salted hash of your password \(never the password itself\)/);
  assert.match(rows["Share links"].detail, /one-way hash/);
  assert.match(rows["Reviews"].who, /display name but not your email/);
  assert.match(rows["Challenges"].who, /display name but not your email/);
  assert.match(rows["Your designs"].who, /Admins cannot read designs/);
  assert.match(C.PRIVACY_AI, /switched off.*Nothing you draw, write or run is sent/s);
  const env = read("nest-boilerplate/nest-boilerplate/.env.example");
  assert.match(env, /AI_ENABLED=false/);
  const html = renderToStaticMarkup(h(Pages.PrivacyPage));
  assert.equal(doc(html).querySelectorAll("[data-testid='privacy-row']").length, C.PRIVACY_STORED.length);
});

test("P1: the privacy page promises export and deletion exactly when the API has them", () => {
  const dir = path.join(root, "nest-boilerplate/nest-boilerplate/src/modules");
  const controllers = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /controller\.ts$/.test(e.name) && controllers.push(fs.readFileSync(path.join(d, e.name), "utf8"))));
  walk(dir);
  const api = controllers.join("\n");
  const hasExport = /@(Get|Post)\("[^"]*export[^"]*"\)/i.test(api);
  const hasDelete = /@Controller\("account"\)[\s\S]*@Post\("delete"\)/.test(api);
  const promises = /download everything you have stored and delete your account/.test(C.PRIVACY_CONTROL);
  assert.equal(promises, hasExport && hasDelete, "the privacy text and the API disagree about export and deletion");
  assert.doesNotMatch(C.PRIVACY_CONTROL, /not available yet|planned for/);
  assert.match(C.PRIVACY_STORED.find((r) => r.what === "Role history").who, /kept after an account is deleted/);
});

test("P1: the about page names the real stack and the real roles, and the source link is the repository", () => {
  const web = JSON.parse(read("web/package.json")).dependencies;
  const api = JSON.parse(read("nest-boilerplate/nest-boilerplate/package.json")).dependencies;
  assert.ok(web.next && web.react && api["@nestjs/core"] && api.typeorm && api.ioredis);
  const text = C.ABOUT_SECTIONS.flatMap((s) => [...s.body, ...(s.items ?? [])]).join(" ");
  for (const word of ["Next.js", "React", "NestJS", "TypeScript", "PostgreSQL", "Redis", "Reviewers", "Instructors", "Admins"]) assert.match(text, new RegExp(word));
  assert.match(text, /Admins cannot read anyone's designs/);
  assert.equal(C.SOURCE_URL, "https://github.com/Mubassir-Ebne-Mohsin/AWT_PROJECT_FALL_26-27");
  const d = doc(renderToStaticMarkup(h(Pages.AboutPage)));
  assert.equal(d.querySelector("a[target='_blank']").getAttribute("href"), C.SOURCE_URL);
});
