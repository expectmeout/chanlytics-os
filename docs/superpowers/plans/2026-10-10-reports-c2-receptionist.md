# Reports phase C, lens 2: the Receptionist, drawn from what is stored (C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Receptionist lens answers "is it handling my customers, and how fast against the hold I set?" in the lenses spec's five parts (D7: sentence, against before, mix, time between steps, stuck now), from a read of its own, and the PR carries the groundwork every later lens needs (a page-only contracts entry, the kit's Figure with `n`, a DotPlot, the end of `days=`).

**Architecture:** One SQL function `receptionist_series` (migration 00380) -> repository `receptionistSeries` -> reader `receptionistReport` -> `GET /api/v1/reports/receptionist` -> contracts DTO -> surface `reports_receptionist` (a `periodSurface`, publishing the DTO) -> the page folds it with `toReceptionistReportVM` from a NEW page-only contracts entry `@chanlytics/contracts/report-lens` (the `report-window` pattern), so the route's JS does not grow by the fold. The frame's own `reports` read keeps drawing the cards it draws today (who answered, why it stopped, calls, asked-then-booked); the lens adds its new cards from its own read, and each read fails alone. Migration 00379 first fixes the automated-email count that every figure here stands on.

**Tech Stack:** Postgres/plpgsql on Supabase (SECURITY INVOKER functions), TypeScript (`packages/contracts`, `packages/db`, Next.js App Router dashboard), React with the repo's kit and hand-rolled SVG charts, `node:test` (run one file per command), Playwright for `e2e/`.

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (decisions D1-D20, §6.4, §7, §9 Receptionist, §13) and today's review, `C:\Users\Ruben\Documents\Claude Projects\Claude Video\docs\reports-canvas\2026-10-10-reports-phase-c-review.md` (§3 defects, §4 groundwork, §5 Receptionist). Precedent: `docs/superpowers/plans/2026-10-07-reports-c1-reviews.md` and its merged code (squash `9c142ad6e`, PR #1484). Written against origin/main `c368115b4`, branch `reports/c2-receptionist`, in `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-reports-heads` (every path below is from that root).

## Global Constraints

