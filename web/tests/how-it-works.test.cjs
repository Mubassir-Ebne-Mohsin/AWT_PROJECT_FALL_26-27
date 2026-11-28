const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { JSDOM } = require("jsdom");
require.cache[require.resolve("next/link")] = { exports: { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) } };
const { HowItWorksPage } = require("../src/components/public/how-it-works-page.tsx");
const { HOW_SECTIONS } = require("../src/lib/public-content.ts");
test("How walkthrough preserves every model explanation and caveat in its server-rendered content", () => {
 const d = new JSDOM(renderToStaticMarkup(React.createElement(HowItWorksPage))).window.document;
 assert.equal(d.querySelectorAll("[data-model-note]").length, HOW_SECTIONS.length);
 for (const section of HOW_SECTIONS) {
  const note=d.querySelector('[data-model-note="'+section.id+'"]');assert.ok(note,section.id);
  for (const text of [...section.body,...(section.items??[])]) assert.ok(note.textContent.includes(text),section.id);
 }
 for(const link of d.querySelectorAll('.how-jump a')) assert.ok(d.querySelector(link.getAttribute('href')),'anchor target exists');
 assert.equal(d.querySelectorAll('h1').length,1);assert.equal(d.querySelector('h1').textContent,'How it works');
 assert.equal(d.querySelectorAll('.how-traffic dt').length,6);
});
