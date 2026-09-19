# Reports Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Chanlytics OS's Reports page as the approved spec (`docs/superpowers/specs/2026-09-18-reports-redesign-design.md`) describes: three new measurements from one migration, a shadcn-shaped chart kit with no runtime dependency, and a page that answers an owner's questions in order, every sentence beside a number said by the view model.

**Architecture:** Three PRs. **A (data):** `report_series` v3 adds `replies`, `channels` and `hours`; contracts' `toReportVM` gains the view-model parts, the card sentences (`lines`) and the comparison gate, and a pure `reportFacts()`. **B (kit):** seven flat `components/chart-*.jsx` classic scripts plus `styles/charts.css`, loaded by both legacy lists; the card owns the series. **C (page):** `reports.jsx` (shell + Google) and `reports-sections.jsx` draw the bridge's `__REPORTS` with the kit; the bridge publishes the facts; the standalone mockup draws the same page from a sample that its server builds.

**Tech Stack:** Postgres (Supabase, plpgsql), TypeScript contracts built with tsup (dists committed), legacy React classic scripts (compiled by Next in the app, by Babel in `Chanlytics.html`), node:test with tsx, esbuild (the mockup's sample), Playwright (nightly).

---

## Status (19 Sep 2026)

The 18 Sep plan (commit c1503582) was reviewed before execution by four passes (SQL and data truth, the kit against
the dataviz rules, the page against the repo's pins, and a read of every task). Ruben approved every change the review
proposed ("All of them") and chose to have the mockup draw a built sample ("Load a built sample"). The amended design
was then built in full on a local draft branch and verified there before any PR was opened: the whole unit suite, every
package's typecheck, lint, the dist check, the migration's test on a real Postgres, and a look at the mockup in a
browser (below). This document is the plan as built. The code is in the three PRs; the 18 Sep version, with its first
draft of every file, stays in git history.

## What the review changed

**Blocking, fixed first**
- Migration **00139**: #677 took 00138 after the plan was written.
- `google.ts` builds `ReportTileVM` too; its four tiles carry `compare: null`.
- The kit's CSV spells every cell with contracts' `csvCell` (`window.__csvCell`), #679's rule. Its own quoting let a
  playbook name like `=HYPERLINK(...)` run as a formula in whoever opened the file.
- The tooltip picks its side in pixels (whichever side of the point holds 260px, else across the plot). The ratio rule
  left every card narrower than about 800px, so every card on a phone.
- The demo sample was unreachable: the app never enters a demo session, and the mockup had no bridge. The mockup's
  server now builds it (`tooling/scripts/serve-legacy.mjs`, esbuild) and `Chanlytics.html` loads it.

**Data and words (contracts)**
- Every sentence beside a number comes from the view model: `vm.lines` (hero, heroBefore, answered, reply, calls,
  channels, rhythm), `cm.lines` (funnel, sent), the booking view model's `words`. The page composes none.
- `compareWords` compares only against a period someone reached the business in, and says "none the {range} before".
- Weekdays over 30 or 90 days are each weekday's own average: 30 days hold five of two weekdays and four of the rest.
  `busiest` and `quietest` are unique or null.
- Copy made true: "said yes to messages" (the general consent; never offers), "Nine in ten" only with ten replies,
  "About 2m 10s a call" by `fmtSeconds`, "Most messages on {date}" (Worth knowing names the weekday), the quiet side of
  the week in words that fit a week or a longer period, "has no reply yet", "every time" when one reason is the tile's
  count, the campaign tie-break toward fewer sends.
- A caller's mood reads in its own order with a status tone; `period` names both periods once.

**Kit (interface)**
- No `ChartContainer`: `ChartCard` owns the series (publishes `--color-<key>`, draws the legend, derives a table twin).
- The area is `LineChart` with a filled series; one frame, one y axis, one x-label rule (the newest day labelled).
- Legend none under two series; a one-slice donut is its number; line keys in tooltips; `role="group"` tab stops;
  `animKey`; pointer events; a clamped keyboard point; the view model's hour names; `SegmentBar` for part-bars.

**Page**
- `<dl>` tiles; fact rows that are one button; Worth knowing hidden in an empty period; an unreadable calendar is a
  failed read; the rhythm table carries the hours; a sticky head with an edge; print; the Google tiles wrap with the
  rest; the Google gained card no longer repeats the tiles' count.
- The sample generator is trade-neutral (`trade-neutral.test.mjs` refuses one trade's words in customer code).

## Ground rules for every task

- **Worktree:** `C:/Users/Ruben/Documents/Claude Projects/Claude Video/cm-gutter`. Never work in the shared checkout.
- **Shell:** Git Bash. No `jq`; use `node -e` or `gh --template`. No heredoc inside `&&` chains.
- **pnpm:** `corepack pnpm ...`. Contracts are consumed through their dist: after a change in `packages/*/src`, run
  `corepack pnpm --filter "./packages/*" build`, and commit a package's `dist/` only where
  `git diff -w --ignore-cr-at-eol -- packages/<pkg>/dist` shows a real change.
- **One test file:** `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs`.
- **Everything:** `corepack pnpm test`, `corepack pnpm -r typecheck`, `corepack pnpm lint`, `node tooling/scripts/check-dist.mjs`.
- **Never add a `readCode(`/`readRaw(` call to a test.** Moving a path inside an existing one is allowed.
- **Legacy files load twice:** a new file goes in `legacy-bridge/manifest.ts` and `legacy/Chanlytics.html` in the same
  order, and every edited legacy file's `?v=N` goes up.
- **The local Supabase stack is shared** by every worktree: verify a migration by applying its function and restoring
  the saved definition, never with `db reset`.
- **Commits** end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`; PR bodies with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **CI:** 6 checks. A CONFLICTING PR runs none: count them. A 2-second failure naming payments is GitHub billing.

## File map

| File | PR | Responsibility |
|---|---|---|
| `supabase/migrations/00139_reports_say_where_and_when.sql` | A | `report_series` v3 |
| `packages/contracts/src/reports.ts` | A | v3 DTO fields, `compareWords` (gated), `weekOf` (averages), `callMoodTone`, `speedOf`, `hoursOf`, `channelsOf`, `runningTotal`, `reportHourWords`, `period`, `lines`, the new VM parts |
| `packages/contracts/src/report-facts.ts` (+ `index.ts`) | A | `reportFacts()` and `ReportFactVM` |
| `packages/contracts/src/campaign-report.ts` | A | `lines` (funnel, sent); tiles `compare: null` |
| `packages/contracts/src/calendar-people.ts` | A | `BookingReportVM.calendar` and `.words` |
| `packages/contracts/src/google.ts` | A | tiles `compare: null` |
| `packages/contracts/dist/**` | A | rebuilt |
| `tooling/scripts/tests/report-series.db.test.mjs` | A | v3 on a real Postgres |
| `tooling/scripts/tests/reports-where-when.test.mjs`, `reports-lines.test.mjs`, `report-facts.test.mjs` | A | the view model, its sentences, Worth knowing |
| `tooling/scripts/tests/campaign-report.test.mjs`, `calendar-people.test.mjs` | A | the campaign lines; the booking view model's two new fields |
| `apps/dashboard/src/legacy/components/chart-{core,bar,line,pie,radar,radial,heat}.jsx` | B | the kit |
| `apps/dashboard/src/legacy/styles/charts.css`, `components/icons.jsx` (`download`) | B | palette, chrome, one icon |
| `legacy-bridge/manifest.ts`, `legacy/Chanlytics.html`, `legacy-bridge/legacy.css` | B, C | load lists |
| `tooling/scripts/tests/_legacy-react.mjs`, `chart-kit.test.mjs` | B | the shared stub React; the kit's tests |
| `apps/dashboard/src/legacy/pages/reports-sections.jsx`, `pages/reports.jsx`, `styles/reports.css` | C | the page |
| `apps/dashboard/src/legacy-bridge/surface-data.ts` | C | `__REPORTS.facts` |
| `apps/dashboard/src/legacy-bridge/reports-sample.ts` | C | the demo's sample, through contracts |
| `tooling/scripts/serve-legacy.mjs`, `package.json`, `pnpm-lock.yaml` | C | the mockup builds the sample (esbuild, a direct dev dependency) |
| `tooling/scripts/tests/reports-page.test.mjs`, `reports-sample.test.mjs` | C | the page; the sample and its bundle |
| `tooling/scripts/tests/reports-honest.test.mjs`, `empty-failed.test.mjs`, `campaign-report.test.mjs`, `calendar-people.test.mjs`, `metrics-truth.test.mjs`, `legacy-harness.test.mjs` | C | tests move with the page; pins follow the cards |
| `e2e/reports.spec.ts` | C | nightly |
| `apps/dashboard/src/legacy/CLAUDE.md`, `docs/system-prd.md` | C | the kit's conventions; Reports as it is |

---

# Part A: data (PR A, `feat/reports-data`)

### Task A1: Branch, and the migration number that is free now

- [ ] `git fetch -q origin && git checkout -b feat/reports-data origin/main`
- [ ] `git ls-tree --name-only origin/main supabase/migrations/ | tail -2` shows `00138_a_person_says_where_they_came_from.sql` as the highest; `gh pr list --repo expectmeout/chanlytics-os --state open` shows no open PR adding a migration. If either has moved, renumber 00139 in the file name, its header and the spec.

### Task A2: The migration and its database test

**Files:** `supabase/migrations/00139_reports_say_where_and_when.sql`, `tooling/scripts/tests/report-series.db.test.mjs`

- [ ] The function is 00037's, unchanged, plus the `hour_counts` and `hour_grid` CTEs and three keys: `replies` (each receptionist first reply this period with the day it was asked), `channels` (inbound customer messages by `messages.channel`, connected calls as `voice`, this period and the one before) and `hours` (7 rows, Monday first, of 24, tenant zone). A call's note is `sender = 'system'`, so no voice row is an inbound customer message and the donut adds up to Customer messages + Calls.
- [ ] Verify on the shared local stack without touching its ledger: save the live definition (`pg_get_functiondef('public.report_series(uuid,integer)'::regprocedure)` into a file), apply the migration with `docker exec -i supabase_db_chanlytics-messaging psql -U postgres -v ON_ERROR_STOP=1 -q < <file>`, export `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o env`, run the db test, then apply the saved definition back. Expected: 1 test, pass; afterwards no `report_series` holds `'hours'`.

### Task A3: The view model

**Files:** `packages/contracts/src/reports.ts`; tests `reports-where-when.test.mjs`, `reports-lines.test.mjs`

- [ ] `reportFacts` aside, everything in spec section 6.3: `compare` on the tiles through `compareWords(current, previous, rangeLabel, priorHadAny)`; `weekOf` as each weekday's average with `unit`; unique `busiest`/`quietest`; `callMoodTone` and the mood's order; `period`; `lines`.
- [ ] Build (`corepack pnpm --filter "./packages/*" build`) and run both files plus `reports-vm.test.mjs`. Expected: all pass (19 in the two new files after the hero test).

### Task A4: Beside the campaigns, the booking and Google

**Files:** `campaign-report.ts`, `calendar-people.ts`, `google.ts`; tests `campaign-report.test.mjs` (a lines test), `calendar-people.test.mjs` (the booking view model's whole-object pin gains `calendar` and `words`)

- [ ] Run `campaign-report`, `calendar-people`, `calendar-honest` and `google` tests. Expected: all pass.

### Task A5: Worth knowing

**Files:** `packages/contracts/src/report-facts.ts`, `index.ts` (`export * from "./report-facts";` after `./reports`); test `report-facts.test.mjs`

- [ ] Spec section 6.4. Expected: 7 tests pass.

### Task A6: Dists, the whole suite, the PR

- [ ] `node tooling/scripts/check-dist.mjs`; commit only `packages/contracts/dist` (the others differ only in line endings).
- [ ] `corepack pnpm test`, `corepack pnpm -r typecheck`, `corepack pnpm lint`: 0 failing, clean, 0 errors.
- [ ] Commit, push, `gh pr create` titled "Reports say where and when (00139)", with the spec and this plan in the PR.
- [ ] Wait for 6 green checks, and count them.

### Task A7: Push the migration to production, then merge

- [ ] Copy `supabase/.temp/{project-ref,pooler-url,linked-project.json}` from the main checkout into the worktree (gitignored).
- [ ] `"$SB" db push --linked --dry-run` lists ONLY `00139_reports_say_where_and_when.sql`; then `"$SB" db push --linked --yes`.
- [ ] Read it back: `"$SB" db query --linked` for the keys of `report_series(<a real tenant>, 7)` includes `channels`, `hours` and `replies`, and the head of `supabase_migrations.schema_migrations` is 00139.
- [ ] Remove the copied link files; `gh pr merge --squash --delete-branch` from a directory that is not a checkout; confirm the squash commit on `origin/main`.

# Part B: the chart kit (PR B, `feat/reports-kit`)

### Task B1: Branch

- [ ] `git fetch -q origin && git checkout -b feat/reports-kit origin/main` (PR A merged).

### Task B2: The kit, its palette and its tests

**Files:** the seven `chart-*.jsx`, `charts.css`, `icons.jsx`, `_legacy-react.mjs`, `chart-kit.test.mjs`; both load lists and `legacy.css`

- [ ] Spec section 7. The kit test names the kit's globals from `globalThis` after importing the files, so lint sees them.
- [ ] Run `chart-kit` and `legacy-harness`. Expected: 23 and 8 pass.
- [ ] The whole suite, typecheck, lint; commit, push, PR "A chart kit for the legacy tree, shaped like shadcn's"; merge on 6 green checks. Nothing on the page changes yet.

# Part C: the page (PR C, `feat/reports-page`)

### Task C1: Branch

- [ ] `git fetch -q origin && git checkout -b feat/reports-page origin/main` (PR B merged).

### Task C2: Worth knowing on the bridge

**Files:** `surface-data.ts` (`ReportsSurface.facts`; the pinned `campaigns:` line kept verbatim), `empty-failed.test.mjs` (a test that the facts are contracts', from the same two view models)

### Task C3: The demo's sample, built by the mockup's server

**Files:** `legacy-bridge/reports-sample.ts`, `tooling/scripts/serve-legacy.mjs` (`reportsSampleBundle`, the `/data/reports-sample.js` route, a server only when run directly), `Chanlytics.html` (the tag right after the stand-ins), `package.json` + `pnpm-lock.yaml` (`esbuild@0.28.2`, `corepack pnpm add -D -w esbuild@0.28.2`), tests `reports-sample.test.mjs` (the bundle publishes the same sample for 7, 30 and 90 days) and `legacy-harness.test.mjs` (the tag's place)

### Task C4: The page

**Files:** `reports-sections.jsx`, `reports.jsx` (`ReviewReply` byte for byte), `reports.css`; both load lists (`reports-sections.jsx` before `reports.jsx`, `?v=` up); `reports-page.test.mjs`; `reports-honest.test.mjs` hands its page tests over; the pins in `campaign-report`, `calendar-people` and `metrics-truth` follow the cards to `reports-sections.jsx` (no read added or removed)

- [ ] Every source pin on the page files holds (Google, the review reply, Today's `RpTile`, the timezone title, "Couldn't load").
- [ ] No rule removed from `reports.css` is still drawn: for each class the old sheet styled and the new one does not, `grep -rlE --include='*.jsx' --include='*.tsx' --include='*.ts' -e "<class>" apps/dashboard/src e2e` finds nothing (the file filters go BEFORE `-e`).

### Task C5: The nightly's spec, the docs

**Files:** `e2e/reports.spec.ts`; `legacy/CLAUDE.md` (the kit bullet; Reports takes `--measure-wide`); `docs/system-prd.md` (the Reports row)

- [ ] `grep -rnE "rp2-(strip-reception|strip-campaigns|legend|key|range|head|plot|prior|section|toggle)|campaign-tiles|\.cl-tab([^a-z-]|$)|Receptionist answered|Median reply time" e2e/` finds only other pages' own words.

### Task C6: Look at it, ship it

- [ ] Serve the mockup (`node tooling/scripts/serve-legacy.mjs 3215`, a session launch entry), open `/Chanlytics.html#/reports`: the sample draws, no console error, no failed read, no sideways scroll at 1440, 1180 or a phone, the first chart row above the fold at 1440 x 900; screenshots to Ruben.
- [ ] `git fetch -q origin && git rebase origin/main`, rerun `legacy-harness`, then the whole suite, typecheck, lint; commit, push, PR "Reports, redesigned"; merge on 6 green checks; confirm production serves the merge commit.
- [ ] Remove the session launch entry; update the project memory; read the next nightly's Reports spec.

---

## Verification on the draft (19 Sep)

| Check | Result |
|---|---|
| Whole unit suite | 3,060 tests, 0 failing (180 skipped: the database suites without a database) |
| Typecheck | every package clean |
| Lint | 0 errors (36 warnings, none new: one in `empty-failed.test.mjs` predates this work) |
| Dist | in sync with src |
| `report-series.db.test.mjs` on a real Postgres | pass, and the shared stack restored |
| Mockup at 1440 x 900, light and dark | 13 cards, no failed read, no sideways scroll, first chart row at 445px |
| Mockup at 1180 and on a phone | no sideways scroll; one 343px column on the phone, nothing spilling from a card |
| 7, 30 and 90-day periods | the head's dates, every card's sentence, the newest day labelled |