- **No commit, no push, no branch change, no new worktree, anywhere in this lane** (Ruben, 10 Oct 2026: work stays uncommitted until the lens is complete). Each task ends with a **Stage** step: the controller verifies the task, then runs the task's exact `git add` list, so the index holds the last verified state and the next task's diff is plain `git diff` (the lane's so far is `git diff --cached`). A new file is made known to git the moment it exists with `git add -N <file>` (the ratchets read `git ls-files`); that adds no content, and the controller stages the content. Nothing in this plan uses `git show HEAD`, `HEAD~1` or a commit sha of this lane. (`git show c39702657` in Task 11 reads another lane's commit; it changes nothing.)
- **Disk:** no dashboard production build until Task 15, and `apps/dashboard/.next` is deleted right after it is measured. The throwaway Supabase stack is the controller's: never `supabase db reset` on a shared one, and when Task 7 is done the stack is stopped with `supabase stop --no-backup`.
- **Route JS must not rise:** the workspace route's JS is 769,653 bytes gzipped against a ceiling of 769,722 (69 bytes of room, `tooling/scripts/tests/baselines/bundle-budget.json`). The reclaim (`report-metrics.ts` and the lens fold leaving the route) pays for the new surface's registration. Measured once, in Task 15, against that file. The ceiling is never raised for this lane without Ruben's word.
- **Page JS and CSS:** the Reports page's own JS budget is 78,137; it rises by what the lens adds (`corepack pnpm check:bundle -- --raise reports=<bytes>`, a "Rises" row in `docs/debt.md`). Route CSS is 151,340 against a ceiling of 163,840; kit.css, charts.css and reports.css rises go in the same row.
- **A ratio carries its n and greys under 5** (D9): one constant, `REPORT_MIN_N = 5`, in `packages/contracts/src/reports/report-tiles.ts`. Reviews' reply time keeps its own 3 (`REVIEW_REPLY_TIME_MIN`). **A number with no source is "—" with words, never 0.**
- **Missed-call window: 1 hour** (3,600 s): `interval '1 hour'` in SQL, said as `MISSED_CALL_TOUCH_WORDS = "an hour"` in contracts, held together by a database test at 3,599 and 3,601 seconds.
- **Migrations:** 00379 (the automated-email fix) and 00380 (`receptionist_series`), renumbered at push; origin/main's head is 00371 and other lanes hold 00372-00378. Forward-only, re-runnable, `set local lock_timeout = '3s'`. Recorded with `node tooling/scripts/checks/migration-ledger.mjs --record`; the ledger's `gaps` argue 00372-00378 while they are empty. Database tests and the generators (`gen:db-types`, `gen:schema-snapshot`, `gen:schema-sets`) run on the throwaway stack the controller hands you.
- **Folder caps (20 modules; a fail at 21):** `packages/contracts/src/reports` has 17 files and takes ONE (`report-lens.ts`) plus a nested folder `reports/receptionist/` (3 files); `tooling/scripts/tests/reports` and `e2e` are at 20 (new tests go in `tooling/scripts/tests/reports/receptionist/`, new e2e cases in the existing `e2e/reports.spec.ts` and `e2e/google.spec.ts` untouched); `apps/dashboard/src/server/readers` is baselined at 32 and `apps/dashboard/src/legacy-bridge` at 34 (no new file in either); `apps/dashboard/src/surfaces/reports` goes 15 -> 16, its `lenses/` 7 -> 9, `kit/charts` 10 -> 11, `packages/db/src/repositories/reports` stays 2.
- **File and function limits:** `packages/contracts/src/reports/reports.ts` is 760 lines (800 is the cap: it may grow by 20); functions at most 150 lines, 30 branches, 5 levels; no new `as unknown as`, `x!`, bare duration numbers (name them from `contracts/shared/time.ts`), unchecked `arr[0]` (use `.at(0)` or a default).
- **One predicate per rule:** a person's words = `public.message_is_a_persons_words(meta)`; an automated send = `public.automated_send(meta)`; a connected call = `public.call_connected(status, duration_ms)`; standing ("needs you") = `standingOfThread` (`packages/contracts/src/conversations/standing.ts:95`), never re-derived in SQL; asked-then-booked = `bookedAfterAsk` (`packages/contracts/src/calendar/calendar-people.ts:690`); voicemail = `reachedVoicemail` (`packages/contracts/src/conversations/call-dto.ts:123`), restated once in SQL and held to it by a test.
- **Kit and styles:** a value is a token (no literal type size, radius, shadow, colour or blur in any stylesheet); no `style` prop and no raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>` in `src/surfaces`; layout-only rules in `reports.css`; a kit class has a `kit.css` rule, a `classes.json` name and a gallery entry; D10: amber is what needs you, red only what failed, coral only the selected and the live.
- **A page fetches nothing:** it reads `useSurface`/`useFollower`; every sentence it draws is a view model's.
- **Export only what another non-test module reads** (knip holds dead exports and types to a baseline that may only fall; a value only a test reads is dead). A task whose export waits for a later task's reader says so in its Run step; Task 15 ends with none waiting.
- **No model call, no eval, no real send:** Ask's tool gains words only; the e2e seed writes terminal rows (never `queued`, never an open escalation, no job).
- **Dist is tracked in git (CI fails on drift):** rebuild `packages/*/dist` (`corepack pnpm --filter "./packages/*" build`) after any `packages/*/src` change, and list the changed dist files in the task's Stage step.
- **Edit with the editor tool, never `sed -i` or a PowerShell rewrite** (Git Bash `sed` flips CRLF; PowerShell double-encodes). Run one test file per command: `node tooling/scripts/checks/test.mjs <file>`; database files: `corepack pnpm test:db -- <file>`.
- **Names fixed here:** page-only entry `@chanlytics/contracts/report-lens`; surface key `reports_receptionist`; route `GET /api/v1/reports/receptionist` (query `period` | `from`+`to`); SQL `public.receptionist_series(p_tenant_id uuid, p_days integer default 30, p_end date default null)`; repository `receptionistSeries`; reader `receptionistReport`.

## Review Focus

The five conditions the spec implies and no task's happy-path test would meet, most likely first. Each has its test in the task named.

1. **A workspace with no opening hours set** (most new workspaces): "While you were closed" must say it needs the hours, with a door to set them, never 0 and never an 8-to-8 guess; a profile that could not be read says nothing. Test: Task 9 (fold: unset vs unreadable vs set), Task 12 (the door).
2. **A period in which nothing happened** (zero held replies, no handover, no missed call, no calls): every new part is absent with words ("—", an empty state), never 0%, `NaN`, or a bar of nothing; the SQL answers zeros and null medians, not an error. Test: Task 7 (an empty workspace), Task 9 (all-zero facts), Task 12 (page).
3. **Picked days in the past** (`p_end` before today): the window counts nothing after its last day; "stuck now" is still now; "booked after the link" is not counted (people as they stand today say nothing true of a month ago) and says why. Test: Task 7 (`p_end`), Task 10 (reader: no people read, `calendar: "ended"`), Task 9 (words).
4. **An email-only workspace, or messages from before the topic was kept** (K1 stamps WhatsApp and SMS only): topics say what they cover and how many had one ("n of m"), languages are not drawn below two, nothing is a bar of zeros. Test: Task 7 (email not in `topics.of`), Task 9 (fold).
5. **A time zone east of UTC** (Auckland, Madrid): a message at 23:50 local belongs to that local day and quarter hour, and the closed count reads the workspace's hours on that day. Test: Task 7 (an Auckland workspace, expected values computed with `Intl` from the same instant), Task 9 (`closedOf` with the same arrivals under `TEST_TZ=UTC` and `TEST_TZ=Pacific/Auckland`).

Also pinned where they belong: a missed call less than an hour old is "under an hour old, not counted yet", not unanswered (Task 7); an escalation a teammate holds or that is snoozed is not "waiting on you" (Task 10); a steered draft and its replacement count once in the hold (Task 7); a person sent the link twice counts once (Task 7); automated mail counts as no customer message anywhere (Task 6).

## Where the code differs from the design, and what this plan does

1. **The head sentence is built by the frame's own fold** (`linesOf` in `reports.ts`, a new `lines.receptionist`), not by the lens fold: the head must paint from the frame's read at once and must not import the page-only entry (the route chunk would carry it). `lensAnswerOf("receptionist")` returns it.
2. **`toReceptionistReportVM(dto, { nowMs })`** takes no `zone`, `hold`, `profile` or `booking` options: the DTO carries the workspace's `profile` (hours and closures), the hold counts (SQL's, apart from the frame's `holdOf`) and the link-to-booked count (the reader's), so the fold is one function of one payload.
3. **"Waiting on you" is not counted in SQL.** `receptionist_series` returns the open escalations with their conversation's `state`, `paused_until` and `assignee_user_id`; the reader folds them with `standingOfThread` (CLAUDE.md: standing is `standingOf`). Call-backs are the subset with `reason = 'callback'` and are counted inside "waiting on you".
4. **"In the hold" has five outcomes plus "still waiting" and "did not go out"; the sixth item of the design (held at the confidence floor) is a dimension, not an outcome**: it is counted across outcomes (`hold.now.low_confidence`) and said in the card's line.
5. **`blocked` leaves out `superseded_by_human`**: the hold card already says "a person answered first", and the two would show one event twice.
6. **The Inbox takes no reason filter** (its address is a thread id, `apps/dashboard/src/surfaces/inbox/routes.ts`), so "Why it stopped" no longer pretends to open one: its rows stop being doors and the "Waiting on you" figure in part 5 holds the Inbox door.
7. **The chart kit is not in `classes.json` or the gallery** (`.ck-*` rules live in `apps/dashboard/src/legacy/styles/charts.css`; its tests are `tooling/scripts/tests/shell/chart-kit.test.mjs`). The DotPlot follows the chart kit's way; only Figure follows the kit-variant steps.
8. **`report-metrics.ts` is not relocated**: it stays where it is and is re-exported by the new entry; `blocks.tsx` imports from the entry; the browser-entry generator gets a `PAGE_ONLY` list (this module and `report-window.ts`) so a page can no longer import them from the package root without the browser-entry test failing.
9. **R0 changes three functions together** (`first_replies`, `report_series`, `metrics_summary`); `contact_first_moments`, `metrics_summary`'s live "awaiting" and `platform_metrics_roll`'s arrivals stay (Task 6 says why).
10. **Missed calls are counted by person** (their first call nobody took in the window), and a person whose call is less than an hour old is `pending`, not unanswered. **Messages that came while closed** come from the lens's own list (messages only), not the frame's `arrivals` (messages plus connected calls), so "N came, it answered X" is one population.
11. **Caller mood loses its tone**: `callMoodTone` and `ReportBarVM.tone` are deleted; the bars wear the ordinal ink ramp (`rptSpread`).

---

### Task 1: The page-only contracts entry `report-lens`, and the metric words leave the route

**Files:**
- Create: `packages/contracts/src/reports/report-lens.ts`
- Modify: `packages/contracts/tsup.config.ts` (a fourth build object, line ~29), `packages/contracts/package.json` (exports, after `./report-window`), `knip.json` (the `packages/*` entry list, line ~47), `tooling/scripts/gen/contracts-browser-entry.mjs` (`generate`, line ~153), `packages/contracts/src/browser.generated.ts` (regenerated), `apps/dashboard/src/surfaces/reports/blocks.tsx:14` (the `metricWordsOf` import)
- Modify (built): `packages/contracts/dist/index.js`, `index.d.ts`, `browser.js`; Create (built): `packages/contracts/dist/report-lens.js`, `report-lens.d.ts`
- Test: `tooling/scripts/tests/shipping/browser-entry.test.mjs`

**Interfaces:**
- Consumes: `metricWordsOf` (`packages/contracts/src/reports/report-metrics.ts:51`).
- Produces: the package subpath `@chanlytics/contracts/report-lens`, whose source `packages/contracts/src/reports/report-lens.ts` re-exports by name (Tasks 9 and 12 add to it): today `metricWordsOf`. And `export const PAGE_ONLY: readonly string[]` in the generator: source modules, relative to `packages/contracts/src`, whose names are left out of `browser.generated.ts`.

- [ ] **Step 1: Write the failing tests** (append to `tooling/scripts/tests/shipping/browser-entry.test.mjs`; import `PAGE_ONLY` with `generate, OUT`)

```js
test("a page-only module's names are in no page's entry, and in its own", () => {
  assert.deepEqual(PAGE_ONLY, ["reports/report-metrics.ts", "reports/report-window.ts"]);
  for (const name of ["metricWordsOf", "reportWindowOf", "reportPickWords", "reportShortcuts"])
    assert.ok(!current.names.includes(name), `${name} is the Reports page's, by its own entry`);
  const lens = fs.readFileSync(path.join(ROOT, "packages/contracts/dist/report-lens.js"), "utf8");
  assert.match(lens, /metricWordsOf/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/contracts/package.json"), "utf8"));
  assert.deepEqual(pkg.exports["./report-lens"], {
    types: "./dist/report-lens.d.ts",
    import: "./dist/report-lens.js",
    default: "./dist/report-lens.js",
  });
});

test("the page-only entry reaches no classic zod", () => {
  const built = fs.readFileSync(path.join(ROOT, "packages/contracts/dist/report-lens.js"), "utf8");
  const specs = [...built.matchAll(/^import\b[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.deepEqual(specs.filter((s) => ["zod", "zod/v4", "zod/v4/classic"].includes(s)), []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs`
Expected: FAIL (`PAGE_ONLY` is not exported; `dist/report-lens.js` does not exist).

- [ ] **Step 3: Implement**
  - `report-lens.ts`: `export { metricWordsOf } from "./report-metrics";` and a header comment (what a page-only entry is, why: "a value a page imports from the package root is in the route chunk every page loads; this entry is imported by the Reports page alone").
  - `tsup.config.ts`: `{ ...each, entry: { "report-lens": "src/reports/report-lens.ts" }, dts }`; extend the comment that lists the entries.
  - `package.json`: `"./report-lens": { "types": "./dist/report-lens.d.ts", "import": "./dist/report-lens.js", "default": "./dist/report-lens.js" }`.
  - `knip.json`: add `"src/reports/report-lens.ts"` to the `packages/*` entries.
  - Generator: `export const PAGE_ONLY = ["reports/report-metrics.ts", "reports/report-window.ts"];` and in `generate()` skip a value whose `v.module` (made relative to `g.dir`, forward slashes) is in `PAGE_ONLY` before it reaches `kept` or `left`. The server and the tests keep reading these through the barrels and `dist/index.js`.
  - `node tooling/scripts/gen/contracts-browser-entry.mjs` (rewrites `browser.generated.ts`); `blocks.tsx` imports `metricWordsOf` from `@chanlytics/contracts/report-lens`.
  - `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs` then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/lenses/report-metric-words.test.mjs` then `corepack pnpm --filter @chanlytics/contracts typecheck` then `corepack pnpm --filter @chanlytics/dashboard typecheck`
Expected: PASS (the second still imports `metricWordsOf` from the package root's node entry; the existing "every value a page imports from contracts is the browser entry's" test stays green because `blocks.tsx` no longer imports it from the root).

- [ ] **Step 5: Stage** (the controller, once verified; nothing is committed)

```bash
git add packages/contracts/src/reports/report-lens.ts packages/contracts/tsup.config.ts packages/contracts/package.json knip.json tooling/scripts/gen/contracts-browser-entry.mjs packages/contracts/src/browser.generated.ts apps/dashboard/src/surfaces/reports/blocks.tsx tooling/scripts/tests/shipping/browser-entry.test.mjs packages/contracts/dist
```

---

### Task 2: The `days=` parameter ends

**Files:**
- Modify: `packages/contracts/src/reports/report-periods.ts` (`reportPeriodOf` line 56, `reportRangeAsked` line 141, the header comment lines 3-7), `apps/dashboard/src/server/readers/report.ts` (`ReportQuery` lines 170-179, the comment at 177), the four routes' comments (`apps/dashboard/app/api/v1/reports/route.ts`, `campaigns/route.ts`, `reach-outs/route.ts`, and the "`days` is not read" lines in `headline/route.ts`, `reviews/route.ts`), `docs/api.md` (regenerated)
- Modify (tests that send it): `tooling/scripts/tests/reports/periods/report-periods.test.mjs` (lines 55-63, 73-96, 280-301), `tooling/scripts/tests/reports/periods/report-routes.test.mjs` (lines 93, 246, 268-278), `tooling/scripts/tests/ask/ask-routes.test.mjs` (lines 555, 560, 570, 574), `tooling/scripts/tests/ask/readers.test.mjs` (line 1612), `tooling/scripts/tests/reach-out-back/back-routes.test.mjs` (lines 101, 106), `tooling/scripts/tests/reports/campaign-report.test.mjs` (lines 201, 206)
- Modify (built): `packages/contracts/dist/*`

**Interfaces:**
- Consumes: nothing new.
- Produces: `reportPeriodOf(asked: { period?: string | undefined }): ReportPeriodId | null` and `reportRangeAsked(asked: { period?; from?; to? }): ReportRange | null` (no `days`); `ReportQuery` = `z.object({ period, from, to })`. A request that still sends `days` is read as if it did not: thirty days. `reportDaysAsked` (Ask's "view of Reports", `report-periods.ts:67`) is a different thing and stays.

- [ ] **Step 1: Write the failing tests.** In `report-periods.test.mjs` replace the `days` assertions with:

```js
test("a request names a period or, with a first and a last day, a window; `days`, which pages sent before Month, is no longer read", () => {
  assert.equal(reportPeriodOf({}), "30d");
  assert.equal(reportPeriodOf({ period: "month" }), "month");
  assert.equal(reportPeriodOf({ days: "90" }), "30d", "ignored: the default");
  for (const bad of [{ period: "14d" }, { period: "" }, { period: "7" }])
    assert.equal(reportPeriodOf(bad), null, JSON.stringify(bad));
  assert.equal(reportRangeAsked({ days: "90" }), "30d");
  assert.equal(reportRangeAsked({ from: "2026-09-01", to: "2026-09-20", days: "7" })?.from, "2026-09-01", "a stray days beside a window is not a refusal now");
});
```

and delete the `REMOVE_AFTER` / `GRACE_DAYS` / `SENDERS_OF_DAYS` block and its test (lines 73-96) and the `DAY_MS` import if nothing else in the file uses it. In the other test files replace each `?days=N` by the period that names those days (`period=7d`, `period=30d`, `period=90d`) and each refusal by a period the table does not offer (`period=14d`, asserting the status 400 and the message the door gives: print it once and put it in the assertion). `report-routes.test.mjs:268-278` becomes: `reportWindowFor(rc, { days: "90" })` answers `live(30)`.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-periods.test.mjs`
Expected: FAIL (`reportPeriodOf({ days: "90" })` is `"90d"` today).

- [ ] **Step 3: Implement.** Delete the `asked.days` branches in `reportPeriodOf` (line 61-63) and `reportRangeAsked` (line 148: the `asked.days !== undefined` clause), the `days` field of both parameter types and of `ReportQuery`; rewrite the header comments that mention the grace; route comments lose their "until 19 October 2026" clauses. `corepack pnpm --filter "./packages/*" build`, then `corepack pnpm gen:api-reference` (the `days` row leaves `docs/api.md`) and `node tooling/scripts/gen/route-types.mjs --check`.

- [ ] **Step 4: Run to verify**, one per command: `report-periods.test.mjs`, `report-routes.test.mjs`, `tooling/scripts/tests/ask/ask-routes.test.mjs`, `tooling/scripts/tests/ask/readers.test.mjs`, `tooling/scripts/tests/reach-out-back/back-routes.test.mjs`, `tooling/scripts/tests/reports/campaign-report.test.mjs`, `tooling/scripts/tests/reports/headline/headline-route.test.mjs`, `tooling/scripts/tests/routes/api-reference.test.mjs` (the suite fails a stale `docs/api.md`). Then `corepack pnpm --filter @chanlytics/dashboard typecheck`.
Expected: all PASS.

- [ ] **Step 5: Stage**

```bash
git add packages/contracts/src/reports/report-periods.ts apps/dashboard/src/server/readers/report.ts apps/dashboard/app/api/v1/reports docs/api.md tooling/scripts/tests/reports/periods/report-periods.test.mjs tooling/scripts/tests/reports/periods/report-routes.test.mjs tooling/scripts/tests/ask/ask-routes.test.mjs tooling/scripts/tests/ask/readers.test.mjs tooling/scripts/tests/reach-out-back/back-routes.test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs packages/contracts/dist
```

---

### Task 3: The kit's Figure gains `n` and a minimum, and a report tile gains a door

**Files:**
- Modify: `apps/dashboard/src/surfaces/kit/figure/figure.tsx`, `apps/dashboard/src/surfaces/kit/figure/figure.type-test.ts`, `apps/dashboard/src/surfaces/kit/kit.css` (Figure block, lines 4157-4231), `apps/dashboard/src/surfaces/kit/classes.json` (`figure-n` under `classes`; `is-thin` under `modifiers`), `tooling/scripts/e2e-harness/kit-gallery.mjs` (the `figure` helper at line 596 and the Figure family at line 1778), `tooling/scripts/tests/styles/kit-components.test.mjs` (`FIGURES`, line 714), `packages/contracts/src/reports/report-tiles.ts` (`ReportTileVM` line 38, the four tile builders lines 111-162, `ReportStripTile` line 199), `apps/dashboard/src/surfaces/reports/blocks.tsx` (`RptFigure` line 174; a new `RptStrip`)
- Modify (built): `packages/contracts/dist/*`
- Test: `apps/dashboard/src/surfaces/kit/figure/figure.type-test.ts` (compiled by `tsc`), `tooling/scripts/tests/styles/kit-components.test.mjs`, `tooling/scripts/tests/styles/kit-gallery.test.mjs`, `tooling/scripts/tests/reports/reports-vm.test.mjs`, `tooling/scripts/tests/reports/reports-page.test.mjs`

**Interfaces:**
- Consumes: `Figure` (`figure.tsx:38`), `Press`/`PressDoor` (`kit/press.tsx`), `routeDoor(to: string): RouteDoor` (`apps/dashboard/src/surfaces/legacy-verbs.ts:492`).
- Produces: `FigureProps` gains `n?: number | null` ("the count a ratio is of") and `minN?: number` ("the fewest that say anything"); when `n != null && minN != null && n < minN` the figure wears `is-thin` and draws `<dd className="figure-n">{figureThinWords(n)}</dd>` after the meta. The line's words are `` `only ${n}, too few to read` `` (a private function in `figure.tsx`; it is not exported, since nothing but the figure reads it). `export const REPORT_MIN_N = 5` in `report-tiles.ts` (and in the contracts barrel `reports/index.ts`). `ReportTileVM` and `ReportStripTile` gain optional `door?: string` (a route: `"inbox"`), `n?: number`, `minN?: number`; set only on: `messages` (`door: "conversations"`), `needed` (`door: "inbox"`), `answered` (`n: answeredTotal, minN: REPORT_MIN_N`), `reply` (`n: sortedReply.length, minN: REPORT_MIN_N`); every other tile is byte for byte what it was. `RptFigure({ t })` passes `n`, `minN` and `door={t.door ? routeDoor(t.door) : undefined}`. `RptStrip({ tiles, className })` in `blocks.tsx`: the `dl.rpt-figures` of `RptFigure`s that `RptTiles` draws today (which now calls it); Task 12 uses it.

- [ ] **Step 1: Write the failing tests**
  - `figure.type-test.ts`: positives `Figure({ label: "Answered without you", value: "62%", n: 17, minN: 5 })` and `n: null`; negatives under `// @ts-expect-error a count is a number, never words` for `n: "17"`, and `minN: "5"`.
  - `kit-components.test.mjs`: add to `FIGURES` the entry `"figure-thin": () => h(Figure, { label: "Customer messages", value: "62%", meta: "on 6 of 7 days", n: 3, minN: 5 })` and in the Figure test:

```js
assert.equal(drawn(h(Figure, { label: "Calls", value: "3", n: 5, minN: 5 })).props.className, "figure", "at the minimum it is read");
assert.equal(drawn(h(Figure, { label: "Calls", value: "3", n: 4, minN: 5 })).props.className, "figure is-thin");
assert.deepEqual(rows({ n: 4, minN: 5 }), ["figure-label", "figure-value", "figure-n"]);
assert.deepEqual(rows({ n: 4 }), ["figure-label", "figure-value"], "no minimum named, none applies");
assert.deepEqual(rows({ n: null, minN: 5 }), ["figure-label", "figure-value"], "no count, nothing to grey");
const thin = drawn(h(Figure, { label: "Calls", value: "3", n: 1, minN: 5 })).props.children.filter(Boolean).at(-1);
assert.equal(thin.props.children, "only 1, too few to read");
```

  - gallery: the Figure family gains `{ id: "figure-thin", html: figure({ thin: 3 }) }` (the `figure` helper gains `thin`, adds ` is-thin` to the div and a `<dd class="figure-n">only 3, too few to read</dd>`); `kit-gallery.test.mjs` fails a class no entry draws, which holds `figure-n` and `is-thin` to it.
  - `reports-vm.test.mjs`: the `answered` tile has `n` equal to the answered total and `minN: 5`; the `reply` tile `n` the reply count; the `messages` tile `door: "conversations"`; the `needed` tile `door: "inbox"`; the `calls`, `people` tiles have no `door`, `n` or `minN` key (`assert.ok(!("door" in tile))`).
  - `reports-page.test.mjs` (copy the way it already draws the strip): the Needed you figure draws a door whose `href` is `#/inbox`; the answered figure with 3 answered draws `is-thin`.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-components.test.mjs` (FAIL: no `n`), `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs` (FAIL), `corepack pnpm --filter @chanlytics/dashboard typecheck` (FAIL on the type test).

- [ ] **Step 3: Implement**
  - `figure.tsx`: the props and the rendering above; `className` stays last (`cx("figure", thin && "is-thin", className)`; check `cx` drops falsy values).
  - `kit.css`, in the Figure block: `.figure.is-thin .figure-value { color: var(--ink-dim); }` and `.figure-n { font-size: var(--text-xs); line-height: 1.35; color: var(--ink-dim); }` (tokens only; no literal).
  - `classes.json` and the gallery as above (`kit/index.ts` already names `Figure` and `FigureProps`; nothing new to name).
  - `report-tiles.ts`: the constant, the optional fields, the four builders; `reports/index.ts` exports `REPORT_MIN_N` (read by Task 9's fold).
  - `blocks.tsx`: `RptFigure` and `RptStrip`; `RptTiles` builds its list as before and returns `<RptStrip tiles={tiles} />`.
  - `node tooling/scripts/gen/contracts-browser-entry.mjs` (the barrel gained a name), then `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**, one per command: `kit-components.test.mjs`, `kit-gallery.test.mjs`, `tooling/scripts/tests/styles/kit-css.test.mjs`, `reports-vm.test.mjs`, `reports-page.test.mjs`, `tooling/scripts/tests/reports/lenses/report-lenses.test.mjs`, `tooling/scripts/tests/shipping/browser-entry.test.mjs`, `tooling/scripts/tests/ask/ask-turn.test.mjs` (Ask reads tiles by label/value/meta only; it must not move), then `corepack pnpm --filter @chanlytics/dashboard typecheck` and `corepack pnpm lint` (a raw control or an inline `style` is a red build). Run the style ratchets: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`.
Expected: PASS, with `style-values.json` and `kit-primitives.json` unmoved.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/surfaces/kit/figure apps/dashboard/src/surfaces/kit/kit.css apps/dashboard/src/surfaces/kit/classes.json tooling/scripts/e2e-harness/kit-gallery.mjs tooling/scripts/tests/styles/kit-components.test.mjs packages/contracts/src/reports/report-tiles.ts packages/contracts/src/reports/index.ts packages/contracts/src/browser.generated.ts apps/dashboard/src/surfaces/reports/blocks.tsx tooling/scripts/tests/reports/reports-vm.test.mjs tooling/scripts/tests/reports/reports-page.test.mjs packages/contracts/dist
```

---

### Task 4: The kit's DotPlot

**Files:**
- Create: `apps/dashboard/src/surfaces/kit/charts/dot.tsx`
- Modify: `apps/dashboard/src/surfaces/kit/charts/line.tsx` (`referenceLine`, line 164: add `export`), `apps/dashboard/src/legacy/styles/charts.css` (after the `.ck-barlist` rules, line ~143)
- Test: `tooling/scripts/tests/shell/chart-kit.test.mjs` (add; import `DotPlot` from `${K}/dot.tsx`)

**Interfaces:**
- Consumes: `useChartWidth`, `useChartNav`, `ckPointer` (`kit/charts/hooks.ts`); `ckFrame`, `ckHeight`, `ckNice`, `ckNiceSeconds`, `ckEvery`, `ckTip` and the `ChartConfig`/`ChartRow`/`ChartWords` types (`kit/charts/geometry.ts`); `ChartLive`, `ChartTooltip`, `ChartTooltipContent`, `CkXLabels`, `CkYAxis` (`kit/charts/parts.tsx`); `referenceLine` (`line.tsx:164`).
- Produces:

```ts
export interface DotRow { day: string; value: number }
interface DotPlotProps {
  /** The card's days, oldest first: the x slots and their labels. */
  days: ChartRow[];
  /** One dot per event, oldest first; its x is its day's slot, spread inside the slot by its order that day. */
  dots: DotRow[];
  config: ChartConfig;                 // one series, key "dot" (the card publishes --color-dot)
  reference?: { value: number; label: string } | null;
  height?: number; floor?: number; yTicks?: number;
  scale?: "count" | "seconds"; yFormat?: (tick: number) => string | number;
  tip?: ((d: DotRow, i: number) => ChartWords) | null;
  describe?: ((d: DotRow, i: number) => string) | null;
  ariaLabel: string; animKey?: string | number;
}
export function DotPlot(props: DotPlotProps): JSX.Element
```

Drawn as BarChart is: a `div.ck-plot` (role `group`, `aria-roledescription="chart"`, one tab stop from `useChartNav(dots.length)`, arrows walk the dots, focus starts on the newest), an `svg.ck-svg` with the y axis (`CkYAxis`), the reference line, one `circle.ck-dotplot-dot` per dot (`r` 3, `fill="var(--color-dot)"`, class `hot` for the held dot and `dim` for the others, as the bars do), the x labels, the tooltip and the live region.

- [ ] **Step 1: Write the failing test** in `chart-kit.test.mjs`:

```js
test("a dot plot: one dot per event on its day's slot, 0 on the baseline, a reference labelled once, one tab stop the arrows walk", () => {
  const days = DAYS3.map(({ day, label, short }) => ({ day, label, short }));
  const dots = [
    { day: "2026-09-03", value: 0 },
    { day: "2026-09-03", value: 40 },
    { day: "2026-09-05", value: 300 },
  ];
  const draw = (extra = {}) =>
    fresh(() =>
      DotPlot({
        days, dots, config: { dot: { label: "Reply", color: "var(--chart-1)" } }, scale: "seconds",
        reference: { value: 0, label: "your 1-minute hold ends" },
        ariaLabel: "Each reply, past its hold", describe: (d) => `${d.day}: ${d.value}s past its hold`, ...extra,
      }),
    );
  const tree = draw();
  const circles = all(tree, (n) => classes(n).includes("ck-dotplot-dot"));
  assert.equal(circles.length, 3, "a dot for each event, none for a day with none");
  const base = Number(find(tree, (n) => classes(n).includes("ck-base"))?.props.y1 ?? NaN);
  assert.equal(Number(circles[0].props.cy), base, "a reply sent as the hold ended sits on the baseline");
  assert.ok(Number(circles[2].props.cy) < Number(circles[1].props.cy), "later is higher");
  assert.ok(Number(circles[1].props.cx) > Number(circles[0].props.cx), "two on one day are spread inside its slot");
  assert.equal(all(tree, (n) => classes(n).includes("ck-ref")).length, 1, "the reference is drawn once");
  assert.ok(textOf(tree).includes("your 1-minute hold ends"));
  const plot = plotOf(tree);
  assert.equal(plot.props.role, "group");
  assert.equal(plot.props.tabIndex, 0, "one tab stop for the whole plot");
  press(plot, "onFocus");
  assert.equal(liveOf(again(tree)), "2026-09-05: 300s past its hold", "focus reads the newest dot");
  assert.equal(all(draw({ dots: [] }), (n) => classes(n).includes("ck-dotplot-dot")).length, 0, "no events, no dots, no crash");
});
```

(`fresh`, `again`, `all`, `find`, `classes`, `textOf`, `press` are the file's helpers; follow the neighbouring "columns: one tab stop" test (line 363) for `press` and `again`. `CkYAxis` (`parts.tsx:15`) gives the 0 tick's line the class `ck-base`.)

- [ ] **Step 2: Run it to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/chart-kit.test.mjs`
Expected: FAIL (`dot.tsx` does not exist).

