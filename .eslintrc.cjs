module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint", "react-hooks"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "no-useless-escape": "error",
    "no-empty": ["error", { "allowEmptyCatch": true }],
    "@typescript-eslint/no-unused-vars": ["off", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "off",
    "no-prototype-builtins": "off",
    "prefer-const": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "off"
  },
  ignorePatterns: [".tmp_src_no_comments/**"]
};
