const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const noRelative = require("eslint-plugin-no-relative-import-paths");

module.exports = [
  { ignores: ["dist/**", "node_modules/**", "eslint.config.js"] },
  ...tsPlugin.configs["flat/recommended"],
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "tsconfig.json", tsconfigRootDir: __dirname },
    },
    plugins: { "no-relative-import-paths": noRelative },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      eqeqeq: "warn",
      "no-relative-import-paths/no-relative-import-paths": [
        "warn",
        { rootDir: "src", prefix: "@" },
      ],
    },
  },
];
