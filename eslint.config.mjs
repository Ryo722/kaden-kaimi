import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import globals from "globals";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/.astro/**",
      "**/node_modules/**",
      "**/.wrangler/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["workers/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.worker,
        ScheduledController: "readonly",
        ExecutionContext: "readonly",
      },
    },
  },
];