- [ ] **Step 3: Implement `DotPlot` in `dot.tsx`** by the BarChart's shape (`bar.tsx:68-135`): width/height from `useChartWidth`/`ckHeight`; `ckNice`/`ckNiceSeconds` over `[...dots.map(value), reference?.value ?? 0]`; slot width `f.pw / days.length`; a dot's x is `f.L + slotIndex*slot + slot*(0.2 + 0.6*rank/(countThatDay))`; y is `f.y(value)`; pointer: nearest dot by x within its slot. Charts.css: `.ck-dotplot-dot { fill-opacity: 0.7; }`, `.ck-dotplot-dot.hot { fill-opacity: 1; }`, `.ck-dotplot-dot.dim { fill-opacity: 0.35; }` (no colour literal; the fill is the card's `--color-dot`). No `classes.json` or gallery change: the chart kit is outside both (the plan's note 7).

- [ ] **Step 4: Run to verify**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/chart-kit.test.mjs`, `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, `corepack pnpm --filter @chanlytics/dashboard typecheck`, `corepack pnpm lint`.
Expected: PASS; `style-values.json` unmoved.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/surfaces/kit/charts/dot.tsx apps/dashboard/src/surfaces/kit/charts/line.tsx apps/dashboard/src/legacy/styles/charts.css tooling/scripts/tests/shell/chart-kit.test.mjs
```

---

### Task 5: The frame's words: the head sentence, the reply dots, the Booked tile for days that ended, a mood without a tone

**Files:**
- Modify: `packages/contracts/src/reports/report-speed.ts` (after `heroSpeed`, line 169; and a new `replyDotsOf`), `packages/contracts/src/reports/reports.ts` (`ReportLinesVM` line 167, `ReportBarVM` line 112, `callMoodTone` lines 406-409, `moodBarsOf` line 575, `replyTimeOf` line 612, `linesOf` line 662), `packages/contracts/src/reports/lens-answer.ts:26-27`, `packages/contracts/src/reports/booking-report.ts` (a constant), `packages/contracts/src/reports/report-tiles.ts` (`bookedTileOf`, lines 202-215), `packages/contracts/src/reports/index.ts` (drop `callMoodTone`, add exports), `apps/dashboard/src/surfaces/reports/series.ts:47-57` (`rptMood`)
- Modify (built): `packages/contracts/dist/*`
- Test: `tooling/scripts/tests/reports/reports-lines.test.mjs`, `reports-hold.test.mjs`, `reports-vm.test.mjs`, `reports-where-when.test.mjs` (line 278), `tooling/scripts/tests/reports/lenses/report-lenses.test.mjs:178`, `tooling/scripts/tests/reports/reports-page.test.mjs:444,490`

**Interfaces:**
- Consumes: `holdOf`, `waitedHold`, `endedWithHold` (private in `report-speed.ts`), `ReportHoldVM`.
- Produces:
  - `receptionistSpeed(hold: ReportHoldVM | null): string` in `report-speed.ts`: the tail of the head sentence: `""` when `hold` is null or most replies had no hold (`!waitedHold`); `", {atEnd} as your {label} hold ended"` when `endedWithHold`; `", {later} later than your {label} hold"` otherwise.
  - `ReportLinesVM.receptionist: string | null` = `` `${ai} of ${answeredTotal} messages answered without you${receptionistSpeed(hold)}.` `` or `null` when `answeredTotal === 0`; **`lines.answered` stays** (the "Most messages on {day}" line is the answered card's takeaway; it is no longer the head). `lensAnswerOf("receptionist", …)` returns `vm.lines.receptionist ?? undefined` (and `undefined` when `vm.empty`).
  - `export interface ReplyDotVM { day: string; past: number }`, a private `REPLY_DOTS_MOST = 500` and `export function replyDotsOf(replies: readonly { day: string; s: number; hold?: number }[] | undefined, most?: number): ReplyDotVM[]` in `report-speed.ts`: one entry per finite reply, `past = Math.max(0, s - (hold ?? 0))` rounded to whole seconds, in the order given, only the last `most`; `[]` for `undefined`. `ReportVM.replyTime.dots: ReplyDotVM[]` (from `dto.replies`).
  - `export const BOOKED_ENDED_META = "not counted for days that have ended: visits are counted as they stand now"` in `booking-report.ts`; `bookedTileOf` returns `value: "—", meta: BOOKED_ENDED_META` when `booking?.calendar === "ended"`, before the other no-count cases.
  - `callMoodTone` and `ReportBarVM.tone` are deleted; `rptMood` is deleted and the calls card uses `rptSpread` (`series.ts:44`) for the moods (Task 12 edits the card).

- [ ] **Step 1: Write the failing tests**
  - `reports-lines.test.mjs` (reuse its `busy` fixture of 13 answered of 17 and the `weekDto` helper; give `busy.replies` as below):

```js
test("the head: how many of how many without you, and how many went out as the hold ended", () => {
  const held = (n, s, hold = 60) => Array.from({ length: n }, () => ({ day: "2026-09-04", s, hold }));
  const head = (replies) => toReportVM({ ...busy, replies }).lines.receptionist;
  assert.equal(head(undefined), "13 of 17 messages answered without you.");
  assert.equal(head(held(8, 61)), "13 of 17 messages answered without you, 8 as your 1-minute hold ended.");
  assert.equal(head([...held(6, 61), ...held(2, 200)]), "13 of 17 messages answered without you, 6 as your 1-minute hold ended.");
  assert.equal(head([...held(2, 61), ...held(6, 200)]), "13 of 17 messages answered without you, 6 later than your 1-minute hold.");
  assert.equal(head(held(8, 30, 0)), "13 of 17 messages answered without you.", "most had no hold: it says nothing of one");
  assert.equal(toReportVM(weekDto([0, 0, 0, 0, 0, 0, 0])).lines.receptionist, null, "nobody wrote");
  assert.equal(lensAnswerOf("receptionist", { vm: toReportVM({ ...busy }), campaigns: null, deals: null, reviews: null }), "13 of 17 messages answered without you.");
});
```

  - the dots, through the view model (`replyDotsOf` is read by `reports.ts` and not exported from the package): `toReportVM({ ...busy, replies: [{ day: "d1", s: 61, hold: 60 }, { day: "d1", s: 30, hold: 60 }, { day: "d2", s: 200 }, { day: "d2", s: Number.NaN, hold: 0 }] }).replyTime.dots` deep-equals `[{ day: "d1", past: 1 }, { day: "d1", past: 0 }, { day: "d2", past: 200 }]`; with 600 replies it holds 500 and they are the last 500 (the first dot is the 101st reply); with no `replies` it is `[]`.
  - `reports-vm.test.mjs:223` neighbourhood: `bookedTileOf(toBookingReportVM({ calendar: "ended", days: 7, asked: 0, booked: 0 }))` has `value: "—"` and `meta: BOOKED_ENDED_META`, and the `unavailable`, `none` and `null` cases are unchanged.
  - `reports-where-when.test.mjs:278`: replace the `callMoodTone` assertion by: every `vm.calls.sentiments` row has no `tone` key (`assert.ok(!("tone" in row))`); `reports-page.test.mjs:490` (the caller-mood bar): its config uses no `var(--ok)` and no `var(--danger)`: `assert.ok(Object.values(config).every((c) => /^var\(--chart-ramp-\d\)$/.test(c.color)))`.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-lines.test.mjs`
Expected: FAIL (`lines.receptionist` is undefined).

- [ ] **Step 3: Implement** the signatures above in the files above. `linesOf` (`reports.ts:662`) gains one property; `replyTimeOf` (`reports.ts:612`) gains `dots: replyDotsOf(dto.replies)`; put the logic in `report-speed.ts` (reports.ts may grow by 20 lines only: check `wc -l`). The barrel loses `callMoodTone`, so `node tooling/scripts/gen/contracts-browser-entry.mjs`, then `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**, one per command: `reports-lines.test.mjs`, `reports-hold.test.mjs`, `reports-vm.test.mjs`, `reports-where-when.test.mjs`, `report-lenses.test.mjs`, `reports-page.test.mjs`, `reports-honest.test.mjs`, `tooling/scripts/tests/shipping/browser-entry.test.mjs`, `tooling/scripts/tests/ask/ask-turn.test.mjs`; then dashboard typecheck and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (file length of `reports.ts`; `callMoodTone` leaves the dead-exports count: bank the fall at the end, Task 15).
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add packages/contracts/src/reports/report-speed.ts packages/contracts/src/reports/reports.ts packages/contracts/src/reports/lens-answer.ts packages/contracts/src/reports/booking-report.ts packages/contracts/src/reports/report-tiles.ts packages/contracts/src/reports/index.ts packages/contracts/src/browser.generated.ts apps/dashboard/src/surfaces/reports/series.ts tooling/scripts/tests/reports packages/contracts/dist
```

---

### Task 6: Migration 00379: automated mail is no customer message

**Files:**
- Create: `supabase/migrations/00379_automated_mail_is_no_customer_message.sql`, `tooling/scripts/tests/reports/receptionist/automated-mail.db.test.mjs`
- Modify: `supabase/migrations-ledger.json` (recorded, plus the argued gaps), `supabase/schema.sql`, `packages/db/src/database.types.ts` (regenerated; likely unchanged), `docs/data-model.md` (regenerated in Task 15)

**Interfaces:**
- Consumes: `public.message_is_a_persons_words(p_meta jsonb)` (`supabase/migrations/00299_an_offer_by_email_goes_only_where_it_is_owed.sql:56`; schema.sql:8941), the three functions' current text in `supabase/schema.sql`: `first_replies` (line 3710), `metrics_summary` (line 9215), `report_series` (line 16825).
- Produces: the same three functions with the same signatures, grants and comments, each counting a customer message only when its words are a person's. Nothing is dropped (same signatures: `create or replace`).

The rule being fixed: `report_series`' `inbound` CTE (`00360:76`: `direction = 'inbound' and sender = 'customer'`) counts every `sender = 'customer'` row, so an automatic reply, a list's mail and a delivery report (an email read as `meta.email.claim` in `automated`, `auto_reply` or `report`) are customer messages on Overview, Receptionist and Today. The siblings that must agree: `first_replies`' `asks` CTE (`schema.sql:3723`), because `answered_ai + answered_you + unanswered` must equal `messages_in`; and `metrics_summary`'s `messages_in` and `conversations_active` (`schema.sql:9309`, `9315`), because Today reads them. **Stay as they are, and why:** `contact_first_moments` (a person's first word in EITHER direction or first connected call; "new person" gets its one rule in C3, the People lens, and nothing here counts customer messages); `metrics_summary`'s `awaiting` (live "whose turn is it", Today's own); `platform_metrics_roll`'s `messages_in` (an operator rollup of what landed per channel; its `asks` follows `first_replies` by itself).

- [ ] **Step 1: Write the failing database test** (`automated-mail.db.test.mjs`, the shape of `tooling/scripts/tests/reports/report-answers.db.test.mjs`: service-role client, a tenant in UTC, skipped without a local stack). World: one person, one conversation; inbound `sender='customer'` rows at 120, 60, 50, 40 and 30 minutes ago: (1) whatsapp `meta: {}`, (2) email `meta: {}`, (3) email `meta: { email: { claim: "automated" } }`, (4) `{ email: { claim: "auto_reply" } }`, (5) `{ email: { claim: "report" } }`; one outbound `sender='ai'` `status='sent'` reply 119 minutes ago. Assertions:

```js
test("report_series, metrics_summary and first_replies count a customer message only when its words are a person's", { skip }, async () => {
  const r = ok(await db.rpc("report_series", { p_tenant_id: tenantId, p_days: 7 }));
  // Summed over the window: a run just after midnight UTC puts the 120-minute-old row on yesterday.
  const sum = (key) => r.series.slice(-7).reduce((s, d) => s + d[key], 0);
  assert.deepEqual(["messages_in", "answered_ai", "answered_you", "unanswered"].map(sum), [2, 1, 0, 1], "two messages, one answered, one not");
  assert.equal(r.channels.current.email, 1, "one email that a person wrote");
  const m = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 2 }));
  assert.deepEqual([m.period.messages_in, m.period.answered_by_ai, m.period.unanswered_in_window, m.period.conversations_active], [2, 1, 1, 1]);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: since })).length, 2);
});
test("a person whose only message was automated mail still has a first moment: the new-person rule is People's, and this migration does not touch it", { skip }, async () => {
  /* a second contact with one row of claim 'automated'; contact_first_moments lists them with first_at = that row's channel_ts */
});
```

- [ ] **Step 2: Run to see it fail** (on the throwaway stack the controller hands you, with its `SUPABASE_URL` and keys in the environment)

Run: `corepack pnpm test:db -- tooling/scripts/tests/reports/receptionist/automated-mail.db.test.mjs`
Expected: FAIL (`messages_in` is 5).

- [ ] **Step 3: Write the migration.** Header of a few lines saying the rule, the three functions and the three that stay (above). `set local lock_timeout = '3s';`. For each of the three functions: copy its CURRENT text from `supabase/schema.sql` (the lines above at c368115b4; `report_series` is 00360's), change only these lines, keep every comment, and say `create or replace function` with the grants and `comment on function` exactly as the schema has them:
  - `first_replies`, `asks` CTE: add `and public.message_is_a_persons_words(m.meta)` to the `where`.
  - `report_series`, `inbound` CTE: `select * from msgs where direction = 'inbound' and sender = 'customer' and public.message_is_a_persons_words(meta)`.
  - `metrics_summary`: add the same predicate to the `messages_in` and `conversations_active` subqueries (`from msgs where direction = 'inbound' and sender = 'customer' and public.message_is_a_persons_words(meta)`); leave `awaiting` alone.
  Apply to the throwaway stack with `supabase migration up --local` (never `db reset` on a shared stack). `node tooling/scripts/checks/migration-ledger.mjs --record`, then in `supabase/migrations-ledger.json` add to `gaps` the versions 00372-00378 ("held by unmerged lanes: the Ledger lane (00372-00376), notifications (00372), the doors lane (00373-00378); the lane that lands first takes its number and the entry goes: migration-ledger.mjs --record drops a gap that gets a file"). Then `corepack pnpm gen:schema-snapshot`, `corepack pnpm gen:db-types`, `corepack pnpm gen:schema-sets` (needs the stack; expect no change to the last two).

- [ ] **Step 4: Run to verify**, one per command, on the stack: the new file; then these, each under `tooling/scripts/tests/reports/`: `report-answers.db.test.mjs`, `report-counts.db.test.mjs`, `report-series.db.test.mjs`, `report-days.db.test.mjs`, `first-replies-person-wait.db.test.mjs`; and under the paths given: `tooling/scripts/tests/reports/periods/report-window.db.test.mjs`; `tooling/scripts/tests/reports/headline/metrics-replies.db.test.mjs`; `tooling/scripts/tests/platform/platform-metrics.db.test.mjs`; `tooling/scripts/tests/database/reads-go-through-their-own-rows.db.test.mjs`. And without the stack: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs`, `tooling/scripts/tests/database/migration-ledger.test.mjs`.
Expected: PASS. A suite that counted an automated email now says the corrected number: fix its expectation and say why in a comment (the tests that failed are the ones that should).

- [ ] **Step 5: Stage**

```bash
git add supabase/migrations/00379_automated_mail_is_no_customer_message.sql supabase/migrations-ledger.json supabase/schema.sql packages/db/src/database.types.ts tooling/scripts/tests/reports/receptionist/automated-mail.db.test.mjs tooling/scripts/tests/reports
```

---

### Task 7: Migration 00380: `receptionist_series`

