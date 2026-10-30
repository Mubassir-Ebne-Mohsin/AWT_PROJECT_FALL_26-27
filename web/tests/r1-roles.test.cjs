const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ROLE_LABEL, extraRoles, extraRoleText, canEnter } = require("../src/lib/roles-presentation.ts");

test("R1 roles: a plain account shows no extra role, and unknown server values are ignored", () => {
  assert.deepEqual(extraRoles(["user"]), []);
  assert.deepEqual(extraRoles(undefined), []);
  assert.equal(extraRoleText(["user"]), "");
  assert.deepEqual(extraRoles(["user", "superuser", "root"]), []);
});

test("R1 roles: extra roles are listed in a fixed order with their display names", () => {
  assert.equal(extraRoleText(["user", "admin", "reviewer"]), "Reviewer, Admin");
  assert.equal(extraRoleText(["user", "instructor", "reviewer", "admin"]), "Instructor, Reviewer, Admin");
  assert.deepEqual(Object.values(ROLE_LABEL), ["User", "Instructor", "Reviewer", "Admin"]);
});

test("R1 roles: an area needs its own role; no role stands in for another", () => {
  assert.equal(canEnter(["user", "admin"], "admin"), true);
  assert.equal(canEnter(["user", "admin"], "reviewer"), false);
  assert.equal(canEnter(["user", "reviewer"], "admin"), false);
  assert.equal(canEnter(["user"], "instructor"), false);
  assert.equal(canEnter([], "user"), false);
  assert.equal(canEnter(undefined, "admin"), false);
});
