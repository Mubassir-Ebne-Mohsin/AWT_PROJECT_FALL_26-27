// Explicit Docker integration test: synthetic fixtures only, never the real app context.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
test("Docker excludes synthetic credentials and dependency trees from build context", { timeout: 90000 }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "stressforge-hardening-context-"));
  const context = path.join(temporary, "context");
  const output = path.join(temporary, "output");
  fs.mkdirSync(context);
  const excluded = [".env", ".env.production", "nested/.env.local", "private.key", "cert.pem", "nested/private.key", "nested/cert.pem", "nested/client_secret-test.json", "client_secret-test.json", "node_modules/fake.js", "nested/node_modules/fake.js", "dist/main.js", ".git/config"];
  try {
    fs.copyFileSync(path.join(__dirname, "../.dockerignore"), path.join(context, ".dockerignore"));
    for (const name of [...excluded, ".env.example", "src/main.ts", "package.json", "pnpm-lock.yaml"]) {
      const file = path.join(context, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "synthetic-non-secret-canary");
    }
    fs.writeFileSync(path.join(context, "Dockerfile"), "FROM scratch\nCOPY . /\n");
    const result = spawnSync("docker", ["build", "--progress=plain", "--output", `type=local,dest=${output}`, context], { encoding: "utf8", timeout: 75000 });
    assert.equal(result.status, 0, "Synthetic scratch build must complete: " + (result.error?.message ?? result.stderr));
    for (const name of excluded) assert.equal(fs.existsSync(path.join(output, name)), false, `Excluded: ${name}`);
    for (const name of [".env.example", "src/main.ts", "package.json", "pnpm-lock.yaml"]) assert.equal(fs.existsSync(path.join(output, name)), true, `Included: ${name}`);
  } finally {
    // Exact mkdtemp-owned directory only; never any project path.
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
