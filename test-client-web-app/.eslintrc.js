/* eslint-env node */
module.exports = {
  env: { es2020: true },
  ignorePatterns: ["dist"],
  extends: ["plugin:@foxglove/base", "plugin:@foxglove/jest"],
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      extends: ["plugin:@foxglove/typescript"],
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
      rules: {
        "@typescript-eslint/restrict-template-expressions": "off",
      },
    },
  ],
  rules: {
    "no-warning-comments": [
      "error",
      { terms: ["fixme"], location: "anywhere" },
    ],
  },
};
