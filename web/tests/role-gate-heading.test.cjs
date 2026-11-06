const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
let state = { roles: [], loading: false, failed: false };
require.cache[require.resolve("../src/components/auth/use-my-roles.ts")] = { exports: { useMyRoles: () => state } };
const { RoleGate } = require("../src/components/auth/role-gate.tsx");
const render = (props = {}) => renderToStaticMarkup(React.createElement(RoleGate, { role: "support", ...props }, React.createElement("h1", null, "Private report")));
test("a standalone denied role page has one generic h1 and no protected content", () => {
 state = { roles: [], loading: false, failed: false };
 const html = render({ headingLevel: 1 });
 assert.match(html, /<h1[^>]*>This area is for Support accounts<\/h1>/);
 assert.doesNotMatch(html, /Private report/);
 assert.equal((html.match(/<h1/g) || []).length, 1);
});
test("standalone unavailable access has a heading; default nested gates keep h2", () => {
 state = { roles: [], loading: false, failed: true };
 assert.match(render({ headingLevel: 1 }), /<h1[^>]*>We could not check your access<\/h1>/);
 assert.match(render(), /<h2[^>]*>We could not check your access<\/h2>/);
 assert.doesNotMatch(render(), /<h1/);
});
test("an authorized standalone role page keeps only its real report heading", () => {
 state = { roles: ["user", "support"], loading: false, failed: false };
 const html = render({ headingLevel: 1 });
 assert.match(html, /Private report/);
 assert.equal((html.match(/<h1/g) || []).length, 1);
 assert.doesNotMatch(html, /This area is for/);
});
