import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/**
 * One ESLint config for the whole workspace.
 *
 * It previously lived in apps/dashboard and covered only the dashboard, which
 * meant the 1,600 lines in apps/edge — the webhook a real customer's message
 * actually travels through — had no static analysis at all, and neither did the
 * four packages it bundles. The live path was the only unlinted code in the
 * repo.
 *
 * Scope is deliberately graded rather than uniform:
 *   our own TS          the recommended set; this is code we wrote and maintain
 *   the ported mockup   hooks rules ONLY. 29 hand-written files that predate
 *                       this repo and use `/* global *​/` headers instead of
 *                       imports. Linting them for style yields hundreds of
 *                       findings nobody reads, which teaches everyone to ignore
 *                       the output — and the output is the point.
 *   generated / built   not linted at all.
 *
 * The rule that earns this config on its own is react-hooks/exhaustive-deps: a
 * stale dependency array is the defect family behind nearly everything that has
 * been called "glitchy" here.
 */

const OUR_TS_RULES = {
  ...js.configs.recommended.rules,
  // TypeScript already rejects genuinely undefined identifiers, and the base
  // rule cannot see type-only imports or JSX pragmas.
  "no-undef": "off",
  // The TS-aware variant, because the base rule flags named parameters inside
  // TYPE signatures — `(req: Request, ctx: RouteContext) => Promise<T>` is
  // documentation, and renaming those to `_req` to satisfy a linter that
  // should not be reading type positions makes the types worse.
  "no-unused-vars": "off",
  "@typescript-eslint/no-unused-vars": [
    "warn",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
  ],
  "no-empty": ["error", { allowEmptyCatch: true }],
  // A line that must not compile says why: the type tests' negatives (`*.type-test.ts`) are `@ts-expect-error <why>`,
  // and one whose line starts to compile is TS2578, an unused directive, so the typecheck fails. `@ts-ignore` stays
  // silent when the line it hides is fixed, and `@ts-nocheck` hides a whole file: neither is written. The phone app
  // (apps/mobile) lints under Expo's config, not this one, so the rule does not reach its files.
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-expect-error": "allow-with-description",
      "ts-ignore": true,
      "ts-nocheck": true,
      "ts-check": false,
      minimumDescriptionLength: 10,
    },
  ],
};

/** Plugin map for every TypeScript block. */
const TS_PLUGINS = { "@typescript-eslint": tseslint.plugin };

/**
 * The boundaries between the dashboard's layers. Nothing but convention held
 * them before: a page module could import the service-role client, a bridge
 * file could reach into a server module, and only a failed Vercel build would
 * have said so. Type-only imports cross freely; they carry a shape, not code.
 *
 *   browser code (legacy-bridge, client, yes, auth, → never the server, never
 *                 surfaces)                           the packages that hold
 *                                                     rules or providers
 *   server code (src/server, app/api)               → never the shell or the
 *                                                     bridge that feeds it
 *   the edge                                        → never the dashboard,
 *                                                     never a UI framework
 */
const BROWSER_MAY_NOT_IMPORT = [
  {
    group: ["**/server/**", "**/server", "@/server", "@/server/**"],
    allowTypeImports: true,
    message: "Browser code reaches the server through the typed client (src/client/api.ts), never by importing it.",
  },
  {
    group: [
      "@chanlytics/core",
      "@chanlytics/core/**",
      "@chanlytics/jobs",
      "@chanlytics/jobs/**",
      "@chanlytics/channels",
      "@chanlytics/channels/**",
      "server-only",
    ],
    allowTypeImports: true,
    message: "Rules and providers run on the server. The browser sees their outcomes through a route.",
  },
];

const SERVER_MAY_NOT_IMPORT = [
  {
    group: [
      "**/legacy-bridge/**",
      "**/legacy-bridge",
      "@/legacy-bridge",
      "@/legacy-bridge/**",
      "**/legacy/**",
      "**/src/client/**",
      "@/client/**",
      "../client/**",
      "../../client/**",
    ],
    allowTypeImports: true,
    message:
      "The server feeds the shell through the surface seam; it never imports the shell, the bridge or the browser client.",
  },
];

const EDGE_MAY_NOT_IMPORT = [
  {
    group: [
      "next",
      "next/**",
      "react",
      "react/**",
      "react-dom",
      "react-dom/**",
      "**/apps/dashboard/**",
      "**/dashboard/**",
    ],
    message:
      "The edge is Node functions a provider calls. It shares packages with the dashboard, never the dashboard itself.",
  },
];

