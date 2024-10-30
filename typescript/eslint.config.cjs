// @ts-check

const foxglove = require("@foxglove/eslint-plugin");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["**/dist"],
  },
  {
    languageOptions: {
      parserOptions: {
        project: "./*/tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
  },
  ...foxglove.configs.base,
  ...foxglove.configs.jest,
  {
    files: ["*"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    rules: {
      "no-warning-comments": ["error", { terms: ["fixme"], location: "anywhere" }],
    },
  },
  ...foxglove.configs.typescript.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
);
