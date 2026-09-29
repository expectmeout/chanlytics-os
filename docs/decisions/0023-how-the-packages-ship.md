# 0023 · How the packages ship

**Status:** decided on 29 September 2026 with the road-to-10 health lane, and built in part: step 1, third-party code
stays an import, is built with this note; steps 2 to 4 are to come. Written against `1388f2cc6` (main, 29 September
2026, after #1332) and verified against the code at it; where this note and the code disagree, the code wins. The
scorecard's move 5 ("Decide how packages ship") and `docs/debt.md`'s two packaging rows asked for it.

## Context

- **The edge executes the packages' built files by path.** Each of the five `apps/edge/lib/packages/*.ts` is one line, `export * from "../../../../packages/<p>/dist/index.js"`, because Vercel's function bundler
  traces real files and does not follow pnpm's workspace links into a function. `.npmrc` hoists third-party modules
  into real directories (`node-linker=hoisted`) for the same reason. So `packages/*/dist` is committed, rebuilt with
  every package change, and held by a drift guard (`corepack pnpm check:dist`, run in CI).
- **Each package's build inlines the workspace's packages it imports** (`noExternal: [/^@chanlytics\//]` in four
  `tsup.config.ts`), so a dist executed by path needs nothing from `@chanlytics/*` at run time. Core's dist carries
  contracts, db and channels whole; jobs' carries core, and through it channels a second time beside its own copy.
- **What that costs, measured at `1388f2cc6`:**
  - Size and churn. Core's dist is 1,824,997 bytes (1.88 MB as a Windows checkout writes it) for about 9.9k lines of
    core's own source; contracts' 1,256,196 of it is contracts. Of the 84 commits since `0c8225d58` (28 September),
    40 rewrote a dist, and of the 34 that changed contracts' source, 13 rewrote all five bundles.
  - Two copies of each class and each piece of module state in one process. `AppError` lost its identity across
    bundles until #1175 gave it a brand every copy recognises (`routes/core-refusal-through-the-wrapper.test.mjs`).
    The provider breaker (`packages/channels/src/provider-fetch.ts`, a module-level map) exists once in channels'
    bundle and again in core's, so a send through core's `deliver` counts toward a breaker the edge's direct calls
    through channels never consult. A logger's request context in a package would split the same way.
  - Third-party code inlined three times. Core and jobs inlined channels' `html-to-text` with `htmlparser2`,
    `entities`, `domutils` and five more, without declaring any of them, so Dependabot's bump of `html-to-text` (#767)
    changes a manifest and the lockfile, the rebuilt core and jobs bundles differ, and the drift guard fails it: red
    since 21 September. Core and jobs imported `@supabase/supabase-js` undeclared too; the hoisted linker hid both.

## Decision

1. **Third-party code is never inlined.** Every package's build keeps each bare import but `@chanlytics/*` an import
   (`skipNodeModulesBundle`), resolved at run time from the hoisted `node_modules`, and every package declares each
   module its source or its dist imports. A bump of a third-party module changes manifests and the lockfile, never a
   committed dist.
2. **The workspace's packages import one another's built files by relative path.** Each package's build rewrites
   `@chanlytics/<p>` to `../../<p>/dist/index.js`: the same file the edge's facade names, both in the repository
   (`packages/<p>/dist`) and in an installed layout (`node_modules/@chanlytics/<p>/dist`, where every importer
   declares the packages it and they need). One module per package per process: one `AppError`, one breaker, one
   logger context; a contracts change rewrites contracts' dist and no other; nothing new has to follow a link.
3. **The committed dist stays, for now.** Retiring it means the edge builds its own bundle from the packages' sources
   at deploy (and the dashboard compiles them with `transpilePackages`). That changes both projects' builds and can be
   proven only on a preview deployment, which is not yet wired for the edge (`EDGE_CALL_SECRET` on previews, a
   staging project: Ruben's). It is its own note when those exist.

Considered and not taken: keeping the inlining and branding every shared class and piece of state as `AppError` is
branded. It changes nothing about size or churn, and every new piece of module state (the breaker, a cache, a
logger's context) needs its own global registry, found only after two copies disagree in production.

## Consequences

- A package's `package.json` is the truth about what its dist needs; `repo/package-dependencies.test.mjs` fails an
  undeclared import in any project's source or any package's dist, a third-party module inlined into a dist, a build
  that inlines anything but `@chanlytics/*`, and two ranges of one module across the packages and the server apps.
- The dists hold only their own code and their siblings' paths once step 2 lands; until it does, core and jobs still
  carry the workspace's packages whole, and `AppError`'s brand stays the defence for the one class that matters today.
- The edge's function bundles carry the same third-party files as before (step 1 moves where they are imported from,
  not what is traced).

## Shape

- `packages/<p>/tsup.config.ts`: `noExternal: [/^@chanlytics\//]` (not in contracts, which imports no sibling) and
  `skipNodeModulesBundle: true`, each with the reason. Core and jobs declare `@supabase/supabase-js` and
  `html-to-text` in the ranges db and channels declare them.
- Step 2 adds an esbuild plugin to each package's tsup config: `onResolve({ filter: /^@chanlytics\/[a-z]+$/ })`
  answers `{ path: "../../<p>/dist/index.js", external: true }`; `noExternal` goes. The declarations keep
  `@chanlytics/*`, which the typecheck resolves through the workspace's links as today.

## Steps

Each ships alone, in either deploy order: the two apps bundle the packages at their own commit, and nothing on the
wire changes.

1. **Built with this note.** `skipNodeModulesBundle` in the five builds; core and jobs declare what they import;
   `repo/package-dependencies.test.mjs` (its four dist and build tests fail on `1388f2cc6`). Core's dist 1,824,997 →
   1,717,169 bytes, jobs' 1,209,906 → 861,352. Proved locally: the suite; `node -e "import('./packages/core/dist/index.js')"`
   and jobs' the same, resolving `html-to-text` and supabase-js from the root; and a trace of all 51 edge doors with
   Vercel's own `@vercel/nft` (1.5.0, TypeScript transpiled on read as `@vercel/node` does) that carries the same
   third-party packages, file for file, as `1388f2cc6`'s: channels' and db's dists already imported them from there.
2. **Siblings by relative path.** Proved before merge by: the suite on the built dists; the nft trace of every edge
   door (each sibling dist reached, no unresolved import); `next build` of the dashboard; the breaker test made to
   fail on step 1 (a send through core's `deliver` and a direct channels call counting toward one breaker); and, once
   a preview deployment of each project exists, the golden probe against it. Then the brand stays for a week of
   production and may go.
3. **The edge's doors import the packages as the dashboard does**, once the organization wave has removed the five
   facades, keeping a relative dist path wherever the function bundler needs one.
4. **Committed dist leaves git** (decision 3): its own note, when a preview can prove the edge's own bundle.

## Tests

- `tooling/scripts/tests/repo/package-dependencies.test.mjs`: declarations against sources and dists, no inlined
  third-party module, builds that inline only `@chanlytics/*`, one range per module.
- `tooling/scripts/tests/routes/core-refusal-through-the-wrapper.test.mjs` and `tooling/scripts/tests/ops/provider-fetch.test.mjs`
  run unchanged on the rebuilt dists.
- Step 2's breaker test is written with step 2.

## Risks

- **An installed layout without a sibling.** Step 2's relative path assumes `@chanlytics/<p>`'s siblings sit beside
  it wherever it is installed. Every project that imports a package declares the packages that package imports today
  (the edge and the dashboard all five); a project that stops declaring one would break at run time, so step 2 adds
  that to `package-dependencies.test.mjs`.
- **A third-party module missing from a function.** Step 1 resolves from the hoisted root as db's and channels' dists
  always have. A module a package declares but the root does not install (a second range) would resolve beside the
  package instead; the one-range test holds it.

## Open questions

- Whether contracts should ship its view models and its schemas as separate entry points, so a page that needs a
  schema does not load every view model. Not needed for this note's steps; the bundle budget would say when.