/**
 * A surface draws its controls with the kit's components (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md,
 * §3.7): outside src/surfaces/kit, a raw <button>, <input>, <select>, <textarea> or <dialog> is refused, whether it is
 * written as JSX (`<button>`, `<motion.button>`) or made from its name (`createElement("button")`, and the JSX
 * runtime's `jsx`, `jsxs` and `jsxDEV`), and the refusal says what to take instead. The kit draws each raw element
 * once, in its component.
 */
const KIT_TAKES = {
  button: "Take the kit's Button, not a raw <button>; a button that opens a page is a link, as a door is.",
  input: "Take the kit's Field, or the kit's Switch for a checkbox, not a raw <input>.",
  select: "Take the kit's Select, not a raw <select>.",
  textarea: "Take the kit's Field, not a raw <textarea>.",
  dialog: "Take the kit's Sheet, or the kit's Confirm for a confirmation, not a raw <dialog>.",
};
/** The calls that make an element from its name: React's own, and the JSX runtime's. */
const MAKES_AN_ELEMENT = "/^(createElement|jsx|jsxs|jsxDEV)$/";
const RAW_ELEMENTS = Object.entries(KIT_TAKES).map(([element, take]) => ({
  selector: [
    `JSXOpeningElement[name.name='${element}']`,
    `JSXOpeningElement[name.property.name='${element}']`,
    `CallExpression[callee.name=${MAKES_AN_ELEMENT}][arguments.0.value='${element}']`,
    `CallExpression[callee.property.name=${MAKES_AN_ELEMENT}][arguments.0.value='${element}']`,
  ].join(", "),
  message: `${take} The kit is apps/dashboard/src/surfaces/kit/: if it has no variant for this, add one there with its gallery entry. A pure move under decision 0015 adds its surface's folder to KIT_PENDING (eslint.config.mjs), and that surface's kit step (Phase 4) removes it.`,
}));

/**
 * The surfaces that have moved under decision 0015 and not yet had their kit step (Phase 4 of the interface kit's
 * plan, §3.6), each by its folder (`apps/dashboard/src/surfaces/reports`). A move draws what the JSX drew, raw
 * elements and all, so it adds its surface here, and the kit step, which draws the surface's controls with the kit,
 * takes it out. Only the rule on raw elements passes over a listed surface: the layers and the function limits hold it
 * as they hold the rest of src/surfaces. Empty until the first move; repo/lint-boundaries.test.mjs fails an entry that
 * names no surface's folder.
 */
export const KIT_PENDING = [];

/** The rule on raw elements, over src/surfaces but the kit and the folders `pending` lists. Its test lists one. */
export const rawElementsRule = (pending) => ({
  files: ["apps/dashboard/src/surfaces/**/*.{ts,tsx}"],
  ignores: ["apps/dashboard/src/surfaces/kit/**", ...pending.map((folder) => `${folder}/**`)],
  rules: { "no-restricted-syntax": ["error", ...RAW_ELEMENTS] },
});

/**
 * A function's limits, the complexity ratchet's (tooling/scripts/tests/_measures.mjs, LIMIT): 150 lines, 30
 * branches, 5 levels. The ratchet holds every function over them by name (baselines/complexity.json), counted as
 * these rules count (repo/measures.test.mjs), and a listed one may only shrink. Where a tree's last entry has been
 * banked, the limits become lint errors there: said in the editor as the function is written, and no longer a number
 * a raise can move. `max-params` has no ratchet; four is where most of the code already is.
 */
export const FUNCTION_LIMITS = { lines: 150, branches: 30, depth: 5, params: 4 };

/**
 * The trees whose complexity baseline is empty: a package's src, an app area, or a domain folder in one. A tree joins
 * in the change that banks its last entry, and a new tree with its first file (src/surfaces, where the shell's pages
 * land as decision 0015 moves them, joined with the kit's); a parent replaces its folders once all of it is held. The
 * shell (legacy/) is not here, since it leaves with decision 0015, and neither are the trees of the programs in flight
 * (Ask, Reach out, the phone app, partners), which join as those land. repo/lint-boundaries.test.mjs holds each entry
 * to real source with no entry left in the baseline, asks ESLint that the limits apply there, and fails a tree the
 * ratchet has emptied that is not here (its header says which folders are trees).
 */
