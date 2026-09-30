import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
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

/** Our own choices over the presets, for every TypeScript block, typed or not. */
const OURS = {
  // TypeScript already rejects genuinely undefined identifiers, and the base
  // rule cannot see type-only imports or JSX pragmas.
  "no-undef": "off",
  // The TS-aware variant, because the base rule flags named parameters inside
  // TYPE signatures — `(req: Request, ctx: RouteContext) => Promise<T>` is
  // documentation, and renaming those to `_req` to satisfy a linter that
  // should not be reading type positions makes the types worse.
  "no-unused-vars": "off",
  // An error since our TypeScript held none (27 September), as in the scripts: a new unused name fails outright, and
  // the lint baseline cannot bank it.
  "@typescript-eslint/no-unused-vars": [
    "error",
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
  // verbatimModuleSyntax (tsconfig.base.json) keeps every import as it is written, so an import that only a type reads
  // says `import type`, or its module is loaded for nothing: under the flag `import { type A } from "m"` still loads m.
  // Held at zero, these two keep what tsup, Vercel and Next emit what they emitted before the flag.
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { prefer: "type-imports", fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
  ],
  "@typescript-eslint/no-import-type-side-effects": "error",
};

/** The TypeScript no program is built for (the browser specs, until e2e has a tsconfig): ESLint's recommended set. */
const OUR_TS_RULES = { ...js.configs.recommended.rules, ...OURS };

/**
 * Types in the lint. The TypeScript each project's tsconfig compiles (the edge, the packages, the dashboard) is read
 * through typescript-eslint's project service, so a rule sees the program tsc checks, on the one compiler the pnpm
 * catalog pins (tests/types/typescript-is-installed-once.test.mjs). What only a type shows is caught: a promise left
 * floating in a webhook, a promise handed to a form's submit, an assertion that changes nothing.
 *
 * The set is typescript-eslint's recommended-type-checked (it carries `recommended`, so `any` and `@ts-ignore` too),
 * plus switch-exhaustiveness-check, where a `default` counts as exhaustive (noImplicitReturns holds the rest), and
 * no-deprecated. Every rule is an error but those in HELD_TYPED, which had findings the day this landed: each is a
 * warning, held per file and rule by tooling/scripts/checks/lint.mjs (baselines/lint-warnings.json), and becomes an
 * error in the change that banks its last finding. It costs about a minute over the tree, once per lint run, and about
 * 4 GB of heap (the dashboard's program alone is 2.8 GB, and every project's stays loaded), which is why the `lint` script
 * in package.json raises Node's heap limit: at the default 2 GB the run dies out of memory on CI's runner.
 */
const TYPED = { projectService: true, tsconfigRootDir: import.meta.dirname };
const rulesOf = (configs) => Object.assign({}, ...configs.map((c) => c.rules ?? {}));

/**
 * The typed rules with findings when they arrived (29 September 2026), held by the lint baseline until each reaches
 * zero. no-unnecessary-type-assertion is among them though its autofix ran: it removed every assertion tsc agreed
 * changed nothing (each project typechecks after it), and what it still reports is either in a file another lane was
 * rewriting that day (Ask's server, routes, bridge and contracts, the kit's components, the Retell availability door,
 * the policies route, the edge-token doors, the jobs handlers), left for that lane, or an assertion the rule misreads
 * as doing nothing. One gives a generic its type: `(await jsonBody(req)) as T` infers `jsonBody`'s T from the
 * assertion, and without it the body is `unknown`; those leave as the routes declare their `input`. The other keeps
 * a literal's type in an object a map builds (`role: (…) as ThreadTurn["role"]`), which widens to string without it.
 * lint-boundaries.test.mjs fails a held rule the baseline no longer holds, so the last one banked turns it an error. no-misused-promises holds one, a route context's params
 * read as a condition in the dashboard's request pipeline (`with-route.ts`), which the request-id lane was rewriting.
 */
export const HELD_TYPED = [
  "@typescript-eslint/no-base-to-string",
  "@typescript-eslint/no-unnecessary-type-assertion",
  "@typescript-eslint/no-deprecated",
  "@typescript-eslint/no-misused-promises",
  "@typescript-eslint/no-redundant-type-constituents",
  "@typescript-eslint/no-unsafe-argument",
  "@typescript-eslint/no-unsafe-assignment",
  "@typescript-eslint/no-unsafe-call",
  "@typescript-eslint/no-unsafe-member-access",
  "@typescript-eslint/no-unsafe-return",
  "@typescript-eslint/only-throw-error",
  "@typescript-eslint/prefer-promise-reject-errors",
  "@typescript-eslint/require-await",
  "@typescript-eslint/restrict-template-expressions",
  "@typescript-eslint/unbound-method",
];

/** A rule's entry at warning, its options kept. */
const asWarning = (entry) => (Array.isArray(entry) ? ["warn", ...entry.slice(1)] : "warn");

const TYPED_AT_ERROR = {
  ...js.configs.recommended.rules,
  ...rulesOf(tseslint.configs.recommendedTypeChecked),
  ...OURS,
  "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
  // A promise where a void is expected, but for a JSX handler: React ignores what `onSubmit` returns, so `void` there
  // would change nothing in the browser, and the screens' tests await the handler's promise to read what it did.
  "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  "@typescript-eslint/no-deprecated": "error",
};
const OUR_TYPED_TS_RULES = {
  ...TYPED_AT_ERROR,
  ...Object.fromEntries(HELD_TYPED.map((rule) => [rule, asWarning(TYPED_AT_ERROR[rule] ?? "error")])),
};

/** Plugin map for every TypeScript block. */
const TS_PLUGINS = { "@typescript-eslint": tseslint.plugin };

/**
 * What a person with a screen reader or only a keyboard meets: the jsx-a11y rules, from eslint-plugin-jsx-a11y-x, the
 * maintained fork (the original supports ESLint 9 at most, and this repository runs 10). Its recommended set, every
 * rule a warning, so the lint baseline holds what each file has today and any new finding fails
 * (tooling/scripts/checks/lint.mjs), in the shell's JSX as in the TSX.
 */
const A11Y_RULES = Object.fromEntries(
  Object.entries(jsxA11y.configs.recommended.rules).map(([rule, entry]) => {
    const [level, ...options] = Array.isArray(entry) ? entry : [entry];
    return [rule, level === "off" ? "off" : ["warn", ...options]];
  }),
);

/** The markup the browser draws, each path one a block below already parses. */
const DASHBOARD_MARKUP = [
  "apps/dashboard/app/**/*.tsx",
  "apps/dashboard/src/legacy-bridge/**/*.tsx",
  "apps/dashboard/src/client/**/*.tsx",
  "apps/dashboard/src/auth/**/*.tsx",
  "apps/dashboard/src/yes/**/*.tsx",
  "apps/dashboard/src/surfaces/**/*.tsx",
  "apps/dashboard/src/legacy/**/*.jsx",
];

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
 * runtime's `jsx`, `jsxs` and `jsxDEV`), and the refusal says what to take instead, by the folder it is in. The kit
 * draws each raw element once, in its component; Confirm is the house's until its first surface moves it into the kit.
 */
const KIT_TAKES = {
  button:
    "Take the kit's Button (kit/button/), not a raw <button>; a button that opens a page is a link, as a door is.",
  input: "Take the kit's Field (kit/field/), or the kit's Switch (kit/switch/) for a checkbox, not a raw <input>.",
  select:
    "Take the kit's Select (kit/select/), or its Combobox (kit/combobox/) for a list to type into, not a raw <select>.",
  textarea: "Take the kit's Field (kit/field/) with its `rows`, not a raw <textarea>.",
  dialog:
    "Take the kit's Sheet (kit/sheet/), or the kit's Confirm for a confirmation (the house's until it moves), not a raw <dialog>.",
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
 * Base UI (`@base-ui/react`), which the kit's components with behaviour of their own are built on (the interface
 * kit's plan, decision 15): one exact version, pinned in apps/dashboard/package.json, and each part imported alone
 * (`@base-ui/react/dialog`), never through the package's index, so a component names the one part it draws and
 * nothing else of the library rides along. Anywhere in the dashboard's TypeScript, the kit's or not.
 */
export const BASE_UI_INDEX = {
  name: "@base-ui/react",
  message:
    "Import the Base UI part you draw (`@base-ui/react/dialog`, `@base-ui/react/menu`), never the package's index. A surface takes the kit's component instead (apps/dashboard/src/surfaces/kit/), which is built on its own part.",
};

/**
 * The surfaces that have moved under decision 0015 and not yet had their kit step (Phase 4 of the interface kit's
 * plan, §3.6), each by its folder (`apps/dashboard/src/surfaces/reports`). A move draws what the JSX drew, raw
 * elements and all, so it adds its surface here, and the kit step, which draws the surface's controls with the kit,
 * takes it out. Only the rule on raw elements passes over a listed surface: the layers and the function limits hold it
 * as they hold the rest of src/surfaces. repo/lint-boundaries.test.mjs fails an entry that names no surface's folder.
 */
export const KIT_PENDING = [
  "apps/dashboard/src/surfaces/reports",
  "apps/dashboard/src/surfaces/inbox",
  "apps/dashboard/src/surfaces/today",
];

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
 * (Ask Rewired, the phone app), which join as those land, by the day repo/lint-boundaries.test.mjs's IN_FLIGHT names. repo/lint-boundaries.test.mjs holds each entry
 * to real source with no entry left in the baseline, asks ESLint that the limits apply there, and fails a tree the
 * ratchet has emptied that is not here (its header says which folders are trees).
 */
export const LIMITED_TREES = [
  "packages/db/src",
  "packages/contracts/src/ai",
  "packages/contracts/src/broadcasts",
  "packages/contracts/src/consent",
  "packages/contracts/src/google",
  "packages/contracts/src/lines",
  "packages/contracts/src/notes",
  "packages/contracts/src/playbooks",
  "packages/contracts/src/reach-out",
  "packages/contracts/src/reports",
  "packages/contracts/src/shared",
  "packages/core/src/inbound",
  "apps/dashboard/src/auth",
  "apps/dashboard/src/client",
  "apps/dashboard/src/lib",
  "apps/dashboard/src/surfaces",
  "apps/dashboard/src/yes",
  "apps/dashboard/src/legacy-bridge/mascot",
  "apps/dashboard/src/legacy-bridge/reach-out",
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
  "apps/edge/lib/google",
  "apps/edge/lib/ops",
  "apps/edge/lib/packages",
  "apps/edge/lib/partners",
  "apps/edge/lib/sms",
];

/**
 * The held trees where a function still takes more than four parameters (measured 28 September 2026: 48 functions,
 * db's widest at 7 and today-sample's at 11; Reach out's timetable and the partners' ledger joined on 29 September). `max-params` waits in these; a tree leaves this list when its last one
 * takes an object instead.
 */
export const WIDE_PARAMS = [
  "packages/db/src",
  "packages/contracts/src/ai",
  "packages/contracts/src/broadcasts",
  "packages/contracts/src/playbooks",
  "packages/contracts/src/reach-out",
  "apps/dashboard/src/legacy-bridge/mascot",
  "apps/dashboard/src/server/platform",
  "apps/dashboard/src/server/ports",
  "apps/dashboard/src/server/receptionist",
  "apps/dashboard/src/server/workspace",
  "apps/edge/lib/billing",
  "apps/edge/lib/calendar",
  "apps/edge/lib/email",
  "apps/edge/lib/google",
  "apps/edge/lib/partners",
];

const treeFiles = (trees) => trees.map((tree) => `${tree}/**/*.{ts,tsx}`);

/**
 * The dashboard's own code, as the TypeScript blocks below read it: everything but the ported mockup.
 */
const DASHBOARD_CODE = [
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
  // The app's own configuration and entry points (next.config.ts, proxy.ts, instrumentation.ts), which its tsconfig compiles.
  "apps/dashboard/*.ts",
];

/** The two modules that read the dashboard's environment; a read anywhere else in DASHBOARD_CODE is refused. */
const DASHBOARD_ENV_READERS = ["apps/dashboard/src/server/env.ts", "apps/dashboard/src/lib/public-env.ts"];

/** The typescript-eslint rules that read a type, which a block without a program cannot run. */
const NEEDS_TYPES = new Set(
  Object.entries(tseslint.plugin.rules)
    .filter(([, rule]) => rule.meta?.docs?.requiresTypeChecking)
    .map(([name]) => `@typescript-eslint/${name}`),
);

/**
 * `config` with its types taken out: the same blocks, files and rules, but no program built and each rule that reads a
 * type off. The tests that lint a probe as if it sat at a path (repo/lint-boundaries.test.mjs, the accessibility test)
 * ask only of rules that read the syntax, and a probe's path is a file no tsconfig holds, which the project service
 * refuses; building each project's program for them would also cost a minute a probe.
 */
export const withoutTypes = (config) =>
  config.map((block) => {
    const parserOptions = block.languageOptions?.parserOptions;
    if (!parserOptions?.projectService) return block;
    const { projectService: _service, tsconfigRootDir: _root, ...rest } = parserOptions;
    const rules = Object.fromEntries(
      Object.entries(block.rules ?? {}).map(([rule, entry]) => [rule, NEEDS_TYPES.has(rule) ? "off" : entry]),
    );
    return { ...block, languageOptions: { ...block.languageOptions, parserOptions: rest }, rules };
  });

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
      parserOptions: TYPED,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    plugins: TS_PLUGINS,
    rules: {
      ...OUR_TYPED_TS_RULES,
      // A floating promise in a webhook means work that silently did not happen
      // before the lambda froze: no-floating-promises sees it with types, and
      // this catches a write that races the await before it.
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
  // The one module that is allowed to do what the block above forbids: the edge reads its environment here. Logging is
  // not its own: the logger is packages/channels/src/log/logger.ts, the one place a line reaches stdout.
  {
    files: ["apps/edge/lib/env.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  // The dashboard's server, its auth routes, Ask's modules and the packages log through the one logger too
  // (packages/channels log/, re-exported as src/server/log.ts): one JSON object per line, named by its event,
  // carrying the request it belongs to. The exceptions, each with the program that owns it:
  //   - the logger's own writer, and db's until an app hands it the logger (packages/db observe.ts);
  //   - db's realtime subscription, which runs in the browser and is #1333's (decision 0019).
  {
    files: [
      "apps/dashboard/src/server/**/*.ts",
      "apps/dashboard/app/api/**/*.ts",
      "apps/dashboard/app/auth/**/*.ts",
      "packages/*/src/**/*.ts",
    ],
    ignores: ["packages/channels/src/log/logger.ts", "packages/db/src/observe.ts", "packages/db/src/realtime.ts"],
    rules: { "no-console": "error" },
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
      parserOptions: TYPED,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: TS_PLUGINS,
    rules: OUR_TYPED_TS_RULES,
  },

  // The dashboard's own code (not the ported mockup).
  {
    files: DASHBOARD_CODE,
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ...TYPED, ecmaFeatures: { jsx: true } },
    },
    plugins: { ...TS_PLUGINS, "react-hooks": reactHooks },
    rules: {
      ...OUR_TYPED_TS_RULES,
      // The two rules by name, not the plugin's `recommended`: from v7 that
      // preset also carries the React Compiler's lints (set-state-in-effect,
      // purity, refs, immutability), which read the ported mockup's patterns as
      // errors. Adopting those is a decision about the mockup, not a bump.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // The dashboard reads its environment in one place too, as the edge does: src/server/env.ts on the server, typed by
  // one zod schema and checked at boot, and src/lib/public-env.ts for the NEXT_PUBLIC_ values the browser's bundles
  // carry. A read anywhere else is a second opinion on what a variable means, and a default nobody checks at boot.
  {
    files: DASHBOARD_CODE,
    ignores: DASHBOARD_ENV_READERS,
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read the environment through src/server/env.ts (or src/lib/public-env.ts in the browser).",
        },
      ],
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

  // Base UI's parts are imported one at a time (BASE_UI_INDEX above).
  {
    files: ["apps/dashboard/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { paths: [BASE_UI_INDEX] }] },
  },

  // A type test proves a type refuses `any` by writing one, under `@ts-expect-error <why>`.
  {
    files: ["**/*.type-test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },

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

  // Accessibility, over all of the dashboard's markup (A11Y_RULES).
  {
    files: DASHBOARD_MARKUP,
    plugins: { "jsx-a11y-x": jsxA11y },
    rules: A11Y_RULES,
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
