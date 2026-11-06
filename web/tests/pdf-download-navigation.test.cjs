const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isLocalFileDownload } = require("../src/lib/draft-navigation.ts");
test("only same-origin Blob links with a download attribute bypass draft-navigation prompts", () => {
 assert.equal(isLocalFileDownload("blob:http://localhost:3003/own-file", true, "http://localhost:3003"), true);
 for (const [href, download] of [["blob:http://other.test/file", true], ["blob:http://localhost:3003/file", false], ["http://localhost:3003/dashboard", true], ["https://other.test/file.pdf", true], ["data:application/pdf,unsafe", true], ["javascript:alert(1)", true], ["invalid", true]])
  assert.equal(isLocalFileDownload(href, download, "http://localhost:3003"), false, href);
});
