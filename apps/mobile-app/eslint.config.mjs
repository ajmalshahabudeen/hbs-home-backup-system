import { config } from "@workspace/eslint-config/base";

export default [
  ...config,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
];
