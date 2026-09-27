# The debt register

One list of what the code owes, with the number that measures each item, what retires it, and
the next step. The numbers are held by ratchets: a baseline under
`tooling/scripts/tests/baselines/` that may only fall, seeded on 26 September 2026 at `4b4637d`
from the scorecard that found them drifting. A new offender is a red build. A reduction is banked
with `UPDATE_BASELINES=1 corepack pnpm test` (dead exports with
`corepack pnpm check:dead-exports -- --update`), and the block at the end of this page is
rewritten by the same command, so a count here is never typed by hand.

There is no owner column. This is a one-founder repository, and the owner of a number is the pull
request that moves it. A row leaves this page when its "retire when" is true and the test that held
it is deleted in the same change. The plan that orders the work is
`docs/plans/2026-09-26-organization-and-code-health.md`.

## What is measured

| Item                                                           | Measured by                                                       | Retire when                                                                                                                       | Next step                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functions over the limit: 150 lines, 30 branches or 5 levels   | `baselines/complexity.json`                                       | Empty for a tree, and ESLint's `complexity`, `max-lines-per-function` and `max-depth` are on for that tree                        | Phase 2 of the plan: `setupSteps`, `toTodayVM`, `toPersonVM`, the edge admin doors, the Retell door, `ChanlyticsApp`, the five largest shell components, `today-sample`, `createCharacter`; never `answerInbound` without decision 0001 |
| Files over 800 lines                                           | `baselines/file-length.json`                                      | Empty                                                                                                                             | The contracts and server moves (Phase 1); the shell's exit for the pages                                                                                                                                                                |
| Directories over 20 modules                                    | `baselines/tree-shape.json`                                       | Empty                                                                                                                             | Phase 1: `src/server`, `contracts`, the demo tree and the tests, each grouped by domain                                                                                                                                                 |
| Window globals: the `window.__*` names the shell reads         | `baselines/window-globals.json`                                   | Empty: every surface reads its data through a typed import                                                                        | The shell's exit decision (the next free number), surface by surface; a surface that goes real-only retires its names                                                                                                                   |
| Window publishers: `Object.assign(window, …)` and `window.x =` | `baselines/window-publishers.json`                                | Empty                                                                                                                             | The same                                                                                                                                                                                                                                |
| Copies: a name declared at top level in three or more files    | `baselines/copies.json`                                           | Empty                                                                                                                             | The homes exist (contracts' `shared/time.ts`, `identity.ts`, `words.ts`, `html.ts`, `clock.ts`; `server/service-db.ts`): Ask's and Reach out's copies move there once those land; other names are other things, renamed to say which    |
| `as unknown as`                                                | `baselines/casts.json`                                            | Zero                                                                                                                              | Phase 3, with the branded ids; the bridge's window casts go with the generated `legacy-globals.d.ts`                                                                                                                                    |
| Table names outside `packages/db`                              | `baselines/tables.json`                                           | Zero: every read and write of a table goes through a repository or a reader in `packages/db` (`CLAUDE.md`, what not to introduce) | A reader at a time, as `src/server` is grouped by domain                                                                                                                                                                                |
| Dead exports, types and modules                                | `baselines/dead-exports.json`, `corepack pnpm check:dead-exports` | Zero                                                                                                                              | Phase 3: a look at each (a use knip cannot see is read through a string or a test double), then delete; `assertCanSend` and `schema-agreement.ts` first                                                                                 |
| Source-text assertions in tests                                | `source-scan-baseline.json`                                       | Zero outside the eight repo-wide lints                                                                                            | A behaviour test replaces each pin as its module is touched                                                                                                                                                                             |
| Lint warnings                                                  | `--max-warnings` in `package.json`                                | Zero, with `exhaustive-deps` and unused names as errors                                                                           | Fix the 27 effects and the 19 unused names, lowering the number as each lands                                                                                                                                                           |

## What is named and not yet measured

| Item                                                                                                               | Retire when                                                                                          | Next step                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shell: about 51k lines of JSX outside the typecheck, Prettier and all but the hooks rules of lint              | Every real surface is a TSX module on an App Router route, with typed imports and its seed twin gone | The shell's exit decision, written first; then Inbox, Today and People                                                                                                                                                                                          |
| Demo code in the real manifest: about 9.6k lines of demo-only pages and seed data loaded for every workspace       | `legacy/demo/` behind `manifest-demo.ts`, imported only in a declared demo session                   | Moved under `legacy/demo/` (Phase 1, move 3); the demo manifest waits on Phase 2, because four real pages still fall back to their seeded twin (`CalendarSeed`, `BroadcastsSeed`, `OutboundSeed`, `LiveMonitorPage`) and `segments.jsx` reads `BC_HISTORY_SEED` |
| Core's dist inlines contracts (1.7 MB), so an error class loses its identity across the package boundary           | The packages externalise `@chanlytics/*`, or every shared class carries a structural brand           | A decision note, then scorecard move 5                                                                                                                                                                                                                          |
| `DIAG_KEY` opens every admin door                                                                                  | Refused on the admin doors; every edge token names a workspace and a person                          | Scorecard move 9                                                                                                                                                                                                                                                |
| The Retell `?key=` secret on the voice doors                                                                       | Signature-only                                                                                       | Scorecard move 9                                                                                                                                                                                                                                                |
| `docs/takeover.md` is scored by hand and dated 21 September                                                        | Its counts come from the block below                                                                 | Phase 4                                                                                                                                                                                                                                                         |
| Decisions 0004 and 0006 to 0009 read as unbuilt though built; the glossary says Deal has no table (00156 made one) | The status lines say what the code does                                                              | Phase 4                                                                                                                                                                                                                                                         |

## The numbers

Written by `UPDATE_BASELINES=1 corepack pnpm test` from the baselines; `debt-register.test.mjs`
fails when this block and the baselines disagree.

<!-- measured:start -->

```text
functions over the limit            275   of which over 200 lines: 66
files over 800 lines                 37
directories over 20 modules           8
window globals                      194   names
window publishers                   388   sites in 141 files
copies                              135   of 36 names
as unknown as                       223
table names outside packages/db     538
dead exports, types and modules     404
source-text reads in tests          833
lint warnings allowed                46
```

<!-- measured:end -->
