# 0024 · How the packages ship

**Status:** Accepted on 4 October 2026 (Ruben, approving the file-tree review's list as recommended). Steps 1 and 2
built: third-party code stays an import (with this note), and the workspace's packages reach one another by relative
path (4 October 2026, "Built" under step 2); steps 3 and 4 to come. Proposed on 29 September 2026 by the road-to-10
health lane. Written against `1388f2cc6` (main, 29 September 2026, after #1332) and verified against the code at it;
where this note and the code disagree, the code wins. The scorecard's move 5 ("Decide how packages ship") and
`docs/debt.md`'s two packaging rows asked for it.

## Context

- **The edge executes the packages' built files by path.** Each of the five `apps/edge/lib/packages/*.ts` is one line, `export * from "../../../../packages/<p>/dist/index.js"`, because Vercel's function bundler
  traces real files and does not follow pnpm's workspace links into a function. `pnpm-workspace.yaml` hoists third-party
  modules into real directories (`nodeLinker: hoisted`) for the same reason. So `packages/*/dist` is committed, rebuilt with
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

- A package's `package.json` is the truth about what its dist needs; `shipping/package-dependencies.test.mjs` fails an
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
   `shipping/package-dependencies.test.mjs` (its four dist and build tests fail on `1388f2cc6`). Core's dist 1,824,997 →
   1,717,169 bytes, jobs' 1,209,906 → 861,352. Proved locally: the suite; `node -e "import('./packages/core/dist/index.js')"`
   and jobs' the same, resolving `html-to-text` and supabase-js from the root; and a trace of all 51 edge doors with
   Vercel's own `@vercel/nft` (1.5.0, TypeScript transpiled on read as `@vercel/node` does) that carries the same
   third-party packages, file for file, as `1388f2cc6`'s: channels' and db's dists already imported them from there.
2. **Siblings by relative path.** Proved before merge by: the suite on the built dists; the nft trace of every edge
   door (each sibling dist reached, no unresolved import); `next build` of the dashboard; the breaker test made to
   fail on step 1 (a send through core's `deliver` and a direct channels call counting toward one breaker); and, once
   a preview deployment of each project exists, the golden probe against it. Then the brand stays for a week of
   production and may go.

   **Built (4 October 2026).** One esbuild plugin, `siblingsByPath` (`tooling/scripts/package-siblings.mjs`), in the
   four configs that import a sibling; `noExternal` stays beside it, since without it tsup names a declared sibling
   external by name before the plugin is asked (a first build did exactly that). Every dist now imports a sibling as
   `../../<p>/dist/index.js` and carries none (bytes, main at `d481afeed` → here): core's 1,551,883 → 965,834, jobs'
   1,069,395 → 52,692, db's 308,393 → 156,905, channels' 346,720 → 196,372, contracts' unchanged; the declarations are
   unchanged, keeping `@chanlytics/*`. Proved: all 56 edge doors traced with Vercel's own `@vercel/nft` 1.5.0 (TypeScript transpiled on
   read), no unresolved import, every door that carries core carrying its three siblings; the doors that load jobs now
   carry core's dist as a file of its own, and the two that load db alone now carry contracts'. Core's dist no longer
   defines `providerFetch`, so the breaker is channels' alone; `shipping/package-dependencies.test.mjs` holds it (no
   dist opens a sibling's module, which core's did three times at `d481afeed`; a sibling only by its relative path
   and only one it declares; every project that declares a package declares that package's siblings). The suite ran
   on the built dists in CI under the `suite` label, and `next build` in the Typecheck job. The brand stays, as above.

3. **The edge's doors import the packages as the dashboard does**, once the organization wave has removed the five
   facades, keeping a relative dist path wherever the function bundler needs one.
4. **Committed dist leaves git** (decision 3): its own note, when a preview can prove the edge's own bundle.

## Tests

- `tooling/scripts/tests/shipping/package-dependencies.test.mjs`: declarations against sources and dists, no inlined
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

  **Answered on 2 October 2026, the other way round.** The budget said it: what a page could not cut was not the view
  models but zod's classic API, one object a bundler keeps whole once any schema written in it is imported, 89 KB of
  the workspace route's 848 KB gzipped. Contracts now builds three entries (`packages/contracts/tsup.config.ts`):
  - the index, which the server, the edge, the packages and the tests read as before;
  - the browser's, `src/browser.generated.ts`: every value whose module reaches no classic zod, written from the
    barrels by `tooling/scripts/gen/contracts-browser-entry.mjs` and handed to a page's bundle by `package.json`'s
    `browser` condition, which only a client chunk resolves. A schema sits in a module of its own beside its words
    (`*-schema.ts`), so a page that says the words loads none of it;
  - `write-rules`, the two classic schemas a page does need (the Business tab's save rules, the waitlist's), which the
    page asks for by `import()` when it will judge a draft.

  A schema every page parses with is zod/mini, which shares the classic API's core and which the bundler cuts: a
  list's rule, a page load's report. The numbers a schema and a page both say are written once, schema-free
  (`config/workspace-config/config-rules.ts`), and the schemas are built from them. The route's JS fell from 847.6 to
  778.6 KB gzipped. `shipping/browser-entry.test.mjs` holds the entry current, every value a page imports from
  contracts to a name the entry exports, and the built entry free of the classic API.

  **An exception since 10 October 2026: the page-only entries.** The browser's entry is one module every page's route
  loads, so a value any page imports from it is on every page, whichever page draws it. What only Reports draws is left
  out of it and built as an entry of its own, which the Reports page imports by subpath: `@chanlytics/contracts/report-window`
  (the date control's words) and `@chanlytics/contracts/report-lens` (the metric definitions and the Receptionist lens's
  fold and words). The generator's `PAGE_ONLY` list (`tooling/scripts/gen/contracts-browser-entry.mjs`) names the modules
  whose values the entry leaves out while the barrels keep naming them, so the server, the edge and the tests read them
  from the index as before; a path in it that names no file under `src` fails the generator, since it would filter
  nothing. `shipping/browser-entry.test.mjs` holds the list, each path to a file, the names out of the entry and into their
  own, and the page-only entry free of the classic API. With the Receptionist lens added the workspace route's JS fell
  from 769,653 to 768,870 bytes gzipped, and the Reports page's own grew by 8,518.

  **Each page loads its own, since 17 October 2026.** The browser's entry is no longer one module. A bundler cannot cut
  a module across pages, so every value any page imported from contracts sat in the route's chunk: 339,619 of the
  workspace route's 857,745 bytes gzipped at `f6e2b8b80`. Contracts' build now writes it a file per module,
  `dist/browser/` (`tooling/scripts/contracts-browser.mjs`, after tsup), each relative import spelled out to the file it
  names. The entry is `dist/browser/index.js`, a list of `export { … } from`, and `package.json`'s `sideEffects`
  says that no file there runs anything as it loads but `zod-config.js`. A page's bundle therefore takes the modules it
  imports and the ones they import, and nothing else. The two modules that build a zod/mini schema run zod's setting
  first themselves, since a page may take them without the entry. The Reports and Ads page entries (`./report-window`,
  `./report-lens`, `./ads-page`) are built the same way and their `browser` condition names their module there, so
  they share modules with the rest of the page instead of each bundling its own copy. Ask's cards and Settings'
  Notifications stay bundled (`./ask-only`, `./alert-pane`): built per module they cost every page a few KB more, since
  Ask's loads with the shell and the pane's modules are the shell's too.

  Measured on one build each of `f6e2b8b80` and of this change, as what a visitor to each page downloads (the runtime,
  every segment's chunks and the page's loadable, gzipped):
  - The workspace route's JS fell 9,625 bytes, to 848,120.
  - Reports fell 53,066, Lists 31,189, Playbooks 31,184, Start 26,787, Broadcasts 25,283, Live 22,972, Calendar
    21,597, Campaigns 18,459, Templates 18,356, Inbox 10,670, Today 9,635, People 8,370 and Conversations 5,478.
  - Settings grew 8,513.

  The shell, which every page loads through `next/dynamic`, still imports most of contracts, and its chunks are
  worked out once for every page. So a module a page imports and the shell imports too arrives twice on that page,
  which is Settings' growth. The bundle check's "page own" sums count those copies, and it read +4 to +40 KB on most
  pages for this change while their visitors download less. The next lever is what the shell imports, not how
  contracts ships.

- Whether `packages/db` should give each domain its own entry (`@chanlytics/db/leads` and the like), since its one
  barrel, `src/index.ts` (some 550 names; 105 commits in the month to 17 October 2026), is where nearly every lane's new
  name meets.

  **Weighed on 17 October 2026 (the architecture review's candidate D) and not taken.** Splitting the barrel moves
  names more than it gathers behaviour behind a smaller interface. The edge runs each package's built index by path
  (step 1: one `export *` per package), so every new entry is a file the edge's functions must be told about. And a
  barrel names each export (`repo/contracts-barrels.test.mjs`). Reopen it when merges in `index.ts` measurably keep
  costing lanes.