**Files:**
- Create: `supabase/migrations/00380_the_receptionist_is_read_beyond_the_days_counts.sql`, `tooling/scripts/tests/reports/receptionist/receptionist-series.db.test.mjs`
- Modify: `supabase/migrations-ledger.json`, `supabase/schema.sql`, `packages/db/src/database.types.ts` (regenerated: the new function appears under `Functions`)

**Interfaces:**
- Consumes: `first_replies(p_tenant_id, p_start)` (as Task 6 leaves it), `message_is_a_persons_words`, `automated_send`, `call_connected`; the writers of what it reads, each cited:
  - a held reply: `queueDraft` (`apps/edge/lib/receptionist/draft-queue.ts:43`) writes an outbound `sender='ai'`, `status='queued'` row with `meta.source` in (`veto_window`, `low_confidence`, `steered`) and `meta.delay_ms`; a steered rewrite (`apps/edge/lib/receptionist/steer.ts:129`) cancels the old row with `error.reason='steered'` and queues a NEW row with `meta.source='steered'` (the continuation: not counted again); the owner's cancel (`packages/core/src/conversations/cancel-send.ts:8`, port `apps/dashboard/src/server/ports/core-ports.ts:111`) sets `status='canceled'` and no `error`; a newer customer message cancels with `superseded_by_newer_message` (`supabase/migrations/00284_*.sql:89`, `00362_*.sql:77`); a person answering first cancels with `superseded_by_human` (`apps/dashboard/src/server/verbs.ts:336`, `packages/db/src/repositories/ingest.ts:766`, and the door's refusal `packages/core/src/deliver.ts:599`).
  - a blocked reply: `message.send_blocked` events with `data.reason` and `data.purpose` (`packages/core/src/deliver.ts:611-625`); `purpose` is `conversational`, `marketing` or `outreach` (`packages/contracts/src/consent/consent.ts:80`).
  - topics and handled: `message_stamp_handled` (`supabase/migrations/00305_a_message_says_what_it_became.sql`) merges `meta.handled` and `meta.intent` on inbound WhatsApp and SMS rows; the outbound reply's `meta.language` is `BrainMeta.language` (`packages/contracts/src/config/brain.ts:112`).
  - handover: `escalations.created_at`, `resolved_at` (K4, `00308_*.sql`); booking links: `calls.outcome = 'booking_link_sent'` and the `booking_link.sent` event `{channel, sender}` on a message (`00313_*.sql`).
- Produces: `public.receptionist_series(p_tenant_id uuid, p_days integer default 30, p_end date default null) returns jsonb`, SECURITY INVOKER, `stable`, one statement, the workspace's zone, `revoke all … from public, anon; grant execute … to authenticated, service_role`. Answers `{ "error": "unknown_tenant" }` for an unknown workspace. Otherwise (`now` = the window, `before` = the same number of days before it):

```jsonc
{ "timezone": "Pacific/Auckland", "today": "2026-10-06", "end": "2026-10-06", "days": 30,
  "hold": { "now":    { "total": 9, "sent": 3, "canceled": 1, "steered": 1, "overtaken": 1, "person_first": 1,
                        "waiting": 1, "other": 1, "low_confidence": 1 },
            "before": { "total": 1, "sent": 1 } },
  "topics":    { "of": 5, "stamped": 4, "by_intent": { "booking": 3, "pricing": 1 } },
  "languages": { "of": 5, "stamped": 4, "by_language": { "en": 3, "es": 1 } },
  "blocked":   { "total": 3, "by_reason": { "human_has_it": 2, "opted_out": 1 } },
  "call_endings": { "total": 4, "by_reason": { "user_hangup": 2, "agent_hangup": 1, "unknown": 1 } },
  "handover": { "now":    { "n": 3, "replied": { "n": 2, "median_s": 600 }, "settled": { "n": 2, "median_s": 5400 } },
                "before": { "n": 0, "replied": { "n": 0, "median_s": null }, "settled": { "n": 0, "median_s": null } } },
  "missed":   { "now": { "n": 3, "touched": 2, "pending": 1, "unknown": 1 },
                "before": { "n": 1, "touched": 0, "pending": 0, "unknown": 0 } },
  "after_hours": [ { "d": "2026-10-06", "q": 4, "n": 1, "a": 1 } ],
  "links": { "total": 2, "people": [ { "c": "<contact id>", "at": "<iso>" } ] },
  "stuck": { "open": [ { "reason": "human_token", "created_at": "<iso>", "state": "needs_human", "paused_until": null, "assignee_user_id": null } ] } }
```