export const LIMITED_TREES = [
  "packages/db/src",
  "packages/contracts/src/broadcasts",
  "packages/contracts/src/consent",
  "packages/contracts/src/google",
  "packages/contracts/src/lines",
  "packages/contracts/src/notes",
  "packages/contracts/src/playbooks",
  "packages/contracts/src/reports",
  "packages/contracts/src/shared",
  "packages/core/src/inbound",
  "apps/dashboard/src/auth",
  "apps/dashboard/src/client",
  "apps/dashboard/src/lib",
  "apps/dashboard/src/surfaces",
  "apps/dashboard/src/yes",
  "apps/dashboard/src/legacy-bridge/today-sample",
  "apps/dashboard/src/server/auth",
  "apps/dashboard/src/server/connections",
  "apps/dashboard/src/server/conversations",
  "apps/dashboard/src/server/export",
  "apps/dashboard/src/server/leads",
  "apps/dashboard/src/server/metrics",
  "apps/dashboard/src/server/platform",
  "apps/dashboard/src/server/ports",
  "apps/dashboard/src/server/public",
  "apps/dashboard/src/server/receptionist",
  "apps/dashboard/src/server/workspace",
  "apps/edge/api/jobs",
  "apps/edge/lib/billing",
  "apps/edge/lib/calendar",
  "apps/edge/lib/email",
  "apps/edge/lib/ops",
  "apps/edge/lib/packages",
  "apps/edge/lib/sms",
];

/**
 * The held trees where a function still takes more than four parameters (measured 28 September 2026: 43 functions,
 * db's widest at 7 and today-sample's at 11). `max-params` waits in these; a tree leaves this list when its last one
 * takes an object instead.
 */
export const WIDE_PARAMS = [
  "packages/db/src",
  "packages/contracts/src/broadcasts",
  "packages/contracts/src/playbooks",
  "apps/dashboard/src/legacy-bridge/today-sample",
  "apps/dashboard/src/server/platform",
  "apps/dashboard/src/server/ports",
  "apps/dashboard/src/server/receptionist",
  "apps/dashboard/src/server/workspace",
  "apps/edge/lib/billing",
  "apps/edge/lib/calendar",
  "apps/edge/lib/email",
];

const treeFiles = (trees) => trees.map((tree) => `${tree}/**/*.{ts,tsx}`);

