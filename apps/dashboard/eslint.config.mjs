import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/**
 * The dashboard had no static analysis at all — 18,500 lines of UI with
 * nothing checking it. The rule that earns this config on its own is
 * react-hooks/exhaustive-deps: a stale dependency array is the defect family
 * behind almost everything we have called "glitchy" (a memo that never
 * recomputed, an effect that decided what to paint with the previous route's
 * value, a subscription that captured a dead closure).
 *
 * Scope is deliberately narrow. The legacy mockup is 29 hand-written files
 * that predate this repo and use `/* global *​/` headers rather than imports;
 * linting them for style would produce hundreds of findings nobody will read
 * and train everyone to ignore the output. They get the hooks rules — which
 * are about correctness — and nothing else.
 */
export default [
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/dist/**",
      "next-env.d.ts",
    ],
  },

  // Our own code: full recommended set.
  {
    files: ["app/**/*.{ts,tsx}", "src/server/**/*.ts", "src/lib/**/*.ts", "src/legacy-bridge/**/*.{ts,tsx}"],
    languageOptions: {
      // The TS parser, without the type-aware ruleset: type-checking already
      // happens in the build, and the slow project-service pass would only
      // duplicate it.
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // TypeScript already rejects genuinely undefined identifiers, and the
      // base rule cannot see type-only imports or JSX pragmas.
      "no-undef": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // The ported mockup: hooks correctness only.
  {
    files: ["src/legacy/**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: { ...globals.browser, React: "readonly" },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Every legacy file aliases the hooks (useShellState, useCvtState, …)
      // per the mockup's own convention, so the plugin needs to recognise them.
      "react-hooks/exhaustive-deps": [
        "warn",
        { additionalHooks: "(useShellEffect|useCvtEffect|useIxEffect|useLdEffect|useTkEffect)" },
      ],
    },
  },
];