Definitions the SQL fixes (the tests below hold each):
- **hold**: the receptionist's drafts of the window (`direction='outbound' and sender='ai' and meta->>'source' in ('veto_window','low_confidence')`, backfill rows left out) by what became of them, from the row's `status` and `error`: `sent` (`sent`, `delivered`, `read`), `waiting` (`queued`), and for `canceled`: `canceled` (no `error`), `steered`, `overtaken` (`superseded_by_newer_message`), `person_first` (`superseded_by_human`); anything else (`failed`, `scheduling_failed`, a refusal) is `other`. `low_confidence` counts the drafts with `meta.source='low_confidence'` across outcomes. There is no "sooner" bucket: no "send now" exists.
- **topics**: inbound customer messages on `whatsapp` or `sms` whose words are a person's: `of` all, `stamped` those with a non-empty `meta.intent`, `by_intent` the counts. **languages**: outbound `ai` replies that left (`sent`, `delivered`, `read`): `of` all, `stamped` those with `meta.language`.
- **blocked**: `message.send_blocked` events of the window with `data.purpose = 'conversational'` by `data.reason`, **leaving out `superseded_by_human`** (the hold counts it).
- **call_endings**: connected calls of the window by `coalesce(disconnection_reason, 'unknown')`.
- **handover**: escalations created in the period whose reason is not `opt_out` or `callback` (nothing may be sent, or the answer is a phone call). `replied`: the first outbound `sender='human'` message that is not `automated_send(meta)` and has left, after `created_at`, on that conversation: seconds from the escalation; `settled`: seconds from `created_at` to `resolved_at` (null `resolved_at` is unknown, never counted); medians are `round(percentile_cont(0.5) within group (…))`.
- **missed**: inbound calls (`direction <> 'outbound'`) of the period that either never connected (`status = 'not_connected'`) or reached voicemail (connected and `in_voicemail` or `disconnection_reason = 'voicemail_reached'` or `outcome = 'voicemail'`: the same three signals as contracts `reachedVoicemail`), by PERSON, the person's first such call in the period; `unknown` counts such calls with no `contact_id`. A person is `touched` when an outbound message that left, or a connected call that is not a voicemail, from or to them, begins within `v_touch` after that call (a campaign's text-back is the business answering); `pending` when that hour has not yet passed (`at + v_touch > now()`), and a pending person is in neither `n` nor `touched`.
- **after_hours**: every customer message of the window (the rows of `first_replies`, so a person's words only) by local day (`d`) and quarter hour (`q`, 0-95), `n` of them and `a` answered by the receptionist (`who = 'ai'`).
- **links**: people sent the booking link in the window: calls with `outcome='booking_link_sent'` (inbound) and `booking_link.sent` events (their message's `contact_id`), one row per person at their first link, at most 500 returned, `total` the count.
- **stuck**: the open escalations as of now (not the window) with their conversation's `state`, `paused_until`, `assignee_user_id`, oldest first, at most 500; the reader decides who is waiting (`standingOfThread`).

- [ ] **Step 1: Write the failing database tests** (`receptionist-series.db.test.mjs`, service-role client as in Task 6; each test builds its own small world under its own tenant and cleans up; `ago(min)` and `plus(date, s)` helpers as in `report-answers.db.test.mjs:27-29`). Seven tests; the worlds and expectations:

  1. **"the hold: each held draft is counted once by what became of it"** (UTC tenant, `p_days: 7`): in the window, outbound `ai` drafts with `meta: { source: "veto_window", delay_ms: 60000, language: … }`: A `sent`, B `delivered`, C `canceled` with `error` null, D `canceled` with `error: { reason: "steered", replaced_by: "x" }`, E `canceled` `superseded_by_newer_message`, F `canceled` `superseded_by_human`, G `queued`, H `failed`, I `source: "low_confidence"` `sent`; J `source: "steered"` `sent` (the replacement: not counted); one `veto_window` draft `sent` 10 days ago (before the window, inside the period before: 7 days to 14). Expect `hold.now` = `{ total: 9, sent: 3, canceled: 1, steered: 1, overtaken: 1, person_first: 1, waiting: 1, other: 1, low_confidence: 1 }` and `hold.before` = `{ total: 1, sent: 1 }`.
  2. **"topics, languages, blocked and call endings"**: inbound customer rows: whatsapp `{intent:"booking"}` ×2, whatsapp `{intent:"pricing"}`, sms `{intent:"booking"}`, whatsapp `{}`, email `{}` ×1 and email `{email:{claim:"automated"}}` ×1. Expect `topics` = `{ of: 5, stamped: 4, by_intent: { booking: 3, pricing: 1 } }` (email is in neither, **the email-only case: a tenant with only email rows gives `topics.of = 0`**). Outbound `ai` `sent` replies with `meta.language` `en`,`en`,`es`, and one with none: `languages` = `{ of: 4, stamped: 3, by_language: { en: 2, es: 1 } }` (the held fixture's rows are in another tenant). `message.send_blocked` events with `data` `{reason:"human_has_it",purpose:"conversational"}` ×2, `{reason:"opted_out",purpose:"conversational"}`, `{reason:"superseded_by_human",purpose:"conversational"}`, `{reason:"opted_out",purpose:"marketing"}`, and one conversational `human_has_it` dated 40 days ago: `blocked` = `{ total: 3, by_reason: { human_has_it: 2, opted_out: 1 } }`. Calls (`status 'ended'`, `duration_ms 60000`) with `disconnection_reason` `user_hangup` ×2, `agent_hangup`, null; and one `status 'not_connected'`: `call_endings` = `{ total: 4, by_reason: { user_hangup: 2, agent_hangup: 1, unknown: 1 } }`.
  3. **"a handover: your first reply, and how long it took to settle"**: a conversation per escalation. E1 `human_token` created 2 days ago 10:00 UTC, an outbound `human` `sent` message 5 minutes later, `state 'resolved'`, `resolved_at` +60 min; E2 created 3 days ago, reply +15 min, resolved +120 min; E3 created 4 days ago, `open`, no reply, but an outbound `human` message with `meta: {source:"broadcast"}` +1 min (automated: not a reply); E4 `opt_out`, `resolved` and E5 `callback`, `open` (both excluded from the handover); E6 `human_token`, `state 'resolved'`, `resolved_at` null (resolved before records were kept), created 12 days ago (the period before; no reply). Expect `handover.now` = `{ n: 3, replied: { n: 2, median_s: 600 }, settled: { n: 2, median_s: 5400 } }` and `handover.before` = `{ n: 1, replied: { n: 0, median_s: null }, settled: { n: 0, median_s: null } }`. `stuck.open` holds E3 and E5 (the two `open` ones) and nothing resolved.
  4. **"calls nobody took, and whether anyone answered within an hour"** (`p_days: 7`; contacts A-E and G): A `not_connected` 2 days ago 10:00, an outbound `sent` message to A 20 minutes after (touched); B `ended` `in_voicemail: true` 3 days ago, nothing after (not touched); C `not_connected` yesterday 09:00, a connected call from C 30 minutes after (touched); D `not_connected` 40 minutes before now ("too recent": pending); a `not_connected` with no contact (unknown); an outbound-direction `not_connected` (nobody's miss); E `not_connected` 12 days ago, untouched (before). Also A's text-back sent 90 minutes after instead would not count: assert it with a second contact G (call 2 days ago, message at +90 min: not touched). Expect `missed.now` = `{ n: 4, touched: 2, pending: 1, unknown: 1 }` (A, B, C, G are people) and `missed.before` = `{ n: 1, touched: 0, pending: 0, unknown: 0 }`. The hour is held behaviourally (contracts says it as "an hour", `MISSED_CALL_TOUCH_WORDS`): a person whose outbound message left 3,599 seconds after their call is touched, one whose message left 3,601 seconds after is not.
  5. **"messages by the workspace's own day and quarter hour"**: tenant `timezone 'Pacific/Auckland'`; contacts with inbound whatsapp messages at `2026-10-05T12:10:00Z` (local 6 Oct 01:10) and `2026-10-05T10:50:00Z` (local 5 Oct 23:50) placed a few days before now by shifting the date with the same time of day (compute the expected `d` and `q` with `new Intl.DateTimeFormat("en-CA", { timeZone, hour12: false, … })` from the same instants, never by hand); an `ai` reply sent after the first only. Expect `after_hours` to equal `[{ d, q: 95, n: 1, a: 0 }, { d: nextDay, q: 4, n: 1, a: 1 }]` in that order.
  6. **"links: a person once"**: person A has a call `outcome 'booking_link_sent'` 2 days ago and a chat `booking_link.sent` event (subject: a message of A) yesterday; person B only the event; an outbound-direction call with the outcome (ignored). Expect `links.total = 2`, `links.people` = A (at the call's `started_at`) then B.
  7. **"a window that ended, a workspace with nothing, an unknown workspace"**: with `p_end = today - 3`, items created after that day's end are in none of the counts while `stuck.open` still lists every open escalation now, `end` is that day and `today` is the real one; `p_end = today + 5` reads as today; a tenant with no rows at all answers every count 0 (`hold.now.total 0`, `handover.now.replied.median_s null`, `after_hours []`, `links.people []`, `stuck.open []`) and no error; `receptionist_series(gen_random_uuid())` answers `{ error: "unknown_tenant" }`.

- [ ] **Step 2: Run to see them fail**

Run: `corepack pnpm test:db -- tooling/scripts/tests/reports/receptionist/receptionist-series.db.test.mjs`
Expected: FAIL (`Could not find the function public.receptionist_series`).

- [ ] **Step 3: Write the migration.** Header (what it adds, the rule of each part as above, either deploy order works: the dashboard answers null until it is applied, `isMissingDoor`), `set local lock_timeout = '3s';`, then the function. The window is 00360's: copy its lines (`00360_*.sql:52-59`) as

```sql
  v_today := (now() at time zone v_tz)::date;
  v_end   := least(coalesce(p_end, v_today), v_today);
  v_start := ((v_end - (v_days - 1))::timestamp) at time zone v_tz;   -- the window's first instant
  v_prior := ((v_end - (v_days * 2 - 1))::timestamp) at time zone v_tz; -- the period before's first instant
  v_stop  := ((v_end + 1)::timestamp) at time zone v_tz;
```

with `v_days := least(greatest(coalesce(p_days, 30), 1), 90)` and `v_touch constant interval := interval '1 hour'`. The CTEs, which the definitions above determine except for these choices: `real_msgs as not materialized (select * from messages where tenant_id = p_tenant_id and coalesce(meta->>'backfill','false') <> 'true')`; `held` as one CTE with `is_now` (`created_at >= v_start`) and `outcome` by a nested `case` (status first, then `error` only for `canceled`) and `unsure`; `answered` = `public.first_replies(p_tenant_id, v_start)` rows with `asked_at < v_stop`, localised once as `asked_at at time zone v_tz`; `arrivals` grouping those by `to_char(local::date,'YYYY-MM-DD')` and `extract(hour)*4 + floor(extract(minute)/15)`; `calls_all` = this tenant's calls from `v_prior` with a `voicemail` column (`coalesce(in_voicemail,false) or disconnection_reason = 'voicemail_reached' or outcome = 'voicemail'`, the one restatement of `reachedVoicemail`), no upper bound, so a touch after the window is seen; `people_missed` grouped by `(contact_id, is_now)` with `min(started_at)`; `touched` as two `exists` over `real_msgs` (outbound, left, `contact_id`, `created_at > at and <= at + v_touch`) and over `calls_all` (connected, not voicemail, same person, same bounds); `esc` with `first_reply_at` as a correlated `min(created_at)` over `real_msgs` of the same conversation; the final `select jsonb_build_object(…)` assembling the shape above with `coalesce(… , '{}'::jsonb)` / `'[]'::jsonb` for empty sets. `revoke all on function public.receptionist_series(uuid, integer, date) from public, anon; grant execute … to authenticated, service_role;` and a `comment on function` that names the sources. Apply with `supabase migration up --local`; `node tooling/scripts/checks/migration-ledger.mjs --record`; `corepack pnpm gen:schema-snapshot`; `corepack pnpm gen:db-types`; `corepack pnpm gen:schema-sets` (no change expected).

- [ ] **Step 4: Run to verify**, on the stack: the new file; `tooling/scripts/tests/reports/receptionist/automated-mail.db.test.mjs`; `tooling/scripts/tests/reports/periods/report-window.db.test.mjs`; then without it `tooling/scripts/tests/database/migrations.test.mjs`, `tooling/scripts/tests/database/migration-ledger.test.mjs`, `tooling/scripts/tests/docs/data-model.test.mjs` (red until Task 15 regenerates the data model: note it, do not fix here).
Expected: PASS. **When this step is green the database work is done: ask the controller to stop the stack (`supabase stop --no-backup`).**

- [ ] **Step 5: Stage**

```bash
git add supabase/migrations/00380_the_receptionist_is_read_beyond_the_days_counts.sql supabase/migrations-ledger.json supabase/schema.sql packages/db/src/database.types.ts tooling/scripts/tests/reports/receptionist/receptionist-series.db.test.mjs
```

---

### Task 8: The repository: `receptionistSeries`

**Files:**
- Modify: `packages/db/src/repositories/reports/report-series.ts` (after `reviewsLedger`, line 77), `packages/db/src/index.ts` (line ~218, beside `reviewsLedger`)
- Modify (built): `packages/db/dist/*`
- Test: `tooling/scripts/tests/reports/report-repository.test.mjs` (extend; copy the `reviewsLedger` cases)

**Interfaces:**
- Consumes: `windowArgs`, `notReadable`, `ReportWindow` (`report-series.ts:21,35,39`), `isMissingDoor` (`packages/db/src/repositories/templates.ts:297`).
- Produces: `receptionistSeries(db: Db, tenantId: string, window: ReportWindow): Promise<Json | null>`: the function's answer; `null` on a database without the function (PostgREST `PGRST202`, via `isMissingDoor`), for a period or a window that names its last day alike; any other failure throws `Error("receptionist_series: …")`. It is the one place the function is called by name.

- [ ] **Step 1: Write the failing tests** (in `report-repository.test.mjs`, over the in-memory database `_fake-db.mjs` with scripted `rpc`s, as the `reviewsLedger` cases there do):

```js
test("receptionistSeries asks receptionist_series for the window, naming the last day only when it is not today", async () => {
  const asked = [];
  const db = fakeDb({ rpcs: { receptionist_series: (a) => (asked.push(a), { days: a.p_days }) } });
  assert.deepEqual(await receptionistSeries(db, W, { days: 30, end: null }), { days: 30 });
  await receptionistSeries(db, W, { days: 20, end: "2026-09-20" });
  assert.deepEqual(asked, [{ p_tenant_id: W, p_days: 30 }, { p_tenant_id: W, p_days: 20, p_end: "2026-09-20" }]);
});
test("receptionistSeries is null where the database does not have the function yet, and throws for any other failure", async () => {
  const missing = fakeDb({ rpcErrors: { receptionist_series: { code: "PGRST202", message: "not found" } } });
  assert.equal(await receptionistSeries(missing, W, { days: 30, end: null }), null);
  assert.equal(await receptionistSeries(missing, W, { days: 20, end: "2026-09-20" }), null, "a window that names a day too");
  const broken = fakeDb({ rpcErrors: { receptionist_series: { code: "XX000", message: "boom" } } });
  await assert.rejects(receptionistSeries(broken, W, { days: 30, end: null }), /receptionist_series: boom/);
});
```

(use the file's own helper names for the fake database and rpc errors; read the `reviewsLedger` cases first.)

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-repository.test.mjs`
Expected: FAIL (`receptionistSeries` is not exported).

- [ ] **Step 3: Implement** `receptionistSeries` exactly as `reviewsLedger` (`report-series.ts:70-77`) with `"receptionist_series"`, its header comment saying 00380 and the deploy order; export it from `packages/db/src/index.ts`; `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**: `report-repository.test.mjs`, then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (the `.rpc("…")` count is inside `packages/db`, which is allowed).
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add packages/db/src/repositories/reports/report-series.ts packages/db/src/index.ts tooling/scripts/tests/reports/report-repository.test.mjs packages/db/dist
```

---

### Task 9: Contracts: the Receptionist DTO, its guard, its words and its fold (page-only)

**Files:**
- Create: `packages/contracts/src/reports/receptionist/receptionist-record.ts`, `packages/contracts/src/reports/receptionist/receptionist-words.ts`, `packages/contracts/src/reports/receptionist/receptionist-report.ts`, `tooling/scripts/tests/reports/receptionist/receptionist-report.test.mjs`
- Modify: `packages/contracts/src/reports/report-lens.ts` (the entry), `packages/contracts/src/reports/index.ts` (named exports), `packages/contracts/src/reports/report-tiles.ts` (seven metric ids), `packages/contracts/src/reports/report-metrics.ts` (seven definitions), `tooling/scripts/gen/contracts-browser-entry.mjs` (`PAGE_ONLY` gains the fold and the words), `packages/contracts/src/browser.generated.ts` (regenerated), `tooling/scripts/tests/shipping/browser-entry.test.mjs` (the `PAGE_ONLY` list), `tooling/scripts/tests/reports/lenses/report-metric-words.test.mjs` (the count and the new ids)
- Modify (built): `packages/contracts/dist/*`

**Interfaces:**
- Consumes: `closedOf`, `hoursUnsetOf`, `ReportProfile` (`report-closed.ts:27,41`), `fmtSeconds`, `beforeWords`, `REPORT_MIN_N`, `ReportMetric` (`report-tiles.ts`), `rangeLabelOf` (`reports.ts:462`), `ReportBarVM`, `plural`/`capitalize` (`shared/words`), `durationWords` (`shared/clock`), `HELD_REASONS` (`broadcasts/run-words.ts:31`), `INTENT_LABELS` (`config/brain.ts:34`), `DISCONNECTION_LABELS` (`conversations/call-dto.ts:146`), `BOOKED_NEEDS_TODAY` and `BOOKED_NEEDS_A_LINK` (booking words), `standingOfThread` (`conversations/standing.ts:95`), `BookingReportDto`.
- Produces (exported through `reports/index.ts` where another module reads them: `ReceptionistSeriesDto`, `ReceptionistDto`, `isReceptionistSeriesDto`, `receptionistDtoOf`, `MISSED_CALL_TOUCH_WORDS`, `toReceptionistReportVM`, `ReceptionistReportVM`; the fold and its view model also through `report-lens.ts`):

```ts
// receptionist-record.ts (server-facing). Only what another module imports is exported: the sub-DTOs below are private.
export const MISSED_CALL_TOUCH_WORDS = "an hour";   // the SQL's `interval '1 hour'` (Task 7's test holds it); the figure's label and its definition read this
interface HoldCountsDto { total: number; sent: number; canceled: number; steered: number; overtaken: number; person_first: number; waiting: number; other: number; low_confidence: number }
interface HandoverDto { n: number; replied: { n: number; median_s: number | null }; settled: { n: number; median_s: number | null } }
interface MissedDto { n: number; touched: number; pending: number; unknown: number }
interface OpenEscalationDto { reason: string; created_at: string; state: string; paused_until: string | null; assignee_user_id: string | null }
/** receptionist_series's own answer (00380). */
export interface ReceptionistSeriesDto {
  timezone: string; today: string; end?: string; days: number;
  hold: { now: HoldCountsDto; before: { total: number; sent: number } };
  topics: { of: number; stamped: number; by_intent: Record<string, number> };
  languages: { of: number; stamped: number; by_language: Record<string, number> };
  blocked: { total: number; by_reason: Record<string, number> };
  call_endings: { total: number; by_reason: Record<string, number> };
  handover: { now: HandoverDto; before: HandoverDto };
  missed: { now: MissedDto; before: MissedDto };
  after_hours: { d: string; q: number; n: number; a: number }[];
  links: { total: number; people: { c: string; at: string }[] };
  stuck: { open: OpenEscalationDto[] };
}
type LinksCalendar = BookingReportDto["calendar"];
/** What the route answers (the reader's body). `series` is null where the database has no receptionist_series yet. */
export interface ReceptionistDto {
  timezone: string; today: string; end?: string; days: number;
  series: (Omit<ReceptionistSeriesDto, "links" | "stuck"> & {
    links: { sent: number; booked: number | null; calendar: LinksCalendar };
    stuck: { waiting: number; oldest_at: string | null; callbacks: number };
  }) | null;
  profile: ReportProfile | null;
}
export function isReceptionistSeriesDto(answer: unknown): answer is ReceptionistSeriesDto  // timezone, today, days, hold, handover, stuck present; false for { error }
export function receptionistDtoOf(series: ReceptionistSeriesDto | null, parts: {
  /** What the reader could say of the people sent the link; null: it was not asked (read as "none"). */
  booked: { calendar: LinksCalendar; booked: number | null } | null;
  profile: ReportProfile | null;
  /** The window as the route asked it, which the DTO echoes (used when `series` is null). */
  head: { timezone: string; today: string; end?: string; days: number };
  nowMs: number;
}): ReceptionistDto
```

`receptionistDtoOf` is pure. `links` becomes `{ sent: series.links.total, booked: parts.booked?.booked ?? null, calendar: parts.booked?.calendar ?? "none" }`. `stuck.waiting` counts the open rows whose `standingOfThread({ state, paused_until, assignee_user_id }, true, parts.nowMs).standing === "needs_you"` (a row a teammate holds, a row the owner holds, and a snoozed one are not waiting on you); `oldest_at` is the earliest `created_at` among the waiting rows (null with none); `callbacks` the waiting rows with `reason === "callback"`. With `series === null` the DTO's `series` is `null` and the head fields come from `parts.head`; otherwise they come from the series.

```ts
// receptionist-report.ts (page-only)
export interface MixPartVM { rows: ReportBarVM[]; line: string | null; empty: string | null }
export interface ReceptionistFigureVM extends ReportStripTile { }
export interface ReceptionistReportVM {
  available: boolean;                      // false: the database has no receptionist_series yet (draw nothing of the new parts)
  hold: MixPartVM; topics: MixPartVM; languages: MixPartVM | null; callEndings: MixPartVM;
  link: { sent: number; booked: number | null; line: string };
  handover: ReceptionistFigureVM[];        // [first reply, time to settle]
  missed: ReceptionistFigureVM;
  closed: (ReceptionistFigureVM & { unset: boolean }) | null;   // null: the workspace's hours could not be read
  stuck: ReceptionistFigureVM[];           // [waiting on you, call-backs, replies held back]
  heldBack: ReportBarVM[];                 // the reasons, most first, for Ask and the figure's line
}
export function toReceptionistReportVM(dto: ReceptionistDto, opts: { nowMs: number }): ReceptionistReportVM
```

Seven new `ReportMetric` ids with their definitions (each says what is counted and what is not, in the style of `report-metrics.ts`): `handover_first_reply`, `handover_settled`, `missed_calls_answered`, `answered_while_closed`, `waiting_on_you`, `call_backs`, `replies_held_back`. The words (`receptionist-words.ts`), exact:
- hold rows in this order, zero rows left out: `sent` "Went out as the hold ended", `canceled` "You cancelled", `steered` "You changed", `overtaken` "A newer message came first", `person_first` "A person answered first", `waiting` "Still waiting", `other` "Did not go out". `hold.line` = `` `${sent} of ${total} went out as the hold ended.` `` plus, when `low_confidence > 0`, ` ` + `` `${n} ${n === 1 ? "was" : "were"} held back as not sure enough to send alone.` ``; `total === 0`: `rows: []`, `line: null`, `empty: "No reply waited in a hold in this period."`.
- topics: `of === 0` -> `empty: "Topics are read from texts and WhatsApp messages. None came in this period."`; `stamped === 0` -> `empty` `` `No topic is recorded for the ${of} ${of === 1 ? "message" : "messages"} that came by text or WhatsApp.` ``; else rows labelled `INTENT_LABELS[k] ?? k`, most first, `line` `` `${stamped} of ${of} text and WhatsApp messages had a topic.` ``.
- languages: `null` unless two or more languages; labels `en` "English", `es` "Spanish", `other` "Another language"; `line` `` `${stamped} of ${of} replies say the language they were written in.` ``.
- callEndings: `total === 0` -> `empty: "Nobody phoned in this period."`; else rows labelled `DISCONNECTION_LABELS[k] ?? k.replace(/_/g, " ")` ("unknown" is "Not recorded"), `line` `` `${total} ${total === 1 ? "call" : "calls"} someone spoke on.` ``.
- link: `sent === 0` -> `"Nobody was sent the booking link in this period."`; `booked` a number -> `` `${sent} ${sent === 1 ? "person was" : "people were"} sent the booking link; ${booked} ${booked === 1 ? "has" : "have"} booked since.` ``; `booked === null` -> the first sentence alone (`"… sent the booking link."`) plus ` ` + the reason: `ended` `BOOKED_NEEDS_TODAY`, `none` `BOOKED_NEEDS_A_LINK`, `unavailable` `"Your calendar could not be read."`.
- handover figures (`n: replied.n` / `settled.n`, `minN: REPORT_MIN_N`): label "Your first reply after a handover" / "Time to settle a handover"; value `fmtSeconds(median)` or `"—"` with no median; meta `` `${replied.n} of ${n} handovers had a reply from you` `` / `` `${settled.n} of ${n} settled` ``, and `"nothing was handed over in this period"` when `n === 0`; `compare` `` `was ${fmtSeconds(before median)} ${beforeWords(rangeLabelOf(days))}` `` when the period before has a median.
- missed: label `` `Missed calls answered within ${MISSED_CALL_TOUCH_WORDS}` `` ("Missed calls answered within an hour"; the metric's definition reads the same constant); value `` `${touched} of ${n}` `` or `"—"` when `n === 0`; meta: the parts of ``[`${pending} under an hour old, not counted yet`, `${unknown} with no caller on record not counted`]`` that apply, joined by `" · "`, else `"no call went unanswered at the phone"` when `n === 0` and both are 0; `n`, `minN`; `compare` `` `was ${before.touched} of ${before.n} ${beforeWords(…)}` `` when `before.n > 0`.
- closed: `hoursUnsetOf(arrivals, profile)` -> `{ label: "Answered while you were closed", value: "—", meta: "set your opening hours to see this", door: "admin/workspace", unset: true }`; `profile === null` -> `closed: null`; else `came = closedOf(after_hours as {d,q,n}, profile)`, `answered = closedOf(after_hours as {d,q,n: a}, profile)`; `came === 0` -> value `"0"`, meta `"nothing came while you were closed"`; else value `` `${answered} of ${came}` ``, meta `` `${came} ${came === 1 ? "message" : "messages"} came while you were closed; the receptionist answered ${answered}.` ``, `n: came`, `minN`.
- stuck: "Waiting on you": value `String(waiting)`, meta `waiting === 0 ? "nobody is waiting for you" : ` + `` `the oldest has waited ${durationWords((opts.nowMs - Date.parse(oldest_at)) / 1000)}` ``, `door: "inbox"`; "Call-backs": value `String(callbacks)`, meta `callbacks === 0 ? "no call-back is waiting" : "people to ring, counted in waiting on you"`, `door: "today"`; "Replies held back": value `String(blocked.total)`, meta the two most common reasons, each as its `HELD_REASONS` words as they stand (lower case) and its count, `` `${HELD_REASONS[r] ?? r.replace(/_/g, " ")} ${n}` ``, joined by `" · "` (`"none were held at the door in this period"` for 0), `door: "inbox"`. `heldBack` rows use `capitalize(HELD_REASONS[r] ?? r.replace(/_/g, " "))`.

- [ ] **Step 1: Write the failing tests** (`receptionist-report.test.mjs`, importing from `@chanlytics/contracts`; the profile and the Monday of `reports-closed.test.mjs`: hours mon-fri 09:30-18:00, sat 09:30-19:00, closure 2026-09-18; 14 Sep 2026 is a Monday). A base fixture `FACTS` (days 30, `now: Date.parse("2026-09-21T12:00:00Z")`):

```js
const FACTS = {
  hold: { now: { total: 14, sent: 9, canceled: 1, steered: 1, overtaken: 1, person_first: 1, waiting: 0, other: 1, low_confidence: 3 }, before: { total: 10, sent: 8 } },
  topics: { of: 41, stamped: 33, by_intent: { booking: 12, pricing: 9, hours: 6, services: 4, other: 2 } },
  languages: { of: 38, stamped: 38, by_language: { en: 30, es: 8 } },
  blocked: { total: 4, by_reason: { human_has_it: 3, opted_out: 1 } },
  call_endings: { total: 18, by_reason: { user_hangup: 11, agent_hangup: 5, unknown: 2 } },
  handover: { now: { n: 12, replied: { n: 11, median_s: 540 }, settled: { n: 9, median_s: 3900 } }, before: { n: 10, replied: { n: 9, median_s: 780 }, settled: { n: 7, median_s: 5400 } } },
  missed: { now: { n: 6, touched: 4, pending: 1, unknown: 1 }, before: { n: 4, touched: 3, pending: 0, unknown: 0 } },
  after_hours: [{ d: "2026-09-20", q: 44, n: 3, a: 1 }, { d: "2026-09-16", q: 84, n: 2, a: 2 }, { d: "2026-09-14", q: 40, n: 4, a: 4 }],
  links: { sent: 7, booked: 3, calendar: "ok" },
  stuck: { waiting: 3, oldest_at: "2026-09-21T09:50:00Z", callbacks: 1 },
};
const dto = (over = {}, profile = PROFILE) => ({ timezone: "UTC", today: "2026-09-21", days: 30, series: { timezone: "UTC", today: "2026-09-21", days: 30, ...FACTS, ...over }, profile });
const vm = (over, profile) => toReceptionistReportVM(dto(over, profile), { nowMs: NOW });
```

Tests, each executing the real functions:
  - `"the hold: nine of fourteen went out as it ended, three held for not being sure"`: `vm().hold.rows.map((r) => [r.label, r.value])` deep-equals the seven labels in order (zero `waiting` left out: six rows) with 9, 1, 1, 1, 1, 1; `hold.line === "9 of 14 went out as the hold ended. 3 were held back as not sure enough to send alone."`; with `low_confidence: 1` the second sentence says `1 was held back as not sure enough to send alone.`; with `hold.now.total: 0` rows `[]`, line null, empty `"No reply waited in a hold in this period."`.
  - `"topics say how many had one, and what they cover"`: `topics.line === "33 of 41 text and WhatsApp messages had a topic."`, rows start `["Booking", 12]`, `["Pricing question", 9]`; `topics: { of: 0, stamped: 0, by_intent: {} }` gives the empty words about texts and WhatsApp; `{ of: 6, stamped: 0, by_intent: {} }` gives `"No topic is recorded for the 6 messages that came by text or WhatsApp."` (the email-only / pre-capture case, with no row of zero).
  - `"languages are drawn with two or more"`: `vm().languages.rows` = English 30, Spanish 8; with `by_language: { en: 38 }` it is `null`.
  - `"how calls ended, in the owner's words, the unrecorded ones said so"`: rows include `["Customer hung up", 11]`, `["Receptionist ended the call", 5]`, `["Not recorded", 2]`; `callEndings.line === "18 calls someone spoke on."`.
  - `"the link and what came of it, said by what the calendar could say"`: `"7 people were sent the booking link; 3 have booked since."`; `booked: null, calendar: "ended"` -> `"7 people were sent the booking link. " + BOOKED_NEEDS_TODAY`; `sent: 0` -> `"Nobody was sent the booking link in this period."`; `sent: 1, booked: 1` -> `"1 person was sent the booking link; 1 has booked since."`.
  - `"you, after a handover: the middle, its n, and the period before"`: first reply `value "9m"`, meta `"11 of 12 handovers had a reply from you"`, `compare "was 13m the 30 days before"`, `n 11`, `minN 5`; settled `value "1h 5m"` (check `fmtSeconds(3900)`'s spelling and copy it), meta `"9 of 12 settled"`; `handover.now = { n: 0, replied: { n: 0, median_s: null }, settled: { n: 0, median_s: null } }` gives `"—"`, meta `"nothing was handed over in this period"`, no `compare`; `replied.n: 3` carries `n: 3` so the Figure greys it (Task 3).
  - `"missed calls answered within an hour: a person, not a call; too recent ones are said, not counted"`: the label is `"Missed calls answered within an hour"` and the metric's definition contains `MISSED_CALL_TOUCH_WORDS`; value `"4 of 6"`, meta `"1 under an hour old, not counted yet · 1 with no caller on record not counted"`, `compare "was 3 of 4 the 30 days before"`; `missed.now = { n: 0, touched: 0, pending: 0, unknown: 0 }` -> `"—"` and `"no call went unanswered at the phone"`.
  - `"while you were closed: the hours decide, and no hours is a question"`: with the profile, `closed.value === "3 of 5"` (Sunday 11:00 and Wednesday 21:00 are closed, Monday 10:00 is open: came 3 + 2 = 5, answered 1 + 2 = 3), meta `"5 messages came while you were closed; the receptionist answered 3."`; `profile: { hours: {} }` -> `closed.unset === true`, `value "—"`, `door "admin/workspace"`; `profile: null` -> `closed === null`; arrivals that are all open -> value `"0"`. **The same arrivals give the same counts when the suite runs in another zone**: run this file under `TEST_TZ=Pacific/Auckland` as well (the counts read no clock).
  - `"stuck: waiting on you, call-backs and replies held back"`: figures in order with values `"3"`, `"1"`, `"4"`; waiting meta `"the oldest has waited 2h 10m"` (NOW is 12:00, oldest 09:50: copy `durationWords(7800)`'s spelling); doors `inbox`, `today`, `inbox`; held-back meta `"a person had the thread 3 · asked to stop 1"`; `vm().heldBack[0]` is `{ label: "A person had the thread", value: 3 }`-shaped; `stuck: { waiting: 0, oldest_at: null, callbacks: 0 }` -> `"nobody is waiting for you"`.
  - `"nothing in the period: every part is absent with words, never a zero percentage or NaN"`: build `QUIET` = every count 0, medians null, `after_hours: []`, `links: { sent: 0, booked: 0, calendar: "ok" }`, `stuck` zeros; assert each part's `empty`/`"—"`, and `JSON.stringify(vm(QUIET)).includes("NaN") === false` and no `"%"` in any value.
  - `"a database without receptionist_series gives a view model that draws nothing of the new parts"`: `toReceptionistReportVM({ ...dto(), series: null }, { nowMs: NOW }).available === false`.
  - `receptionistDtoOf`: the open rows `[{human_token, 08:00, state "needs_human"}, {callback, 09:00, "open"}, {manual, 07:00, "open", assignee_user_id: "u2"}, {human_token, previous day, "snoozed"}]` give `stuck = { waiting: 2, oldest_at: <the 08:00 one>, callbacks: 1 }` (the teammate's and the snoozed are not waiting on you); `links.people` of two with `booked: { calendar: "ok", booked: 1 }` give `links = { sent: 2, booked: 1, calendar: "ok" }`; `booked: null` gives `{ sent: 2, booked: null, calendar: "none" }`; `series: null` gives `series: null`; `isReceptionistSeriesDto({ error: "unknown_tenant" }) === false` and a full SQL answer is `true`.
  - `report-metric-words.test.mjs`: the count of definitions is 26 and each of the seven ids has words that say what is not counted.
  - `browser-entry.test.mjs`: `PAGE_ONLY` now also names `reports/receptionist/receptionist-report.ts` and `reports/receptionist/receptionist-words.ts`, and `toReceptionistReportVM` is absent from `current.names` and present in `dist/report-lens.js`.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/receptionist/receptionist-report.test.mjs`
Expected: FAIL (`toReceptionistReportVM` is not exported).

- [ ] **Step 3: Implement** the three modules and the registrations. `receptionist-record.ts` is root-barrel and server-facing (the guard, the DTO builder, the constant); `receptionist-words.ts` holds the maps and the pure sentence helpers; `receptionist-report.ts` the fold (each function under the limits: one small function per part). The seven metric ids go into `ReportMetric` and `METRIC_WORDS` (`report-metrics.ts:12` is a `Record`, so a missing definition is a compile error). `reports/index.ts` names every export; `report-lens.ts` adds `toReceptionistReportVM` and the types it returns; the generator's `PAGE_ONLY` gains the two page-only modules (the record module is not page-only: the server reads it, and a page imports only its types, which cost nothing). `node tooling/scripts/gen/contracts-browser-entry.mjs`; `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**, one per command: `receptionist-report.test.mjs` (once, and again with `TEST_TZ=Pacific/Auckland` set, PowerShell: `$env:TEST_TZ='Pacific/Auckland'; node tooling/scripts/checks/test.mjs …`), `report-metric-words.test.mjs`, `browser-entry.test.mjs`, `tooling/scripts/tests/repo/contracts-barrels.test.mjs`, `tooling/scripts/tests/repo/contracts-import-cycles.test.mjs`, `tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, `corepack pnpm --filter @chanlytics/contracts typecheck`, `corepack pnpm --filter @chanlytics/dashboard typecheck`.
Expected: PASS. Exports a later task reads (the record module's guard and builder: Task 10; the fold: Tasks 11-13) are listed in Task 15's dead-exports step.

- [ ] **Step 5: Stage**

```bash
git add packages/contracts/src/reports/receptionist packages/contracts/src/reports/report-lens.ts packages/contracts/src/reports/index.ts packages/contracts/src/reports/report-tiles.ts packages/contracts/src/reports/report-metrics.ts tooling/scripts/gen/contracts-browser-entry.mjs packages/contracts/src/browser.generated.ts tooling/scripts/tests/shipping/browser-entry.test.mjs tooling/scripts/tests/reports/receptionist/receptionist-report.test.mjs tooling/scripts/tests/reports/lenses/report-metric-words.test.mjs packages/contracts/dist
```

---

### Task 10: The reader, the route, the policy row and the client

**Files:**
- Modify: `apps/dashboard/src/server/readers/report.ts` (a `profileOf` helper from lines 124-131, and `receptionistReport` after `reviewsReport`, line 288), `apps/dashboard/src/server/calendar/people-visits.ts` (`bookedSince` out of `bookingReport` lines 188-202; `linksBooked` after it), `apps/dashboard/src/server/log.ts` (line ~160: `"receptionist_series_missing"` beside `"reviews_ledger_missing"`), `tooling/scripts/tests/route-policy.json` (a row between `GET reports/reach-outs` and `GET reports/reviews`), `apps/dashboard/src/client/routes.generated.ts`, `packages/contracts/src/route-keys.generated.ts` (both regenerated), `docs/api.md` (regenerated)
- Create: `apps/dashboard/app/api/v1/reports/receptionist/route.ts`
- Test: `tooling/scripts/tests/ask/readers.test.mjs` (a `receptionistReport` section, copying the `reviewsReport` cases at lines 2066, 2093, 2129, 2143, 2156, 2176, 2179), `tooling/scripts/tests/reports/periods/report-routes.test.mjs` (the route's periods, Month, the refusals; copy the `reviews` cases at line ~246), `tooling/scripts/tests/ask/ask-routes.test.mjs` (the policy row, as for reviews), `tooling/scripts/tests/calendar/calendar-counts.test.mjs` (near line 836: `linksBooked`)

**Interfaces:**
- Consumes: `receptionistSeries(db, tenantId, window)` (Task 8), `isReceptionistSeriesDto`, `receptionistDtoOf` (Task 9), `reportWindowFor`, `ReportQuery`, `windowRead`, `facts`/`load`/`stamp` and the `Reader` type (as `reviewsReport` uses them), `everyone(ctx, tenantId)` (`apps/dashboard/src/server/people/people.ts:135`), `peopleVisits`, `bookedAfterAsk`.
- Produces:
  - `profileOf(rc: ReaderContext): Promise<ReportProfile | null>` (private to `report.ts`; `report` and `receptionistReport` both read it: one derivation).
  - `bookedSince(visits: PersonVisitsDto | undefined, askedMs: number): boolean` (private to `people-visits.ts`): the inner test of `bookingReport` (`v && bookedAfterAsk({ next, last }, askedMs)`), which `bookingReport` and `linksBooked` both call: one predicate.
  - `linksBooked(ctx: RouteContext, tenantId: string, rows: PersonRowDto[], links: { c: string; at: string }[], now?: Date, known?: { timezone: string; config: unknown }): Promise<{ calendar: "ok" | "unavailable" | "none"; booked: number }>`: of the people sent the link, how many have a visit that `bookedSince` finds after the moment the link went (`askedMs = Date.parse(at)`).
  - `export const receptionistReport: Reader<ReportWindow, ReceptionistDto>` (name `"receptionistReport"`, `rows: []`): reads `receptionistSeries` and `profileOf` together; `null` answer -> `log.warn("receptionist_series_missing", { tenant_id })` and `receptionistDtoOf(null, …)`; an answer that is not `isReceptionistSeriesDto` -> `AppError("not_found", "No workspace found for this report.", 404)`; a window that ended before today (`window.end !== null`) -> `booked: { calendar: "ended", booked: null }` and **no people are read**; no links -> `booked: { calendar: "ok", booked: 0 }`, no people read; else `everyone` once, filtered to the linked ids, then `linksBooked` (`{ calendar, booked }`, with `booked: null` when the calendar is `none` or `unavailable`); a failure of that read is `booked: { calendar: "unavailable", booked: null }` (logged `booking_report_failed`), never fatal.
  - `GET /api/v1/reports/receptionist`: `read({ scope: workspace, rate: "aggregate", query: ReportQuery.pick({ period: true, from: true, to: true }), handle })`, the reviews route's twin (`app/api/v1/reports/reviews/route.ts`), with a header comment in its style. The policy row is `{ "kind": "read", "scope": "workspace", "role": null, "rate": "aggregate", "spend": false }`.

- [ ] **Step 1: Write the failing tests**
  - Reader (in `readers.test.mjs`, the world helpers it already has): (a) `GET reports/receptionist` answers its reader's payload byte for byte for 7, 30 and 90 days; (b) a scripted `receptionist_series` answer with `links.people` of three contacts and a world whose calendar feed books one of them after the link: the DTO's `series.links` is `{ sent: 3, booked: 1, calendar: "ok" }`; (c) `receptionist_series` answering a missing function (`PGRST202`) gives `series: null` and one `receptionist_series_missing` warn, and the route does not fail; (d) `{ error: "unknown_tenant" }` is the route's 404; (e) a window `{ days: 20, end: "2026-09-20" }` gives `links.calendar: "ended"`, `booked: null`, and the fake `people_list` rpc is never called; (f) a series with `links.total: 0` never reads people either; (g) the open escalations of Task 9's fixture (needs_human, callback open, teammate-claimed, snoozed) reach `stuck = { waiting: 2, oldest_at, callbacks: 1 }`; (h) the profile in the DTO equals `report`'s for the same workspace (hours and closures), and is `null` when the config cannot be parsed.
  - `calendar-counts.test.mjs`: `linksBooked` over the feed that test builds: a person with a visit after the link counts, one whose visit is before it does not (`bookedAfterAsk`'s rule), `calendar: "none"` for a workspace with no feed; `bookingReport` still answers what it did (its existing assertions stay).
  - `report-routes.test.mjs`: Month and `from`/`to` for the new route, `period=14d` refused with status 400, `days=7` ignored (thirty).
  - `ask-routes.test.mjs`: the policy row is what is above.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs`
Expected: FAIL (`receptionistReport` is not exported).

- [ ] **Step 3: Implement** the helpers, the reader and the route as above. `node tooling/scripts/gen/route-types.mjs` and `corepack pnpm gen:api-reference`. Edit `tooling/scripts/tests/route-policy.json` by hand for the row, in the file's key order.

- [ ] **Step 4: Run to verify**, one per command: `readers.test.mjs`, `report-routes.test.mjs`, `ask-routes.test.mjs`, `calendar-counts.test.mjs`, `tooling/scripts/tests/calendar/calendar-people.test.mjs` (its source-text assertion at line 1446 must still find `bookedAfterAsk(` in the service), `tooling/scripts/tests/routes/route-policy.test.mjs`, `tooling/scripts/tests/routes/api-reference.test.mjs`, `tooling/scripts/tests/repo/log-events.test.mjs`, `node tooling/scripts/gen/route-types.mjs --check`, `corepack pnpm --filter @chanlytics/dashboard typecheck`, `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (`readers/` takes no new file).
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/app/api/v1/reports/receptionist/route.ts apps/dashboard/src/server/readers/report.ts apps/dashboard/src/server/calendar/people-visits.ts apps/dashboard/src/server/log.ts tooling/scripts/tests/route-policy.json apps/dashboard/src/client/routes.generated.ts packages/contracts/src/route-keys.generated.ts docs/api.md tooling/scripts/tests/ask/readers.test.mjs tooling/scripts/tests/ask/ask-routes.test.mjs tooling/scripts/tests/reports/periods/report-routes.test.mjs tooling/scripts/tests/calendar/calendar-counts.test.mjs packages/contracts/dist
```

---

### Task 11: The surface `reports_receptionist` and its registrations

**Files:**
- Create: `apps/dashboard/src/surfaces/reports/receptionist-surface.ts`, `tooling/scripts/tests/reports/receptionist/receptionist-surface.test.mjs`
- Modify: `apps/dashboard/src/surfaces/reports/period-surface.ts` (the debounce, applied from the other lane's commit), `apps/dashboard/src/surfaces/surface-values.ts` (the type at line ~41 and `SURFACE_KEYS` at ~170), `apps/dashboard/src/legacy-bridge/LegacyApp.tsx` (import ~46, `SURFACES` ~167, `SURFACE_LABELS` ~206), `apps/dashboard/src/legacy-bridge/surface-registry.ts` (`ROUTE_DRAWS`, line ~208), `apps/dashboard/src/surfaces/reports/period.ts` (`followers`, line 20), `apps/dashboard/src/legacy-bridge/refresh-map.ts` (imports line 30; the `thread` group; `PATCH workspaces`; `PUT settings`), `tooling/scripts/tests/_legacy-react.mjs` (the stub's surface list, ~line 120)
- Test: `receptionist-surface.test.mjs` (copy `tooling/scripts/tests/reports/lenses/reviews-surface.test.mjs`'s cases about the helper: the override's marks, a read held by period and painted at once on a pick back, a read for a period left never painted over the new one, `forget`, the follower's `current`/`coming`/`failed`, picked days named by their one key; drop its Google parts), `tooling/scripts/tests/reports/headline/on-demand-boot.test.mjs`, `tooling/scripts/tests/reports/headline/headline-boot.test.mjs` (lines 125, 172, 196), `tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs` (lines 567, 637-660), `tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs` (lines 73, 365-419), `tooling/scripts/tests/shell/surfaces/surface-registry.test.mjs` (lines 356-368), `tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs` (lines 178-223), `tooling/scripts/tests/reports/periods/report-range-follow.test.mjs`

**Interfaces:**
- Consumes: `periodSurface` (`period-surface.ts:42`), `shownReportRange`, `rangeQuery` (`surface.ts:65,71`), `read` (`@/legacy-bridge/api`), `onlyOnItsPage` (`surface-registry.ts`), `ReceptionistDto` (Task 9, a TYPE import only: the surface imports no fold).
- Produces:

```ts
/** What the lens draws from: the answer as the route gave it (the page folds it), the range it is of, and when it was read. */
export interface ReceptionistSurface { dto: ReceptionistDto; key: string; readAt: number }
export const receptionist = periodSurface({ key: "reports_receptionist", shown: shownReportRange, of: (v) => v.key,
  read: async (range) => ({ dto: await read("GET reports/receptionist", { query: rangeQuery(range) }), key: reportRangeKey(range), readAt: Date.now() }),
  live: { refreshOnTables: ["messages", "escalations", "calls"], refreshWhen: onlyOnItsPage("reports_receptionist", ["messages", "escalations", "calls"]), debounceMs: 800 } });
export const receptionistOverride: SurfaceOverride;    // receptionist.override
export const forgetReceptionist: () => void;           // receptionist.forget
```

  `SurfaceValues.reports_receptionist: ReceptionistSurface`; `ROUTE_DRAWS["reports/receptionist"] = ["reports_receptionist"]`; the follower `{ surface: receptionist, preReads: false }` in `period.ts`. `forgetReceptionist()` is called by the `thread` group in `refresh-map.ts` (a write on a conversation or an escalation moves "waiting on you"), by `PATCH workspaces` (the zone moves the days) and by `PUT settings` (hours and closures move "while you were closed"); the read is made as the lens comes on screen. It hears the live feed only while the lens is on screen (`onlyOnItsPage`), 800 ms after the last change, the way `reports` does (`surface.ts:164`).

- [ ] **Step 1: Write the failing tests.** `receptionist-surface.test.mjs`: the override's key/value/events/`onDemand`/`isStale`/`view()`; `refreshOnTables` equals `["messages","escalations","calls"]`; `debounceMs === 800`; `refreshOnMessageInserts` undefined; `refreshWhen` is true for each table on `reports/receptionist` and false on `reports/people`, `reports/reviews`, `today`; `apply()` publishes `{ dto, key, readAt }` where `dto` is the route's answer unfolded (assert `surfaceValue("reports_receptionist").dto === the stub answer`); `GET reports/receptionist` is asked with `{ period: "30d" }` or `{ from, to }`; the other files assert the registrations as their Reviews lines do (read where drawn and nowhere else; `routeDrawsFor("reports","receptionist")` and `("reports", "receptionist:2026-09-01~2026-09-20")` are `["reports_receptionist"]`; `ownsTheScreen("reports_receptionist","reports/receptionist")` true and false elsewhere; a pick paints the held read and reads behind it only on the lens; `refresh-coverage`: `POST conversations/[id]/reply`, `POST escalations/[id]/resolve`, `PATCH workspaces` and `PUT settings` drop what the lens held).

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/receptionist/receptionist-surface.test.mjs`
Expected: FAIL (the module does not exist).

- [ ] **Step 3: Implement.**
  - The debounce, from the other lane exactly: `git show c39702657 -- apps/dashboard/src/surfaces/reports/period-surface.ts` is a diff of `period-surface.ts` only (a read of another lane's commit; it changes nothing here); apply it to this file unchanged (`git show c39702657 -- apps/dashboard/src/surfaces/reports/period-surface.ts | git apply`; if the context does not match, make the same hunks by hand, line for line), so the two branches make the same lines and merge clean. It widens `live` to `Pick<SurfaceOverride, "refreshOnTables" | "refreshWhen" | "debounceMs">` and updates two comments; `...live` already spreads the option onto the override.
  - The registrations as in "Produces", beside the Reviews ones (each is a one- or two-line change; the comments in those files that name the Reviews lens alone now name both).
  - `tooling/scripts/tests/_legacy-react.mjs`: the stub's list gets `["reports_receptionist", "surface:reports_receptionist"]` beside the reviews line.

- [ ] **Step 4: Run to verify**, one per command, each of the Test files above, then `tooling/scripts/tests/shell/surfaces/route-prefetch.test.mjs`, `tooling/scripts/tests/shell/surfaces/held-views.test.mjs`, `tooling/scripts/tests/shell/surfaces/zone-remembered.test.mjs`, `tooling/scripts/tests/shell/surfaces/read-cache.test.mjs`, `corepack pnpm --filter @chanlytics/dashboard typecheck`, `corepack pnpm lint`, and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (`legacy-bridge` takes no new file: it stays at 34).
Expected: PASS; `surface-registry`'s "every key is classified" tests name the new key.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/surfaces/reports/receptionist-surface.ts apps/dashboard/src/surfaces/reports/period-surface.ts apps/dashboard/src/surfaces/surface-values.ts apps/dashboard/src/legacy-bridge/LegacyApp.tsx apps/dashboard/src/legacy-bridge/surface-registry.ts apps/dashboard/src/surfaces/reports/period.ts apps/dashboard/src/legacy-bridge/refresh-map.ts tooling/scripts/tests/_legacy-react.mjs tooling/scripts/tests/reports tooling/scripts/tests/shell/surfaces
```

---

### Task 12: The page: the lens in five parts, the demo sample, and the defects on the page

**Files:**
- Create: `apps/dashboard/src/surfaces/reports/lenses/receptionist-mix.tsx`, `apps/dashboard/src/surfaces/reports/lenses/receptionist-time.tsx`
- Modify: `apps/dashboard/src/surfaces/reports/lenses/receptionist.tsx` (rebuilt), `apps/dashboard/src/surfaces/reports/reports-page.tsx` (the follower, `lensBody`, `busy`), `apps/dashboard/src/surfaces/reports/sample.ts` (`receptionistSample`), `apps/dashboard/src/surfaces/reports/series.ts` (drop `rptMood`), `apps/dashboard/src/legacy/styles/reports.css` (layout only), `packages/contracts/src/reports/report-lens.ts` (nothing new unless a type is read)
- Test: `tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs` (`BODIES.receptionist` line 83, the draw helper line ~75), `tooling/scripts/tests/reports/reports-page.test.mjs` (lines 399-500), `tooling/scripts/tests/reports/reports-sample.test.mjs`, `tooling/scripts/tests/reports/lenses/report-metric-words.test.mjs` (the strip's four figures name their metrics), `tooling/scripts/tests/reports/receptionist/receptionist-page.test.mjs` (new)

**Interfaces:**
- Consumes: `useFollower("reports_receptionist")` and `Follower` (`use-surface.ts:43,54`), `ReceptionistSurface` (Task 11), `toReceptionistReportVM`, `ReceptionistReportVM` from `@chanlytics/contracts/report-lens` (Task 9), `RptStrip`, `RptFigure`, `RptBooked`, `RptSection` (`blocks.tsx`), `DotPlot` (Task 4), `ChartCard`, `SegmentBar`, `BarList`, `EmptyState`, `FailedRead`, `routeDoor` (`legacy-verbs.ts:492`), `vm.replyTime.dots` and `vm.lines.receptionist` (Task 5), `ReportVM`/`ReportsSurface`.
- Produces: `ReceptionistLens({ R, pick, phone, own }: LensProps & { own: Follower<ReceptionistSurface> })`; `lensBody` in `reports-page.tsx` takes the follower; `receptionistSample(range: ReportRange, today?: string): ReceptionistSurface` in `sample.ts` (a DTO from deterministic numbers, `readAt` the sample's own clock; it is folded by the page through the real `toReceptionistReportVM`). New test ids: `receptionist-strip`, `chart-hold`, `chart-topics`, `chart-languages`, `chart-call-endings`, `receptionist-link`, `receptionist-time`, `receptionist-handover`, `receptionist-missed`, `receptionist-closed`, `receptionist-stuck`, `receptionist-failed`; the kept ones stay: `chart-answered`, `chart-reply`, `chart-reasons`, `chart-calls`, `chart-booking`.

What the page draws, in order (the lens is `R.vm.empty` -> `nothingCameIn` as today; otherwise):
1. **The head** (nothing to draw here: `head.ts` already asks `lensAnswerOf`).
2. **Against before:** `<RptStrip tiles={[messages, answered, reply, needed from R.vm.tiles by id]} className="quad" testid="receptionist-strip" />`.
3. **The mix**, a `rpt-grid`: *Who answered, day by day* (kept: `answeredCard`); *Why it stopped* (kept, but its rows are NOT doors: no `onPick`, no `navigate("inbox")`; the Inbox takes no reason, and part 5's "Waiting on you" holds the door); *In the hold* (`chart-hold`: `SegmentBar`/`BarList` of `own.hold.rows` and the `line`); *What they asked about* (`chart-topics`: `BarList` of the rows, the `line` as takeaway); *Replied in* (`chart-languages`, only when the VM has it); *Calls* (kept, the mood `SegmentBar` coloured by `rptSpread(vm.calls.sentiments)`, never `--ok`/`--danger`) with *How calls ended* (`chart-call-endings`) beside it; *Asked, then booked* (kept, with the link line, `receptionist-link`, under it).
4. **Time between steps** (`receptionist-time`): *How fast it answers* (`chart-reply`): `DotPlot` of `vm.replyTime.dots` over `vm.speed.points` (the days), `reference: { value: 0, label: "your {hold.label} hold ends" }` where `vm.replyTime.hold` exists (none otherwise), the spread `SegmentBar` kept under it, the table twin made from the dots by day; then the figures of `own.handover` (`receptionist-handover`), `own.missed` (`receptionist-missed`), `own.closed` (`receptionist-closed`; unset draws its door).
5. **Stuck now** (`receptionist-stuck`): `RptStrip` of `own.stuck` with their doors (`routeDoor`).

While `own` is `coming` the kept cards draw from `R` and the new ones draw nothing; `failed` draws one `FailedRead` (`kind="card"`, `what="the receptionist's other numbers"`, `surface="reports_receptionist"`, `testid="receptionist-failed"`) in their place; `available === false` (no function yet) draws none of the new parts and no failure. A figure never draws a number the VM did not give.

- [ ] **Step 1: Write the failing tests**
  - `receptionist-page.test.mjs` (the stub React and the `draw` helper of `reports-lens-page.test.mjs`, with `setSurfaceValue("reports_receptionist", { dto, key: "30d", readAt })`; `dto` from Task 9's `FACTS` through `dtoWith`):
    - `"the five parts, in order, for a workspace that has everything"`: the test ids appear in this order: `receptionist-strip`, `chart-answered`, `chart-reasons`, `chart-hold`, `chart-topics`, `chart-languages`, `chart-calls`, `chart-call-endings`, `chart-booking`, `chart-reply`, `receptionist-handover`, `receptionist-missed`, `receptionist-closed`, `receptionist-stuck`; the strip has four figures with metrics `customer_messages`, `answered_share`, `reply_median`, `handovers`.
    - `"Why it stopped is not a door"`: `chart-reasons`' `BarList` has `onPick` null (`find(tree, n => n.props?.onPick)` is absent in that card), and nothing in the lens calls `navigate`.
    - `"the stuck figures are doors"`: `Waiting on you` has `href "#/inbox"`, `Call-backs` `href "#/today"`, `Replies held back` `href "#/inbox"`.
    - `"the reply card plots each reply past its hold"`: a `DotPlot` with `dots.length === vm.replyTime.dots.length`, `reference.value === 0` and a label naming the hold; no `LineChart` in `chart-reply`.
    - `"the caller's mood wears the ramp, not red and green"`: the calls card's `SegmentBar` config colours match `/^var\(--chart-ramp-\d\)$/`.
    - `"its own read out: the kept cards stand and the new ones are absent; failed: one failed read with its Retry on the surface; no function yet: nothing of them and no failure"`.
    - `"a figure with too few is greyed and says so"`: with `handover.now.replied.n = 3` the first-reply figure draws `n=3, minN=5` (the kit greys it).
    - `"no hours: the closed figure says so and holds the door to set them; no profile: no figure"`.
    - `"an email-only workspace: no languages card, topics say what they cover"`.
    - `"a quiet period: no card draws a bar of zeros or a 0%"`.
  - `reports-sample.test.mjs`: `receptionistSample("30d")` folds through the real `toReceptionistReportVM` with every part available and consistent: the hold outcomes add to `hold.now.total`, `topics.stamped <= topics.of`, `after_hours` sums to at most the messages, `stuck.waiting <= stuck.open`, no `NaN`; the same range on the same day is the same object; a picked range (`{from,to}`) is named by its key.
  - `reports-page.test.mjs`/`reports-lens-page.test.mjs`: `BODIES.receptionist` lists the new ids; the dim-by-period rule also holds while `own.state === "coming"` on this lens.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/receptionist/receptionist-page.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement.** `receptionist.tsx` keeps `answeredCard`, `reasonsCard` (minus the door), `callsCard` and assembles the parts; `receptionist-mix.tsx` holds `holdCard`, `topicsCard`, `languagesCard`, `callEndingsCard`, `linkLine`; `receptionist-time.tsx` holds `speedCard` (the DotPlot, its table twin from the dots), `timeFigures`, `stuckFigures`. The fold runs once per `own.value.dto` with `useMemo`, `nowMs: own.value.readAt`. `reports-page.tsx`: `const receptionist = useFollower("reports_receptionist")`; in a demo session with no read, `receptionist = { value: receptionistSample(R.range), state: "current" }`; `busy` also holds while `lens === "receptionist" && receptionist.state === "coming"`; `lensBody` passes it. `reports.css`: `.rpt-figures.quad { --cells: 4 }` and `.rpt-figures.trio { --cells: 3 }` with the responsive collapse the `.listing` rules have (lines 239-246), nothing else; no kit class named, no primitive word in a new class name.

- [ ] **Step 4: Run to verify**, one per command: `receptionist-page.test.mjs`, `reports-lens-page.test.mjs`, `reports-page.test.mjs`, `reports-sample.test.mjs`, `report-metric-words.test.mjs`, `tooling/scripts/tests/reports/reports-seam.test.mjs`, `tooling/scripts/tests/reports/reports-honest.test.mjs`, `tooling/scripts/tests/shell/chart-kit.test.mjs`; `corepack pnpm --filter @chanlytics/dashboard typecheck`; `corepack pnpm lint`; `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (`kit-primitives.json`, `style-values.json` and `inline-styles.json` must not move; any function over its limits is a red build). Then look at the page in the demo: `corepack pnpm --filter @chanlytics/dashboard dev` and `/w/<slug>/reports/receptionist` in a demo session at 1440 and 390 wide, both themes (a dev server is not a production build; stop it afterwards).
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/surfaces/reports/lenses apps/dashboard/src/surfaces/reports/reports-page.tsx apps/dashboard/src/surfaces/reports/sample.ts apps/dashboard/src/surfaces/reports/series.ts apps/dashboard/src/legacy/styles/reports.css tooling/scripts/tests/reports packages/contracts/src/reports/report-lens.ts packages/contracts/dist
```

---

### Task 13: Ask says what the page shows

**Files:**
- Modify: `apps/dashboard/src/server/ask/tools/read/report.ts` (the loads at lines 88-98, a `receptionistSaid`, the description at line 145), `tooling/scripts/tests/ask/ask-registry.test.mjs` (a `REPORT_RECEPTIONIST_WORDS` constant beside line 92 and one more `.replace` in the chain at line 383), `tooling/scripts/tests/fixtures/ask-tools-4-7.json` (the `report` description, four lines, one per role), `tooling/scripts/tests/ask/ask-turn.test.mjs` (the report cases), `tooling/scripts/tests/ask/ask-tool-names.test.mjs` (the report case and its reads)

**Interfaces:**
- Consumes: `receptionistReport` (Task 10), `toReceptionistReportVM`, `ReceptionistReportVM` (Task 9, from the package root: Ask is server code), `unread(t, "report", "receptionist")` (`ask/tools/context.ts:200`), `reviewsSaid` (the pattern, `report.ts:64`).
- Produces: the report tool's answer gains `receptionist`: `{ error: "the receptionist numbers could not be read just now" }` where the read failed (never "nothing"); `{ available: false }` where the database has no function yet; else

```ts
{ hold: { rows: string[], line }, topics: { rows: string[], line } | { empty }, languages: string[] | null,
  call_endings: string[], link: line, handover: [{ label, value, meta, change }],
  missed: { label, value, meta, change }, closed: { value, meta } | null,
  stuck: [{ label, value, meta }], held_back: string[] }
```
  (rows as `"label: value"`, the page's own lines and the figures' own `label/value/meta/compare`, every sentence from the one fold). The description gains one sentence naming `receptionist`, after the Reviews one. **No model call and no eval.**

- [ ] **Step 1: Write the failing tests.** `ask-turn.test.mjs`: the real tool over four worlds (a scripted `receptionist_series` answer: Task 9's `FACTS` as the SQL's raw shape with `links.people` and `stuck.open`; a database with no function; an unscripted rpc that fails; an empty period) and each exact object as above, including `held_back[0] === "A person had the thread: 3"` and `stuck[0].value === "2"` for a world with the four open escalations of Task 10. `ask-tool-names.test.mjs`: the report's reads gain `receptionist_series` and the people read only when links exist. `ask-registry.test.mjs`: the chain is `was(role, "report").description.replace(…hold…).replace(…campaigns…).replace(…reviews…).replace("reviews says linked false where no Google listing is linked, and error where its numbers could not be read.", REPORT_RECEPTIONIST_WORDS)` for every role, and `words(tool)` otherwise unchanged.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-registry.test.mjs`
Expected: FAIL (the registry's description is the old one while the test expects the new sentence).

- [ ] **Step 3: Implement** the tool, then re-freeze the fixture ONLY on its lines: run the registry test to read the new description for each role, then replace the old `report` description string by the new in `ask-tools-4-7.json` with a one-off script written to the scratchpad directory (read the file as text, replace the exact JSON-escaped string, require exactly four replacements, write it back; the file is not `JSON.stringify(…, 2)`-shaped, so the text is edited, not reserialised). `git diff --stat tooling/scripts/tests/fixtures/ask-tools-4-7.json` must show four changed lines and nothing else.

- [ ] **Step 4: Run to verify**, one per command: `ask-registry.test.mjs`, `ask-turn.test.mjs`, `ask-tool-names.test.mjs`, `tooling/scripts/tests/ask/readers.test.mjs`, then the whole folder once: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask`.
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/server/ask/tools/read/report.ts tooling/scripts/tests/ask/ask-registry.test.mjs tooling/scripts/tests/ask/ask-turn.test.mjs tooling/scripts/tests/ask/ask-tool-names.test.mjs tooling/scripts/tests/fixtures/ask-tools-4-7.json
```

---

### Task 14: The nightly's workspace shows the lens, and the e2e spec reads it

**Files:**
- Modify: `tooling/scripts/ops/e2e-workspace.mjs` (a `convergeReceptionist(db, T, ownerId, now)` called after `convergeGoogle`, line ~996; the config's hours; the header's "no escalation" line ~47; `verify`, line 1457), `e2e/reports.spec.ts` (the Overview test around line 105; the address test around line 190), `tooling/scripts/tests/e2e/e2e-workspace.test.mjs`
- Test: `tooling/scripts/tests/e2e/e2e-workspace.test.mjs` (executed over the in-memory database), `e2e/reports.spec.ts` (runs nightly against the seeded workspace)

**Interfaces:**
- Consumes: the seed's existing helpers (`must`, `emitEvent` from `@chanlytics/db`, `PEOPLE`, `TIMEZONE = "America/New_York"`, `SLUG`), the rows' shapes in this plan's Task 7.
- Produces: rows with `external_id` prefix `e2e-seed-r-` (deleted and written again every run, re-dated from `now`), all terminal, none for a sweep to select:
  - in Sam Example's own conversation (not Robin's, whose messages the other specs read; every message dated at least 3 hours before the first conversation's reply so `verify`'s "newest conversation" stays Robin's): inbound customer messages on `whatsapp` with `meta.intent` `booking` ×3 and `pricing` ×2, `meta.handled` `ai`; one inbound `email` with `meta: { email: { claim: "automated" } }` (it must not be counted anywhere); outbound `ai` replies `status 'delivered'` with `meta.language` `en` ×4 and `es` ×1; held drafts `status 'delivered'` with `meta { source: "veto_window", delay_ms: 60000 }`, one `status 'canceled'` with no `error`, one `canceled` with `error { reason: "steered" }`;
  - two resolved escalations (`reason 'human_token'`, `state 'resolved'`, `created_at`/`resolved_at` set explicitly, inserted resolved: the stamp trigger is on UPDATE only) with an outbound `sender 'human'` message 10 minutes after each; **no open escalation** (the deadman pages the platform for one);
  - one call with `status 'not_connected'`, `direction 'inbound'`, `notified_at` set, `retell_call_id 'e2e-seed-r-missed'` (a not-connected call writes no note and starts no sweep);
  - one `message.send_blocked` event `{ reason: "human_has_it", purpose: "conversational" }` through `emitEvent`;
  - the config's `brain.profile.hours` for `mon` to `fri` 09:00-17:00 (the schema is `TenantConfigWriteSchema`; the seed already builds its config at line ~506), so the closed figure is a number.
  - `verify` additionally requires: the missed call exists and is not connected, the two escalations are resolved with `resolved_at`, none is open, no `queued` message exists in the workspace.

- [ ] **Step 1: Write the failing tests.** `e2e-workspace.test.mjs`: after `main({ apply: true })` over the in-memory database the rows above exist (counts by kind and status); a second run changes nothing but the dates; `verify` returns a problem when an open escalation or a queued message is planted; the header comment no longer says "no escalation" without "open". `e2e/reports.spec.ts` (written now, run nightly): in the Overview test, after clicking `lens-receptionist` assert the cards `chart-hold`, `chart-topics`, `chart-call-endings`, `receptionist-time`, `receptionist-stuck` are visible and `receptionist-strip` has four `.figure`s with labels `["customer messages", "receptionist answered", "median reply time", "needed you"]` (lower-cased); `chart-reasons` has no `button.ck-barlist-row`; the hold card's text says `"went out as the hold ended"`; the stuck figure `Waiting on you` has value `0` or a count and `a[href$="/inbox"]`; and the automated email is in no count: `customer messages` on the strip equals the seed's persons' words (read the number from `GET /api/v1/reports?period=30d` with `apiGet` and assert the strip says the same `answered`-total, never a hard-coded number). In the address test: `/w/<slug>/reports/receptionist` loads on its own with `lens-receptionist` `aria-current`, and a pick of `7d` makes a GET to `/api/v1/reports/receptionist` with `period=7d` and requests no document.

- [ ] **Step 2: Run to see the unit test fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/e2e/e2e-workspace.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement** `convergeReceptionist` (delete the previous night's `e2e-seed-r-*` rows first, with the file's `deleteWhere`, then insert) and the hours; before touching the dates, `grep -rn "conversations\|toHaveCount" e2e` for any spec that counts Inbox or Conversations rows or Sam's conversation: a spec that counts exactly gets its number updated in this task.

- [ ] **Step 4: Run to verify**: `e2e-workspace.test.mjs`; `corepack pnpm exec playwright test --list e2e/reports.spec.ts` (the spec compiles; it runs against production nightly and is not run here); `corepack pnpm lint`; `corepack pnpm -r typecheck`.
Expected: PASS. Dry-run the script only: `node tooling/scripts/ops/e2e-workspace.mjs` (no `--apply`; it needs the env and writes nothing).

- [ ] **Step 5: Stage**

```bash
git add tooling/scripts/ops/e2e-workspace.mjs tooling/scripts/tests/e2e/e2e-workspace.test.mjs e2e/reports.spec.ts
```

---

### Task 15: The bundle, the documents, the register and the whole-lane check

**Files:**
- Modify: `tooling/scripts/tests/baselines/bundle-budget.json` (by `check:bundle`), `tooling/scripts/tests/baselines/dead-exports.json` (a fall), `docs/debt.md` (a "Rises" row and the regenerated register), `docs/takeover.md` (regenerated with it), `docs/data-model.md` (regenerated), `docs/system-prd.md` (the surface table near line 645: a `reports_receptionist` row; the `reports` row's reads), `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (§6.4 rows and §9's Receptionist table statuses), `C:\Users\Ruben\Documents\Claude Projects\Claude Video\docs\reports-canvas\2026-10-10-reports-phase-c-review.md` (§5's Receptionist built; §3's rows for the head, Booked, automated email, mood, the Inbox door fixed), `docs/runbook.md` only if a command it names changed
- Test: the changed tests and the repo ratchets, below

**Interfaces:**
- Consumes: everything above. Produces: a lane in which the checks named under "Run" are green.

- [ ] **Step 1: Measure the bundle once.** Build the packages (`corepack pnpm --filter "./packages/*" build`) and git must show no unexpected dist drift (`git diff --stat -- packages/*/dist` only the files this lane changed). Then ONE production build of the dashboard with placeholder public env (Git Bash: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder corepack pnpm --filter @chanlytics/dashboard build`; PowerShell: set both with `$env:` first), then `corepack pnpm check:bundle`. **Delete `apps/dashboard/.next` immediately after the numbers are written down** (and `Remove-Item -Recurse -Force apps/dashboard/.next` is the command on this machine). The "before" is `tooling/scripts/tests/baselines/bundle-budget.json` as it stands (main's own record): route JS 769,653, route CSS 151,340, `reports` 78,137.
  - **Route JS must not exceed 769,653.** If it does, STOP and report the measured growth and the largest movers (`check:bundle` prints them) to the controller; do not raise the route's number and do not build a second time before a reclaim is agreed. (The reclaim this plan counts on is `METRIC_WORDS`, 19 definitions, plus the pages' folds already outside the route; the fallback candidates are the other folds the surfaces run on the route: `toReviewsReportVM`, `toCampaignReportVM`, `toReachOutReportVM`, each by the same publish-the-DTO move, each its own piece of work.)
  - If route JS fell, bank it: `corepack pnpm check:bundle -- --update`. The Reports page grew: `corepack pnpm check:bundle -- --raise reports=<bytes>` by the growth the output prints (never to what was measured), and route CSS likewise if it rose.

- [ ] **Step 2: The register.** Add the "Rises" row to `docs/debt.md` (table at line ~72, three columns: Rise, Why, Falls when): "The Reports page's own JS budget 78,137 to N, +G; route CSS (if raised) …: the Receptionist lens, drawn from what is stored (10 October 2026)"; why: the five parts, the DotPlot, the Figure's n, the fold page-only; falls when: the page's chunk stops repeating what the route shares (the pages that fold DTOs). Regenerate the register's numbers: `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs` (banks only falls: dead exports `callMoodTone` and the metric words; run `corepack pnpm check:dead-exports` first and `-- --update` if it fell, **never** `--raise`). `corepack pnpm gen:data-model` (no stack needed).

- [ ] **Step 3: The documents.** `docs/system-prd.md`: the surface table gets `reports_receptionist | /reports/receptionist | — (read through useFollower("reports_receptionist"): the Receptionist lens's new parts) | messages, escalations, calls, while the lens is on screen, 800 ms after the last change; on-demand: …` in the style of the `reports_reviews` row; the spec's §6.4 SQL/Route/Reader/Surface rows name `receptionist_series` (00380), `receptionistReport`, `reports_receptionist` and the page-only entry; §9's Receptionist rows move from "Now"/"K4" to built, with the "sooner" bucket struck (no "send now" exists) and "reopened conversations" and "handling time" struck (review §5 avoid list); the review document's Receptionist section is marked built with the date and this PR's number once it has one. A count written in prose carries its date (`tooling/scripts/tests/docs/counts-are-dated.test.mjs`), and a path in the docs opens something (`tooling/scripts/tests/docs/docs-paths.test.mjs`).

- [ ] **Step 4: Run, one per command** (the lane's own files, then the ratchets):
  - `node tooling/scripts/checks/test.mjs` on each of: `tooling/scripts/tests/reports/receptionist/receptionist-report.test.mjs`, `receptionist-surface.test.mjs`, `receptionist-page.test.mjs`, `tooling/scripts/tests/reports/reports-lines.test.mjs`, `reports-vm.test.mjs`, `reports-page.test.mjs`, `reports-sample.test.mjs`, `reports-where-when.test.mjs`, `tooling/scripts/tests/reports/lenses` (the folder), `tooling/scripts/tests/reports/periods` (the folder), `tooling/scripts/tests/reports/headline` (the folder), `tooling/scripts/tests/ask` (the folder), `tooling/scripts/tests/shell/surfaces` (the folder), `tooling/scripts/tests/shell/chart-kit.test.mjs`, `tooling/scripts/tests/styles` (the folder), `tooling/scripts/tests/shipping/browser-entry.test.mjs`, `tooling/scripts/tests/e2e/e2e-workspace.test.mjs`, `tooling/scripts/tests/database/migrations.test.mjs`, `tooling/scripts/tests/database/migration-ledger.test.mjs`, `tooling/scripts/tests/docs` (the folder: data-model, paths, dated counts), `tooling/scripts/tests/routes` (the folder: policy, api reference), `tooling/scripts/tests/repo` (the folder: ratchets, barrels, cycles, source-scan).
  - `TEST_TZ=Pacific/Auckland` for `receptionist-report.test.mjs` and `reports-page.test.mjs` (PowerShell: `$env:TEST_TZ='Pacific/Auckland'`).
  - `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`, `corepack pnpm check:dead-exports`, `node tooling/scripts/gen/route-types.mjs --check`, `node tooling/scripts/gen/contracts-browser-entry.mjs --check`, `git status` shows no dist drift beyond the files this lane staged or changed.
  Expected: all PASS; dead exports end at or below the baseline they started at (every export this lane added has a non-test reader by now: say any that does not and why).

- [ ] **Step 5: Stage**

```bash
git add tooling/scripts/tests/baselines/bundle-budget.json tooling/scripts/tests/baselines/dead-exports.json docs/debt.md docs/takeover.md docs/data-model.md docs/system-prd.md docs/superpowers/specs/2026-10-02-reports-lenses-design.md docs/superpowers/plans/2026-10-10-reports-c2-receptionist.md
```

(The review document lives outside the repository checkout and is edited in place; it is not staged.)

---

## Open questions (not settled by the code; each has the default the tasks are written for)

1. **Route JS.** Whether moving `METRIC_WORDS` out pays for the new surface's registration cannot be known without a build; Task 15 measures once and stops if the route is over 769,653 (it does not raise the ceiling). Default: it pays.
2. **The thin figure's words.** The brief says the Figure "says 'n too small'"; the plan writes "only N, too few to read" (an owner's words, in one private function of `figure.tsx`). Default: the plan's words.
3. **"Booked after the link" reads the people pool a second time** (the frame's `report` read already does, for asked-then-booked), only when links exist and the window ends today. Default: accept it.
4. **`platform_metrics_roll.messages_in`** (operator-only, K10) still counts automated mail as arrived, while its `asks` now follows `first_replies`. Default: left, argued in Task 6.
5. **The nightly workspace's new rows** go in Sam Example's own conversation; a spec that counts Inbox or Conversations rows exactly may need its number (Task 14 greps for it). Default: update the spec.
6. **A reason filter for the Inbox** would make "Why it stopped" a door again; the Inbox's address takes a thread id only. Default: not this lane.

## Self-review (run once, fixed inline)

- **Spec coverage.** D4 the head: Task 5. D7's five parts: Task 12 (parts 1-5) over Tasks 7-11. D8 stock as of now plus door: `stuck` (Tasks 7, 9, 10, 12). D9 absent never zero, ratio with n, grey under 5: Tasks 3, 9, 12. D10 colours: Task 5 (mood), Task 12. D13 no score: none drawn. D14 reply speed against the hold: Tasks 4, 5, 12. D15 automated sends never "you": Task 7 (`automated_send` on the first-reply and the touch). D16 hours: Task 9 (`closedOf`). D19 no open rates: none. §6.4 one read per lens: Tasks 7-11. §13 testing: each task. The brief's items: R0 (Task 6), R1 (Task 7), the route/policy/client/api (Task 10), the groundwork (Tasks 1-4), `days=` (Task 2), defects (Tasks 5, 12; the unfiltered Inbox door in Task 12; automated mail Task 6), Ask (Task 13), demo (Task 12), e2e and seed (Task 14), bundle and docs (Task 15), debounce copied (Task 11).
- **Names consistent.** `REPORT_MIN_N` (Task 3) is read by Task 9; `ReportStripTile` gets `door/n/minN` in Task 3 and `ReceptionistFigureVM extends ReportStripTile` in Task 9; `replyDotsOf`/`ReplyDotVM`/`replyTime.dots` (Task 5) are drawn in Task 12; `receptionistSeries` (Task 8), `isReceptionistSeriesDto`/`receptionistDtoOf` (Task 9) are the reader's in Task 10; `ReceptionistSurface { dto, key, readAt }` (Task 11) is the page's in Task 12; `receptionistReport` (Task 10) is Ask's in Task 13; the SQL's raw shape (Task 7) is `ReceptionistSeriesDto` (Task 9).
- **Proportion.** Signatures, definitions, test names and values; the SQL's shape and rules are given because the signature does not determine them; no function body is written out.