export default [
  {
    ignores: [
      // The phone app lints itself with Expo's config (apps/mobile/eslint.config.js): React Native, not the web.
      "apps/mobile/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.vercel/**",
      "**/next-env.d.ts",
      // Generated by `supabase gen types`; regenerating is the only correct edit.
      "packages/db/src/database.types.ts",
      // An agent's git worktree is a second copy of the tree, not more of it.
      "**/.claude/worktrees/**",
    ],
  },

  // The edge: vanilla Node functions, no React, no DOM globals worth assuming.
  {
    files: ["apps/edge/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    plugins: TS_PLUGINS,
    rules: {
      ...OUR_TS_RULES,
      // A floating promise in a webhook means work that silently did not happen
      // before the lambda froze. Without type information the base rule cannot
      // see async calls, so this is the reachable subset.
      "require-atomic-updates": "error",
      // Every line the edge logs is one JSON object with a level, an event and
      // whatever context is bound (lib/log.ts). A bare console call is a line
      // no query returns and no tenant can be joined to.
      "no-console": "error",
      // The environment is read in one place (lib/env.ts), typed, trimmed,
      // blank as unset. A read anywhere else is a second opinion on what a
      // variable means.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
          message: "Read the environment through lib/env.ts, which types every variable once.",
        },
      ],
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: EDGE_MAY_NOT_IMPORT }],
    },
  },
  // The two modules that are allowed to do what the block above forbids.
  {
    files: ["apps/edge/lib/log.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["apps/edge/lib/env.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

  // The browser specs and their helpers: Playwright in Node, with callbacks
  // that run inside the page.
  {
    files: ["e2e/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: TS_PLUGINS,
    rules: OUR_TS_RULES,
  },

  // The shared packages.
  {
    files: ["packages/*/src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: TS_PLUGINS,
    rules: OUR_TS_RULES,
  },

  // The dashboard's own code (not the ported mockup).
  {
    files: [
      "apps/dashboard/app/**/*.{ts,tsx}",
      "apps/dashboard/src/server/**/*.ts",
      "apps/dashboard/src/lib/**/*.ts",
      "apps/dashboard/src/legacy-bridge/**/*.{ts,tsx}",
      // The typed client and the sign-in screens ran without any static
      // analysis until the boundaries below needed to see them.
      "apps/dashboard/src/client/**/*.{ts,tsx}",
      "apps/dashboard/src/auth/**/*.{ts,tsx}",
      // The public opt-in pages' markup, apart from their pages so it renders without a workspace (the desk sign).
      "apps/dashboard/src/yes/**/*.tsx",
      // The surfaces that leave the shell (decision 0015), and the kit they draw with.
      "apps/dashboard/src/surfaces/**/*.{ts,tsx}",
      // The few modules that sit at src/ itself (csp.ts): the middleware's own rules.
      "apps/dashboard/src/*.ts",
      "apps/dashboard/*.{ts,mjs}",
    ],
    languageOptions: {
      // The TS parser without the type-aware ruleset: the build already
      // typechecks, and the slow project-service pass would only duplicate it.
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { ...TS_PLUGINS, "react-hooks": reactHooks },
    rules: {
      ...OUR_TS_RULES,
      // The two rules by name, not the plugin's `recommended`: from v7 that
      // preset also carries the React Compiler's lints (set-state-in-effect,
      // purity, refs, immutability), which read the ported mockup's patterns as
      // errors. Adopting those is a decision about the mockup, not a bump.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // The dashboard's layers, held apart (see BROWSER_MAY_NOT_IMPORT).
  {
    files: [
      "apps/dashboard/src/legacy-bridge/**/*.{ts,tsx}",
      "apps/dashboard/src/client/**/*.{ts,tsx}",
      "apps/dashboard/src/yes/**/*.tsx",
      "apps/dashboard/src/auth/**/*.{ts,tsx}",
      "apps/dashboard/src/surfaces/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: BROWSER_MAY_NOT_IMPORT }],
    },
  },
  {
    files: ["apps/dashboard/src/server/**/*.ts", "apps/dashboard/app/api/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: SERVER_MAY_NOT_IMPORT }],
    },
  },

  // A surface draws its controls with the kit's components (RAW_ELEMENTS above); the kit draws the raw elements, and
  // a surface moved before its kit step waits in KIT_PENDING.
  rawElementsRule(KIT_PENDING),

  // A function's limits, as errors where the ratchet holds nothing (LIMITED_TREES above). IIFEs count, as they
  // do to the ratchet.
  {
    files: treeFiles(LIMITED_TREES),
    rules: {
      complexity: ["error", FUNCTION_LIMITS.branches],
      "max-lines-per-function": ["error", { max: FUNCTION_LIMITS.lines, IIFEs: true }],
      "max-depth": ["error", FUNCTION_LIMITS.depth],
    },
  },
  {
    files: treeFiles(LIMITED_TREES.filter((tree) => !WIDE_PARAMS.includes(tree))),
    rules: { "max-params": ["error", FUNCTION_LIMITS.params] },
  },

  // The ported mockup: hooks correctness only. Its bare names are checked by
  // repo/shell-names-are-published.test.mjs against what the shell publishes on
  // the window; no-undef here would believe the files' `/* global */` headers.
  {
    files: ["apps/dashboard/src/legacy/**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: { ...globals.browser, React: "readonly" },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // The files are scripts in one global scope, so each names its own copy
      // of a hook (`const { useEffect: useCvEffect } = React`), and the plugin
      // checks only the names it is given. The pattern is the convention, not a
      // list: the list it replaced matched one of the shell's 38 aliases, and
      // calls to the other 37 held 102 findings nobody saw.
      // repo/hook-aliases-are-linted.test.mjs lints a call to every alias the
      // shell declares, so a new one outside the pattern fails there. The plugin
      // reads a name without "Effect" as a memo, so a `…Layout` alias is also
      // told when a dependency is unnecessary.
      "react-hooks/exhaustive-deps": [
        "warn",
        { additionalHooks: "^(use[A-Z][A-Za-z]*(Effect|Layout|Memo|Callback)|useEffectP)$" },
      ],
    },
  },

  // Test and operational scripts.
  {
    files: ["tooling/{scripts,evals}/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // An error since the scripts held none (27 September): a new unused name
      // fails outright, and the lint baseline cannot bank it.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
