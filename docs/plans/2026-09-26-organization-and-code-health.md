# Organization and code health, to ten

**Status.** Written against `main` at `4b4637d` (26 September 2026), after the nine-reviewer
scorecard measured `8d7d22d6` the same day. Every number below was re-measured at `4b4637d` in
this checkout; where the scorecard and this page differ, this page says so. Checks at `4b4637d`:
typecheck clean, Prettier clean, lint 0 errors and 46 warnings, 5,674 tests (5,327 pass, 0 fail,
347 skip without credentials), no dist drift.

This page answers three questions for the four categories the scorecard groups as _Organization
and code health_ (2 Folder organization, 27 Complexity, 28 Code smells, 40 Technical debt, mean
5.6 with 8, 9 and 35 included) and, more briefly, for the three others scored 5 (17 Frontend
architecture, 19 Performance, 36 Scalability):

1. Is the scorecard right about the code? (Mostly yes; three places where the plan differs.)
2. What does 10 mean, concretely, and which test holds it there?
3. In what order, by whom, and what does each step lift?

The rubric is the scorecard's: **10** means the practice is universal, a test or tool stops it
regressing, it is documented, and it fits a live product built by one founder with agents.

## 1. The scorecard against the code at `4b4637d`

### Confirmed

| Claim                                                   | At `4b4637d`                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts` is a flat grab-bag                          | 130 files, 45,874 lines, no subdirectory, 103 `export *` lines in `index.ts`. All 299 consumer imports go through the barrel, so a split by folder is a pure move.                                                                                             |
| `src/server` is flat and `service.ts` is a grab-bag     | 63 files at the root plus `ask/` (12) and `readers/` (22, new since the scorecard). `service.ts` is 863 lines and 30 exports: jobs, thread control, media, erasure, live calls, notifications, team, WhatsApp signup, templates, playbooks, lead suggestions. Nine `lead-*.ts` (1,572 lines) sit at the root. |
| Tests are one flat directory                            | 598 files (533 `.test.mjs`, 54 `.db.test.mjs`, 11 `.integration.test.mjs`), 240,694 lines, none beside the code it proves.                                                                                                                                      |
| 79 functions over 200 lines; 25 files over 1,000        | Exactly 79 and exactly 25, measured with the TypeScript compiler API (definitions in §5). Over 150 lines: 133. Over 100: 235. The god-function table (`setupSteps` 930, `answerInbound` 920, `toTodayVM` 726, `ChanlyticsApp` 701, `toPersonVM` 594 …) matches line for line. |
| Nothing limits size or branching                        | `eslint.config.mjs` has no `complexity`, `max-lines`, `max-depth` or `max-params`; no CI ratchet on any of them; 46 lint warnings are tolerated (27 `exhaustive-deps`, 19 unused variables).                                                                    |
| The shell carries global state                          | 191 distinct `window.__*` names, 65 `Object.assign(window, …)` sites, 308 `window.X =` sites, 630 distinct published names, 12 `*_STORE`s.                                                                                                                      |
| Demo code ships with every real workspace               | About 9.6k lines of demo-only pages and seed data are static imports in `manifest.ts`; `__DEMO_MODE` appears in 21 files; four surfaces exist as a mockup `X.jsx` beside a real `X-real.jsx` (broadcasts, calendar, live-monitor, outbound); `clients-a.jsx` is People. |
| Small facts are spelled out many times                  | 29 names are declared at top level in three or more files: `DAY_MS` 15, `UUID` 11, `plural` 11, `serviceDb` 6, `E164` 5, `mmss` 4, `escapeHtml` 3, `WEEK_MS` 3, `capitalize` 3.                                                                                  |
| `assertCanSend` is dead                                 | Defined at `server/verbs.ts:205`, referenced nowhere.                                                                                                                                                                                                          |
| Type assertions and raw table names                     | 212 `as unknown as`. 543 `.from("<table>")` calls outside `packages/db`, against the rule in `CLAUDE.md` ("a table name typed outside `packages/db`") that nothing enforces.                                                                                     |
| `docs/takeover.md` is stale                             | Dated 21 September. "Nine files over 1,000 lines" is 25; "148 window globals" is 191; "contracts is a 25k-line grab bag" is 45.9k; "395 test files" is 598; "the 880-line WhatsApp handler" is `answerInbound`, 920 lines in core.                              |
| Dead exports                                            | knip, with the edge doors, the routes, the manifest and the tests declared as entries, finds 181 unused exports and 180 unused types in the apps (edge 73 and 93, dashboard 96 and 87) and one unreferenced module, `packages/channels/src/schema-agreement.ts`. Higher than the scorecard's 40, which counted the packages only. Each needs a look before it is deleted; the count needs no look to be held. |

Not re-measured here: the growth from 91k to 119k to 181k lines (14, 21, 26 September). This
checkout is shallow (50 commits); the previous session re-derived it. Since the scorecard's
commit the tree grew a further 4.2k lines in seventeen merges, so the rate has not changed.

### Where this plan differs from the scorecard

1. **Tests go by domain, not beside the packages.** The scorecard's step is "move tests beside
   their packages". The suite is one runner glob, one baseline keyed by file name, eleven shared
   worlds (`_fake-db.mjs`, `_lead-world.mjs` …) and a CI rule that keys off the directory; 321
   files import the packages' built dist and 58 import the apps' TypeScript by relative path.
   Colocating 598 files inside `packages/*` means each package carrying test dependencies and
   the dist-versus-source import split, for the same findability that
   `tooling/scripts/tests/<domain>/` gives at a tenth of the churn. The runner glob becomes
   `**/*.test.mjs` and the ratchet is keyed by relative path.
2. **Contracts split by domain, not by kind.** The scorecard proposes `rules/`, `schemas/`,
   `views/<surface>/` and `words/`. Everything else in this repository that is grouped is grouped
   by domain (`apps/edge/lib`, `packages/core/src`, `src/server/readers`), and `CLAUDE.md` already
   answers "which kind" at the package level. A Today change should stay in one folder:
   `contracts/src/today/`, with kinds as file names inside it where a domain is large enough
   (`schema.ts`, `vm.ts`, `words.ts`). Curated barrels stay in the plan.
3. **Branded ids come after the moves.** `TenantId`, `ContactId` and `E164` touch 397 `tenantId:
   string` sites across contracts, core and the ports; doing that while contracts is being moved
   is two moves in one diff. It is Phase 3, not Phase 1.

One correction to the scorecard's own numbers: the dead-export count that matters is the one a
configured knip gives (above), not the 40 from an AST pass over the packages.

## 2. What 10 means, and the test that holds it

### 2 · Repository and folder organization (now 5)

10 is: every tree is grouped by domain with plumbing at its root, the way `apps/edge/lib` already
is; no flat directory over twenty modules; every barrel names what it exports; demo code lives
under `legacy/demo/` and is not in the real manifest; and a test fails the build when a directory
passes its ceiling or a barrel grows an `export *`.

- `packages/contracts/src/<domain>/` with a curated `index.ts` per domain and the root barrel
  re-exporting the domains. The built export list is byte-identical before and after (the repo's
  own proof for a pure move).
- `apps/dashboard/src/server/<domain>/` (team, erasure, live, whatsapp, templates, playbooks,
  leads, people, calendar, billing, ask, readers …) with the fourteen plumbing modules at the root
  (`route.ts`, `with-route.ts`, `edge.ts`, `deployment.ts`, `tenant.ts`, `origin.ts`,
  `request-*.ts`, `rate-limit.ts`, `dto.ts`, `lazy.ts`, `model-json.ts`, `server-timing.ts`,
  `auth-*.ts`). `service.ts` is dissolved into those folders; nothing is left at the root that
  belongs to one domain.
- `tooling/scripts/tests/<domain>/` on the same names, the worlds beside the tests that use them.
- `apps/dashboard/src/legacy/demo/{pages,data}/` behind `manifest-demo.ts`, imported dynamically
  when and only when `__DEMO_MODE` is set; the harness (`Chanlytics.html`) list updated, since
  `legacy-harness.test.mjs` holds the two lists to the same order. `clients-a.jsx` becomes
  `people.jsx`; each `X-real.jsx` becomes `X.jsx` once its mockup twin has moved to `demo/`.
- Held by: the tree-shape ratchet (directories over the ceiling may only fall), a barrel test
  (no `export *` outside a domain barrel), the harness test that already exists, and the
  canonical-example table in `CLAUDE.md` naming the domain folders.

### 27 · Complexity management (now 4)

10 is: no function over 150 lines, 30 branches or 5 levels outside the shell, and none over 200
anywhere; the limits are lint errors for new code; the decision tables are written as tables; and
a baseline that may only fall holds every existing exception by name.

- `baselines/complexity.json`: every function over the limit, by file and name, with its lines,
  branches and depth. A new function over the limit is a red build; a listed one may not grow;
  a reduction must be banked (`UPDATE_BASELINES=1 corepack pnpm test`) or the build says so.
- The twelve god functions, each its own change, proven equal by value against recorded
  fixtures: `setupSteps` as `SETUP_ROWS: ((i, ctx) => Row | null)[]`; `toTodayVM` as one builder
  per band over one `TodayInput`; `toPersonVM` as one builder per card; the edge admin doors
  (`lines`, `google`, `billing`) as `Record<Op, handler>` over plan functions; the Retell webhook
  as verify-and-normalise plus a pure `planCallEvent`; `ChanlyticsApp` as a route table beside
  `surface-registry.ts`; `AskReal`, `BroadcastsReal`, `LeadsReal`, `PeopleReal` and `Inbox` split
  into hooks; `today-sample.ts` as one sample builder per surface; `createCharacter` as a state
  record with per-state reducers; `ConnectMode` deleted with the rest of the demo studio.
- Two functions are not this plan's: `answerInbound` belongs to decision 0001 (its comment says
  the order of its gates is the product, and `CLAUDE.md` says read the note before touching the
  inbound path), and `runAskTurn` is being rebuilt by the Ask Rewired program.
- Held by: the ratchet above, then `complexity`, `max-lines-per-function`, `max-depth` and
  `max-params` in `eslint.config.mjs` at the limits, once the baseline is empty for a tree.

### 28 · Code smells (now 5)

10 is: no dead export; every small helper has one home; every duration is named; the shell
publishes nothing new on `window`; the log events are a registry; and each of those is a number
the build holds.

- Dead code: knip in CI with the doors, routes, manifest and tests as entries; the count per
  file may only fall (`baselines/dead-exports.json`); `assertCanSend`, `schema-agreement.ts` and
  the rest deleted after a look at each.
- One home: `DAY_MS`, `WEEK_MS` and friends in `contracts/time.ts`; `isUuid` in `identity.ts`;
  `plural` and `capitalize` in a `words.ts`; `escapeHtml` in `core/html.ts`; `mmss` in
  `clock.ts`; `serviceDb` in `packages/db`. The copies ratchet (names declared in three or more
  files) holds the total at its number and then at zero.
- Magic numbers: the 177 unnamed duration literals named after the copies land, so they name the
  one home; the lead caps become data both the SQL and the dashboard read.
- Global state: the globals ratchet holds the set of `window.__*` names and the number of
  publisher sites; each surface that goes real-only retires its `*_STORE`. The count reaches
  zero only with the shell's exit (decision 0015, below), which is its own program.
- `LOG_EVENTS` on the edge as a closed set with a test, the way `EVENT_KINDS` already is.
- Branded `TenantId`, `ContactId`, `E164` in core commands and ports, after the moves.
- Held by: the dead-exports, copies, globals, casts and tables ratchets; the `LOG_EVENTS` test.

### 40 · Technical debt (now 5)

10 is: one register naming every debt item with what measures it and when it retires; the
numbers in it generated, never typed; every measured drift ratcheted; the self-scorecard
re-derived from the register; and an exit path written for the largest item.

- `docs/debt.md`: one table (item, measured by, retire when, next step) and a generated block of
  the current numbers. A test fails when a baseline exists that no row names, or when the block
  differs from the baselines. No owner column: this is a one-founder repository and the owner of
  a number is the pull request that moves it.
- `docs/takeover.md` re-scored from the register after Phase 1, and its counts generated from
  the same measures so they cannot go stale again.
- Decisions 0004 and 0006–0009 marked built; the glossary's line that Deal has no table fixed
  (00156 made one).
- The workarounds with an exit but no date get a retire-when in the register: the Retell `?key=`
  secret, `DIAG_KEY`, committed dist.
- The shell's exit decision, surface by surface, under the next free number:
  [0015](../decisions/0015-the-shell-leaves-surface-by-surface.md). 0011 to 0013 went to the bearer
  token, partners and a partner's second factor while this plan ran, the open partner note (#1165)
  writes 0014, and the open pricing note (#1039) also claims 0011. Written, not built, in this plan.
- Held by: the register test; `--max-warnings` falling to 0; the ratchets.

## 3. The order, and who does what

The repository merges to `main` about twenty-five times a day across two programs (Reach out 3,
Ask Rewired), both of which touch `contracts`, `src/server` and the pages. Two consequences: a
structural move must be a short-lived pull request merged the same day, and instrumentation
must land before the moves, so every move is measured and nothing regresses while it waits.

### Phase 0 · Instrument (one pull request, additive, no collision)

One AST helper (`tooling/scripts/tests/_ast.mjs`, over the TypeScript compiler API, never the
source text) and one ratchet helper (`_ratchet.mjs`) that give each measure the same two tests:
nothing got worse, and the baseline is not stale; `UPDATE_BASELINES=1 corepack pnpm test` banks a
reduction. Eight baselines under `tooling/scripts/tests/baselines/`, held by one test file, and
knip's, held by a CI step:

| Baseline                 | Holds                                                                    | At `4b4637d`               |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------- |
| `complexity.json`        | functions over 150 lines, 30 branches or 5 levels                        | 293, of which 79 over 200  |
| `file-length.json`       | files over 800 lines                                                     | 43                         |
| `tree-shape.json`        | directories over 20 direct modules                                       | 10                         |
| `window-globals.json`    | the set of `window.__*` names the shell reads (a new name fails)         | 191 names                  |
| `window-publishers.json` | `Object.assign(window, …)` and `window.x =` sites, per file              | 373 sites in 138 files     |
| `copies.json`            | names declared at top level in three or more files                       | 29 names, 133 copies       |
| `casts.json`             | `as unknown as` per file                                                 | 212                        |
| `tables.json`            | `.from("<table>")` outside `packages/db`, per file                       | 542                        |
| `dead-exports.json`      | knip's unused exports, types and modules per file (`check:dead-exports`) | 350                        |

Plus `--max-warnings 46` on lint, the register, a `CLAUDE.md` rule ("what is measured may only
fall") and a row in the canonical-example table. Lifts 27, 28 and 40 by one point each: the
limits exist and hold; nothing has moved yet.

### Phase 1 · Organize (four pure moves, one pull request each, one agent each, in worktrees)

Order: server, then contracts, then demo, then tests. Each is "moved whole": no line changes but
the wiring, the export list byte-identical, dist rebuilt, the full check line green, merged the
same day so the two programs rebase once. The contracts move goes last of the code moves
because it rewrites the most dist and both programs are in it daily.

1. `src/server` by domain; `service.ts` dissolved. Every route's import path changes, nothing
   else. About 60 files.
2. `contracts` by domain, one curated `index.ts` per domain, the barrel ratchet added in the
   same change. About 130 files.
3. Demo under `legacy/demo/`, `manifest-demo.ts` behind a dynamic import, both lists updated,
   `clients-a.jsx` renamed. About 25 files and the harness.
4. Tests by domain; runner glob and ratchet keys updated. About 600 files, no content change.

Lifts 2 from 5 to 8, and 35 and 40 by a point. What is left for 2 after this is the shell.

### Phase 2 · Decompose (one pull request per god function, agents in parallel)

Twelve functions (§2, category 27), each proven equal by value: record the function's output
over the fixtures the existing tests already build, split, assert equality, then delete the
recording. Agents run in parallel because the functions do not share files, with one rule: a
change under `packages/*` rewrites dist, so those merge one at a time, rebased and rebuilt.
Lifts 27 from 5 to 8 or 9, and 3, 4 and 35 by a point.

### Phase 3 · Smells (small, parallel)

Dead exports deleted after a look at each; the copies moved to their one home; durations named;
`LOG_EVENTS`; the lead caps as data; branded ids last. Lifts 28 to 8; the rest is the shell.

### Phase 4 · Debt docs

`takeover.md` re-scored from the register; decision statuses and the glossary fixed; the shell's
exit decision written (0015). Lifts 40 to 9.

Roughly: Phase 0 today; Phase 1 two to three days of calendar because of the sequencing; Phase 2
about a week with agents in parallel; Phases 3 and 4 three days together. The last point in each
category is the shell's exit, which is decision 0015's program and not this plan's.

### Rules for the agents

- A move is a move: no rename of a symbol, no reorder of a body, no "while I am here".
- Every pull request runs the whole line: `corepack pnpm --filter "./packages/*" build &&
  corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`, and `git status` shows
  no dist drift.
- A decomposition is proven by value, never by reading. The recording is deleted in the same
  change; a fixture that survives becomes a test.
- The ratchets are the referee: a pull request that raises a number needs an argument in its
  description, and the number changes in the same diff.
- Nothing in `answerInbound` without decision 0001; nothing in `runAskTurn` while Ask Rewired
  runs; nothing on the inbound path or appointments without the note `CLAUDE.md` names.

## 4. The three others scored 5

Not re-verified in this session beyond what §1 measured of the shell; the steps are the
scorecard's, ordered by what Phases 0 to 3 already carry.

- **17 Frontend architecture.** The lint alias for the shell's effect hooks matches only five
  names; make it `use\w+Effect`, raise `exhaustive-deps` to an error under the warnings ratchet,
  add `no-undef` and `jsx-a11y` behind their own baselines (Phase 0's pattern). The demo split is
  Phase 1's third move. Then `legacy-globals.d.ts` generated from the publishers the globals
  ratchet already lists, and `checkJs` on one surface at a time. The long step is the shell's exit, decision 0015.
- **19 Performance.** A bundle budget on the `/w` route's JavaScript and CSS that may only fall
  (Phase 0's pattern, over `next build`'s output), and p75 LCP and INP sent to the logs. Then
  `setStatus` notifying only on a real change, a memoised page subtree, the LiveCallBar timer
  stopped, demo and heavy surfaces on demand (Settings, Reports, the first run, the Leads map),
  message events routed only to the three surfaces that draw messages.
- **36 Scalability.** The playbooks and calendar sweeps due-aware in SQL and playbooks fanned
  out as jobs (the 25-playbook and 40-calendar ceilings); a broadcast that stops and reschedules
  on a 429 or a tier refusal; then ledger lanes and fairness, and rollups behind
  `metrics_summary` and `people_list` with keyset paging. These are backend changes with their
  own design notes, not moves; they are listed here so the order is one list.

## 5. How the numbers are measured

- **Functions** are every function declaration, expression, arrow and method with a body, in
  `apps/**` and `packages/*/src/**`, excluding `dist`, generated files and `.d.ts`. **Lines** are
  from the function's first token to its closing brace. **Branches** are cyclomatic complexity as
  ESLint's `complexity` counts it: one, plus one per `if`, loop, `case`, `catch`, ternary, `&&`,
  `||`, `??`, logical assignment, `?.` and default value. **Depth** is the nesting ESLint's
  `max-depth` counts: `if`, `switch`, `try` and loops, an else-if chain flat. A nested function
  is its own: its branches and depth are not its container's.
- **Globals** are property accesses on `window` whose name starts with `__`; **publishers** are
  `Object.assign(window, {…})` calls and `window.X =` assignments. A cast hides neither:
  `(window as T).__X`, `(<T>window).__X`, a name bound to it (`const w = window as T; w.__X`) and
  `const { __X } = window` count.
- **Copies** are names declared at top level (functions and `const`/`let`) in three or more
  files, whatever their length, excluding route modules (`app/**`, `apps/edge/api/**`) and tests.
- **Casts** are `as unknown as` expressions, however written (`(x as unknown) as T`,
  `<T><unknown>x`); **tables** are `.from("<literal>")` calls outside `packages/db`.
- **Dead exports** are knip's, with entries declared in `knip.json`.
- The file set is `git ls-files`, so a checkout and a desk measure the same thing.
