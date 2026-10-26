// Development-only source worker. Compile with the existing SWC dependency
// inside this worker, avoiding TypeScript compiler initialization in the
// queue-inclusive preview budget. Production still loads emitted JavaScript.
const { readFileSync } = require("node:fs");
const { transformSync } = require("@swc/core");
const paths = require("tsconfig-paths");
const config = paths.loadConfig();
if (config.resultType !== "success") throw new Error("Source worker configuration unavailable");
paths.register({ baseUrl: config.absoluteBaseUrl, paths: config.paths });
require.extensions[".ts"] = (module, filename) => {
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename,
    jsc: { parser: { syntax: "typescript", decorators: true }, target: "es2022" },
    module: { type: "commonjs" },
  });
  module._compile(code, filename);
};
