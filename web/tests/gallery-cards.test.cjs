const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { GalleryCard } = require("../src/components/gallery/gallery-card.tsx");
const { GalleryPreview } = require("../src/components/gallery/gallery-preview.tsx");
const preview = { nodes: [{ id: "a", type: "client", label: "Users", x: -600, y: -200 }, { id: "b", type: "app", label: "Application", x: -200, y: -200 }], edges: [{ id: "ab", from: "a", to: "b" }] };
const post = { id: "p", title: "Bookshop <script>", description: "A published example", ownerName: "Builder", publishedAt: "2026-11-25T10:00:00Z", revision: 9, verdict: "strained", p95: 248.34, p95Target: 300, tags: ["client", "lb", "app", "db"], nodeCount: 2, remixCount: 3, allowRemix: true, preview };
test("card presents recorded metrics, escaped title, author, revision, tags and view link", () => {
 const html = renderToStaticMarkup(React.createElement(GalleryCard, { post, onTag() {} }));
 for (const expected of ["248.34", "300", "Strained", "Revision 9", "by Builder", "3 remixes", "Load balancer", "+1 more", 'href="/gallery/p"', "marker-end="]) assert.ok(html.includes(expected), expected);
 assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>"));
});
test("preview preserves negative positions and arrow endpoints, with unique marker IDs", () => {
 const html = renderToStaticMarkup(React.createElement("div", null, React.createElement(GalleryPreview, { graph: preview, title: "A" }), React.createElement(GalleryPreview, { graph: preview, title: "B" })));
 assert.ok(html.includes('translate(-600 -200)')); assert.ok(html.includes('translate(-200 -200)'));
 const ids = [...html.matchAll(/<marker id="([^"]+)"/g)].map(m => m[1]); assert.equal(new Set(ids).size, 2);
});
test("missing preview and view-only designs have honest fallbacks", () => {
 const html = renderToStaticMarkup(React.createElement(GalleryCard, { post: { ...post, preview: null, allowRemix: false }, onTag() {} }));
 assert.ok(html.includes("Diagram preview unavailable")); assert.ok(html.includes("View only")); assert.ok(!html.includes("3 remixes"));
});
test("dangling edges do not crash previews", () => {
 assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(GalleryPreview, { graph: { ...preview, edges: [{ id: "bad", from: "a", to: "missing" }] }, title: "Example" })));
});

test("maximum-sized preview retains all 50 nodes and 200 edges", () => {
 const nodes = Array.from({length:50}, (_,i) => ({ id: "node"+i, type: "app", label:"App "+i, x: (i%10)*250-1000, y: Math.floor(i/10)*150-300 }));
 const edges = Array.from({length:200}, (_,i) => ({ id:"edge"+i, from:nodes[i%50].id, to:nodes[(i+1)%50].id }));
 const html = renderToStaticMarkup(React.createElement(GalleryPreview, { graph:{nodes, edges}, title:"Large topology" }));
 assert.equal([...html.matchAll(/<rect width="184" height="64"/g)].length,50);
 assert.equal([...html.matchAll(/marker-end=/g)].length,200);
 assert.ok(html.includes("50 components, 200 connections"));
});

test("creator's public username appears alongside display name, with a legacy fallback", () => {
 const withUsername = renderToStaticMarkup(React.createElement(GalleryCard, { post: { ...post, ownerUsername: "gallery_builder" }, onTag() {} }));
 assert.ok(withUsername.includes("by Builder")); assert.ok(withUsername.includes("@gallery_builder"));
 for (const ownerUsername of [undefined, null]) {
  const html = renderToStaticMarkup(React.createElement(GalleryCard, { post: { ...post, ownerUsername }, onTag() {} }));
  assert.ok(html.includes("by Builder")); assert.ok(!html.includes("@undefined")); assert.ok(!html.includes("@null"));
 }
});

test("saved previews distinguish current architecture, empty canvas and older API fallback", () => {
 const h = graph => renderToStaticMarkup(React.createElement(GalleryPreview, { graph, title: "My design", context: "saved" }));
 assert.ok(h(preview).includes("Saved architecture for My design"));
 assert.ok(!h(preview).includes("Published architecture"));
 assert.ok(h({ nodes: [], edges: [] }).includes("Empty canvas"));
 assert.ok(h(undefined).includes("Open the design to inspect its saved architecture."));
});
