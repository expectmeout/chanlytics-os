# 0074 · The build keeps its own books

**Status:** Built 28 October 2026, every step, on `claude/amazing-thompson-boate8` (the five steps approved as
recommended, end to end); "As built" below says where the build departs from the proposal, and the code wins.
Proposed the same day (lane E of the architecture review of that day: the collision points). Written against `origin/main` at `714510144` (#1895) and measured there, over the
590 changes that landed in the 30 days to that commit (#1313 to #1895); each experiment below was run on that tree in a
clean container and reverted. Where this note and the code disagree, the code wins.

**What it closes.** Of the 590 changes, 424 (72%) touched a file no person writes: a committed `dist`, a baseline, the
register's numbers, the takeover checklist's, the architecture tree, a generated file, the API reference, the data
model, the schema snapshot or the database's types. Those files are where parallel lanes collide, where a reviewer's
diff is buried, and where a feature's pull request spends its second and third commits (#1895, 28 October: one commit
the feature, one "the barrel's rise argued, the ledger and the tree", one "the register counts the edge's website
tree"). The rule after this note: **a change commits what it changes, and the build keeps the books.** Nothing a
command can write from the tree is committed by a change; a number the build holds is read from main's own
measurement, never banked by hand; and a list several lanes add to is sorted, so their lines land apart.

**What it does not do.** No code of the product moves. No rule the ratchets hold is loosened: every number that may
only fall still may only fall, judged change by change. The generated route files, the API reference and the
migration-derived files stay committed (section 5 says why). The register's rows, what retires each number and the
next step, stay a person's words; only the numbers leave their hands.

## As built

What landed, step by step, and each place it differs from the decision below. The decision's text is kept as it was
proposed; where the two disagree, this section and the code are what is true.

- **S1 · Sorted lists.** `tooling/scripts/gen/sorted-lists.mjs` writes every barrel (`packages/*/src/index.ts` and each
  domain's `index.ts`) one export statement per module, in path order, names in order within, formatted by Prettier;
  `--check` says which are out of order, and `repo/sorted-lists.test.mjs` holds them (`corepack pnpm gen:sorted-lists`;
  `land` runs it first). The core barrel keeps its own order (`OWN_ORDER`), since its header argues the order of its
  lines. `PREFETCH_READS`, the policy pins and the event lists were not moved: the route and door pins were sorted by
  key already, and `PREFETCH_READS` is read in page order, which is its meaning.
- **S2 · The packages are sources.** Each package's `exports` carries `types`, `bundled`, `edge-light` (contracts),
  `browser` (contracts), `import` and `default`, every target under `src/` but `bundled`; `tsc -b` checks each package
  once through its project reference, declarations to `.types/`. Three departures:
  - The suite's bundle is each package's `dist/`, gitignored, not `.bundle/` (a name the bundle check's record already
    takes): `tooling/scripts/package-build.mjs` builds it with esbuild before the runner starts, only when its stamp
    (`dist/.built`: each input's path, size and time, hashed) moved, and `tooling/scripts/checks/test.mjs` passes
    `--conditions=bundled`. A script that loads a package runs under `node --import tsx` and reads the sources.
  - The dashboard's build runs no `tsc -b` first: Vercel's build command is the project's own, and nothing a deploy
    needs may lean on a step before it. Next's type pass is off in the build (`typescript.ignoreBuildErrors`); the
    dashboard's typecheck is `next typegen && tsc -b`, and CI's Types job, the required check, is the gate, as the
    Risks section's fallback said.
  - The edge's facades are `export * from "@chanlytics/<p>"`, one line each: the package's barrel already names every
    export, and a second list of the same names would be the collision this note removes.
- **S3 · The record and the compare.** `corepack pnpm check:debt` (`tooling/scripts/checks/debt.mjs`) measures three
  parts, the measures of `_measures.mjs` (`RATCHETS`, the source scan among them), the lint's warnings by file and rule
  (`lint.mjs` `lintTree`) and knip's dead exports (`dead-exports.mjs` `deadExports`), on a base and on the tree, and
  `judge` fails a number that rose or an offender that is new unless the pull request's description carries a line
  `Debt: <why>` of twelve characters or more (`repo/debt/debt-check.test.mjs`; the register's rows are held to the
  measures' keys by `repo/debt/debt-register.test.mjs`). Three departures:
  - **No record is cached on main's push.** CI's debt job (`What this change owes`) measures the merge commit's first
    parent in place (`--base HEAD^1 --in-place`), then the head, every run: one job, no cache to miss, and a base that
    is always the main the change stands on. On a laptop the default compares the working tree with its merge base
    with `origin/main`, measured in a worktree; `check:local` no longer runs it, since CI's job is the one that reads the
    description.
  - **Nothing is committed nightly.** A workflow's own token opens a pull request no workflow runs on, so a commit of
    the numbers could never pass the required check. `.github/workflows/register.yml` measures main each night, prints
    the totals in its summary (`check:debt -- --totals`), keeps the record as an artifact for 35 days, and on Mondays
    reads it beside one a week older, keeping one rolling issue open while a measure grew. The register's and the
    takeover checklist's number blocks left the pages for it; `docs/debt.md` "The numbers" says where they are read.
    The architecture's drawn tree, the one block the build can write from the tree alone, moved to its own generated
    page, `docs/tree.md` (`tooling/scripts/gen/docs-tree.mjs`, held by `docs/docs-tree.test.mjs`, written by `land`).
  - **Four baselines stay, each a person's list, not a number**: `reads-not-heard.json`, `on-demand-reads.json`,
    `hearing/` and `writes/` (the hearing tests' goldens and reasons), with `bundle-ceiling.json` and `coverage.json`, the
    two decisions. `UPDATE_BASELINES` remains for those alone; the lint's and knip's `--update` and `--raise` are gone.
    The thirty-three number baselines and `source-scan-baseline.json` left git.
    The "Rises" table is frozen under a dated line, as decided.
- **S4 · The browser entry stays committed.** Section 3 below is not built, by decision: Vercel builds the dashboard
  with its own command, so a file written by a step before `next build` is a file a deploy may not have, and a client
  bundle without the entry is the +63,771 bytes measured in Context. The entry is a generated file `land` takes main's
  side of and writes again (from the sorted barrels, so two lanes' lines land apart there too), and
  `shipping/browser-entry.test.mjs` fails a stale one. It leaves git when the dashboard's build command is the
  repository's to name.
- **S5 · `land` and the stack.** A conflict in `supabase/migrations-ledger.json` takes main's side and the ledger is
  recorded again (`migration-ledger.mjs --record`), which refuses a migration main's head has passed. The schema
  snapshot, the database's types, the closed sets and the unique keys (`REPLAYED`) are written only from a replay: with
  `--replay` and a stack that answers `supabase status`, main's side is taken, the stack is replayed from zero
  (`supabase db reset`, so its data goes, which is why it is asked for) and the four written again before the data
  model. Without either, `land` names them as a person's. Before this, the closed sets and the unique keys took main's
  side and nothing wrote them again. A merge `land` left open is taken up where it was left, its conflicts settled by
  the same rule (`settle`).

## Context

Measured on 28 October 2026 at `714510144` (`git log --since='30 days ago' --first-parent origin/main`).

**The committed dist.** 338 of the 343 changes that touched a package's source rewrote a `packages/*/dist`: 1.34
million lines of built output beside 1.53 million lines of source and tests, and 37.7 of the 90.7 MB of blobs the
repository's history holds (42%). `packages/contracts/dist` alone is 543 files and 13 MB; its `index.js` was rewritten
301 times. The dist exists for one reason (decision 0024, Context): Vercel's function tracer did not follow pnpm's
workspace links, so the edge executed each package's built file by relative path. Since #1643 (16 October) the edge is
bundled by esbuild (`tooling/scripts/edge-functions.mjs`), which follows the links itself, and both Vercel projects
post a preview on every pull request (`.github/workflows/preview-smoke.yml`): the two things 0024's step 4 said to wait
for. What the dist costs beyond the diff: a CI job of its own (`The dist matches the sources`, 1 m 48 s a run), the
line-ending rewrite before every build (`tooling/scripts/lf-sources.mjs`), the sibling-path plugin
(`tooling/scripts/package-siblings.mjs`), a browser build of 543 files (`tooling/scripts/contracts-browser.mjs`), tsup
and its `ignoreDeprecations` row in the register, the "never add `--sourcemap`" surprise in the README, a test that
reads timestamps because built output cannot be diffed (`tooling/scripts/tests/repo/dist-freshness.test.mjs`), and
`land`'s record that three of #1639's four merge conflicts were in dist alone (`tooling/scripts/land.mjs`).

**The books banked by hand.** 290 changes touched a baseline under `tooling/scripts/tests/baselines/` (40 files,
832 KB), 240 the register (`docs/debt.md`, 42,683 bytes on 28 September, 645,890 on 28 October), 219 the takeover
checklist (`docs/takeover.md`, which carries the same block), 59 the architecture tree (`docs/architecture.md`), 35 the
source-scan baseline. The register's "Rises" table grew from 21 rows to 238: 217 rises argued by hand in 30 days, in
37% of the changes. The ratchet's device (`tooling/scripts/tests/_ratchet.mjs`) is sound, a reduction nobody wrote down
is a reduction the next change can spend, but it is paid for in every pull request, and #1889's merge of 28 October
conflicted in the architecture tree. The bundle check stopped paying it on 10 October: "47 of 165 merges in ten days
edited" its budget, and since then a push to main records its measurement under its own sha, a pull request is
compared with the record of the main commit it stands on, growth past a line is argued in the description
(`Bundle: <why>`), the week is read on Mondays (`.github/workflows/bundle-week.yml`), and nothing in the repository
changes for it (`tooling/scripts/checks/bundle-budget.mjs`). That is the one measure no change has had to bank since.

**The lists every lane adds to.** 216 changes touched a contracts domain barrel, 109 `packages/db/src/index.ts`
(0024's open question said to reopen it "when merges in `index.ts` measurably keep costing lanes"), 188 the browser
entry generated from them (`packages/contracts/src/browser.generated.ts`), 62 the route policy pin, 24
`PREFETCH_READS`. Across the packages' 49 barrels, 303 of 965 export lines are out of their module's path order: a new
line goes wherever the author was, which is the same place the next lane's line goes. The two lists that are sorted,
`LOG_EVENTS` (710 names) and `DASHBOARD_LOG_EVENTS` (225), take a lane's new name wherever its letters put it.

**What CI spends on it** (main's run for #1895): the dist build 1 m 48 s, the typecheck against the dist 1 m 47 s, the
dashboard's build 1 m 55 s, the lint 3 m 40 s uncached, knip 47 s; the whole run 4 m 42 s.

**What the experiments found** (this container, four cores, 28 October; every change reverted):

- Pointing each package's `exports` at `src/index.ts` and typechecking the apps as today, `tsc --noEmit` each: 222
  errors, every one `noUncheckedIndexedAccess`'s family (TS2532, TS18048, TS2345, TS2322), all in contracts' sources
  compiled under channels' options. Contracts, core and the dashboard turn that flag off (410 unchecked reads in 110
  files: contracts 222, the dashboard 153, core 35; `baselines/unchecked-index.json`); every other project has it on.
  A consumer compiling a package's sources under its own options is the wrong design whatever the flag.
- The same, with each package a composite project emitting declarations to a `.types/` folder and each app
  referencing the five (`tsc -b apps/edge apps/dashboard`): 0 errors, 79 s cold, 8 s warm (`pnpm -r typecheck`
  against the dist: 73 s). The edge's tsconfig moved to `moduleResolution: "Bundler"` for it, which is how the edge is
  built since #1643; its `NodeNext` setting predates that.
- The edge's functions bundled from the sources, the five facades in `apps/edge/lib/packages/` re-exporting
  `@chanlytics/<p>` by name: 76 functions in 7.4 s.
- Two test files run through tsx against the sources: pass. A folder of twenty (`tooling/scripts/tests/conversations`,
  406 tests): 18 s from the dist, 33 s from the sources with tsx's cache warm (a second run 34 s). Each test process
  loads some 900 source modules where it loaded five bundles; the suite needs a bundle, which need not be committed.
- The dashboard built with the five in `transpilePackages`: with contracts' `browser` condition kept, 12 errors,
  because Next's edge runtime resolves that condition too and the browser entry lacks the server's names
  (`parseSystemOneResponse` and its kin, reached from `instrumentation.ts` through `server/log.ts`); the dist never met
  this because channels' dist reached contracts' by relative path. Without the condition, and with the references'
  declarations built: 110 s (58 s compiling, 47 s in Next's type pass) where the same tree built from the dist in 74 s
  (26 s and 44 s); `check:static-shell` holds. Without the references, Next's type pass compiles the five packages'
  sources into the dashboard's one program and runs out of memory ("Failed to type check"): the references are not a
  refinement but the design.
- **The browser entry earns its bytes.** Built without it, against main's own build of the same tree: route JS
  753,008 → 816,779 bytes gzipped (+63,771), Settings +16,933, Start +31,361, Conversations +8,072, route CSS
  unchanged. With the package's `sideEffects` corrected to name `src/zod-config.ts` (it named dist files) the same
  within 150 bytes, and with Next's `optimizePackageImports` on the package the same again: the bundler alone does not
  cut what the entry cuts.
- **The entry kept, behind the client alone.** With the `browser` condition pointing at `src/browser.generated.ts` and
  an `edge-light` condition listed before it, pointing at the index (an export map is matched in its own order, and
  Next's edge runtime carries `edge-light` where a client bundle does not), the build passes and the bundle check reads
  route JS +49 bytes against main, route CSS +0, Inbox −16,537, Conversations −7,171, Start −7,133 and Settings −6,593:
  a module a page-only entry and the index both reach is now one file, where the dist built it twice.

## Decision

### 1. The packages are sources

Each package's `package.json` points at its sources: `exports` `"."` to `./src/index.ts` for `types`, `import` and
`default`, each subpath to its module (`./src/reports/report-window.ts`), as `./phone-app` already does. Nothing is
built to be imported:

- **Types through project references.** Each package's `tsconfig.json` is `composite`, emitting declarations alone to
  `.types/` (gitignored), under its own options; each package references the siblings it imports, each app the five.
  `pnpm -r typecheck` becomes `tsc -b` at the root, one program per package checked once, and the dashboard's build
  script runs `tsc -b` for the packages before `next build`, so Next's own type pass reads their declarations. The
  edge's tsconfig moves to `moduleResolution: "Bundler"`. The one base stays the one base
  (`tooling/scripts/tests/types/every-tsconfig-extends-the-base.test.mjs`): `composite`, `declaration`,
  `emitDeclarationOnly`, `outDir` and `rootDir` are a runtime's settings, not a strictness flag.
- **The dashboard** lists the five in `transpilePackages`; Turbopack compiles them as it compiles the app.
  Contracts' `browser` condition points at `src/browser.generated.ts`, with `edge-light` to the index listed before
  it, so the edge runtime reads the whole package and a client bundle the entry; `sideEffects` names
  `src/zod-config.ts`, the one module that runs something as it loads.
- **The edge** bundles them as it bundles its own files; `apps/edge/lib/packages/*.ts` re-export `@chanlytics/<p>` by
  name (0024's step 3, without touching the 504 import sites that read the facades).
- **The suite** runs each package as one bundle the launcher builds (`tooling/scripts/checks/test.mjs`, before the
  runner starts: esbuild, a few seconds, into `packages/*/.bundle/`, gitignored), reached through an export condition
  `bundled` the launcher passes as it passes `--conditions=react-server` today. Tests import `@chanlytics/<p>` by name;
  the 31 that import a `dist` path by hand are rewritten, and the 11 scripts that do. Coverage reads the bundle's
  module markers as `tooling/scripts/checks/coverage.mjs` reads the dist's today.
- **The phone app** is unchanged: Metro compiles the one source export it takes.

With that, `packages/*/dist` leaves git, and with it: the CI job `The dist matches the sources` and `check:dist`
(`tooling/scripts/checks/dist.mjs`), `tooling/scripts/tests/repo/dist-freshness.test.mjs`, tsup and the five
`tsup.config.ts`, `tooling/scripts/lf-sources.mjs`, `tooling/scripts/package-siblings.mjs`,
`tooling/scripts/contracts-browser.mjs`, the `!packages/*/dist/` exception in `.gitignore`,
`injectWorkspacePackages` in `pnpm-workspace.yaml` (it existed for the tracer, and an injected copy of a source
package would not follow an edit; the packages are linked today), the README's "`packages/*/dist` is committed"
surprise, the runbook's lines on rebuilding it, `land`'s dist writer, and two rows of the register's "What is named
and not yet measured": the committed dist and tsup's `ignoreDeprecations`. The entry's generator stays (section 3).
0024's decisions 1 and 2 hold by construction: one module per package per process, nothing third-party inlined,
because nothing is bundled until an app bundles itself.

### 2. A change is held to what it adds; main keeps the numbers

The bundle check's rule, for every number the build holds:

- **A push to main records every measure under its sha**: the syntax-tree measures of `_measures.mjs`, the source
  scan, the wire's casing, the unchecked index reads, the lint's warnings by file and rule, knip's dead exports, and the
  bundle's sums, which already are. Each producing job writes its part (the lint job the warnings, the hygiene job the
  rest; the bundle's stays with the build) to the Actions cache under the sha and as an artifact, as
  `bundle-record` is.
- **A pull request is compared with its first parent's record** (the build and tests jobs check out two commits deep
  already; the lint and hygiene jobs do too). A key the base has not (a new offender) or a number that rose fails the
  job unless the description carries a line `Debt: <why>`, read as the check runs, as `Bundle: <why>` is. A number that
  fell needs nothing: there is no file to bank it in, and nothing to spend, since the next change is compared with the
  main it stands on and not with a number written weeks before. When the base's record is missing (main's run cancelled,
  or not finished), the check measures the base itself in a worktree of `HEAD^1` and says so.
- **The register is written by the build.** A nightly workflow (`.github/workflows/register.yml`, after the suite's)
  reads main's newest record and writes the blocks between the markers of `docs/debt.md`, `docs/takeover.md` and the
  tree of `docs/architecture.md`, and commits them to main in one commit, "The register, read <date>", only when they
  moved: pushed by the workflow where the protection lets one push, else as a pull request that merges itself under
  `land`'s rule. The pages' prose stays a person's: each row's item, what retires it and the next step; the "Baseline"
  column names the record's key instead of a file.
- **The week is read as the bundle's is.** `bundle-week.yml` becomes the week's reading of the whole record: a
  measure that rose over main's week keeps the rolling issue open (`tooling/scripts/ops/rolling-issue.mjs`) with the
  merges that carried a `Debt:` line and those that carried none.
- **The "Rises" table freezes** under a dated line: it is the record of why each number went up until 28 October
  2026, and a rise after it is argued where it is made, in its pull request, and listed by the week's reading.

So `tooling/scripts/tests/baselines/` leaves git but for two files that are decisions, not measurements:
`bundle-ceiling.json` (what a visitor may be asked to wait for) and `coverage.json` (the floors a full run is held to,
which only the nightly measures). `UPDATE_BASELINES`, `--update` and `--raise` go; `_ratchet.mjs` keeps `compare` and
loses `bank`; `code-health-ratchets.test.mjs`'s pairs become the measures' part of one check,
`tooling/scripts/checks/debt.mjs` (`corepack pnpm check:debt`), which `check:local` runs against the merge base with
`origin/main` in a worktree before it stamps a tree. `LIMITED_TREES` keeps its rule as a plain test: a tree whose
measure is empty is in the list.

### 3. The browser entry is written by the build, not committed

The entry stays: section Context measured what it saves, and no setting of the bundler reproduces it. What goes is
its place in git. `packages/contracts/src/browser.generated.ts` is gitignored and written by
`tooling/scripts/gen/contracts-browser-entry.mjs` as the first step of the dashboard's `dev` and `build` scripts, in
under a second from the barrels; the file that was rewritten in 188 of 590 changes is rewritten in none.
`tooling/scripts/tests/shipping/browser-entry.test.mjs` already generates it in memory on every run and holds every
value a page imports to a name in it; it keeps that, drops its reading of the built files, and keeps the one rule the
entry exists for: a module under the browser layers reaches no module that imports `zod`, `zod/v4` or
`zod/v4/classic`. `tooling/scripts/contracts-browser.mjs`, the per-module build of the entry, goes: the sources are
per module already.

### 4. A list several lanes add to is sorted

Every barrel (`packages/*/src/index.ts` and each domain's `index.ts`) is one export statement per module, modules in
path order, names in order within; `PREFETCH_READS` (`packages/contracts/src/shell/route-prefetch.ts`), the route
policy pin (`tooling/scripts/tests/route-policy.json`), the door policy pin
(`tooling/scripts/tests/edge/door-policy.json`) and the two event lists likewise, by key. One test holds them all
(`tooling/scripts/tests/repo/sorted-lists.test.mjs`), and `--fix` writes the order. Two lanes' names then conflict only
when they are neighbours in the alphabet, and a barrel still names every export it has
(`tooling/scripts/tests/repo/contracts-barrels.test.mjs` is unchanged).

### 5. What stays committed, and why

- **The generated route files** (`apps/dashboard/src/client/routes.generated.ts`,
  `packages/contracts/src/route-keys.generated.ts`, `packages/contracts/src/schema-sets.generated.ts`,
  `apps/dashboard/src/legacy-bridge/surfaces/shapes.generated.ts`), `docs/api.md` and `docs/data-model.md`: a reviewer
  sees the client's change in them, and `land` already takes main's side and writes them again (83 of the 590 changes
  touched a route-derived one).
- **The migration-derived files**, `supabase/schema.sql`, `packages/db/src/database.types.ts`,
  `supabase/migrations-ledger.json` and the schema sets: they need a database to write, which CI's replay has and a
  laptop may not (122 changes touched one). `land` learns the one thing it can: when a local stack answers
  (`supabase status`), a conflict in them is resolved as the generated files' are, main's side taken and the four
  commands run again; without one it names them, as it does today.
- **The route policy pin** stays hand-written and sorted: a change there is a change to who may do what, and the
  diff is the review.

## Shape

- `packages/<p>/package.json`: `exports` to sources, a `bundled` condition to `./.bundle/index.js`; no `main` or
  `types` to a dist; tsup leaves `devDependencies`. Contracts: `types`, `edge-light`, `browser`, `import`, `default`
  in that order on `"."` and each page-only entry, and `sideEffects: ["./src/zod-config.ts"]`.
- `packages/<p>/tsconfig.json`: `composite`, `declaration`, `emitDeclarationOnly`, `outDir: ".types"`, `rootDir: "src"`,
  `references` to the siblings in `dependencies`; `noEmit` off there alone.
- `apps/edge/tsconfig.json`: `module: "ESNext"`, `moduleResolution: "Bundler"`, `references` to the five.
  `apps/dashboard/tsconfig.json`: `references` to the five. Root `package.json`: `typecheck` is `tsc -b`.
- `apps/dashboard/next.config.ts`: `transpilePackages` names the five. `apps/dashboard/package.json`: `build` runs the
  packages' `tsc -b` first.
- `apps/edge/lib/packages/<p>.ts`: `export * from "@chanlytics/<p>"`.
- `tooling/scripts/package-bundle.mjs`: esbuild, each package's `src/index.ts` to `.bundle/index.js`, siblings
  external by name, third-party external, in seconds; `test.mjs` runs it and passes `--conditions=bundled`.
- `tooling/scripts/checks/debt.mjs`: `--record <file> --sha <sha>` writes the measures;
  `--against <record> --base <sha>` compares and reads `PR_BODY` for `Debt:`; `--pages` writes the three blocks from a
  record; `--base-tree` measures `HEAD^1` in a worktree when no record is restored. `lint.mjs` and `dead-exports.mjs`
  take the same two flags for their parts.
- `.github/workflows/ci.yml`: the `dist` job goes; `types` runs `tsc -b`; the lint and hygiene jobs restore the base's
  record and compare, and on a push record and save; `register.yml` is new; `bundle-week.yml` reads the whole record.
- `.gitignore`: `.types/`, `.bundle/`; the `!packages/*/dist/` line goes. `knip.json` ignores `**/.types/**` and
  `**/.bundle/**`.

## Steps

Each is one pull request, shippable alone and in either deploy order: nothing on the wire changes, and each app
bundles the packages at its own commit. S1 and S3 touch no file S2 touches but `ci.yml`.

1. **S1 · Sorted lists** (half a day). The test and its `--fix`; one commit per list reordered, no name changed.
2. **S2 · The packages are sources** (three to four days), as two pull requests:

- **S2a** points the exports at the sources with the references, `transpilePackages`, contracts' `edge-light` condition
  and `sideEffects`, the facades by name, the launcher's bundle and condition, the 31 tests' and 11 scripts' imports,
  and the edge's tsconfig; the dist stays in the tree, unread, so a rollback is the revert of one change. Proved on
  both previews: the dashboard's by `preview-smoke.yml` and `tooling/scripts/checks/smoke.mjs`, the edge's by
  `tooling/scripts/ops/golden-edge.mjs --no-secret` against its `VERCEL_URL`, and the suite under the `suite` label
  in both zones. Measured in the pull request: `tsc -b` cold and warm beside today's 1 m 47 s, the dashboard's build
  beside today's 1 m 55 s, the suite's time beside the nightly's, and the bundle check's own reading.
  - **S2b** deletes the dist and everything in section 1's last paragraph, and updates 0024's status (steps 3 and 4
    built here) and the two register rows.

3. **S3 · The record and the compare** (three to four days). `debt.mjs`, the records and the compare in CI,
   `register.yml`, the week's reading, the baselines deleted, the register's columns, the Rises table frozen,
   `check:local` through `check:debt`. The first nightly run writes the first blocks.
4. **S4 · The browser entry leaves git** (half a day, after S2a). The file gitignored, the two scripts writing it,
   the test without the built files; the bundle check reads the change, which this note's measurement says is none.
5. **S5 · `land` and the stack** (half a day). The migration-derived files resolved when a stack answers.

## Tests

- `shipping/package-dependencies.test.mjs`: every `exports` target is under `src/` or `.bundle/`; no `dist` in
  `git ls-files`; every package's `references` are exactly its `@chanlytics` dependencies; each app references the
  five. Its dist tests go.
- `shipping/browser-entry.test.mjs`: the graph alone (section 3); the file and the build it read are gone.
- `repo/debt-compare.test.mjs`: the compare's decisions on records written for it: a new key, a rise, a fall, a rise
  with and without its `Debt:` line, a base record missing. `repo/measures.test.mjs` keeps the measures' meaning.
- `repo/settings/workflow-rules.test.mjs` and `a-change-reaches-production-fast.test.mjs`: the gate's parts without
  `dist`; a push records and a pull request compares; `register.yml`'s schedule, permissions and the one commit;
  `land`'s writers without the dist and with the stack's four.
- `repo/sorted-lists.test.mjs`: each list sorted; `--fix` is the one way to reorder.
- `repo/debt-register.test.mjs`: every record key has a row and every row a key; a page's block is a record's, no
  longer the live tree's.
- `docs/docs-tree.test.mjs`: the tree is drawn by `register.yml`, and a plain run holds the block's shape alone.
- The suite under the `suite` label in both zones on S2a's pull request; `check:static-shell` and the bundle check on
  every build, as today.

## Risks

- **Typecheck time.** `tsc -b` of both apps was 79 s cold here against 73 s today, and 8 s warm; the dashboard's
  build spends 47 s in Next's type pass through the references. If a preview's build grows past what a deploy may
  take, Next's `typescript.ignoreBuildErrors` is the fallback: the Types job is the gate, and nothing deploys that it
  has not passed.
- **The suite's load time.** Without the launcher's bundle a folder took 33 s where it takes 18. The bundle is the
  design; its build is seconds, and S2a measures the whole suite under the label before anything is deleted.
- **The edge runtime's resolution.** Next's edge runtime applies the `browser` condition; the entry fails it, as the
  first build showed. The `edge-light` condition ahead of it is the answer, measured; a runtime that one day carries
  neither reads the index, which is the safe side.
- **A stale entry on a laptop.** A new export of contracts is not in the entry until the generator runs again, as
  today it is not until the entry is regenerated and the dist rebuilt; `dev` writes it on start, CI's test fails a
  stale one, and the generator is one command.
- **A base record missing.** Main's run cancelled, or the pull request's run ahead of it: the check measures `HEAD^1`
  in a worktree, slower by the lint's and knip's minute, and says so in the summary.
- **A fall lost to history.** Nothing banks a fall, so the register no longer says on what day a number fell; the
  record of each push to main does, as an artifact for 35 days and as the nightly's commit, and the week's issue
  names the merges.
- **The nightly's commit on a protected main.** If the protection refuses a workflow's push, the workflow opens a
  pull request that merges itself; CI passes a docs-only change in about five minutes.
- **The edge runtime's warnings.** Compiled from the sources, Next warns 14 times that channels' `meta-signature.ts`
  loads `node:crypto`, which its edge runtime lacks; the dist hid the same import. The edge half of
  `apps/dashboard/instrumentation.ts` reaches channels for its logger alone, so the logger a subpath of its own
  (`@chanlytics/channels/log`) ends the warnings; until then they are warnings.
- **Windows checkouts.** `lf-sources.mjs` existed because a CRLF checkout built a different dist. Nothing is built to
  be compared any more; `.gitattributes` keeps every text file LF regardless.

## Considered and not taken

- **Uniform strictness instead of references**: turn `noUncheckedIndexedAccess` on in contracts, core and the
  dashboard first (410 reads to guard), then let every consumer compile the sources under its own options. The guards
  are owed anyway (the index-reads row of the register), but a consumer compiling a dependency under its own options
  breaks again on the next option that differs, and checks contracts' 141,302 lines up to six times a run. References
  check each package once, under its own options, and are the compiler's own mechanism for it.
- **An uncommitted dist built on every consumer** (Vercel, CI, the laptop) with the exports as they are: it keeps
  tsup, the sibling plugin, the browser build and a build step before every typecheck, test and `next dev`, and
  changes nothing about how an edit reaches a running `next dev` (it does not, until a rebuild).
- **Committing the register's numbers from each pull request's own run**: that is today, with a bot's hand instead
  of a person's; the conflicts stay.
- **Dropping the register's numbers from the repository** for the weekly issue alone: `docs/takeover.md` is the
  takeover reader's one page and should carry them; one nightly commit a day at most is the price.
- **Generated barrels** (an `index.ts` written from each module's exports): then every export is public, and the
  barrel stops being where a package decides its surface (`contracts-barrels.test.mjs`'s rule). Sorted barrels keep
  the decision and lose the collisions.
- **Splitting `packages/db`'s barrel into domain entries** (0024's open question, candidate D of the 17 October
  review): the number is now measured (109 changes in 30 days), and the edge's objection falls with the facades, but
  a sorted barrel is the cheaper first answer; reopen it on the first month's reading of S1.

## Not decided here

- Deep imports from a page into a contracts module (`@chanlytics/contracts/<module>`) in place of the barrel: the entry
  already gives a page's bundle what it needs (section 3), so the question is one of names, not bytes.
- Whether the generated route files should be written by `pnpm install` and leave git too: `land` resolves them
  today, and a reviewer reads the client's change in them.
- The migration ledger's own shape, and whether CI's replay should write the migration-derived files into a pull
  request's branch.
- `nodeLinker: hoisted`, which the tracer also asked for and esbuild does not; harmless, and its own change.

## How we will know

Read on `origin/main` a month after S3 lands, with the commands in Context:

- The share of landed changes that touch a file no person writes: 72% on 28 October 2026, against the route-derived
  and migration-derived 150 of 590 that this note keeps (25%); the goal is that share and no more.
- `docs/debt.md`'s size, which grew fifteenfold in the 30 days to 28 October, flat but for the nightly's blocks and a
  person's rows.
- The merge commits of the month's pull requests whose message lists conflicts, read from their branches through the
  API (GitHub keeps them after the squash), by file: none in a dist, a baseline, the register or a barrel.
- CI's run on main: the dist job gone, `tsc -b` in the Types job beside today's 1 m 47 s, and the bundle check's
  reading unchanged by S4.
