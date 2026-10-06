# Reports, finished (phase B, part 2): Today reads one small headline, Reports boots only where it is drawn, and part 1's loose ends are cleared — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reports, finished. Three things, in this order. (1) The loose ends of part 1 (#1424) are cleared: the Reviews lens stops saying "Find your business on Google once" before Google has been read, the page's own tile and its dozen rules give way to the kit's figure, doors are links, native tooltips go, the period control no longer holds, and the duplicates, the dead rules, the false docs and the source-text tests are gone (Tasks 1 to 3). (2) Today stops paying for Reports' whole read: its period line and Worth a look read one small `GET reports/headline` (the same `report_series`, summed on the server by the period derivation the page's view model is built from, plus the booking line counted by the one function the report counts it with), through a surface of their own held by period; the `__REPORTS` window mirror is deleted and every reader of it moves to the seam (Tasks 4 to 8). (3) Reports **boots only where it is drawn**: the runner learns a surface that is read where its page is on screen and nowhere else, so every other page's boot stops reading the report, its campaigns and its reach-outs, which it did on every page (Task 9). And Today's sentences about reply speed say a reply that waited the owner's hold went out "as your 1-minute hold ended", by the one rule contracts already holds (spec D14, deferred from phase A, and D17, §6.5; Tasks 10 and 11). Task 12 measures what stopped; Task 13 is the docs and the verification.

**Architecture:** One derivation. `headlineOf` (contracts, `reports.ts`) sums a `ReportDto` with `periodFactsOf` and `answeredOf`, the facts `toReportVM` is built from, and answers a DTO of counts (`ReportHeadlineDto`: eleven fields, no day of the series); `toHeadlineVM` words it for Today and is what `todayPeriodLine` and `todayLeaks` now read (`ReportsLike` and its look-alike tiles are deleted). The reader `reportHeadline` (in `readers/report.ts`, which already holds `ReportQuery` and `reportDaysFor`) calls `reportSeries` and the report reader's own booking code, moved to one function `bookingOf` that both readers call. The route is `GET /api/v1/reports/headline?period=`. A surface override `reports_headline` (`surfaces/reports/headline.ts`) follows the period Reports shows, holds its views by period with when each was read, and is read at boot, on return, on Retry, after a zone is saved, as Today comes back after a few minutes, and on a period pick only when none is held for the period or the held one is old; Today's two pages read it with `useSurface("reports_headline")` and its failure with `useSurfaceFailed`. `SurfaceOverride` gains `onDemand` and `isStale` (`legacy-bridge/surface-data.ts`): the runner's boot skips an on-demand surface in its second pass and a return skips it unless the page on screen draws it, and `readWhatWasMissed` (`surface-registry.ts`), which hears every move of the address, reads it as a page that draws it comes on screen. Reply speed rides the day's metrics instead: `metricsSummaryFor` reads the day's first replies (`first_replies`, already granted, through `packages/db`) beside `metrics_summary`, computes `holdOf` over them on the server and puts a four-number summary on `MetricsSummaryDto` (`reply_hold`), so the browser's `toTodayVM`, `GET today` for the phone app and Ask's `today` reader all say the same words from the one rule, with no copy of the ten-second slack.

**Tech Stack:** Next.js App Router route and readers (`apps/dashboard`), TypeScript (`packages/contracts`, `packages/db`), the surface seam and runner (`legacy-bridge`, `surfaces`), `node:test` through `tooling/scripts/checks/test.mjs`, the in-memory database double (`tooling/scripts/tests/_fake-db.mjs`). No migration, no new SQL.

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (D14, D17, §6.5, §12 "Fix today's page (phase A)" for the deferred reply-speed item, §13, §14). Part 1 (#1424, the frame) is on main; its plan is `docs/superpowers/plans/2026-10-05-reports-b1-the-frame.md`, whose "Not in this plan" names this part.

**Written against** `decd19522` (origin/main, 5 Oct 2026, which holds #1424 as `bf2365fb9`; merged into `reports/b2-todays-reads` as `b734a152e`), on branch `reports/b2-todays-reads`. Every path, name and line below was read on that tree; a line number is a locator, so re-find it by its text if main has moved. The dist files and `packages/db/src/index.ts` moved on main after the first draft: the one line this plan cites there, the `reportSeries` export, is unchanged.

---

## What this pull request is, and is not

It is PR 2 of phase B, and it finishes Reports. Its title: **"Reports, finished: Today reads a small headline, Reports boots where drawn, part 1 cleared"** (90 characters; the brief's own wording, "Reports, finished: Today reads one small headline, Reports boots only where it is drawn, and part 1's loose ends are cleared", is 124, over the 100 it asked the title to stay under, so the title says the same in fewer words). It adds one GET route and no migration; every task ends green (its own tests, `corepack pnpm -r typecheck` where a package or a type moved, and the ratchets it touches).

What a customer sees: nothing changes in Today's words (a test builds the old sentences from `toReportVM` and the new ones from the headline over the same series and holds them equal), except one: where most of a day's replies waited the owner's hold, "typically in 1m" becomes "typically as your 1-minute hold ended". On Reports, three things are no longer wrong: the Reviews lens does not say nothing is linked before Google has been read or after a read failed, a one-day period says "1 day", and the period control can be arrowed on to Month while a period loads.

What stops, **measured on the real runner (Task 12)**: **no page but Reports reads `GET reports`, `reports/campaigns` and `reports/reach-outs` any more**. Until now the runner booted every override it was given a moment after any page loaded, as a "stranger" in its second pass, so the Inbox, People and Today each paid for the report beside their own page; Today then reads one small `reports/headline` instead, and Reports reads its three where it is on screen, as before. What does **not** stop, said plainly: the headline's booking line is still counted on the server from the people pool and the calendar feed (phase C moves it into SQL), and Reports itself still reads its three routes on open.

### Not in this plan

- **Per-lens figures on the Overview, "Export this lens", Ask's `lens` parameter and its eval case** (phase C). The headline is built so the Overview can read it; nothing here draws it there.
- **"A person is new by one rule"** (`person_moments.new_at`, part 3, with its own runbook).
- **Any change to the Reports page itself** beyond clearing part 1's loose ends (Tasks 1 to 3) and leaving `__REPORTS`: its surface, its lenses, its period control's choices and its reads stand.
- **`report_headline` as SQL** (spec §6.5) and with it the end of the people-pool and calendar-feed read for the booking line. The brief for this part keeps booking on the server by the same function, so §14's "Today's boot: no read of the people pool or the feed for Reports' sake" is met in phase C, when booking moves into SQL; what this part removes is named in Task 12.
- **Today's two one-message waits**: the card's "answered in 1m 18s" (the messages figure's clause) and the proof's "answered 1m 18s later" say how long the last reply took after its question: one measured wait, which is true as it stands, not a claim about the receptionist's speed.
- **A head-started read for the headline** (`PREFETCH_READS.today` in `contracts/shell/chrome.ts`) and **a live-feed rule for it** (Choice 5).
- **A demo sample for Today's period line**: Today has none (decision 0015, step 4) and none is added.
- **Accepted as they are** (part 1's review named them; none is changed here): `ReportQuery` and `reportDaysFor` stay in `readers/report.ts` (`server/` root and `server/readers/` are both at their module limits, so a module of their own would breach the tree-shape rule); the 760px phone check in `blocks.tsx` (`useRptPhone`, held by the breakpoints baseline; the page's own redesign moves it); **Month against a request that crosses local midnight** (the day's count is read once at the request, and a request that straddles midnight may say the day before); and **the old `chanlytics.report.days` storage key** (read once, never written, until the day the `days` parameter ends).

## Choices this plan makes where the brief did not settle them

1. **The headline follows the member's chosen Reports period, not a fixed one.** Today's words today are the one `reports` surface's, and that surface is read for `reportPeriod`, the stored choice (`surfaces/reports/surface.ts`, `view: () => reportPeriod`); `todayPeriodLine` leads with the report's `period.now` and `todayLeaks` says "the last ${reports.vm.rangeLabel}" (`contracts/today/today-period.ts`, `today-leaks.ts`). A fixed 30 days would change the words, the thresholds' meaning and the Month case for every member who picked another period; following it keeps them, and it is what spec §6.5 has the Overview read too. The cost is one coupling, paid once: `shownReportPeriod()` is exported from `surface.ts` (Task 1; the one state, never a second reader of the storage key), and `setReportRange` paints a held headline and re-reads it only when it must (Task 6).
2. **The DTO holds counts and two derived facts, computed once on the server; the view model is Today's, not the report's.** `ReportHeadlineDto` carries `messages_in`, `messages_before` (null where the period before had no message and no call: `compareWords`' `priorHadAny`), the three answered counts, `answered_share`, `calls`, `empty`, the period, its days and the booking DTO. `empty` and `answered_share` are the facts `periodFactsOf` (new field `empty`) and `answeredOf` already compute for `toReportVM`; the view model recomputes neither (a third spelling of a share would be a bug even if it agreed). `ReportHeadlineVM` is flat and named for what Today says (`lead`, `rangeLabel`, `messages.compare`, `answered.share`, `calls`, `booking`); it has no tiles and no `vm` wrapper, and `ReportsLike`, `WeekTileLike` and the cases they allowed (`campaigns: null`, a `vm` with no `answered`) are deleted with their tests.
3. **`headlineOf` lives in `reports.ts`**, beside `toReportVM`, because `periodFactsOf` and `answeredOf` are file-private there (only the type `PeriodFacts` is exported) and exporting the internals so a neighbour could rebuild a second summary is how a count gets counted twice. Two one-word helpers come out of `periodFactsOf`/`toReportVM` so the headline says them once: `rangeLabelOf(days)` and `periodWords(rangeLabel)`. `reports.ts` is 666 lines, about 700 after.
4. **No cast.** `reportSeries` answers `Json`. The new reader checks it with a type guard, `isReportDto` (`report_series` answers `{ series, days, ... }` or its own `{ error }`), instead of the `as unknown as ReportDto` the page's reader uses. The page's reader keeps its cast (`tooling/scripts/tests/ask/readers.test.mjs` fakes `report_series` with a bare `{ days, tenant }`, which a guard would refuse); `casts.json` neither rises nor falls.
5. **The headline has no live-feed rule, where the brief said to copy the Reports surface's; and visiting Reports no longer re-reads it.** That rule is `onlyOnItsPage("reports", DEFAULT_REFRESH_TABLES)`: a message re-reads Reports only while Reports is on screen (`ownsTheScreen`, `surface-registry.ts`). The headline's page is Today, whose route's own surface is `today`, and `ownsTheScreen("reports_headline", <any route>)` is false everywhere, so the copied rule would be inert (every message recorded as missed, never read) and a subscription for nothing. It would also be wrong to make it live: the headline reads the people pool and the calendar feed for its booking line. So it is read at boot, when the tab returns, by Retry, after `PATCH workspaces` (a zone moves the period's day edges), on a period pick when none is held or the held one is old, and **as Today comes back on screen once the held one is older than `HEADLINE_STALE_MS` (five minutes)** (Task 9 hangs that on the one hook the runner already has for an address that moves; it is a line in `isStale`, not a rule of its own). What changes against today, said plainly: the `reports` surface used to be read on every page, so a member who sat on Reports for an hour and went back to Today found Today's line as old as the last live message; now **Today's period line is not re-read by visiting Reports**, and is as old as its last read, at most five minutes when Today is next on screen. `message-fan-out.test.mjs`'s "a message re-reads the Inbox, Conversations and Today" holds with the override in its list (Task 6).
6. **Today's reply words ride the metrics read, not the headline** (the brief's "ideally"), **as a four-number summary, not a list.** `toTodayVM` is composed three times from `MetricsSummaryDto`: the browser (`surfaces/today/surface.ts`), `GET today` for the phone app (`app/api/v1/today/route.ts`) and Ask's `today` reader (`server/readers/today.ts`). A clause built from the headline would be said by the browser alone, and would be as old as the headline beside figures that move with every message. Carried by the metrics, one reading serves all three and moves with the day's figures. `metricsSummaryFor` reads the day's first replies (`first_replies(p_tenant_id, p_start)`, 00303, granted to `authenticated`, the function both `metrics_summary` and `report_series` read, through the new `packages/db` module `first-replies.ts`) beside `metrics_summary` in the same `Promise.all`, **from 26 hours back** (a local day is at most 25 hours long, so the window's own midnight is always inside it; `since - 26h` cannot be the bound, because `since` is what the parallel read is waiting for, so the bound is `Date.now() - 26 * HOUR_MS`, which is never later than `since - 1h`), keeps the replies the window's own midnight keeps (`window.since`, which the function answered), runs `holdOf` over them **on the server** and puts `replyHoldDtoOf` of the result on the summary as `reply_hold` (`{ label, at_end, later, unheld }`, snake_case because it rides a route). Constant in size whatever the day held; the one rule (`classOf`, its ten-second slack, `holdOf`) is applied once, in contracts, and nothing is spelled twice. A read that fails costs the clause and nothing else (logged as `today_replies_read_failed`; the page says the median). The SQL alternative (`metrics_summary` carrying the summary) is a migration and a throwaway-stack proof for a few kilobytes of one extra scan, and is not needed.
7. **The words.** Where most replies waited a hold (the test `heroSpeed` already makes, now one private function `waitedHold` in `report-speed.ts` over one private helper `repliesSeen`, so the sum of replies a hold was counted over is written once): "typically as your 1-minute hold ended" when as many or more went out as it ended than later, "typically later than your 1-minute hold" otherwise; else the median as before ("typically in 34s", "in about 34s" in the calm headline's detail, "34s" as Ask's fact value). One function, `replySpeedOf(median, hold)` in `report-speed.ts`, is read by `todayReplySpeed(metrics)` (in `today-metrics.ts`) and every sentence takes `speedIn(speed)` from `today-bands.ts`; the figure's clause is one module-level `speedClause`, so `figuresOf`, which stands at exactly its 200-line complexity baseline, gains no line. The ten-second slack stays in `classOf`, private, and is never written again. The pairs are rounded in `packages/db` as `report_series` rounds them (`round(ai_seconds)`, `round(coalesce(ai_hold_s, 0))`), so a reply is the same class on Reports and on Today at the slack's edge.
8. **The failure door is the seam's hook, not the shell's door.** `surfaceFailed(key)` (`surfaces/today/shell.ts`) calls `window.__surfaceFailed(page, param)`, which maps its argument through `routeSurfaceFor` (`surface-registry.ts`, `ROUTE_SURFACE`), a table of routes that has no `reports_headline`: `surfaceFailed("reports_headline")` is false for ever, and the card's `today-period-failed` and the band's `today-leaks-failed` could never draw. `card.tsx` and `leaks.tsx` read it with `useSurfaceFailed("reports_headline")` (`surfaces/use-surface.ts`), a hook called before any early return, which draws again when the surface's status moves (`useSurface` alone redraws only when the value does, so dropping `"reports"` from `useMoved` would have lost the redraw), and the `surfaceFailed` import goes from `card.tsx`. The page tests drive failure through the real status (`setStatus("reports_headline", "seeded")`), never a stand-in that answers for any key, so the test fails on the old code; `setStatus` has no reset, so the one test that fails it is the last of `today-page.test.mjs`.
9. **The window-globals ratchet will not fall.** The brief expects the deletion to bank a fall, but `__REPORTS` is not in `window-globals.json`: `windowUse` (`tooling/scripts/tests/_ast.mjs`) counts `window.__X` and `window["__X"]` only, and every reader of `__REPORTS` reaches it by a string (`borrowed("__REPORTS")`) or through a typed parameter (`w.__REPORTS` in `ask/context.ts`). Task 8 runs the ratchet and banks whatever it reports; the executed proof that the mirror is gone is `reports-seam.test.mjs` (a value set under `reports` leaves `window.__REPORTS` undefined).
10. **Measure on the real runner, over every override, both passes.** After Task 9 both overrides still exist (the Reports page reads `reports`), so one test starts the real runner (`startSurfaces`) over the app's overrides on route `today` and on route `inbox`, before and after (the report overrides real over a recording `fetch` on a busy workspace's thirty-day fixtures, the others recorded), and counts the requests and bytes of both passes; it counts the database's doors per route over the in-memory double. The pull request quotes its output, and says what stopped: Today's three routes for one, and **every other page's boot** reading none.
11. **On-demand is one field and one rule, and it can only skip.** `onDemand` is read by four places in the runner (`bootInPasses` leaves it out of the second pass; `onReturn`, `readEverySurfaceAgain` and `refreshAllSurfaces` leave it out when no page on screen draws it) and one in the registry (`readWhatWasMissed` reads it as its page comes on screen). A refresh asked for **by name** is still made, so `refresh-map` and the period pick are untouched. It does not make Reports cheaper where it is drawn, and it makes the `reports` value **absent until Reports has been on screen** in this tab; Ask's context, the one reader off the page, answers the route alone for a value not read (Task 8 holds it), and `git grep` finds no other. If the runner could not carry this without a wider change this plan would say so here; it can, in the lines Task 9 names.
12. **The period pick paints, and reads behind only when it must.** The headline's first draft re-read it on every pick while the member was on Reports, which doubles the heaviest read there is. A pick paints the headline this tab holds for the period (`paintHeldHeadline`) and reads behind it only if none is held for it or the held one was read more than `HEADLINE_STALE_MS` ago (`isHeadlineStale`; a constant built from contracts' `MIN_MS`), and a pick that fails (`keepReportPeriod(prev)`) repaints the headline of the period kept, so Today never says 90 days while the page says thirty (Task 6 holds both).
13. **Part 1's loose ends come first, in three tasks, because each leaves the branch green and the page truer, and the later tasks edit the same files.** Task 1 is what the page says wrongly (Reviews, "1 days", the strip's derivation, the period control); Task 2 is what it draws its own way (the kit's figure, links, tooltips); Task 3 is what is said twice or falsely around it (one `plural`, one list of periods, no scene runner, the docs, the tests). `shownReportPeriod` is exported in Task 1, where the period control first needs it, and the surface's own `reportsOverride` docblock is fixed in Task 3.

---

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/surfaces/reports/{blocks,google,reach-outs,reports-page,chrome,surface,period,series}.ts(x)`, `lenses/{reviews,people,receptionist,campaigns,overview,pipeline,shared}.tsx`, `apps/dashboard/src/legacy/styles/reports.css` | modify | Tasks 1 to 3: Reviews' three states, `lensShownHere`, the period control, Google's figures, links, tooltips, one `plural`, no dead rule |
| `packages/contracts/src/calendar/calendar-people.ts`, `apps/dashboard/src/server/readers/report.ts` | modify | "1 day"; `bookingOf`, `reportPeriodAsked`, `reportHeadline`, the closed `period` |
| `packages/contracts/src/reports/report-periods.ts`, `apps/dashboard/src/server/ask/tools/read/report.ts` | modify | `REPORT_PERIOD_IDS`; the Ask tool's counts read from the table |
| `tooling/scripts/checks/style-equality.mjs`, `.claude/skills/chanlytics-interface/SKILL.md`, `apps/dashboard/src/legacy/CLAUDE.md`, `apps/dashboard/src/legacy-bridge/app-bridge.ts`, `e2e/reports.spec.ts`, `e2e/google.spec.ts` | modify | The scene runner deleted; the documents and specs say what the code does |
| `packages/contracts/src/reports/report-headline.ts` | create | `ReportHeadlineDto`, `ReportHeadlineVM`, `toHeadlineVM`, `isReportDto` |
| `packages/contracts/src/reports/reports.ts` | modify | `headlineOf`, `rangeLabelOf`, `periodWords`, `empty` in the period's facts |
| `packages/contracts/src/reports/report-speed.ts` | modify | `waitedHold`, `repliesSeen`, `replySpeedOf`, `ReplySpeed`, `ReplyHoldDto`, `replyHoldDtoOf` |
| `packages/contracts/src/reports/index.ts`, `packages/contracts/src/today/index.ts`, `packages/contracts/src/browser.generated.ts`, `packages/*/dist` | modify, regenerate | The barrels, the browser entry, the builds |
| `packages/contracts/src/today/today-period.ts`, `today-leaks.ts` | modify | The period line and Worth a look read `ReportHeadlineVM`; `ReportsLike` and `WeekTileLike` deleted |
| `packages/contracts/src/today/today-metrics.ts`, `today-facts.ts`, `today-bands.ts`, `today-figures.ts` | modify | `reply_hold` on the metrics, `todayReplySpeed`, `speedIn`, `speedClause`, the four sentences |
| `packages/db/src/repositories/reports/first-replies.ts` (create), `packages/db/src/index.ts` (modify) | create, modify | `firstReplies`: the one place `first_replies` is called by name, in a module of its own |
| `apps/dashboard/app/api/v1/reports/headline/route.ts` | create | `GET reports/headline` |
| `apps/dashboard/src/server/metrics/metrics.ts`, `apps/dashboard/src/server/log.ts` | modify | The day's replies beside `metrics_summary`, from 26 hours back, as `reply_hold`; the event name |
| `apps/dashboard/src/surfaces/reports/headline.ts` | create | The `reports_headline` override, its held views, `isHeadlineStale` |
| `apps/dashboard/src/surfaces/surface-values.ts`, `use-surface.ts` | modify | The `reports_headline` key; the headers' examples |
| `apps/dashboard/src/legacy-bridge/surface-data.ts`, `surface-runner.ts`, `surface-registry.ts` | modify | `onDemand`, `isStale`; the boot, the return and Retry-all leave an on-demand surface to its page; the arrival reads it |
| `apps/dashboard/src/legacy-bridge/LegacyApp.tsx`, `refresh-map.ts` | modify | The override registered and labelled; refreshed with the zone |
| `apps/dashboard/src/surfaces/today/pages/card.tsx`, `leaks.tsx`, `brief-pane.tsx`, `shell.ts` | modify | Read the headline through the seam, and its failure through the seam's hook |
| `apps/dashboard/src/legacy-bridge/ask/context.ts` | modify | Ask's Reports context reads the seam |
| `apps/dashboard/src/client/routes.generated.ts`, `packages/contracts/src/route-keys.generated.ts`, `tooling/scripts/tests/route-policy.json`, `docs/api.md` | regenerate | The route's row, its client key, its reference, the closed `period` |
| `tooling/scripts/tests/reports/headline/{report-headline,headline-route,headline-surface,on-demand-boot,metrics-replies,headline-boot}.test.mjs` | create | The new folder's six tests |
| `tooling/scripts/tests/today/_headline.mjs`, `today-reply-hold.test.mjs` | create | The shared fixture, built by the real builders; Today's hold words |
| `tooling/scripts/tests/{reports,calendar,ask,reach-out-back,styles,today,shell,receptionist}/…` | modify | The fixtures, doors and pins that moved (named in each task) |
| `apps/dashboard/src/legacy/CLAUDE.md`, `docs/system-prd.md`, `tooling/scripts/tests/baselines/*.json`, `docs/debt.md`, `docs/takeover.md` | modify | The docs; banked falls |

Folder counts (`tree-shape.json`, 20 modules at most; the ratchets read `git ls-files`, so stage new files before running them): `packages/contracts/src/reports` 11 to 12; `packages/contracts/src/today` is at 20 and gets **no** new file (its changes go into existing modules); `packages/db/src/repositories/reports` goes from 1 to 2 (`first-replies.ts` beside `report-series.ts`: a folder of one module gets its second by the rule); `apps/dashboard/src/server/readers` is over its limit and gets **no** new file (the reader joins `report.ts`); `apps/dashboard/src/surfaces/reports` 10 to 11 (plus its `lenses/` folder); `apps/dashboard/src/legacy-bridge` gets **no** new file (the runner's change is inside `surface-data.ts`, `surface-runner.ts` and `surface-registry.ts`); `tooling/scripts/tests/today` 16 to 18; `tooling/scripts/tests/reports` is full and gets no file at its root: its new tests go in the new folder `tests/reports/headline/` (6 files); `tooling/scripts/tests/shell/surfaces` is full (20), so the runner's test goes in `tests/reports/headline/` too; `tooling/scripts/tests/ask` is full and gets none.

## Standing rules for how this is done

- **Local commits only.** Nothing is pushed and no pull request is opened until Ruben says so. One pull request for the whole plan.
- **Sub-agents run on Sonnet.** Never `supabase db reset`; there is no database here, and no migration in this plan.
- **Never run the whole `pnpm test`.** Run the touched test files one per command, `node tooling/scripts/checks/test.mjs <one test file>`; the ratchets and the debt register where a task says so; `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm check:dead-exports` and `corepack pnpm format:check` where it says so. Before the push, Task 13's `changed-tests.mjs`.
- **Tests import `@chanlytics/contracts` and `@chanlytics/db` from `dist`.** After a contracts or db change: `corepack pnpm --filter "./packages/*" build`, then keep only the dist files that have a real diff:
  `for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done`.
  On this Windows machine `packages/db/dist/index.d.ts` gets four `agrees?:` comments spliced in by any build while `packages/db/src/database.types.ts` is CRLF, and that is a real diff the loop would keep. So, **before the first build of this work**, make that source LF in the working copy (git sees no change and it stays LF): `node -e "const fs=require('fs');const f='packages/db/src/database.types.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"`. After a build, `git diff --stat -- packages/db/dist/index.d.ts` shows nothing, or only the declaration Task 11 adds.
- **Contracts' browser entry.** After a contracts barrel changes: `node tooling/scripts/gen/contracts-browser-entry.mjs`, then the build above.
- **Edits are whole-file writes or exact replacements, never `sed`** (Git Bash's `sed` flips CRLF on this machine). The working copy is CRLF, so a multi-line replacement is made with `swap`, a Node script written once to the session scratchpad with the Write tool as `swap.mjs`. A task's `swap` block is saved as `<task>.swap` in the scratchpad and run from the worktree root with `node <scratchpad>/swap.mjs <scratchpad>/<task>.swap`; each edit is matched on LF-normalised text and must match exactly once, or the script stops with the first words of the text it did not find and writes nothing of the run; a file is written back in its own line endings.

  ```js
  // swap.mjs — node swap.mjs <edits file>. Edits are  ##FILE <path> / ##FROM / <old text> / ##TO / <new text> / ##END.
  import fs from "node:fs";
  const lines = fs.readFileSync(process.argv[2], "utf8").replace(/\r\n/g, "\n").split("\n");
  let file = null;
  let mode = null;
  let from = [];
  let to = [];
  const edits = [];
  for (const line of lines) {
    if (line.startsWith("##FILE ")) file = line.slice(7).trim();
    else if (line === "##FROM") {
      mode = "from";
      from = [];
      to = [];
    } else if (line === "##TO") mode = "to";
    else if (line === "##END") {
      edits.push({ file, from: from.join("\n"), to: to.join("\n") });
      mode = null;
    } else if (mode === "from") from.push(line);
    else if (mode === "to") to.push(line);
  }
  const texts = new Map();
  const endings = new Map();
  for (const e of edits) {
    if (!texts.has(e.file)) {
      const raw = fs.readFileSync(e.file, "utf8");
      endings.set(e.file, raw.includes("\r\n"));
      texts.set(e.file, raw.replace(/\r\n/g, "\n"));
    }
    const parts = texts.get(e.file).split(e.from);
    if (parts.length !== 2) throw new Error(`${e.file}: expected the text once, found ${parts.length - 1}:\n${e.from.slice(0, 120)}`);
    texts.set(e.file, parts.join(e.to));
  }
  for (const [file, text] of texts) fs.writeFileSync(file, endings.get(file) ? text.replace(/\n/g, "\r\n") : text);
  console.log(`${edits.length} edits in ${texts.size} files`);
  ```

  A deletion's `##FROM` carries the line after it so no blank line is left. A whole new file is written with the Write tool. Prettier owns formatting: `corepack pnpm exec prettier --write <files>` on every touched file under `apps/`, `packages/`, `tooling/` and `e2e/` (and `CLAUDE.md`, `docs/*.md`) before `git add` (`docs/superpowers/` is Prettier-ignored).
- **Dead exports are checked in every task that adds or deletes an export** (Tasks 1 to 3 end with it; Tasks 4 to 6 add exports whose readers arrive in Tasks 5 to 7, so the check is first required at Task 7): `headlineOf`, `toHeadlineVM` and `isReportDto` have the reader and the surface; `paintHeldHeadline` and `isHeadlineStale` the pick and the override; `shownReportPeriod` (exported in Task 1) the pick's guard; `lensShownHere` the page.
- **Bank every ratchet fall in the task that causes it.** `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, then the same for `tooling/scripts/tests/repo/debt-register.test.mjs`; `corepack pnpm lint -- --update` and `corepack pnpm check:dead-exports -- --update` for the lint and dead-export baselines. A rise is a stop, not a bank: find what added it.
- **No customer in the code.** Fixtures say `harbor`, `Harbor Studio`, `+1555010xxxx`, `example.com`. **One look:** no `[data-look=...]` selector (this plan draws nothing new).
- **Disk:** check free space before a dashboard build (`df -h .`) and delete this worktree's `apps/dashboard/.next` afterwards. A page change is looked at in the real app (`corepack pnpm --filter @chanlytics/dashboard dev`, `/w/<slug>/`), never the standalone mockup.

## Review Focus

1. **Today says word for word what it said.** Task 4 holds the headline's fields equal to the page's view model's, for the same series cut to what each period reads, over a matrix of periods; Task 7 holds the sentences equal (an oracle copy of the old sentences, built from `toReportVM`, against `todayPeriodLine` and the two rows of `todayLeaks` over the headline), and the migrated Today tests still say what they said.
2. **A count is counted once.** `headlineOf` reads `periodFactsOf` and `answeredOf`; booking is `bookingOf` for both readers; the ten-second slack is read only in `classOf`, `holdOf` is run once (on the server) and the summary it makes is read, never re-derived; the sum of replies a hold was counted over is `repliesSeen`; a period's id is `REPORT_PERIOD_IDS`; a count's noun is contracts' `plural`.
3. **Nothing reads `window.__REPORTS`**, and the mirror's one line is gone (Task 8); Ask's context answers the route alone for a `reports` value not read.
4. **Today's boot asks one small read for three large ones, and no other page's boot reads the report at all.** Task 9 executes the runner (on route `today` neither pass reads the three report routes; moving to `reports` reads them once, and the gate opens; moving back reads nothing new; an unmarked surface behaves as before), and Task 12 prints the requests, the bytes and the doors, over every override, both passes, on `today` and on `inbox`.
5. **The failure draws.** The card's `today-period-failed` and the band's `today-leaks-failed` are drawn by the seam's `useSurfaceFailed`, which the test drives through the real status (Task 7): it fails on the first draft's `surfaceFailed("reports_headline")`, which is false for ever.
6. **Part 1's loose ends are cleared and the page still draws what it drew**, except where a task says what changed (Tasks 1 to 3). Task 2 and Task 3's stylesheet and recorder edits are the part a test cannot see: look at Reports at 1440, 900 and 375 pixels, in both themes, after Task 2, and run the recorder's own tests after Task 3.
7. **The reply-speed clause fails soft and either deploy order works**: a failed or absent summary says the median as before (Task 11); an old client ignores `reply_hold`; an old server sends none. The period pick never doubles the heaviest read and never leaves Today on a period the page left (Task 6).

---

### Task 1: Reports' part 1 is finished (1 of 3): the Reviews lens, a lens that waits on the workspace list, the one-day words and the period control say what is true

**Why:** four faults in what #1424 merged, each a thing the page says that is not so. (a) The Reviews lens draws "Find your business on Google once" while `useSurface("google")` is `undefined`, which is true before Google's first read and after a failed one (Reports does not wait for `google`), so a read still out and a read that failed both claim nothing is linked. (b) "Shown when" is derived twice (the strip in `chrome.ts`, the page in `reports-page.tsx`), and a workspace list the shell does not yet hold reads as "deals are off", so Pipeline would say "you book directly" to a workspace nobody has asked. (c) A one-day period (Month on the 1st) is said "the last 1 days" by the booking card (`calendar-people.ts`) and "Reports, 1 days" by the citation label (`readers/report.ts`). (d) The period control is `readOnly` while a period loads, so arrowing from 30 days on to Month (an arrow key chooses, and choosing reads) stops at the first key; the surface already drops an answer for a period left, so the latest pick can simply win.

**Files:**
- Modify: `apps/dashboard/src/surfaces/reports/lenses/reviews.tsx` (whole file), `apps/dashboard/src/surfaces/reports/chrome.ts`, `apps/dashboard/src/surfaces/reports/reports-page.tsx` (whole file), `apps/dashboard/src/surfaces/reports/surface.ts`, `apps/dashboard/src/surfaces/reports/period.ts`, `packages/contracts/src/calendar/calendar-people.ts`, `apps/dashboard/src/server/readers/report.ts`
- Modify (tests): `tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs`, `tooling/scripts/tests/reports/reports-page.test.mjs`, `tooling/scripts/tests/calendar/calendar-people.test.mjs`, `tooling/scripts/tests/ask/ask-context.test.mjs`

- [ ] **Step 1: Write the failing tests**

`reports-lens-page.test.mjs`: Google's three answers are three fixtures, Reviews has three states, and a lens that waits on the workspace list draws nothing. `setStatus` has no reset (`surface-status.ts`), so the failed-read test is the **last test of the file**; the tests above it never touch `google`'s status (`swap`):

```swap
##FILE tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs
##FROM
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
##TO
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { setStatus } = await import(`${S}/legacy-bridge/surface-status.ts`);
##END
##FILE tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs
##FROM
/** The lens drawn over a surface: the page for its address. */
##TO
/** Google answered, and nothing is linked: this deployment cannot look a listing up and none is kept. */
const GOOGLE_UNLINKED = {
  dto: { ...GOOGLE_NONE.dto, ready: { places: false, profile: false } },
  fetchedAt: 1,
};
/** The lens drawn over a surface: the page for its address. */
##END
##FILE tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs
##FROM
test("a period with nothing in it says so on each lens that draws sections, and Reviews says what it needs where Google cannot be read", () => {
##TO
test("a period with nothing in it says so on each lens that draws sections, and Reviews says what it needs where Google answered that nothing is linked", () => {
##END
##FILE tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs
##FROM
  const reviews = draw("reviews", { google: undefined });
  assert.ok(textOf(byTestId(reviews, "lens-empty")).includes("Find your business on Google once."));
});
##TO
  const reviews = draw("reviews", { google: GOOGLE_UNLINKED });
  assert.ok(textOf(byTestId(reviews, "lens-empty")).includes("Find your business on Google once."));
});

test("Reviews draws nothing while Google is unread: a read still out is not 'nothing is linked'", () => {
  workspace("booking");
  const unread = draw("reviews", { google: undefined });
  assert.equal(
    byTestId(unread, "lens-empty"),
    null,
    "REGRESSION: the empty that says nothing is linked, drawn before Google's first read",
  );
  assert.equal(byTestId(unread, "reviews-failed"), null, "and no failure: nothing has failed");
  assert.ok(byTestId(unread, "reports-real"), "the page itself stands");
});

test("a lens that waits on how the workspace sells draws nothing until the workspace list is held, and the Overview stands without it", () => {
  delete globalThis.__WORKSPACES;
  delete globalThis.__ACTIVE_WORKSPACE;
  const pipeline = draw("pipeline", { R: surface({ deals: NO_DEALS }) });
  assert.equal(
    byTestId(pipeline, "lens-empty"),
    null,
    "REGRESSION: 'you book directly' said to a workspace nobody had asked",
  );
  assert.equal(byTestId(pipeline, "rpt-deals"), null);
  assert.ok(byTestId(draw("overview", { R: surface({ deals: DEALS }) }), "reports-hero"), "open to everyone: no list needed");
  workspace("proposal");
  assert.ok(byTestId(draw("pipeline", { R: surface({ deals: DEALS }) }), "rpt-deals"), "the list held: the lens draws");
});

// LAST in the file: a surface's failure cannot be taken back (surface-status.ts has no reset), and every test above draws Google.
test("Reviews says the read failed, with its Retry, where Google could not be read, and never the empty that says nothing is linked", () => {
  workspace("booking");
  setStatus("google", "seeded");
  const failed = draw("reviews", { google: undefined });
  const words = byTestId(failed, "reviews-failed");
  assert.ok(words, "the house's failed read, as Today draws one");
  assert.ok(textOf(words).includes("Couldn't read your Google reviews"), textOf(words));
  assert.equal(byTestId(failed, "lens-empty"), null, "REGRESSION: a failed read said 'find your business on Google once'");
});
##END
```

`reports-page.test.mjs`: the control never holds (three pins that said it did go, and the hold test becomes the test that it does not):

```swap
##FILE tooling/scripts/tests/reports/reports-page.test.mjs
##FROM
  assert.equal(c.props.readOnly, false, "nothing on its way");
  const ask = byTestId(tree, "reports-ask");
##TO
  const ask = byTestId(tree, "reports-ask");
##END
##FILE tooling/scripts/tests/reports/reports-page.test.mjs
##FROM
    assert.equal(control(tree).props.readOnly, false, "the control holds only while a period loads");
    assert.equal(chosen(tree), "7 days");
##TO
    assert.equal(chosen(tree), "7 days", "the pick that failed is taken back: the control says what the page shows");
##END
##FILE tooling/scripts/tests/reports/reports-page.test.mjs
##FROM
test("REGRESSION (C27): the period tabs hold while a period loads -- a second press started a second load", async () => {
  await inPeriodTest("hold", async () => {
    let tree = page();
    choose(tree, "30 days");
    tree = redraw();
    assert.equal(control(tree).props.readOnly, true, "REGRESSION: pressable while a period loaded");
    choose(tree, "90 days");
    assert.deepEqual(period.asked, ["30d"], "REGRESSION: a second load began");
    await land();
  });
});
##TO
test("REGRESSION: the period control never holds -- arrowing on to Month is a choice per key, each pick is read and the latest one wins", async () => {
  await inPeriodTest("hold", async () => {
    let tree = page();
    choose(tree, "30 days");
    tree = redraw();
    assert.equal(control(tree).props.readOnly, undefined, "REGRESSION: the control was read-only while a period loaded");
    assert.equal(chosen(tree), "30 days", "the control shows the pick as it is made, so the next key goes on from it");
    choose(tree, "90 days");
    assert.deepEqual(period.asked, ["30d", "90d"], "each pick is read; none waits behind another");
    await land();
    redraw();
    tree = redraw();
    assert.equal(chosen(tree), "90 days", "the latest pick is the one shown: the surface dropped the answer for 30 days");
    assert.equal(cls(tree, "rpt-failed"), null, "and the pick that was left says nothing of its own");
  });
});
##END
```

`calendar-people.test.mjs` and `ask-context.test.mjs`: a one-day period, said in both places (`swap`):

```swap
##FILE tooling/scripts/tests/calendar/calendar-people.test.mjs
##FROM
    [0, "Everyone who asked in the last 7 days has an appointment."],
  );
##TO
    [0, "Everyone who asked in the last 7 days has an appointment."],
  );
  // One day (Month on the 1st): "1 day", never "1 days", in each place the card names its period.
  assert.equal(
    toBookingReportVM({ calendar: "ok", days: 1, asked: 2, booked: 1 }).words,
    "of the people who wrote or called in the last 1 day have an appointment on the calendar",
  );
  assert.equal(
    toBookingReportVM({ calendar: "ok", days: 1, asked: 3, booked: 3 }).rest,
    "Everyone who asked in the last 1 day has an appointment.",
  );
  assert.equal(
    toBookingReportVM({ calendar: "ok", days: 1, asked: 0, booked: 0 }).sub,
    "nobody wrote or called in the last 1 day",
  );
##END
##FILE tooling/scripts/tests/ask/ask-context.test.mjs
##FROM
  assert.match(textOf(month.blocks[0]), /^Reports, 5 days · /);
});
##TO
  assert.match(textOf(month.blocks[0]), /^Reports, 5 days · /);
  // Month on the 1st: one day, said as one.
  clearContextCache();
  const first = await buildContext(
    rcIn(ctxFor(tables(), { ...RPCS, report_series: series })),
    page("reports", [], { view: "1" }),
  );
  assert.match(textOf(first.blocks[0]), /^Reports, 1 day · /);
});
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs tooling/scripts/tests/reports/reports-page.test.mjs tooling/scripts/tests/calendar/calendar-people.test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/calendar/calendar-people.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
```
Expected: FAIL. `reports-lens-page`: the unread Reviews draws `lens-empty`; the failed read draws `lens-empty`; Pipeline with no list draws `lens-empty`. `reports-page`: the control is `readOnly` while a period loads, and the second pick is refused (`period.asked` is `["30d"]`). `calendar-people` and `ask-context`: "the last 1 days" and "Reports, 1 days".

- [ ] **Step 3: One word for a count, the one derivation of "shown when", the Reviews lens, the page, the period**

`plural` is contracts' (`shared/words.ts`, exported from the barrel); `chrome.ts` holds the one place Reports asks who is looking (`swap`):

```swap
##FILE packages/contracts/src/calendar/calendar-people.ts
##FROM
import { dateFormat, DAY_MS } from "../shared/time";
##TO
import { dateFormat, DAY_MS } from "../shared/time";
import { plural } from "../shared/words";
##END
##FILE packages/contracts/src/calendar/calendar-people.ts
##FROM
      sub: `nobody wrote or called in the last ${dto.days} days`,
##TO
      sub: `nobody wrote or called in the last ${plural(dto.days, "day")}`,
##END
##FILE packages/contracts/src/calendar/calendar-people.ts
##FROM
  const words = `of the people who wrote or called in the last ${dto.days} days have an appointment on the calendar`;
##TO
  const words = `of the people who wrote or called in the last ${plural(dto.days, "day")} have an appointment on the calendar`;
##END
##FILE packages/contracts/src/calendar/calendar-people.ts
##FROM
        ? `Everyone who asked in the last ${dto.days} days has an appointment.`
##TO
        ? `Everyone who asked in the last ${plural(dto.days, "day")} has an appointment.`
##END
##FILE apps/dashboard/src/server/readers/report.ts
##FROM
  parseTenantConfigResult,
  reportPeriodOf,
##TO
  parseTenantConfigResult,
  plural,
  reportPeriodOf,
##END
##FILE apps/dashboard/src/server/readers/report.ts
##FROM
      rows: [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${days} days` }],
##TO
      rows: [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${plural(days, "day")}` }],
##END
##FILE apps/dashboard/src/surfaces/reports/chrome.ts
##FROM
import { isLensParam, lensOf, lensOfRoute, lensRoute, lensesFor, type LensId } from "@chanlytics/contracts";
##TO
import {
  isLensParam,
  lensIsShown,
  lensOf,
  lensOfRoute,
  lensRoute,
  lensesFor,
  type LensId,
  type LensWho,
} from "@chanlytics/contracts";
##END
##FILE apps/dashboard/src/surfaces/reports/chrome.ts
##FROM
/** The lenses shown here, as the frame's strip draws them; `picked` is the one the address names. */
function lensViews(picked: LensId): SurfaceViews {
  const ws = workspaceOverride.current();
  const tabs = lensesFor({ sellsBy: ws?.sells_by, role: ws?.role }).map((l) => ({
##TO
/**
 * Who is looking and how their customers buy, as the workspace list the shell holds says it: the one place Reports asks, for the
 * strip and for the page's body. Null before the list is held (the shell reads it before the page draws, ROUTE_WAITS, but a read
 * that failed leaves none).
 */
const lensWho = (): LensWho | null => {
  const ws = workspaceOverride.current();
  return ws ? { sellsBy: ws.sells_by, role: ws.role } : null;
};

/** What is known of a workspace whose list is not held: deals are not on, and the person is the lowest rung. */
const NOT_HELD: LensWho = { sellsBy: undefined, role: undefined };

/**
 * Whether a lens is shown here: yes or no, or null where the answer waits on a list the shell has not held (how the workspace sells
 * decides the Pipeline). A lens open to everyone never waits. The page draws nothing for a null, rather than an empty that claims
 * "you book directly" of a workspace nobody has asked.
 */
export function lensShownHere(lens: LensId): boolean | null {
  const who = lensWho();
  if (who) return lensIsShown(lens, who);
  return lensIsShown(lens, NOT_HELD) ? true : null;
}

/** The lenses shown here, as the frame's strip draws them (before the list is held, those that need nothing of it); `picked` is the one the address names. */
function lensViews(picked: LensId): SurfaceViews {
  const tabs = lensesFor(lensWho() ?? NOT_HELD).map((l) => ({
##END
##FILE apps/dashboard/src/surfaces/reports/surface.ts
##FROM
/** The one period every chart on Reports is scoped to, kept in this browser. */
export function keepReportPeriod(period: ReportPeriodId): void {
##TO
/** The period the page is on now, or on its way to: the one kept in this browser. */
export const shownReportPeriod = (): ReportPeriodId => reportPeriod;

/** The one period every chart on Reports is scoped to, kept in this browser. */
export function keepReportPeriod(period: ReportPeriodId): void {
##END
##FILE apps/dashboard/src/surfaces/reports/period.ts
##FROM
import { keepReportPeriod, paintHeldReports, reportsOverride } from "./surface";
##TO
import { keepReportPeriod, paintHeldReports, reportsOverride, shownReportPeriod } from "./surface";
##END
##FILE apps/dashboard/src/surfaces/reports/period.ts
##FROM
  await refreshSurfaces([reportsOverride]);
  // The override writes the period it fetched.
##TO
  await refreshSurfaces([reportsOverride]);
  // A newer pick was made while this one loaded: the surface dropped this answer (a period left), and the newer pick decides what
  // the page keeps and says. This one failed nothing, so it takes nothing back.
  if (shownReportPeriod() !== period) return true;
  // The override writes the period it fetched.
##END
```

Write the whole of `apps/dashboard/src/surfaces/reports/lenses/reviews.tsx`:

```tsx
/**
 * The Reviews lens: Google's listing, its rating and its newest reviews, over the period (google.tsx draws the section). Reports does
 * not wait for Google, so "no value" is two things and the lens says which: a read still out draws nothing, and a read that failed
 * is the house's failed read, with its Retry. "Find your business on Google once" is only what Google answers when nothing is linked.
 */
import { FailedRead } from "../../kit/empty/empty";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { GoogleSection, googleReadable } from "../google";
import { LensEmpty, type LensProps } from "./shared";

export function ReviewsLens({ R }: LensProps) {
  const G = useSurface("google");
  const failed = useSurfaceFailed("google");
  if (!G) {
    return failed ? (
      <FailedRead kind="card" what="your Google reviews" surface="google" testid="reviews-failed" />
    ) : null;
  }
  return googleReadable(G) ? (
    <GoogleSection days={R.days} range={{ since: R.vm.since, until: R.vm.until }} />
  ) : (
    <LensEmpty lens="reviews" vm={R.vm} />
  );
}
```

Write the whole of `apps/dashboard/src/surfaces/reports/reports-page.tsx` (the period control shows its pick and never holds; the body asks the one helper whether the lens is shown):

```tsx
/**
 * Chanlytics, Reports: the page on its App Router route (`reports/[[...lens]]`, decision 0015, and the lenses spec). One page of
 * lenses, each at its own address (`/w/<slug>/reports/<lens>`, the Overview at `/w/<slug>/reports`). The page follows its own
 * address, as People's does (the path the App Router page hands it), so a move between two lenses is a pushed or replaced entry and
 * never a request for a page, and every lens draws from the one read the surface holds, so a move asks for nothing and never
 * blanks the body. The frame draws the strip of lenses (chrome.ts, its `views`) and the head (head.ts); the page draws one row above
 * everything (the period, its days and the Ask door) and the lens's body (lenses/). A real workspace draws the bridge's own numbers
 * (`useSurface("reports")`); a demo session draws the same page from the contracts sample (sample.ts); without either, the page says
 * what Reports reads.
 */
import { useEffect, useState } from "react";
import {
  REPORT_PERIOD_DEFAULT,
  REPORT_RANGES,
  lensOfRoute,
  routeOfPath,
  type LensId,
  type ReportPeriodId,
} from "@chanlytics/contracts";
import { askAbout, demoSession } from "../legacy-verbs";
import { Button } from "../kit/button/button";
import { EmptyState } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { Segmented } from "../kit/segmented/segmented";
import { useSurface } from "../use-surface";
import { useRptPhone } from "./blocks";
import { lensShownHere } from "./chrome";
import { useReportsStanding } from "./head";
import { CampaignsLens } from "./lenses/campaigns";
import { OverviewLens } from "./lenses/overview";
import { PeopleLens } from "./lenses/people";
import { PipelineLens } from "./lenses/pipeline";
import { ReceptionistLens } from "./lenses/receptionist";
import { ReviewsLens } from "./lenses/reviews";
import { LensEmpty, type LensProps } from "./lenses/shared";
import { setReportRange } from "./period";
import { reportsSample } from "./sample";
import type { ReportsSurface } from "./surface";

/** Reports read nothing: a session with no workspace, and no demo to draw. */
function readsAWorkspace() {
  return (
    <div className="rpt" data-testid="reports-none">
      <div className="rpt-inner">
        <EmptyState
          kind="page"
          glyph="wave"
          title="Reports reads a workspace's own numbers"
          body="Open a workspace to see what its receptionist answered, who reached it, and what its campaigns sent."
        />
      </div>
    </div>
  );
}

/** One row above everything: the period, the days it covers, and a door to ask about them. */
function periodRow(p: {
  R: ReportsSurface;
  /** The period the control shows: the pick as it is made, until the page's own catches up with it. */
  chosen: ReportPeriodId;
  failed: ReportPeriodId | null;
  pick: (period: ReportPeriodId) => Promise<void>;
}) {
  const { R, chosen, failed, pick } = p;
  const vm = R.vm;
  return (
    <div className="rpt-head">
      {/* The control never holds while a period loads: an arrow key chooses and choosing reads, so a key held on 30 days must be
          able to go on to Month. Each pick is read, the surface drops the answer for a period left, and the latest pick wins. */}
      <Segmented
        label="Period"
        value={chosen}
        onValueChange={(next) => void pick(next)}
        options={REPORT_RANGES.map((r) => ({ value: r.id, label: r.label, testid: `period-${r.id}` }))}
      />
      <span className="rpt-dates" title={`Days follow ${vm.timezone}`}>
        {vm.since} to {vm.until}
      </span>
      {failed && (
        <span className="rpt-failed" role="status" aria-live="polite">
          Couldn't load {REPORT_RANGES.find((r) => r.id === failed)?.label}. Still showing {vm.rangeLabel}.
        </span>
      )}
      <Button
        size="sm"
        className="rpt-ask"
        aria-label="Ask about this period"
        onClick={() => askAbout({ prompt: `What stood out in my last ${vm.rangeLabel}?` })}
        data-testid="reports-ask"
      >
        <Icon name="sparkle" size={13} />
        <span className="rpt-ask-label">Ask about this period</span>
      </Button>
    </div>
  );
}

/** The lens's body: nothing where it is not yet known to be shown, what it says where it is not shown, else its cards. */
function lensBody(lens: LensId, props: LensProps, shown: boolean | null) {
  if (shown === null) return null;
  if (!shown) return <LensEmpty lens={lens} vm={props.R.vm} />;
  switch (lens) {
    case "overview":
      return <OverviewLens {...props} />;
    case "receptionist":
      return <ReceptionistLens {...props} />;
    case "people":
      return <PeopleLens {...props} />;
    case "pipeline":
      return <PipelineLens {...props} />;
    case "campaigns":
      return <CampaignsLens {...props} />;
    case "reviews":
      return <ReviewsLens {...props} />;
  }
}

export function ReportsPage({ pathname }: { pathname: string | null }) {
  // The lens the address names; the frame hands the page only the addresses it takes (surfaces/routes.ts), so an address that is no
  // lens is not drawn here at all.
  const lens = lensOfRoute(routeOfPath(pathname) ?? "reports") ?? "overview";
  const phone = useRptPhone();
  const live = useSurface("reports");
  // A demo's own period: the sample answers at once, so the tabs switch it here.
  const [samplePeriod, setSamplePeriod] = useState<ReportPeriodId>(REPORT_PERIOD_DEFAULT);
  // The period picked and not yet shown: what the control says, and what dims the body until its answer lands.
  const [pending, setPending] = useState<ReportPeriodId | null>(null);
  // The period that failed to load, if any: the page keeps the old one and says so, instead of dimming forever and
  // switching later on its own.
  const [failed, setFailed] = useState<ReportPeriodId | null>(null);
  const fetchedAt = live ? live.fetchedAt : 0;
  useEffect(() => {
    setPending(null);
  }, [fetchedAt]);
  const R = live || (demoSession() ? reportsSample(samplePeriod) : null);
  useReportsStanding(lens, R);
  if (!R) return readsAWorkspace();
  const pick = async (period: ReportPeriodId) => {
    // The one shown, or the one on its way: nothing to read. Any other pick is read, whatever else is out.
    if (period === (pending ?? R.period)) return;
    if (!live) {
      setSamplePeriod(period);
      return;
    }
    setPending(period);
    setFailed(null);
    const ok = await setReportRange(period);
    if (!ok) {
      setPending(null);
      setFailed(period);
    }
  };
  const busy = pending !== null;
  return (
    // A period on its way dims by the one rule every page uses (components.css [data-loading] [data-dims]).
    <div
      className="rpt"
      data-testid={live ? "reports-real" : "reports-sample"}
      data-lens={lens}
      data-loading={busy ? "" : undefined}
    >
      <div className="rpt-inner">
        {/* One row above everything: the period, the days it covers, and a door to ask about them. The frame's head says
            Reports and the lens's answer; the page does not title itself. */}
        {periodRow({ R, chosen: pending ?? R.period, failed, pick })}
        <div className="rpt-body" data-dims aria-busy={busy ? "true" : "false"}>
          {lensBody(lens, { R, pick, phone }, lensShownHere(lens))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rebuild the contracts, run the tests, typecheck**

```bash
corepack pnpm --filter "./packages/*" build
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
corepack pnpm exec prettier --write packages/contracts/src/calendar/calendar-people.ts apps/dashboard/src/server/readers/report.ts apps/dashboard/src/surfaces/reports/chrome.ts apps/dashboard/src/surfaces/reports/surface.ts apps/dashboard/src/surfaces/reports/period.ts apps/dashboard/src/surfaces/reports/reports-page.tsx apps/dashboard/src/surfaces/reports/lenses/reviews.tsx
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/lenses/reports-address.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/calendar/calendar-people.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs
corepack pnpm -r typecheck
corepack pnpm check:dead-exports
```
Expected: all PASS. `reports-address` still holds "no workspace list yet: deals are not on" for the strip (`NOT_HELD` is what the strip read before). `empty-failed`'s period-pick tests pass over the new pick (each pick is read; its failure test still ends on "7 days"). `dist` shows a real diff in `packages/contracts/dist` only (the three sentences); `check:dead-exports` is clean (`lensShownHere` is read by the page, `shownReportPeriod` by `period.ts`).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/calendar/calendar-people.ts packages/contracts/dist apps/dashboard/src/server/readers/report.ts apps/dashboard/src/surfaces/reports/chrome.ts apps/dashboard/src/surfaces/reports/surface.ts apps/dashboard/src/surfaces/reports/period.ts apps/dashboard/src/surfaces/reports/reports-page.tsx apps/dashboard/src/surfaces/reports/lenses/reviews.tsx tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs tooling/scripts/tests/reports/reports-page.test.mjs tooling/scripts/tests/calendar/calendar-people.test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
git commit -m "Reports says what is true: Reviews tells unread from failed from unlinked, a lens waits for the workspace list, a day is a day, and the period control never holds." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reports' part 1 is finished (2 of 3): one figure for every number, doors that are links, no native tooltips

**Why:** three things the page draws its own way where the house has one. (a) Google's four numbers are drawn with the page's own `RpTile` (`blocks.tsx`, its only user) and a dozen `.rp2-tile*` rules, while the strip above them is the kit's `Figure`: the same four numbers in the same strip's pattern (`dl.rpt-figures`, `.rpt-cell`, `data-figure` = the metric). (b) A door is `LinkButton onClick={() => navigate(to)}` (`blocks.tsx` the fact rows, the booked-rest door and the source rows; `reach-outs.tsx` the chain's name), a button that goes nowhere a link could: no address to copy, nothing for a new tab. The house door is `{...routeDoor(to)}` (`campaigns/home/tiles.tsx` draws it), and the page's rules restyle layout only. (c) A native `title` is a tooltip that reaches nobody on a keyboard or a phone: the fact rows carried their whole sentence in one, for a line cut short (the line now wraps, so the words are on screen), the dates carried the zone they follow (the kit's `Tooltip`, as `Figure` does it), and the "Asked, never booked" door carried what its list counts (the same).

**Files:**
- Modify: `apps/dashboard/src/surfaces/reports/blocks.tsx`, `google.tsx`, `reach-outs.tsx`, `reports-page.tsx`, `apps/dashboard/src/legacy/styles/reports.css`
- Modify (tests): `tooling/scripts/tests/reports/reports-page.test.mjs`, `tooling/scripts/tests/reports/metrics-truth.test.mjs`, `tooling/scripts/tests/reach-out-back/back-pages.test.mjs`, `e2e/google.spec.ts`
- Banked: `tooling/scripts/tests/baselines/kit-primitives.json` (the six `reports.css::rp2-*` counts fall)

- [ ] **Step 1: Write the failing tests**

```swap
##FILE tooling/scripts/tests/reports/reports-page.test.mjs
##FROM
const { Field } = await import(`${S}/surfaces/kit/field/field.tsx`);
##TO
const { Field } = await import(`${S}/surfaces/kit/field/field.tsx`);
const { Figure } = await import(`${S}/surfaces/kit/figure/figure.tsx`);
const { Tooltip } = await import(`${S}/surfaces/kit/tooltip/tooltip.tsx`);
##END
##FILE tooling/scripts/tests/reports/reports-page.test.mjs
##FROM
  assert.equal(c.props.label, "Period");
  const ask = byTestId(tree, "reports-ask");
##TO
  assert.equal(c.props.label, "Period");
  // The zone the days follow is the kit's tooltip over the dates (a native title reaches nobody on a keyboard); the dates are on screen.
  const dates = find(tree, (n) => n.type === Tooltip);
  assert.match(dates.props.tip, /^Days follow /);
  assert.ok(textOf(dates).includes(" to "), "the days themselves are words on the page");
  const ask = byTestId(tree, "reports-ask");
##END
##FILE tooling/scripts/tests/reports/reports-page.test.mjs
##FROM
  const row = find(facts[0], (n) => n.type === "button");
  assert.ok(classes(row).includes("rpt-fact-row"), "the whole row is the door");
  assert.equal(row.props.title, "1 message has no reply yet", "the sentence rides in the title, for a line cut short");
  press(row);
##TO
  const row = find(facts[0], (n) => n.type === "a");
  assert.ok(classes(row).includes("rpt-fact-row"), "the whole row is the door, and a door is a link");
  assert.match(row.props.href, /inbox$/, "REGRESSION: a button that went nowhere a link could: no address in it");
  assert.equal(row.props.title, undefined, "no native title: the sentence is the row's words, wrapped, never cut short");
  press(row);
##END
##FILE tooling/scripts/tests/reports/reports-page.test.mjs
##FROM
    find(facts[2], (n) => n.type === "button"),
    null,
    "a fact with no door is no button",
##TO
    find(facts[2], (n) => n.type === "a" || n.type === "button"),
    null,
    "a fact with no door is no link and no button",
##END
##FILE tooling/scripts/tests/reports/reports-page.test.mjs
##FROM
  for (const r of rows) press(byTestId(r, "source-open"));
  assert.deepEqual(went, ["outbound/p1", "broadcasts/run:b1"], "REGRESSION: no door on either row");
##TO
  for (const r of rows) press(byTestId(r, "source-open"));
  assert.deepEqual(went, ["outbound/p1", "broadcasts/run:b1"], "REGRESSION: no door on either row");
  assert.deepEqual(
    rows.map((r) => byTestId(r, "source-open").props.href),
    ["#/outbound/p1", "#/broadcasts/run:b1"],
    "and each is a link with its address",
  );
##END
##FILE tooling/scripts/tests/reports/reports-page.test.mjs
##FROM
    assert.equal(
      all(byTestId(tree, "google-tiles"), (n) => classes(n).includes("rp2-tile")).length,
      4,
      "the shared tile, as Today draws its week",
    );
##TO
    assert.deepEqual(
      all(byTestId(tree, "google-tiles"), (n) => n.type === Figure).map((n) => n.props.id),
      ["rating", "reviews", "ratings_gained", "newest_review"],
      "the kit's Figure, in the strip's pattern, each named by its metric",
    );
    assert.ok(classes(byTestId(tree, "google-tiles")).includes("rpt-figures"), "the strip's own frame");
##END
##FILE tooling/scripts/tests/reports/metrics-truth.test.mjs
##FROM
  assert.ok(page.includes("title={`Days follow ${vm.timezone}`}"));
##TO
  // The zone is the kit's tooltip over the dates (executed: reports-page.test.mjs), never a native title.
  assert.ok(!page.includes("title={"), "a native title reaches nobody on a keyboard or a phone");
##END
##FILE tooling/scripts/tests/reach-out-back/back-pages.test.mjs
##FROM
  press(byTestId(tree, "ro-source-open"));
##TO
  assert.match(byTestId(tree, "ro-source-open").props.href, /^#\//, "the chain's name is a link with its address");
  press(byTestId(tree, "ro-source-open"));
##END
##FILE e2e/google.spec.ts
##FROM
      const tiles = page.getByTestId("google-tiles").locator(".rp2-tile");
##TO
      const tiles = page.getByTestId("google-tiles").locator("[data-figure]");
##END
##FILE e2e/google.spec.ts
##FROM
      for (const v of await tiles.locator(".rp2-tile-value").allInnerTexts())
##TO
      for (const v of await tiles.locator(".figure-value").allInnerTexts())
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/reports/reports-page.test.mjs tooling/scripts/tests/reports/metrics-truth.test.mjs tooling/scripts/tests/reach-out-back/back-pages.test.mjs e2e/google.spec.ts
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/metrics-truth.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-pages.test.mjs
```
Expected: FAIL. `reports-page`: no `Tooltip` over the dates, the fact row is a `button` with a `title`, the source row has no `href`, Google's tiles are `div.rp2-tile`s. `metrics-truth`: the page still carries `title={`. `back-pages`: the chain's name has no `href`.

- [ ] **Step 3: Google's four are Figures, the doors are links, the titles go**

`blocks.tsx`: the tile and its comment go, the fact row, the booked-rest door and the source row take the house door, and the count's noun is contracts' (Task 3 deletes the page's copy of it; this task stops reading it here) (`swap`):

```swap
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
import {
  bookedTileOf,
  type BookingReportVM,
##TO
import {
  bookedTileOf,
  plural,
  type BookingReportVM,
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
import { listRoute, navigate } from "../legacy-verbs";
##TO
import { listRoute, routeDoor } from "../legacy-verbs";
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
import { RadialChart } from "../kit/charts/radial";
import { rptPlural } from "./series";
##TO
import { RadialChart } from "../kit/charts/radial";
import { Tooltip } from "../kit/tooltip/tooltip";
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
/**
 * A number, what it is, and one line of what it holds. It also drew a seven-point sparkline beside a number the chart
 * below plots properly, and a delta that claimed percentages on counts of two -- "+100% vs prior 7 days" is 2 to 4,
 * and "-100%" is a zero. The view model still carries both: Ask reads the change. Today draws its week with this tile,
 * and so do Google's tiles; the Reports strip itself is RptTiles.
 */
export function RpTile({ t }: { t: { id: string; label: string; value: ReactNode; meta: string } }) {
  return (
    <div className="rp2-tile" data-tile={t.id}>
      <div className="rp2-tile-label" title={t.label}>
        {t.label}
      </div>
      <div className="rp2-tile-value">{t.value}</div>
      <div className="rp2-tile-meta" title={t.meta}>
        {t.meta}
      </div>
    </div>
  );
}

const phoneQuery
##TO
const phoneQuery
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
function factRow(f: ReportFactVM) {
  const said = f.sub ? `${f.text}, ${f.sub}` : f.text;
  const door = f.door;
##TO
function factRow(f: ReportFactVM) {
  const door = f.door;
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
        <LinkButton className="rpt-fact-row" title={said} onClick={() => navigate(door.to)}>
          {body}
        </LinkButton>
      ) : (
        <div className="rpt-fact-row" title={said}>
          {body}
        </div>
      )}
##TO
        <LinkButton className="rpt-fact-row" {...routeDoor(door.to)}>
          {body}
        </LinkButton>
      ) : (
        <div className="rpt-fact-row">{body}</div>
      )}
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
// button, the whole row its target; the full sentence rides in its title for a line cut short.
##TO
// link, the whole row its target; the sentence wraps rather than being cut short, so its words are all on the page.
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
        {bk.unbooked > 0 && (
          <LinkButton
            title="People's own list of who wrote or called this month and has never been on the calendar"
            onClick={() => navigate(listRoute("asked_never_booked"))}
            data-testid="booked-rest-door"
          >
            Asked, never booked
          </LinkButton>
        )}
##TO
        {bk.unbooked > 0 && (
          <Tooltip tip="People's own list of who wrote or called this month and has never been on the calendar">
            <LinkButton {...routeDoor(listRoute("asked_never_booked"))} data-testid="booked-rest-door">
              Asked, never booked
            </LinkButton>
          </Tooltip>
        )}
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
        <LinkButton
          className="rpt-src"
          onClick={() => navigate(s.kind === "broadcast" ? `broadcasts/run:${s.id}` : `outbound/${s.id}`)}
          data-testid="source-open"
        >
##TO
        <LinkButton
          className="rpt-src"
          {...routeDoor(s.kind === "broadcast" ? `broadcasts/run:${s.id}` : `outbound/${s.id}`)}
          data-testid="source-open"
        >
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
          {s.kind === "playbook" ? ` · ${rptPlural(s.runs, "run")}` : ""}
##TO
          {s.kind === "playbook" ? ` · ${plural(s.runs, "run")}` : ""}
##END
##FILE apps/dashboard/src/surfaces/reports/google.tsx
##FROM
import { EmptyState } from "../kit/empty/empty";
import { Button } from "../kit/button/button";
##TO
import { EmptyState } from "../kit/empty/empty";
import { Figure } from "../kit/figure/figure";
import { Button } from "../kit/button/button";
##END
##FILE apps/dashboard/src/surfaces/reports/google.tsx
##FROM
import { RpTile, RptSection } from "./blocks";
##TO
import { RptSection } from "./blocks";
##END
##FILE apps/dashboard/src/surfaces/reports/google.tsx
##FROM
      <div className="rp2-tiles rp2-strip-google four" data-testid="google-tiles">
        {vm.tiles.map((t) => (
          <RpTile key={t.id} t={t} />
        ))}
      </div>
##TO
      {/* The strip's own pattern (RptTiles in blocks.tsx): the kit's figure in a list of terms, named by its metric; four, not five. */}
      <dl className="rpt-figures four" data-testid="google-tiles">
        {vm.tiles.map((t) => (
          <Figure
            key={t.id}
            className="rpt-cell"
            id={t.metric}
            label={t.label}
            value={t.value}
            change={t.compare}
            meta={t.meta}
          />
        ))}
      </dl>
##END
##FILE apps/dashboard/src/surfaces/reports/reach-outs.tsx
##FROM
import { navigate } from "../legacy-verbs";
##TO
import { routeDoor } from "../legacy-verbs";
##END
##FILE apps/dashboard/src/surfaces/reports/reach-outs.tsx
##FROM
                {s.kind === "chain" ? (
                  <LinkButton className="rpt-src" onClick={() => s.to && navigate(s.to)} data-testid="ro-source-open">
                    {s.name}
                  </LinkButton>
                ) : (
##TO
                {s.kind === "chain" ? (
                  s.to ? (
                    <LinkButton className="rpt-src" {...routeDoor(s.to)} data-testid="ro-source-open">
                      {s.name}
                    </LinkButton>
                  ) : (
                    <span className="rpt-src">{s.name}</span>
                  )
                ) : (
##END
##FILE apps/dashboard/src/surfaces/reports/reports-page.tsx
##FROM
import { Segmented } from "../kit/segmented/segmented";
##TO
import { Segmented } from "../kit/segmented/segmented";
import { Tooltip } from "../kit/tooltip/tooltip";
##END
##FILE apps/dashboard/src/surfaces/reports/reports-page.tsx
##FROM
      <span className="rpt-dates" title={`Days follow ${vm.timezone}`}>
        {vm.since} to {vm.until}
      </span>
##TO
      <Tooltip tip={`Days follow ${vm.timezone}`}>
        <span
          className="rpt-dates"
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focus stop for its tip, the one way a keyboard reads which zone the days follow
          tabIndex={0}
          aria-description={`Days follow ${vm.timezone}`}
        >
          {vm.since} to {vm.until}
        </span>
      </Tooltip>
##END
```

`rptPlural` is read by no one after this (`series.ts` still defines it until Task 3 deletes it, so this task stays green). `ReactNode` is still imported and used by `RptSection`'s `children`.

The stylesheet: the six `rp2-*` rule families that only `RpTile` and a dead card used go; Google's four take the strip's rules, with their own columns at each width (four make two rows of two, never three and one); a fact row and a source name keep layout only, and a row that is a link is not underlined text (`swap`):

```swap
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
/* ====================================================================
   Shared with other surfaces: Messages draws rp2 cards; Today draws its
   week, and Google its listing, with RpTile.
   ==================================================================== */

.rp2-card { position: relative; display: flex; flex-direction: column; }
.rp2-card .fl-card-head { align-items: center; }
.rp2-foot { font-size: 11.5px; color: var(--ink-dim); }

##TO
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
/* The strip: the indicators in one frame with hairline dividers — not six cards. */
.rp2-tiles { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0; background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius-md); overflow: hidden; }
.rp2-tiles.five { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.rp2-tile { display: flex; flex-direction: column; gap: 2px; padding: 11px 14px 9px; border: none; border-right: 1px solid var(--line); border-radius: 0; background: transparent; min-width: 0; box-shadow: none; }
.rp2-tile:last-child { border-right: none; }
.rp2-tile-label { font-family: var(--font-mono); text-transform: uppercase; color: var(--ink-faint); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp2-tile-value { font-size: 21px; font-weight: 500; letter-spacing: -0.015em; color: var(--ink); line-height: 1.15; font-variant-numeric: tabular-nums; }
.rp2-tile-meta { font-size: var(--text-xs); color: var(--ink-dim); line-height: 1.35; text-overflow: ellipsis; }
.rp2-tiles.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1100px) {
  .rp2-tiles, .rp2-tiles.five, .rp2-tiles.four { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rp2-tile { border-bottom: 1px solid var(--line); }
  .rp2-tile:nth-child(3n) { border-right: none; }
}
@media (max-width: 640px) {
  .rp2-tiles, .rp2-tiles.five, .rp2-tiles.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rp2-tile:nth-child(3n) { border-right: 1px solid var(--line); }
  .rp2-tile:nth-child(2n) { border-right: none; }
}

/* Cards: the same frame as the strip, tighter. */
.rp2-card { padding: 12px 14px; border-radius: var(--radius-md); gap: 8px; }
.rp2-card .fl-card-title { font-size: var(--text-sm); }
.rp2-card .fl-card-sub { font-variant-numeric: tabular-nums; }
/* The meaning line may take two lines before it clips. */
.rp2-tile-meta { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* Twenty-one small capitals must fit a strip cell beside a sidebar. */
.rp2-tile-label { font-size: 9px; letter-spacing: 0.05em; }

##TO
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
.rpt-fact .rpt-fact-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 10px; align-items: center; width: 100%; padding: 7px 0; text-align: left; border-radius: var(--radius-sm); }
button.rpt-fact-row { cursor: pointer; }
button.rpt-fact-row:hover .rpt-fact-door { background: var(--bg-hover); color: var(--ink); }
##TO
.rpt-fact .rpt-fact-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 10px; align-items: center; width: 100%; padding: 7px 0; text-align: left; border-radius: var(--radius-sm); }
/* A row that is a link is not underlined text: its words keep their own ink, and the door's chip is what answers a hover. */
a.rpt-fact-row { text-decoration: none; }
a.rpt-fact-row:hover .rpt-fact-door { background: var(--bg-hover); color: var(--ink); }
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
.rpt-fact-copy { min-width: 0; font-size: 13px; line-height: 1.45; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
##TO
.rpt-fact-copy { min-width: 0; font-size: 13px; line-height: 1.45; }
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
/* The strip: five figures (the kit's Figure) in one frame with hairline dividers, a list of terms and their values. */
##TO
/* The strip: five figures (the kit's Figure) in one frame with hairline dividers, a list of terms and their values; Google's four are
   the same strip with one cell fewer. */
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
/* Google's tiles further down are the shared RpTile (Today draws its week with it); on this page they wear this look. */
.rpt .rp2-tiles { border-radius: var(--radius-lg); }
.rpt .rp2-tile { padding: 12px 18px 13px; }
.rpt .rp2-tile-label { font-family: inherit; font-size: var(--text-sm); letter-spacing: 0; text-transform: none; font-weight: 400; color: var(--ink-muted); }
.rpt .rp2-tile-value { font-size: var(--text-2xl); letter-spacing: -0.025em; line-height: 1.2; font-variant-numeric: normal; }
.rpt .rp2-tile-meta { font-size: 12px; }
##TO
.rpt-figures.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
.rpt-sources .rpt-src { font-size: 13px; color: var(--ink); font-weight: 500; text-align: left; border-radius: var(--radius-xs); }
.rpt-sources .rpt-src:hover { text-decoration: underline; text-underline-offset: 3px; }
##TO
.rpt-sources .rpt-src { text-align: left; border-radius: var(--radius-xs); }
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
  .rpt-figures, .rpt .rp2-tiles, .rpt .rp2-tiles.four { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rpt-cell:nth-child(4) { border-left: none; }
  .rpt-cell:nth-child(n + 4) { border-top: 1px solid var(--line); }
##TO
  .rpt-figures { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .rpt-cell:nth-child(4) { border-left: none; }
  .rpt-cell:nth-child(n + 4) { border-top: 1px solid var(--line); }
  /* Four make two rows of two, not three and one. */
  .rpt-figures.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rpt-figures.four .rpt-cell:nth-child(n) { border-left: none; border-top: none; }
  .rpt-figures.four .rpt-cell:nth-child(even) { border-left: 1px solid var(--line); }
  .rpt-figures.four .rpt-cell:nth-child(n + 3) { border-top: 1px solid var(--line); }
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
  .rpt-fact-copy { white-space: normal; }
  .rpt-fact-sub::before { content: ""; }
##TO
  .rpt-fact-sub::before { content: ""; }
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
  .rpt-figures, .rpt .rp2-tiles, .rpt .rp2-tiles.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
##TO
  .rpt-figures { grid-template-columns: repeat(2, minmax(0, 1fr)); }
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
  .rpt-cell:last-child { grid-column: 1 / -1; border-left: none; }
##TO
  .rpt-cell:last-child { grid-column: 1 / -1; border-left: none; }
  .rpt-figures.four .rpt-cell:last-child { grid-column: auto; border-left: 1px solid var(--line); }
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
/* Google's strip of numbers sits inside its card: an inset there, not glass on glass. */
.rp2-strip-google {
  border: 0;
##TO
/* Google's strip of four: an inset, not glass on glass. */
.rpt-figures.four {
  border: 0;
##END
```

If a CSS swap stops on a mismatch (a stylesheet is read by eye, and a trailing space is invisible), delete those lines with the Edit tool instead; the check is that this prints nothing: `git grep -n "rp2-card\|rp2-foot\|rp2-tile\|rp2-strip" -- apps e2e tooling/scripts/tests`.

- [ ] **Step 4: Format, run, bank**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/reports/blocks.tsx apps/dashboard/src/surfaces/reports/google.tsx apps/dashboard/src/surfaces/reports/reach-outs.tsx apps/dashboard/src/surfaces/reports/reports-page.tsx
git grep -n "rp2-card\|rp2-foot\|rp2-tile\|rp2-strip\|RpTile" -- apps e2e tooling/scripts/tests
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/metrics-truth.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-pages.test.mjs
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm check:dead-exports
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
git diff --stat -- tooling/scripts/tests/baselines
```
Expected: `git grep` prints nothing (the plans and specs under `docs/` that name `rp2-tile` are history and are not searched); the four tests PASS; typecheck, lint and dead exports clean (`RpTile` was the dead export's one reader's only user: its export goes with it). The ratchets name falls and no rise: `kit-primitives.json` drops the six `reports.css::rp2-card`, `rp2-tile`, `rp2-tile-label`, `rp2-tile-meta`, `rp2-tile-value` and `rp2-tiles` entries; the unused-selector count in `style-values.json` may fall too. Any other file in the diff is named in the commit message and the pull request. The look is then **looked at in the real app** (`corepack pnpm --filter @chanlytics/dashboard dev`, `/w/<slug>/reports/reviews` on a workspace with a linked listing, at desk width, at 900px and at 375px): four figures in a row, two rows of two, never three and one; a fact row a quiet link that wraps; "Asked, never booked" a link with its tip.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/surfaces/reports/blocks.tsx apps/dashboard/src/surfaces/reports/google.tsx apps/dashboard/src/surfaces/reports/reach-outs.tsx apps/dashboard/src/surfaces/reports/reports-page.tsx apps/dashboard/src/legacy/styles/reports.css tooling/scripts/tests/reports/reports-page.test.mjs tooling/scripts/tests/reports/metrics-truth.test.mjs tooling/scripts/tests/reach-out-back/back-pages.test.mjs e2e/google.spec.ts tooling/scripts/tests/baselines
git commit -m "Reports draws Google's numbers as the strip's figures, its doors as links, and its tips in the kit's tooltip: RpTile and a dozen rules go." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reports' part 1 is finished (3 of 3): one spelling of a count and of the periods, no leftovers, docs and tests that tell the truth

**Why:** what is left of the review of #1424, all of it a thing said twice or a thing said falsely. (a) `rptPlural` (`series.ts`) is contracts' `plural` under another name, with two lens files reading it. (b) The Ask `report` tool spells 7, 30 and 90 three times (the schema, the description, the error) beside a `REPORT_RANGES.some` check the schema makes unreachable, and the three routes' `period` is `z.string()`, so neither the typed client nor `docs/api.md` knows there are four. (c) Dead rules and notes: the style-equality recorder keeps a scene runner for `SCENES = {}`, the Reports lens files say they were "moved from sections.tsx" (a file that is gone), a docblock sits over the wrong constant in `surface.ts`, `RptReachOuts` takes a `R | null` nothing passes. (d) Four documents say what the code no longer does. (e) A test reads source text for what two other tests execute. Nothing here changes what the page says.

**Files:**
- Modify: `apps/dashboard/src/surfaces/reports/series.ts`, `lenses/people.tsx`, `lenses/receptionist.tsx`, `lenses/campaigns.tsx`, `lenses/overview.tsx`, `lenses/pipeline.tsx`, `lenses/shared.tsx`, `blocks.tsx`, `reach-outs.tsx`, `surface.ts`, `apps/dashboard/src/legacy/styles/reports.css`
- Modify: `apps/dashboard/src/server/ask/tools/read/report.ts`, `apps/dashboard/src/server/readers/report.ts`, `packages/contracts/src/reports/report-periods.ts`, `packages/contracts/src/reports/index.ts` only if it does not already re-export the module whole
- Modify: `tooling/scripts/checks/style-equality.mjs`, `tooling/scripts/tests/styles/style-equality-pages.test.mjs`, `tooling/scripts/tests/styles/style-equality.test.mjs`
- Modify (docs): `.claude/skills/chanlytics-interface/SKILL.md`, `apps/dashboard/src/legacy/CLAUDE.md`, `apps/dashboard/src/legacy-bridge/app-bridge.ts`, `e2e/reports.spec.ts`, `docs/api.md` (generated)
- Modify (tests): `tooling/scripts/tests/reports/campaign-report.test.mjs`, `tooling/scripts/tests/reports/periods/report-periods.test.mjs`, `tooling/scripts/tests/reports/periods/report-routes.test.mjs`
- Regenerate: `apps/dashboard/src/client/routes.generated.ts`, `packages/contracts/src/route-keys.generated.ts`

- [ ] **Step 1: Write the failing tests**

The periods have one table, so the closed set a request's `period` is, the counts of days the Ask tool takes, and the sentence it says them in are all read from it; and a route is sent `period=month`, which no route test did (the reader's own test did). `reports/periods/report-periods.test.mjs` also learns where else to look on the day `days` ends (`swap`):

```swap
##FILE tooling/scripts/tests/reports/periods/report-routes.test.mjs
##FROM
const { reportDaysFor } = await importSrc("apps/dashboard/src/server/readers/report.ts");
##TO
const { reportDaysFor } = await importSrc("apps/dashboard/src/server/readers/report.ts");
const { fakeDb } = await import("../../_fake-db.mjs");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
const { REPORT_RANGES, REPORT_PERIOD_IDS } = await import("@chanlytics/contracts");
##END
##FILE tooling/scripts/tests/reports/periods/report-routes.test.mjs
##FROM
test("`days`, which open tabs still send, means what it meant; none named is thirty days; a period that is none of ours is refused in words", async () => {
##TO
test("a route sent period=month answers the days since the 1st in the workspace's zone, and the closed set of periods refuses any other at the door", async () => {
  setRateStore(memoryStore());
  const route = await importSrc("apps/dashboard/app/api/v1/reports/campaigns/route.ts");
  const asked = [];
  const ctx = () => ({
    supabase: fakeDb(
      {
        memberships: [
          {
            user_id: "u1",
            tenant_id: W,
            role: "viewer",
            tenants: { slug: "harbor", name: "Harbor Studio", timezone: "America/New_York" },
            created_at: "2026-01-01",
          },
        ],
      },
      {},
      {
        campaign_series: (a) => {
          asked.push(a);
          return { days: a.p_days };
        },
      },
    ),
    userId: "u1",
    email: "ada@example.com",
    params: {},
  });
  const out = await route.GET.run(
    new Request(`http://localhost/api/v1/reports/campaigns?period=month&workspace=${W}`),
    ctx(),
  );
  // Month is the day of the month in the workspace's zone, today included (a request that crosses local midnight is accepted: Not in this plan).
  const days = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(8, 10));
  assert.deepEqual([out, asked], [{ report: { days } }, [{ p_tenant_id: W, p_days: days }]]);
  for (const bad of ["14d", "7", "MONTH"])
    await assert.rejects(
      route.GET.run(new Request(`http://localhost/api/v1/reports/campaigns?period=${bad}&workspace=${W}`), ctx()),
      (e) => e.status === 400,
      `period=${bad} is no id of the table`,
    );
});

test("the table is the one list of periods: the closed set a request names, and the counts of days the Ask report tool takes, said from it", async () => {
  assert.deepEqual(
    REPORT_PERIOD_IDS,
    REPORT_RANGES.map((r) => r.id),
    "the ids, in the control's order",
  );
  const { reportTool } = await importSrc("apps/dashboard/src/server/ask/tools/read/report.ts");
  const [action] = Object.values(reportTool.actions);
  const counts = REPORT_RANGES.flatMap((r) => (r.days === null ? [] : [r.days]));
  for (const days of counts) assert.equal(action.input.safeParse({ days }).success, true, `${days} days`);
  for (const days of [1, 8, 45, 365])
    assert.equal(action.input.safeParse({ days }).success, false, `${days} days is no period of the table`);
  assert.ok(
    reportTool.description.includes(`days takes ${counts.slice(0, -1).join(", ")} or ${counts.at(-1)} and nothing else`),
    "the sentence the model reads is made from the table",
  );
});

test("`days`, which open tabs still send, means what it meant; none named is thirty days; a period that is none of ours is refused in words", async () => {
##END
##FILE tooling/scripts/tests/reports/periods/report-periods.test.mjs
##FROM
test("the days parameter ends on 19 October 2026: the change that removes it deletes its branch in report-periods.ts and this test", (t) => {
##TO
/** Every test that still sends `days=` to a report route: the day the parameter ends says where else to look. */
const SENDERS_OF_DAYS = [
  "ask/ask-routes.test.mjs (reports and reports/campaigns, `?days=`)",
  "ask/readers.test.mjs (the two loops that run a route beside its reader, `?days=${days}`)",
  "reach-out-back/back-routes.test.mjs (reports/reach-outs, `&days=`)",
  "reports/campaign-report.test.mjs (reports/campaigns, `?days=`)",
];

test("the days parameter ends on 19 October 2026: the change that removes it deletes its branch in report-periods.ts and this test", (t) => {
##END
##FILE tooling/scripts/tests/reports/periods/report-periods.test.mjs
##FROM
    `the days parameter's day (${REMOVE_AFTER}) passed more than ${GRACE_DAYS} days ago: remove it (report-periods.ts reportPeriodOf, the three routes' query) and this test`,
##TO
    `the days parameter's day (${REMOVE_AFTER}) passed more than ${GRACE_DAYS} days ago: remove it (report-periods.ts reportPeriodOf, the three routes' query), this test, and what still sends it: ${SENDERS_OF_DAYS.join("; ")}`,
##END
##FILE tooling/scripts/tests/reports/campaign-report.test.mjs
##FROM
  const s = readCode("apps/dashboard/src/surfaces/reports/surface.ts");
  assert.ok(
    s.includes('read("GET reports/campaigns", { query: { period } })'),
    "fetched with the same period, beside the receptionist's numbers",
  );
  assert.ok(
    s.includes("campaigns: campaigns instanceof Error ? null : toCampaignReportVM(campaigns.report)"),
    "its own read: null when it fails, never a blank page (D9)",
  );
  const lens = (name) => readCode(`apps/dashboard/src/surfaces/reports/lenses/${name}.tsx`);
  const p = lens("campaigns");
  assert.ok(
    p.includes('testid="chart-funnel"'),
    "the funnel: sent, delivered, wrote back (the campaign tiles folded into it: each number once)",
  );
  assert.ok(
    p.includes('testid="chart-campaigns"'),
    "chart-campaigns: the card, the empty and the failed read all carry it",
  );
  assert.ok(
    p.includes('testid="chart-sources"') && p.includes('title="By playbook and broadcast"'),
    "the sources card",
  );
  assert.ok(
    p.includes('<RptSection title="Campaigns"') && lens("overview").includes("<RptTiles "),
    "the page is sectioned, and the strip is one frame (its testid is executed: reports-page.test.mjs)",
  );
  assert.ok(
    !/\$\d|revenue|booked from/i.test(
      ["overview", "receptionist", "people", "pipeline", "campaigns", "reviews"].map(lens).join("\n"),
    ),
    "nothing in dollars",
  );
});
##TO
  // What the surface does with this read (its own request, null where it fails) and what the Campaigns lens draws from it are
  // executed, not read as text: reports/lenses/reports-lens-page.test.mjs and shell/empty-failed.test.mjs.
});
##END
##FILE tooling/scripts/tests/reports/campaign-report.test.mjs
##FROM
import { importSrc, readCode, readRaw } from "../_source.mjs";
##TO
import { importSrc, readRaw } from "../_source.mjs";
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/reports/periods/report-routes.test.mjs tooling/scripts/tests/reports/periods/report-periods.test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-routes.test.mjs
```
Expected: the first new test PASSES at once (it pins what the reader's own test held and no route test did: a route sent `period=month`); the second FAILS: `REPORT_PERIOD_IDS` is not exported from contracts, and the tool's description is its own words, not the table's. `report-periods.test.mjs` and `campaign-report.test.mjs` still PASS (they only lose what they said twice; run both after Step 5).

- [ ] **Step 3: One list of periods, one `plural`, nothing left over**

The periods (`swap`): the ids as a closed set, the three routes' `period` over it, the Ask tool from the table, and the page's count word deleted:

```swap
##FILE packages/contracts/src/reports/report-periods.ts
##FROM
/** The period a report is read over when none is named. */
##TO
/** The ids of the periods, in the control's order: the closed set a request's `period` is (the typed client and docs/api.md say them). */
export const REPORT_PERIOD_IDS = REPORT_RANGES.map((r) => r.id);

/** The period a report is read over when none is named. */
##END
##FILE apps/dashboard/src/server/readers/report.ts
##FROM
  period: z.string().optional(),
##TO
  period: z.literal(REPORT_PERIOD_IDS).optional(),
##END
##FILE apps/dashboard/src/server/readers/report.ts
##FROM
  parseTenantConfigResult,
  plural,
  reportPeriodOf,
##TO
  parseTenantConfigResult,
  plural,
  REPORT_PERIOD_IDS,
  reportPeriodOf,
##END
##FILE apps/dashboard/src/server/ask/tools/read/report.ts
##FROM
async function getReport(t: ToolContext, input: { days: number }): Promise<unknown> {
  const days = Number(input.days) || 30;
  if (!REPORT_RANGES.some((r) => r.days === days)) return { error: "days must be 7, 30 or 90" };
##TO
/** The counts of days the table offers (Month is no count: it is the days since the 1st, and the page's own), as the model is told them. */
const DAYS = REPORT_RANGES.flatMap((r) => (r.days === null ? [] : [r.days]));
const DAYS_SAID = `${DAYS.slice(0, -1).join(", ")} or ${DAYS.at(-1)}`;

async function getReport(t: ToolContext, input: { days: number }): Promise<unknown> {
  // The schema below refuses any other count, so the turn never gets here with one.
  const days = Number(input.days) || 30;
##END
##FILE apps/dashboard/src/server/ask/tools/read/report.ts
##FROM
  description:
    "The Reports page for the last 7, 30 or 90 days: messages
##TO
  description:
    `The Reports page for the last ${DAYS_SAID} days: messages
##END
##FILE apps/dashboard/src/server/ask/tools/read/report.ts
##FROM
the Reports page on screen already holds this. days takes 7, 30 or 90 and nothing else. An empty period
##TO
the Reports page on screen already holds this. days takes ${DAYS_SAID} and nothing else. An empty period
##END
##FILE apps/dashboard/src/server/ask/tools/read/report.ts
##FROM
a range the report cannot answer is an error, said in words.",
##TO
a range the report cannot answer is an error, said in words.`,
##END
##FILE apps/dashboard/src/server/ask/tools/read/report.ts
##FROM
  // The three periods as literals, not a number: the schema refuses 8, and says the three it takes.
  input: z.object({ days: z.literal([7, 30, 90]) }),
##TO
  // The table's counts as literals, not a number: the schema refuses 8, and says the ones it takes.
  input: z.object({ days: z.literal(DAYS) }),
##END
##FILE apps/dashboard/src/surfaces/reports/series.ts
##FROM

/** "1 message", "2 messages": a count with its noun, as Reports says every one. */
export const rptPlural = (n: number, one: string, many?: string): string => `${n} ${n === 1 ? one : many || `${one}s`}`;
##TO
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/people.tsx
##FROM
import type { ReportVM } from "@chanlytics/contracts";
##TO
import { plural, type ReportVM } from "@chanlytics/contracts";
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/people.tsx
##FROM
import { RPT_CHANNELS, rptPeriods, rptPlural } from "../series";
##TO
import { RPT_CHANNELS, rptPeriods } from "../series";
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/people.tsx
##FROM
            note: d.newPeople ? `${rptPlural(d.newPeople, "new person", "new people")} that day` : null,
##TO
            note: d.newPeople ? `${plural(d.newPeople, "new person", "new people")} that day` : null,
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/receptionist.tsx
##FROM
import type { ReportVM } from "@chanlytics/contracts";
##TO
import { plural, type ReportVM } from "@chanlytics/contracts";
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/receptionist.tsx
##FROM
import { RPT_ANSWERED, RPT_CALLS, RPT_REPLY, rptMood, rptPlural, rptSpread } from "../series";
##TO
import { RPT_ANSWERED, RPT_CALLS, RPT_REPLY, rptMood, rptSpread } from "../series";
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/receptionist.tsx
##FROM
          tipNote={(d) => rptPlural(d.in, "customer message")}
##TO
          tipNote={(d) => plural(d.in, "customer message")}
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/receptionist.tsx
##FROM
            `${d.label}: ${rptPlural(d.in, "customer message")}, ${d.ai} answered
##TO
            `${d.label}: ${plural(d.in, "customer message")}, ${d.ai} answered
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/receptionist.tsx
##FROM
            note: d.p50 == null ? "No replies" : rptPlural(d.count, "reply", "replies"),
##TO
            note: d.p50 == null ? "No replies" : plural(d.count, "reply", "replies"),
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/receptionist.tsx
##FROM
            describe={(d) => `${d.label}: ${rptPlural(d.calls, "call")}`}
##TO
            describe={(d) => `${d.label}: ${plural(d.calls, "call")}`}
##END
```

The tool's description becomes one template literal (its opening and closing quotes are backticks, so `${DAYS_SAID}` is read in it); the two lens files take `plural` into the value-and-type import they already have from contracts.

Leftovers (`swap`): the notes about a file that is gone, a docblock over the wrong constant, a parameter nothing passes, the stylesheet's header:

```swap
##FILE apps/dashboard/src/surfaces/reports/lenses/people.tsx
##FROM
/** The People lens: where they reach you, and when, and how many are new (moved from sections.tsx). */
##TO
/** The People lens: where they reach you, and when, and how many are new. */
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/receptionist.tsx
##FROM
/** The Receptionist lens: who answered, how fast, why it stopped, the calls, and who booked (moved from sections.tsx). */
##TO
/** The Receptionist lens: who answered, how fast, why it stopped, the calls, and who booked. */
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/campaigns.tsx
##FROM
/** The Campaigns lens: what the broadcasts and playbooks sent, and what the reach-outs wrote (moved from sections.tsx). */
##TO
/** The Campaigns lens: what the broadcasts and playbooks sent, and what the reach-outs wrote. */
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/overview.tsx
##FROM
 * The Overview lens: the receptionist's share of the answered beside Worth knowing, and the strip of counts (moved from
 * sections.tsx, decision 0015). A period nobody wrote or called in says so under the strip.
##TO
 * The Overview lens: the receptionist's share of the answered beside Worth knowing, and the strip of counts. A period nobody
 * wrote or called in says so under the strip.
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/pipeline.tsx
##FROM
 * The Pipeline lens: the proposals of the period and what became of them, and the clients now (moved from sections.tsx; the
 * Deals section's own comment stays with it).
##TO
 * The Pipeline lens: the proposals of the period and what became of them, and the clients now (the Deals section's own comment
 * stays with it).
##END
##FILE apps/dashboard/src/surfaces/reports/lenses/shared.tsx
##FROM
 * What the lenses share (moved from sections.tsx, decision 0015): the props every lens body takes, and the card a period
 * nobody wrote or called in draws.
##TO
 * What the lenses share: the props every lens body takes, and the card a period nobody wrote or called in draws.
##END
##FILE apps/dashboard/src/surfaces/reports/blocks.tsx
##FROM
 * The pieces of the Reports page (moved from legacy/pages/reports.jsx and reports-sections.jsx, decision 0015): a
 * section under its title, a number with what it is and one line of what it holds, the headline meter, Worth knowing,
 * the strip of counts, Asked-then-booked, and the table of sources.
##TO
 * The pieces of the Reports page: a section under its title, the headline meter, Worth knowing, the strip of counts,
 * Asked-then-booked, and the table of sources.
##END
##FILE apps/dashboard/src/surfaces/reports/reach-outs.tsx
##FROM
export function RptReachOuts({ R }: { R: ReportsSurface | null }) {
  const ro = R ? R.reachOuts : undefined;
  // Nothing reads it here (the demo): nothing of it is drawn.
##TO
export function RptReachOuts({ R }: { R: ReportsSurface }) {
  const ro = R.reachOuts;
  // Nothing reads it here (the demo): nothing of it is drawn.
##END
##FILE apps/dashboard/src/surfaces/reports/surface.ts
##FROM
/**
 * Reports — the receptionist's own numbers over a period.
 *
 * The mockup drew revenue, bookings and eight agents. This publishes the
 * report view model built from one SQL function that already applies the
 * Today metrics' rules (tenant time zone, no undated imports, answered-by =
 * first reply). Realtime message inserts re-apply so today's column moves.
 */
/** The periods this tab has read (held views)
##TO
/** The periods this tab has read (held views)
##END
##FILE apps/dashboard/src/surfaces/reports/surface.ts
##FROM
export const reportsOverride: SurfaceOverride = {
  key: "reports",
##TO
/**
 * Reports: the receptionist's own numbers over the period the page shows, built from one SQL function that already applies the
 * Today metrics' rules (the tenant's time zone, no undated imports, answered-by = first reply), with the campaigns' and the
 * reach-outs' reads beside it. Realtime message inserts re-apply it while its page is on screen, so today's column moves.
 */
export const reportsOverride: SurfaceOverride = {
  key: "reports",
##END
##FILE apps/dashboard/src/legacy/styles/reports.css
##FROM
   The Reports page: pages/reports.jsx (the shell and Google) and
   pages/reports-sections.jsx. One radius scale: cards 12px (the kit's),
##TO
   The Reports page (surfaces/reports/): the page, its lenses and Google's
   section. One radius scale: cards 12px (the kit's),
##END
```

`surface.ts`'s docblock is the one over `reportsHeld`; the second swap there puts the true one over the override it describes. If `lenses/receptionist.tsx` line 37's template (the `FROM` above names only its start) is longer than shown, the swap matches its start and keeps the rest.

The style-equality recorder keeps a scene runner for `SCENES = {}`; the scene runner, its export, its tests' halves and what only it used go (`swap`):

```swap
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
 * moment, and opens each route of PAGES and each scene of SCENES (a route and a press or two, for what is drawn only
 * after one; none today) at a desk width and at a phone's with a coarse pointer,
##TO
 * moment, and opens each route of PAGES at a desk width and at a phone's with a coarse pointer,
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
/**
 * What is drawn only after a press, each recorded as a page of its own: the record and route it opens, its presses (`click`,
 * `hover` or `focus` on the first element a selector finds, or `key`, the key named third pressed there), and what must then be
 * on screen. None now: the scenes pressed the pages that left (a person's menu, a confirm, a toast, a fold, a danger item, a
 * focused button, the tooltip on Today's bell), and the kit's states are held in a browser by e2e/kit/kit-behaves.spec.ts.
 */
export const SCENES = {};

##TO
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
/** How long a scene's press may wait for its element, in real time. */
const PRESS_TIMEOUT_MS = 10_000;
##TO
/** How long a wait on the page (a locator, a function) may take, in real time. */
const WAIT_TIMEOUT_MS = 10_000;
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
/** One press of a scene, on the first element its selector finds: a `key` press names its key third. */
async function press(page, [act, selector, key], what) {
  const target = page.locator(selector).first();
  const acts = {
    click: () => target.click(),
    hover: () => target.hover(),
    focus: () => target.focus(),
    key: () => target.press(key),
  };
  if (!acts[act] || (act === "key") !== (key !== undefined)) {
    throw new Error(`${what}: a scene presses by click, hover, focus or key (with its key), not ${act} ${key ?? ""}`);
  }
  try {
    await acts[act]();
  } catch (e) {
    throw new Error(`${what}: could not ${act} ${selector}: ${e.message.split("\n")[0]}`, { cause: e });
  }
}

/** One scene: from a page of nothing (so the route is drawn afresh), its route, its presses, and what they drew. */
async function playScene(page, quiet, { key, scene, theme, errors }) {
  await go(page, "_");
  await settle(page, quiet, key, 1);
  await go(page, scene.route);
  await settle(page, quiet, key);
  await refuseUndrawn(page, key, theme, errors);
  for (const step of scene.steps) await press(page, step, key);
  await settle(page, quiet, key, 1);
  if (!(await page.locator(scene.sees).first().isVisible())) throw new Error(`${key}: nothing matches ${scene.sees}`);
  await refuseUndrawn(page, key, theme, errors);
}

/** Every route and scene of one record, at one width, in one theme, in a context of its own. */
async function recordContext(browser, job) {
  const { harness, slug, name, device, theme, routes, scenes, plant, take, fold, walkArgs } = job;
  const context = await browser.newContext({
    ...VIEWPORTS[device],
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    // A toast's scene copies a number; a browser that refused the clipboard would throw in the page.
    permissions: ["clipboard-read", "clipboard-write"],
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(PRESS_TIMEOUT_MS);
##TO
/** Every route of one record, at one width, in one theme, in a context of its own. */
async function recordContext(browser, job) {
  const { harness, slug, name, device, theme, routes, plant, take, fold, walkArgs } = job;
  const context = await browser.newContext({
    ...VIEWPORTS[device],
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(WAIT_TIMEOUT_MS);
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
    await page.goto(`${harness.url}/w/${slug}/#/${routes[0] ?? scenes[0][1].route}`, {
##TO
    await page.goto(`${harness.url}/w/${slug}/#/${routes[0]}`, {
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
    for (const [scene, s] of scenes) {
      const key = `${where} scene: ${scene}`;
      await playScene(page, quiet, { key, scene: s, theme, errors });
      take(key, await page.evaluate(walk, walkArgs));
    }
    fold(await page.coverage.stopCSSCoverage());
##TO
    fold(await page.coverage.stopCSSCoverage());
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
const SETUP = ["format", "pages", "scenes", "viewports", "themes", "edgeStep", "laidOut", "properties", "browser"];

/** The setup a recording of `pages` and `scenes` is made with, all but what only the browser knows. */
const setupOf = (pages, scenes) => ({
  format: FORMAT,
  pages,
  scenes,
  viewports: VIEWPORTS,
##TO
const SETUP = ["format", "pages", "viewports", "themes", "edgeStep", "laidOut", "properties", "browser"];

/** The setup a recording of `pages` is made with, all but what only the browser knows. */
const setupOf = (pages) => ({
  format: FORMAT,
  pages,
  viewports: VIEWPORTS,
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
export async function record({ pages = PAGES, scenes = SCENES, plant = null, log = () => {} } = {}) {
##TO
export async function record({ pages = PAGES, plant = null, log = () => {} } = {}) {
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
    const records = [...new Set([...Object.keys(pages), ...Object.values(scenes).map((s) => s.record)])];
##TO
    const records = Object.keys(pages);
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
        const own = Object.entries(scenes).filter(([, s]) => s.record === name);
        for (const device of Object.keys(VIEWPORTS)) {
          for (const theme of THEMES) {
            const job = { harness, slug: WORKSPACE.slug, name, device, theme, routes, scenes: own, plant };
##TO
        for (const device of Object.keys(VIEWPORTS)) {
          for (const theme of THEMES) {
            const job = { harness, slug: WORKSPACE.slug, name, device, theme, routes, plant };
##END
##FILE tooling/scripts/checks/style-equality.mjs
##FROM
  const apart = before ? setupMismatch(before.meta, { ...before.meta, ...setupOf(PAGES, SCENES) }) : [];
##TO
  const apart = before ? setupMismatch(before.meta, { ...before.meta, ...setupOf(PAGES) }) : [];
##END
##FILE tooling/scripts/tests/styles/style-equality-pages.test.mjs
##FROM
 * What the style-equality recorder opens (tooling/scripts/checks/style-equality.mjs, PAGES and SCENES) is only ever a
##TO
 * What the style-equality recorder opens (tooling/scripts/checks/style-equality.mjs, PAGES) is only ever a
##END
##FILE tooling/scripts/tests/styles/style-equality-pages.test.mjs
##FROM
import { PAGES, SCENES } from "../../checks/style-equality.mjs";
##TO
import { PAGES } from "../../checks/style-equality.mjs";
##END
##FILE tooling/scripts/tests/styles/style-equality-pages.test.mjs
##FROM
/** Every route the recorder opens, with the record or scene that opens it. */
const opened = () => [
  ...Object.entries(PAGES).flatMap(([record, routes]) => routes.map((route) => [record, route])),
  ...Object.entries(SCENES).map(([name, scene]) => [`scene "${name}"`, scene.route]),
];
##TO
/** Every route the recorder opens, with the record that opens it. */
const opened = () => Object.entries(PAGES).flatMap(([record, routes]) => routes.map((route) => [record, route]));
##END
##FILE tooling/scripts/tests/styles/style-equality-pages.test.mjs
##FROM
  assert.deepEqual(gone, [], "a route that left the shell comes out of PAGES and SCENES in the change that moves it");
##TO
  assert.deepEqual(gone, [], "a route that left the shell comes out of PAGES in the change that moves it");
##END
##FILE tooling/scripts/tests/styles/style-equality-pages.test.mjs
##FROM
test("a record opens something, and a scene runs in a record that exists", () => {
  for (const [record, routes] of Object.entries(PAGES)) assert.ok(routes.length > 0, `${record} opens no route`);
  for (const [name, scene] of Object.entries(SCENES))
    assert.ok(Object.hasOwn(PAGES, scene.record), `scene "${name}": the record ${scene.record} opens no route`);
});
##TO
test("a record opens something", () => {
  for (const [record, routes] of Object.entries(PAGES)) assert.ok(routes.length > 0, `${record} opens no route`);
});
##END
##FILE tooling/scripts/tests/styles/style-equality.test.mjs
##FROM
  pages: {},
  scenes: {},
##TO
  pages: {},
##END
```

The recorder's other two calls (`record({ pages, scenes: {}, log })`, in its own self-check near the file's end) lose their `scenes: {}`: `node -e` over the file would be a second edit script, so they are the Edit tool's, two lines, found by `git grep -n "scenes: {}" -- tooling/scripts/checks/style-equality.mjs`, whose output is empty after. The `record` docblock's "and every scene" goes the same way (`git grep -n "every scene"`).

- [ ] **Step 4: The documents that no longer say what the code does**

```swap
##FILE .claude/skills/chanlytics-interface/SKILL.md
##FROM
`ListRow`, `Meter`, and those with behaviour of their own, on Base UI: `Sheet`
##TO
`ListRow`, `Meter`, `Figure`, and those with behaviour of their own, on Base UI: `Sheet`
##END
##FILE .claude/skills/chanlytics-interface/SKILL.md
##FROM
which the index names it from. The kit's root holds only what its families share: the index, the stylesheet, the
registry, `variants.ts` with its type test, and `press.tsx`, so no folder of it comes near the 20 modules a folder may hold (the
tree-shape measure).
##TO
which the index names it from. The kit's root holds only what its families share: the index, the stylesheet, the
registry (`classes.json`), `variants.ts` with its type test, `press.tsx`, and three small things more than one family calls:
`chosen.ts` (the one chosen state), `download.ts` (a file the browser saves) and `kit-globals.ts` (the components the shell's
pages still draw, under the names they read), so no folder of it comes near the 20 modules a folder may hold (the tree-shape
measure).
##END
##FILE .claude/skills/chanlytics-interface/SKILL.md
##FROM
  The recorder draws the kit's gallery and the shell's table, and nothing else: a surface that has left the shell is drawn by
##TO
  The recorder draws the kit's gallery, and nothing else: a surface that has left the shell is drawn by
##END
##FILE .claude/skills/chanlytics-interface/SKILL.md
##FROM
each as it stands. A surface imports the kit's own components (`Button`, `LinkButton`, `Panel`, `Face`, `ListRow`,
`Meter`, and those on Base UI); the rest are the house's JSX
##TO
each as it stands. A surface imports the kit's own components (`Button`, `LinkButton`, `Panel`, `Face`, `ListRow`,
`Meter`, `Figure`, and those on Base UI); the rest are the house's JSX
##END
##FILE .claude/skills/chanlytics-interface/SKILL.md
##FROM
| segmented control | `Segmented` (`.rec-seg`); `RecordToggleGroup` on a legacy page |
##TO
| segmented control | `Segmented` (`.rec-seg`); `RecordToggleGroup` on a legacy page |
| a number, what it counts and the period before | `Figure`, in the `dl` the page draws (Reports' strip, Google's four) |
##END
##FILE apps/dashboard/src/legacy/CLAUDE.md
##FROM
calendar[/a-id | /YYYY-MM-DD] · reports · tasks
##TO
calendar[/a-id | /YYYY-MM-DD] · reports[/<lens>] · tasks
##END
##FILE apps/dashboard/src/legacy-bridge/app-bridge.ts
##FROM
  // A file the page made (the chart kit's CSV, surfaces/kit/charts/card.tsx), asked for with a cancelable `app:file`: taken to the app's share sheet,
##TO
  // A file the page made (the kit's `downloadCsv`, surfaces/kit/download.ts), asked for with a cancelable `app:file`: taken to the app's share sheet,
##END
##FILE e2e/reports.spec.ts
##FROM
 * Reports, on a real workspace (the redesign of September 2026).
 *
 * The receptionist's share of the answered as a meter beside Worth knowing, five tiles compared with the period before
 * in counts, then the cards, each with a table twin, and nothing in dollars. Read-only: the range control only issues a
 * GET, and Ask is not pressed.
 *
 * Reports is the first page to leave the shell (decision 0015, step 3): it is an App Router page at
 * `/w/<slug>/reports`, and the frame draws its chrome around it.
##TO
 * Reports, on a real workspace: one App Router page of lenses (`/w/<slug>/reports`, the Overview, and
 * `/w/<slug>/reports/<lens>`), with the frame's chrome around it (decision 0015, and the lenses spec).
 *
 * The Overview: the receptionist's share of the answered as a meter beside Worth knowing, and a strip of five figures compared
 * with the period before in counts; then each lens's cards, each with a table twin, and nothing in dollars. Read-only: the
 * period control only issues a GET, and Ask is not pressed.
##END
```

The `SKILL.md` and `CLAUDE.md` edits are exact strings read on this tree; the first `SKILL.md` swap is the table's "Its components" row (its line is long: the swap matches the one clause).

- [ ] **Step 5: Regenerate, run, bank**

```bash
corepack pnpm --filter "./packages/*" build
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
corepack pnpm exec prettier --write packages/contracts/src/reports/report-periods.ts apps/dashboard/src/server/readers/report.ts apps/dashboard/src/server/ask/tools/read/report.ts apps/dashboard/src/surfaces/reports tooling/scripts/checks/style-equality.mjs tooling/scripts/tests/styles/style-equality-pages.test.mjs tooling/scripts/tests/styles/style-equality.test.mjs tooling/scripts/tests/reports/periods/report-routes.test.mjs tooling/scripts/tests/reports/periods/report-periods.test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs e2e/reports.spec.ts apps/dashboard/src/legacy-bridge/app-bridge.ts
node tooling/scripts/gen/route-types.mjs
corepack pnpm gen:api-reference
git diff --stat -- apps/dashboard/src/client/routes.generated.ts packages/contracts/src/route-keys.generated.ts docs/api.md
git grep -n "rptPlural\|scenes: {}\|SCENES\|every scene" -- apps tooling e2e
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-periods.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/campaign-report.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/style-equality-pages.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/style-equality.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-types.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/back-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm check:dead-exports
corepack pnpm format:check
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
```
Expected: all PASS. `git grep` prints nothing. `docs/api.md` names the four ids for `period` on the three report routes (and the typed client's query type is the union); `routes.generated.ts` and `route-keys.generated.ts` change only if a route's types do. The ratchets name falls and no rise: `source-scan` falls by the deleted assertions' `readCode` reads, and the casts, complexity, tree-shape and window-globals baselines do not move. A rise is a stop. If `check:dead-exports` names `REPORT_PERIOD_IDS`, the route's `ReportQuery` was not changed.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts apps/dashboard/src apps/dashboard/src/client/routes.generated.ts docs/api.md tooling/scripts/checks/style-equality.mjs tooling/scripts/tests e2e/reports.spec.ts .claude/skills/chanlytics-interface/SKILL.md
git commit -m "Reports' part 1 is finished: one list of periods and one count word, no scene runner or note for what is gone, and docs and tests that say what the code does." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The headline, in contracts: one derivation of a period's counts, its small DTO and its view model

**Why first:** everything else reads it, and the proof that Today can say what it says from six counts and a booking line is a test over the same series the page's view model is built from. This task adds, changes no behaviour, and leaves Today reading what it read.

**Files:**
- Create: `packages/contracts/src/reports/report-headline.ts`, `tooling/scripts/tests/reports/headline/report-headline.test.mjs`
- Modify: `packages/contracts/src/reports/reports.ts`, `packages/contracts/src/reports/index.ts`
- Regenerate: `packages/contracts/src/browser.generated.ts`, `packages/contracts/dist`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/headline/report-headline.test.mjs`:

```js
/**
 * The headline (contracts reports/report-headline.ts; `headlineOf` in reports.ts): what Today reads of a period, summed where
 * the series is. One derivation: its counts are `periodFactsOf`'s, the facts the page's view model is built from, so this holds it
 * to that view model for the same series (the world Reports' own tests draw, tests/reports/_report-world.mjs) over a matrix of
 * periods, and pins what goes over the wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineOf, isReportDto, toBookingReportVM, toHeadlineVM, toReportVM } from "@chanlytics/contracts";
import { CALENDAR, quiet, reportDto } from "../_report-world.mjs";

const NONE = { calendar: "none", days: 30, asked: 0, booked: 0 };
/** The world's series cut to what a period of `days` reads: the last `days` and the `days` before them, and no more (the function answers no more). */
const lastDays = (days) => {
  const dto = reportDto();
  return { ...dto, days, series: dto.series.slice(-2 * days) };
};
/** The periods the page offers over the world's fourteen days, and what Month is early in a month. */
const MATRIX = [
  ["the week, as the world has it", reportDto(), "7d", CALENDAR],
  ["a month on its first day: one day, against the one before it", lastDays(1), "month", CALENDAR],
  ["a month on its fifth day, the calendar unread", lastDays(5), "month", null],
  [
    "thirty days of a workspace younger than two periods: nothing before it to compare",
    lastDays(30),
    "30d",
    NONE,
  ],
  ["nobody wrote or called", { ...reportDto(), ...quiet() }, "7d", CALENDAR],
];

for (const [name, dto, period, booking] of MATRIX)
  test(`${name}: the headline says what the page's view model says of the same series`, () => {
    const page = toReportVM(dto, { profile: null });
    const messages = page.tiles.find((t) => t.id === "messages");
    assert.deepEqual(toHeadlineVM(headlineOf(dto, period, booking)), {
      period,
      days: page.days,
      rangeLabel: page.rangeLabel,
      lead: page.period.now,
      empty: page.empty,
      messages: { total: page.answered.totals.in, compare: messages.compare },
      answered: {
        ai: page.answered.totals.ai,
        you: page.answered.totals.you,
        none: page.answered.totals.none,
        share: page.answered.share,
      },
      calls: page.calls.total,
      booking: toBookingReportVM(booking),
    });
  });

test("what goes over the wire is counts and one ratio, not a day of the series: eleven fields, a few hundred bytes", () => {
  const dto = headlineOf(reportDto(), "7d", CALENDAR);
  assert.deepEqual(Object.keys(dto), [
    "period",
    "days",
    "empty",
    "messages_in",
    "messages_before",
    "answered_ai",
    "answered_you",
    "unanswered",
    "answered_share",
    "calls",
    "booking",
  ]);
  // The world's week: 17 messages (13 answered by the receptionist, 3 by the owner, 1 by nobody) and 3 calls, after a week
  // of 7 messages; the owner's calendar says 3 of the 8 who asked have an appointment.
  assert.deepEqual(dto, {
    period: "7d",
    days: 7,
    empty: false,
    messages_in: 17,
    messages_before: 7,
    answered_ai: 13,
    answered_you: 3,
    unanswered: 1,
    answered_share: 13 / 17,
    calls: 3,
    booking: CALENDAR,
  });
  assert.ok(JSON.stringify(dto).length < 400, "a small read");
  assert.equal(
    headlineOf({ ...reportDto(), days: 30 }, "30d", null).messages_before,
    null,
    "nothing before a workspace's first period: there is nothing to compare with, and the words say none",
  );
});

test("a database's answer is a report only when it holds the series and the days: its own refusal, a bare object and nothing are not", () => {
  assert.equal(isReportDto(reportDto()), true);
  assert.equal(isReportDto({ error: "unknown_tenant" }), false);
  assert.equal(isReportDto({ days: 7 }), false);
  assert.equal(isReportDto({ series: [] }), false);
  assert.equal(isReportDto(null), false);
  assert.equal(isReportDto("report"), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/report-headline.test.mjs`
Expected: FAIL at load: `SyntaxError: The requested module '@chanlytics/contracts' does not provide an export named 'headlineOf'`.

- [ ] **Step 3: The facts, the words and the headline in `reports.ts`**

Save as `task1.swap` and run it (Standing rules):

```swap
##FILE packages/contracts/src/reports/reports.ts
##FROM
import { REPORT_TILES, fmtSeconds, type ReportTileVM } from "./report-tiles";
import { sumOf } from "../shared/numbers";
##TO
import { REPORT_TILES, fmtSeconds, type ReportTileVM } from "./report-tiles";
import type { ReportHeadlineDto } from "./report-headline";
import type { ReportPeriodId } from "./report-periods";
import type { BookingReportDto } from "../calendar/calendar-people";
import { sumOf } from "../shared/numbers";
##END
##FILE packages/contracts/src/reports/reports.ts
##FROM
/**
 * What every part of the report is built from, counted once: the period asked for (the series' last `days`) and the
##TO
/**
 * The period in words, as a sentence takes it: the table's label for 7, 30 and 90 days, else the count ("5 days", Month on
 * the 5th). The report's and the headline's, so the two never spell a range two ways.
 */
export const rangeLabelOf = (days: number): string =>
  REPORT_RANGES.find((r) => r.days === days)?.label ?? plural(days, "day");

/** The two periods by name, said the same way wherever they are said: "Last 30 days", "The 30 days before". */
export const periodWords = (rangeLabel: string): { now: string; before: string } => ({
  now: `Last ${rangeLabel}`,
  before: `The ${rangeLabel} before`,
});

/**
 * What every part of the report is built from, counted once: the period asked for (the series' last `days`) and the
##END
##FILE packages/contracts/src/reports/reports.ts
##FROM
    noun,
    rangeLabel: REPORT_RANGES.find((r) => r.days === days)?.label ?? noun,
    // A comparison needs a period before that was lived in: its zeros are a count only if someone reached the business.
    priorHadAny: prev.in + prev.calls > 0,
##TO
    noun,
    rangeLabel: rangeLabelOf(days),
    // A comparison needs a period before that was lived in: its zeros are a count only if someone reached the business.
    priorHadAny: prev.in + prev.calls > 0,
    /** Nobody wrote or called in the period: no customer message and no call. */
    empty: tot.in === 0 && tot.calls === 0,
##END
##FILE packages/contracts/src/reports/reports.ts
##FROM
/** The Reports page's view model: a builder per part, over the facts counted once. `profile` is the workspace's hours
##TO
/**
 * What Today reads of a period, summed where the series is: the same facts the report is built from (`periodFactsOf`,
 * `answeredOf`), so a count is counted once and the number Today says is the number Reports prints, and none of the series'
 * days goes over the wire. `booking` is the calendar's line over the same days, counted beside it (the server's `bookingOf`).
 */
export function headlineOf(dto: ReportDto, period: ReportPeriodId, booking: BookingReportDto | null): ReportHeadlineDto {
  const f = periodFactsOf(dto);
  return {
    period,
    days: f.days,
    empty: f.empty,
    messages_in: f.tot.in,
    // Nothing to compare with where the period before had no customer message and no call at all (compareWords).
    messages_before: f.priorHadAny ? f.prev.in : null,
    answered_ai: f.tot.ai,
    answered_you: f.tot.you,
    unanswered: f.tot.none,
    answered_share: answeredOf(f).share,
    calls: f.tot.calls,
    booking,
  };
}

/** The Reports page's view model: a builder per part, over the facts counted once. `profile` is the workspace's hours
##END
##FILE packages/contracts/src/reports/reports.ts
##FROM
    empty: f.tot.in === 0 && f.tot.calls === 0,
##TO
    empty: f.empty,
##END
##FILE packages/contracts/src/reports/reports.ts
##FROM
    period: { now: `Last ${f.rangeLabel}`, before: `The ${f.rangeLabel} before` },
##TO
    period: periodWords(f.rangeLabel),
##END
```

- [ ] **Step 4: The DTO, the view model and the guard**

Create `packages/contracts/src/reports/report-headline.ts`:

```ts
/**
 * The headline: what Today reads of a period (the period line at the foot of the day's card and the two rows of Worth a look
 * that read Reports), and nothing else of the report. The report is a series of days over two periods; Today wants six counts,
 * one share and the calendar's line. `headlineOf` (reports.ts) sums them where the series is, from the facts the page's view
 * model is built from; `toHeadlineVM` words them. The Overview reads it too from phase C (the lenses spec, §6.5).
 */
import { toBookingReportVM, type BookingReportDto, type BookingReportVM } from "../calendar/calendar-people";
import type { ReportPeriodId } from "./report-periods";
import { periodWords, rangeLabelOf, type ReportDto } from "./reports";
import { compareWords } from "./report-tiles";

/** What `GET reports/headline` answers: counts over the period, and the calendar's line over the same days. */
export interface ReportHeadlineDto {
  /** The period asked for, as a request names it. */
  period: ReportPeriodId;
  /** The days it is: Month is the days since the 1st in the workspace's zone, today included. */
  days: number;
  /** Nobody wrote or called in the period. */
  empty: boolean;
  /** Customer messages in the period. */
  messages_in: number;
  /** Customer messages the period before; null where nothing reached the business then, so there is nothing to compare with. */
  messages_before: number | null;
  /** Who answered the period's customer messages, and the ones nobody did. */
  answered_ai: number;
  answered_you: number;
  unanswered: number;
  /** The receptionist's part of the answered, 0..1; null with nothing answered. */
  answered_share: number | null;
  /** Connected calls in the period. */
  calls: number;
  /** Asked, then booked, over the same days; null where it could not be counted at all. */
  booking: BookingReportDto | null;
}

/** What Today says of the period, in the words it says them: the one view model its line and its leaks read. */
export interface ReportHeadlineVM {
  period: ReportPeriodId;
  days: number;
  /** The period as a sentence takes it: "7 days", "30 days", "5 days" (Month on the 5th). */
  rangeLabel: string;
  /** How the period's sentences begin: "Last 7 days" (Reports' own words, periodWords). */
  lead: string;
  empty: boolean;
  /** The period's customer messages and how they compare with the period before, in counts ("up from 99"); null with nothing to compare. */
  messages: { total: number; compare: string | null };
  /** Who answered them, and the receptionist's share (0..1; null with nothing answered). */
  answered: { ai: number; you: number; none: number; share: number | null };
  calls: number;
  /** Asked, then booked: absent (`present` false) without a calendar to count against. */
  booking: BookingReportVM;
}

/** Whether the database answered a report (`report_series`): the series and the days it counts, and not its own `{ error }`. */
export function isReportDto(answer: unknown): answer is ReportDto {
  return (
    typeof answer === "object" &&
    answer !== null &&
    "series" in answer &&
    Array.isArray(answer.series) &&
    "days" in answer &&
    typeof answer.days === "number"
  );
}

export function toHeadlineVM(dto: ReportHeadlineDto): ReportHeadlineVM {
  const rangeLabel = rangeLabelOf(dto.days);
  return {
    period: dto.period,
    days: dto.days,
    rangeLabel,
    lead: periodWords(rangeLabel).now,
    empty: dto.empty,
    messages: {
      total: dto.messages_in,
      compare: compareWords(dto.messages_in, dto.messages_before ?? 0, rangeLabel, dto.messages_before !== null),
    },
    answered: { ai: dto.answered_ai, you: dto.answered_you, none: dto.unanswered, share: dto.answered_share },
    calls: dto.calls,
    booking: toBookingReportVM(dto.booking),
  };
}
```

In `packages/contracts/src/reports/index.ts` (`swap`):

```swap
##FILE packages/contracts/src/reports/index.ts
##FROM
  callMoodTone,
  toReportVM,
##TO
  callMoodTone,
  toReportVM,
  headlineOf,
##END
##FILE packages/contracts/src/reports/index.ts
##FROM
export type { ReportPeriodId } from "./report-periods";
##TO
export type { ReportPeriodId } from "./report-periods";
export { toHeadlineVM, isReportDto } from "./report-headline";
export type { ReportHeadlineDto, ReportHeadlineVM } from "./report-headline";
##END
```

- [ ] **Step 5: Build, then run the new test and the tests that hold the view model**

```bash
corepack pnpm exec prettier --write packages/contracts/src/reports/report-headline.ts packages/contracts/src/reports/reports.ts packages/contracts/src/reports/index.ts tooling/scripts/tests/reports/headline/report-headline.test.mjs
node -e "const fs=require('fs');const f='packages/db/src/database.types.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter "./packages/*" build
git diff --stat -- packages/db/dist/index.d.ts
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/report-headline.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-hold.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-honest.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-lines.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-where-when.test.mjs
corepack pnpm -r typecheck
```
Expected: the new test PASSES (seven tests: the five matrix rows, the wire's shape, the guard), the five view-model files PASS unchanged (`empty`, `period` and `rangeLabel` come from the new helpers by value), typecheck clean, `git diff --stat packages/db/dist/index.d.ts` empty.

- [ ] **Step 6: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add packages/contracts/src/reports/report-headline.ts packages/contracts/src/reports/reports.ts packages/contracts/src/reports/index.ts packages/contracts/src/browser.generated.ts packages/*/dist tooling/scripts/tests/reports/headline/report-headline.test.mjs
git commit -m "Today's numbers over a period are summed once, where the series is, and a small headline carries what Today says of them." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: One small read: `GET reports/headline`, over the same `report_series` and the one booking function

**Why:** the headline needs a door. It calls `reportSeries` (the function the page's route calls) and counts booking with the page's own code, moved to one function both readers call; it declares its policy like its three siblings.

**Files:**
- Create: `apps/dashboard/app/api/v1/reports/headline/route.ts`, `tooling/scripts/tests/reports/headline/headline-route.test.mjs`
- Modify: `apps/dashboard/src/server/readers/report.ts` (whole file), `tooling/scripts/tests/route-policy.json` (by its updater)
- Regenerate: `apps/dashboard/src/client/routes.generated.ts`, `packages/contracts/src/route-keys.generated.ts`, `docs/api.md`, `packages/contracts/dist`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/headline/headline-route.test.mjs`:

```js
/**
 * GET /api/v1/reports/headline (readers/report.ts `reportHeadline`): the same report_series the page's route calls, summed on
 * the server by contracts' headlineOf, with the booking line counted by the one function the report counts it with. Executed over
 * the database in memory, in the worlds Reports' reader tests draw (tests/ask/readers.test.mjs).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { headlineOf, toHeadlineVM, toReportVM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { reportDto } from "../_report-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const kernel = await importSrc("apps/dashboard/src/server/readers/index.ts");
const { reportHeadline, reportPeriodAsked } = await importSrc("apps/dashboard/src/server/readers/report.ts");
const headlineRoute = await importSrc("apps/dashboard/app/api/v1/reports/headline/route.ts");
const reportsRoute = await importSrc("apps/dashboard/app/api/v1/reports/route.ts");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const req = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const none = (days) => ({ calendar: "none", days, asked: 0, booked: 0 });
/** Harbor Studio in New York: nobody in People, no calendar, and report_series answering the world's series for the days asked. */
const world = (answer = (a) => ({ ...reportDto(), days: a.p_days })) => ({
  tables: {
    memberships: [
      {
        user_id: "u1",
        tenant_id: A,
        role: "viewer",
        tenants: { slug: "harbor", name: "Harbor Studio", timezone: "America/New_York" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    tenants: [],
    tenant_config: [],
    policies: [],
  },
  rpcs: { report_series: answer, people_list: () => [] },
});
const ctxOf = (w) => ({ supabase: fakeDb(w.tables, {}, w.rpcs), userId: "u1", email: "ada@example.com", params: {} });
const seenOf = (ctx, name) => ctx.supabase.seen.filter((q) => q.rpc === name).map((q) => q.args);

test("the route answers the series summed on the server, for each preset: report_series asked once, for the days, and the booking line beside it", async () => {
  for (const [period, days] of [
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ]) {
    const ctx = ctxOf(world());
    const body = await headlineRoute.GET.run(req(`?period=${period}&workspace=${A}`), ctx);
    assert.deepEqual(Object.keys(body), ["headline"]);
    assert.deepEqual(body.headline, headlineOf({ ...reportDto(), days }, period, none(days)), period);
    assert.deepEqual(seenOf(ctx, "report_series"), [{ p_tenant_id: A, p_days: days }], `${period}: one call, for ${days}`);
  }
});

test("Today's numbers are Reports' numbers: the headline and the page's own route count one series, and the booking line is the same line", async () => {
  const page = await reportsRoute.GET.run(req(`?period=30d&workspace=${A}`), ctxOf(world()));
  const head = await headlineRoute.GET.run(req(`?period=30d&workspace=${A}`), ctxOf(world()));
  const vm = toReportVM(page.report, { profile: page.profile });
  const today = toHeadlineVM(head.headline);
  assert.equal(today.messages.total, vm.answered.totals.in);
  assert.equal(today.messages.compare, vm.tiles.find((t) => t.id === "messages").compare);
  assert.equal(today.answered.share, vm.answered.share);
  assert.equal(today.calls, vm.calls.total);
  assert.deepEqual(head.headline.booking, page.booking, "the one booking function: the same answer from the same world");
});

test("Month is the days since the 1st in the workspace's zone, as for the other three report routes", async () => {
  const ctx = ctxOf(world());
  const rc = kernel.readerContext(
    ctx,
    { tenantId: A, role: "viewer", facts: { name: "Harbor Studio", timezone: "America/New_York" } },
    new Date("2026-10-05T12:00:00Z"),
  );
  const { data } = await kernel.load(rc, reportHeadline, { period: "month" });
  assert.deepEqual([data.headline.period, data.headline.days], ["month", 5]);
  assert.deepEqual(seenOf(ctx, "report_series"), [{ p_tenant_id: A, p_days: 5 }]);
});

test("a workspace the database answers nothing for is the page's 404, in its words; a period that is none of ours is refused in words", async () => {
  const rc = kernel.readerContext(ctxOf(world(() => ({ error: "unknown_tenant" }))), { tenantId: A, role: "viewer" });
  await assert.rejects(
    kernel.load(rc, reportHeadline, { period: "7d" }),
    (e) => [e.code, e.status, e.message].join("|") === "not_found|404|No workspace found for this report.",
  );
  for (const bad of [{ period: "14d" }, { period: "" }, { days: "45" }])
    assert.throws(
      () => reportPeriodAsked(bad),
      (e) => e.status === 400 && e.message === "period must be 7d, 30d, 90d or month.",
      JSON.stringify(bad),
    );
  assert.equal(reportPeriodAsked({}), "30d", "none named is thirty days");
});

test("the route declares its policy as its siblings do: a member's read, counted with the aggregate reads", () => {
  assert.deepEqual(headlineRoute.GET.policy, {
    kind: "read",
    scope: "workspace",
    role: null,
    rate: "aggregate",
    spend: false,
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/headline-route.test.mjs`
Expected: FAIL at load: the route module `apps/dashboard/app/api/v1/reports/headline/route.ts` cannot be found.

- [ ] **Step 3: The reader**

Write the whole of `apps/dashboard/src/server/readers/report.ts`:

```ts
import "server-only";
import { z } from "zod";
import {
  AppError,
  dealsAreOn,
  fixedDaysOf,
  headlineOf,
  isReportDto,
  monthDaysAt,
  parseTenantConfigResult,
  plural,
  REPORT_PERIOD_IDS,
  reportPeriodOf,
  zoneDayKey,
  type BookingReportDto,
  type DealReportDto,
  type PersonRowDto,
  type ReportDto,
  type ReportHeadlineDto,
  type ReportPeriodId,
  type ReportProfile,
} from "@chanlytics/contracts";
import { reportSeries } from "@chanlytics/db";
import { everyone } from "../people/people";
import { bookingReport } from "../calendar/people-visits";
import { dealReport } from "../people/deals";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import * as facts from "./facts";
import { log } from "@/server/log";

/**
 * Asked, then booked over `days`: the one conversion line, from everyone in People and the calendar. Never fatal: a feed that
 * cannot be read costs this line (null), not the report. `people` is everyone, not one 1000-row page: every other number is
 * computed in SQL over the whole workspace, and a conversion rate over a truncated denominator would disagree with all of them.
 * The calendar's zone and settings are the turn's (readers/facts.ts): a turn that holds them reads neither again, and a request
 * reads each once, where the booking line's own lookup read them. The report and the headline both count the line here.
 */
async function bookingOf(
  rc: ReaderContext,
  days: number,
  people: Promise<PersonRowDto[]>,
): Promise<BookingReportDto | null> {
  return people
    .then(async (rows) => {
      const [zone, settings] = await Promise.all([load(rc, facts.facts, undefined), load(rc, facts.config, undefined)]);
      return bookingReport(rc.ctx, rc.tenantId, rows, days, undefined, {
        timezone: zone.data.timezone,
        config: settings.data?.config ?? null,
      });
    })
    .catch((e: unknown) => {
      log.error("booking_report_failed", {
        tenant_id: rc.tenantId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    });
}

/**
 * GET reports, as the route answers it: the receptionist's numbers day by day for one of the four periods (the route
 * refuses any other), then the booking line and the deals beside them -- the route's body, moved here whole, so the
 * Reports page and Ask's report tool read the same rows the same way. One SECURITY INVOKER function computes the series
 * in the tenant's own zone under the caller's RLS; a function that answers nothing is the route's 404, in its words,
 * before anything else is read. The calendar's zone and settings, and how the workspace's customers buy, come through
 * their readers, once in a turn. It returns the workspace's profile too: the hours and closures the while-you-were-closed
 * count is made from, `{}` where it was read with none, null where it could not be read. The page is the row a citation
 * names.
 */
export const report: Reader<
  { days: number },
  { report: ReportDto; booking: BookingReportDto | null; deals: DealReportDto | null; profile: ReportProfile | null }
> = {
  name: "report",
  async read(rc, { days }) {
    const ctx = rc.ctx;
    const tenantId = rc.tenantId;
    const report = (await reportSeries(ctx.supabase, tenantId, days)) as unknown as ReportDto;
    if (!report || report.error) throw new AppError("not_found", "No workspace found for this report.", 404);
    // Asked, then booked — the one conversion line, from the calendar. Read once: the deals below say where the new
    // clients came from out of the same rows.
    const people = everyone(ctx, tenantId);
    const booking = await bookingOf(rc, days, people);
    // The deals of the period and the stock (0004), only where deals are on (0008) and a deal was recorded. Never
    // fatal either: a table that cannot be read costs the section, and People that cannot be read cost only the line
    // that says where the new clients came from. How the workspace's customers buy is the turn's (readers/facts.ts).
    const deals = await load(rc, facts.sellsBy, undefined)
      .then((r) => r.data)
      .then(async (sellsBy) => dealReport(ctx, tenantId, days, dealsAreOn(sellsBy), await people.catch(() => [])))
      .catch(() => null);
    // The workspace's hours and closures, which Reports' while-you-were-closed counts against (spec A2): the turn's
    // config, which the booking line above already read, parsed as the calendar parses it, without its log line. Null
    // is a profile that could not be read (no row, a config the parser refuses, a read that failed): the report then
    // says nothing of the hours. A config read whole that keeps none is an empty profile, which is how the report
    // knows the workspace has not set them.
    const profile: ReportProfile | null = await load(rc, facts.config, undefined)
      .then((s) => {
        const parsed = s.data ? parseTenantConfigResult(s.data.config) : null;
        if (!parsed?.ok) return null;
        const { hours, closures } = parsed.config.brain?.profile ?? {};
        return { ...(hours && { hours }), ...(closures && { closures }) };
      })
      .catch(() => null);
    return {
      data: { report, booking, deals, profile },
      rows: [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${plural(days, "day")}` }],
      stamp: stamp(),
    };
  },
};

/**
 * GET reports/headline, as the route answers it: what Today reads of a period and nothing else of the report. The same
 * `report_series` the page's route calls, summed here by contracts' `headlineOf` (so the number is the page's number and no day of
 * the series goes over the wire), and the booking line counted by `bookingOf`, the page's own code, beside it: the series and the
 * people and the calendar are read together, not one after the other. A function that answers nothing is the page's 404.
 */
export const reportHeadline: Reader<{ period: ReportPeriodId }, { headline: ReportHeadlineDto }> = {
  name: "report_headline",
  async read(rc, { period }) {
    const days = await reportDaysFor(rc, { period });
    const [answer, booking] = await Promise.all([
      reportSeries(rc.ctx.supabase, rc.tenantId, days),
      bookingOf(rc, days, everyone(rc.ctx, rc.tenantId)),
    ]);
    if (!isReportDto(answer)) throw new AppError("not_found", "No workspace found for this report.", 404);
    return {
      data: { headline: headlineOf(answer, period, booking) },
      rows: [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${plural(days, "day")}` }],
      stamp: stamp(),
    };
  },
};

/**
 * The one query the three report routes take (GET reports, reports/campaigns and reports/reach-outs): the window they
 * read, said once, so the three never disagree about it.
 */
export const ReportQuery = z.object({
  /** `7d`, `30d`, `90d` or `month`; thirty days when none is named. */
  period: z.literal(REPORT_PERIOD_IDS).optional(),
  /** What the pages sent before `period` existed: read until 19 October 2026 (contracts report-periods.ts, and the day is held by tests/reports/periods/report-periods.test.mjs). */
  days: z.string().optional(),
});

/** The period a request names, or the request's refusal in words: it is the window every report route reads, said once. */
export function reportPeriodAsked(input: z.infer<typeof ReportQuery>): ReportPeriodId {
  const period = reportPeriodOf(input);
  if (period === null) throw new AppError("validation", "period must be 7d, 30d, 90d or month.");
  return period;
}

/**
 * The days a request's period is. Month is the days since the 1st in the workspace's own zone, today included (the zone is
 * the membership's, which `readerContext` seeds: nothing is read for it, and nothing at all for a period of fixed days).
 * A period that is none of ours is the request's refusal.
 */
export async function reportDaysFor(rc: ReaderContext, input: z.infer<typeof ReportQuery>): Promise<number> {
  const period = reportPeriodAsked(input);
  const fixed = fixedDaysOf(period);
  if (fixed !== null) return fixed;
  const zone = (await load(rc, facts.facts, undefined)).data.timezone;
  return monthDaysAt(zoneDayKey(rc.now.getTime(), zone));
}
```

- [ ] **Step 4: The route**

Create `apps/dashboard/app/api/v1/reports/headline/route.ts`:

```ts
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { ReportQuery, reportHeadline, reportPeriodAsked } from "@/server/readers/report";

/**
 * GET /api/v1/reports/headline?period=7d|30d|90d|month — what Today reads of a period: its customer messages and how they compare
 * with the period before, who answered them, its calls and how many of the people who asked have an appointment. The same
 * `report_series` the page's route calls, summed on the server (so Today never loads the report), over the same four periods.
 * `days` is not read: no page sent it to a route that did not exist. The body is its reader's (readers/report.ts), which the
 * Overview reads too from phase C. Counted with the other aggregate reads; any member.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: ReportQuery.pick({ period: true }),
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    return (await load(rc, reportHeadline, { period: reportPeriodAsked(input) })).data;
  },
});
```

- [ ] **Step 5: Bank the policy, regenerate the client and the reference, build, run**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/server/readers/report.ts apps/dashboard/app/api/v1/reports/headline/route.ts tooling/scripts/tests/reports/headline/headline-route.test.mjs
UPDATE_ROUTE_POLICY=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-policy.test.mjs
node tooling/scripts/gen/route-types.mjs
corepack pnpm gen:api-reference
git diff --stat -- tooling/scripts/tests/route-policy.json apps/dashboard/src/client/routes.generated.ts packages/contracts/src/route-keys.generated.ts docs/api.md
corepack pnpm --filter "./packages/*" build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/headline-route.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/report-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-policy.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-types.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/api-reference.test.mjs
corepack pnpm -r typecheck
```
Expected: the policy diff is one added block, `"GET reports/headline": { "kind": "read", "scope": "workspace", "role": null, "rate": "aggregate", "spend": false }`, between `GET reports/campaigns` and `GET reports/reach-outs` (the file's order is the routes' path order); the generated client gains `"GET reports/headline"` in `ROUTES` and in the handler map, the contracts' route keys gain it, and `docs/api.md` gains its section; every test PASSES (the page's reader tests prove `bookingOf` is a pure move: the same keys in the same order, the same `booking` for every world); typecheck clean.

- [ ] **Step 6: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add apps/dashboard/src/server/readers/report.ts apps/dashboard/app/api/v1/reports/headline/route.ts apps/dashboard/src/client/routes.generated.ts packages/contracts/src/route-keys.generated.ts packages/*/dist tooling/scripts/tests/route-policy.json docs/api.md tooling/scripts/tests/reports/headline/headline-route.test.mjs
git commit -m "One small read, GET reports/headline, sums a period on the server over the same report_series and the one booking line." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The headline is a surface: held by period, read at boot and when the period moves, never by the live feed

**Why:** Today reads surfaces through the seam. The headline needs a key, an override, held views by period (as Reports' own are, so a pick of a period this tab has read paints at once) and the places that re-read it. It is registered and read at boot from this task, but Today does not draw it until Task 7, so Today's words do not move here. A pick on the Reports page also moves the headline, and the brief's first draft read it on every pick, which doubles the heaviest read while the member is on Reports: so a pick **paints** the headline this tab holds for the period and reads behind it only when none is held for it or the held one was read more than a few minutes ago (five minutes, `HEADLINE_STALE_MS`), and a pick that fails is taken back by repainting the headline of the period kept.

**Files:**
- Create: `apps/dashboard/src/surfaces/reports/headline.ts`, `tooling/scripts/tests/reports/headline/headline-surface.test.mjs`
- Modify: `apps/dashboard/src/surfaces/reports/period.ts` (whole file), `apps/dashboard/src/surfaces/surface-values.ts`, `apps/dashboard/src/legacy-bridge/LegacyApp.tsx`, `apps/dashboard/src/legacy-bridge/refresh-map.ts`, `tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs`, `tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs`, `tooling/scripts/tests/shell/empty-failed.test.mjs`, `e2e/reports.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/headline/headline-surface.test.mjs`:

```js
/**
 * The headline's override (surfaces/reports/headline.ts): one read of GET reports/headline for the period Reports shows,
 * published under `reports_headline` through the seam as contracts' view model; held by period, so a pick of a period this tab has
 * read paints at once; an answer for a period left is not painted; a read that fails fails the surface, never an empty line; and no
 * live-feed rule of its own (the brief's "copy the Reports surface's" would be inert: no route's own surface is this one). A period
 * pick (period.ts) paints what is held and reads behind it only when it must, and a pick that failed repaints the period kept.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_MS, headlineOf, toHeadlineVM } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";
import { CALENDAR, reportDto } from "../_report-world.mjs";

installLegacyReact();
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const keepError = console.error;
console.error = () => {};
const { reportsHeadlineOverride, paintHeldHeadline, isHeadlineStale } = await importSrc(
  "apps/dashboard/src/surfaces/reports/headline.ts",
);
const { keepReportPeriod, shownReportPeriod } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { setReportRange } = await importSrc("apps/dashboard/src/surfaces/reports/period.ts");
const { surfaceValue, setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
console.error = keepError;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const asked = [];
let parked = null;
let refuse = null;
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const period = u.searchParams.get("period");
  const route = u.pathname.replace("/api/v1/", "");
  asked.push(`${route} ${period}`);
  if (/^reports\/(campaigns|reach-outs)$/.test(route)) return json(500, { ok: false, error: { code: "internal", message: "no" } });
  if (route === "reports" && refuse === period) return json(500, { ok: false, error: { code: "internal", message: "down" } });
  if (parked && parked.period === period) await parked.until;
  if (route === "reports") return json(200, { ok: true, data: { report: reportDto(), booking: CALENDAR, deals: null } });
  return json(200, { ok: true, data: { headline: headlineOf(reportDto(), period, CALENDAR) } });
};
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const headlineReads = () => asked.filter((a) => a.startsWith("reports/headline"));
const reset = (period) => {
  asked.length = 0;
  parked = null;
  refuse = null;
  keepReportPeriod(period);
  setSurfaceValue("reports_headline", undefined);
};

test("one read of the headline for the period Reports shows, published as contracts' view model under its own key", async () => {
  reset("30d");
  await reportsHeadlineOverride.apply();
  assert.deepEqual(asked, ["reports/headline 30d"], "one request, for the shown period");
  assert.deepEqual(surfaceValue("reports_headline"), toHeadlineVM(headlineOf(reportDto(), "30d", CALENDAR)));
  assert.equal(reportsHeadlineOverride.key, "reports_headline");
  assert.equal(reportsHeadlineOverride.value, "reports_headline", "the cache keeps it beside the surface's snapshot");
  assert.deepEqual(reportsHeadlineOverride.events, ["surface:reports_headline"]);
  assert.equal(reportsHeadlineOverride.view(), "30d", "reads of one period take their turn, a pick of another starts at once");
  assert.equal(
    Object.keys(globalThis.window).filter((k) => /HEADLINE/i.test(k)).length,
    0,
    "published through the seam alone: no mirror on window",
  );
});

test("it has no live-feed rule: a message moves a count by one in a hundred and the read reaches for the people pool and the calendar", () => {
  assert.equal(reportsHeadlineOverride.refreshOnMessageInserts, undefined);
  assert.equal(reportsHeadlineOverride.refreshOnTables, undefined);
  assert.equal(reportsHeadlineOverride.refreshWhen, undefined);
});

test("held by period: a period read is painted at once when picked again, one never read is not, and the answer for a period left is not painted", async () => {
  reset("30d");
  await reportsHeadlineOverride.apply();
  keepReportPeriod("7d");
  assert.equal(paintHeldHeadline(), false, "seven days was never read: nothing to paint");
  assert.equal(surfaceValue("reports_headline").period, "30d", "and what was shown stays");
  await reportsHeadlineOverride.apply();
  assert.equal(surfaceValue("reports_headline").period, "7d");
  keepReportPeriod("30d");
  assert.equal(paintHeldHeadline(), true, "thirty days was read: painted before any read of it");
  assert.equal(surfaceValue("reports_headline").period, "30d");
  assert.equal(shownReportPeriod(), "30d");
  // A slow read of 30 lands after the pick of 7: its answer is for a period left and never lands on the new one.
  let release = () => {};
  parked = { period: "30d", until: new Promise((r) => (release = r)) };
  const slow = reportsHeadlineOverride.apply();
  keepReportPeriod("7d");
  await reportsHeadlineOverride.apply();
  release();
  await slow;
  assert.equal(surfaceValue("reports_headline").period, "7d", "REGRESSION: a late answer put the old period over the new one");
});

test("a read that fails fails the surface: the shell says so where the line would be, never a line about nobody", async () => {
  reset("30d");
  const was = globalThis.window.fetch;
  globalThis.window.fetch = async () => json(500, { ok: false, error: { code: "internal", message: "down" } });
  try {
    await assert.rejects(() => reportsHeadlineOverride.apply(), (e) => e && e.code === "internal");
    assert.equal(surfaceValue("reports_headline"), undefined);
  } finally {
    globalThis.window.fetch = was;
  }
});

test("a period pick paints the held headline and reads behind it only when none is held or the held one is old; a pick that fails repaints the period kept", async () => {
  const stop = startSurfaces([], () => () => {});
  const realNow = Date.now;
  try {
    reset("30d");
    await reportsHeadlineOverride.apply();
    assert.equal(isHeadlineStale(), false, "just read");
    asked.length = 0;

    // Seven days, never read: nothing to paint, so it is read behind the pick, and the value that lands is the seven days'.
    await setReportRange("7d");
    await settle();
    assert.deepEqual(headlineReads(), ["reports/headline 7d"], "one read of the headline, for the period picked");
    assert.equal(surfaceValue("reports_headline").period, "7d", "REGRESSION: the headline stayed on the period before the pick");

    // Back to thirty days, which is held and fresh: painted at once, and not read again (the pick was doubling the read).
    asked.length = 0;
    await setReportRange("30d");
    await settle();
    assert.equal(surfaceValue("reports_headline").period, "30d", "painted from what is held");
    assert.deepEqual(headlineReads(), [], "REGRESSION: a held, fresh headline was read again on every pick");

    // A held headline read longer ago than HEADLINE_STALE_MS is painted and read behind.
    Date.now = () => realNow() + 10 * MIN_MS; // past the few minutes a held headline stays fresh
    assert.equal(isHeadlineStale(), true);
    asked.length = 0;
    await setReportRange("7d");
    await settle();
    assert.equal(surfaceValue("reports_headline").period, "7d", "painted at once");
    assert.deepEqual(headlineReads(), ["reports/headline 7d"], "and read behind, being old");
    Date.now = realNow;

    // A pick whose own read fails is taken back: the headline Today says is the period Reports kept, not the one that failed.
    await setReportRange("30d");
    await settle();
    asked.length = 0;
    refuse = "90d";
    const ok = await setReportRange("90d");
    await settle();
    assert.equal(ok, false, "the pick failed");
    assert.equal(shownReportPeriod(), "30d", "the period goes back");
    assert.equal(
      surfaceValue("reports_headline").period,
      "30d",
      "REGRESSION: Today kept saying 90 days after the pick that failed, while the page said thirty",
    );
  } finally {
    Date.now = realNow;
    stop();
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/headline-surface.test.mjs`
Expected: FAIL at load: `apps/dashboard/src/surfaces/reports/headline.ts` cannot be found.

- [ ] **Step 3: The key, the override, the pick, the registrations**

`shownReportPeriod` is `surface.ts`'s since Task 1; `period.ts` already has its guard for a pick left behind. The key and the registrations (`swap`):

```swap
##FILE apps/dashboard/src/surfaces/surface-values.ts
##FROM
import type { TodayVM } from "@chanlytics/contracts";
##TO
import type { ReportHeadlineVM, TodayVM } from "@chanlytics/contracts";
##END
##FILE apps/dashboard/src/surfaces/surface-values.ts
##FROM
  reports: ReportsSurface;
  google: GoogleSurface;
##TO
  reports: ReportsSurface;
  /** Today's one small read of the period (contracts ReportHeadlineVM): the card's period line and Worth a look read it. */
  reports_headline: ReportHeadlineVM;
  google: GoogleSurface;
##END
##FILE apps/dashboard/src/surfaces/surface-values.ts
##FROM
  reports: true,
  google: true,
##TO
  reports: true,
  reports_headline: true,
  google: true,
##END
##FILE apps/dashboard/src/legacy-bridge/LegacyApp.tsx
##FROM
import { reportsOverride } from "@/surfaces/reports/surface";
##TO
import { reportsOverride } from "@/surfaces/reports/surface";
import { reportsHeadlineOverride } from "@/surfaces/reports/headline";
##END
##FILE apps/dashboard/src/legacy-bridge/LegacyApp.tsx
##FROM
  reportsOverride,
  liveOverride,
##TO
  reportsOverride,
  // Today's period line and Worth a look: one small read of the period Reports shows (surfaces/reports/headline.ts).
  reportsHeadlineOverride,
  liveOverride,
##END
##FILE apps/dashboard/src/legacy-bridge/LegacyApp.tsx
##FROM
  reports: "Reports",
  live: "Calls",
##TO
  reports: "Reports",
  reports_headline: "Today's period",
  live: "Calls",
##END
##FILE apps/dashboard/src/legacy-bridge/refresh-map.ts
##FROM
import { reportsOverride } from "@/surfaces/reports/surface";
##TO
import { reportsOverride } from "@/surfaces/reports/surface";
import { reportsHeadlineOverride } from "@/surfaces/reports/headline";
##END
##FILE apps/dashboard/src/legacy-bridge/refresh-map.ts
##FROM
  // and it switches the deal layer: People's lists and column, Reports' Deals section and Today's proposals waiting.
  "PATCH workspaces": () => [settingsOverride, peopleOverride, reportsOverride, todayOverride],
##TO
  // and it switches the deal layer: People's lists and column, Reports' Deals section and Today's proposals waiting. The zone
  // is also where Today's period line counts its days from: the headline is read again too.
  "PATCH workspaces": () => [settingsOverride, peopleOverride, reportsOverride, reportsHeadlineOverride, todayOverride],
##END
```

Create `apps/dashboard/src/surfaces/reports/headline.ts`:

```ts
/**
 * The headline override: Today's period line and Worth a look read the period as one small count (contracts
 * `ReportHeadlineVM`, `GET reports/headline`), never the whole report. Part of the SurfaceData seam
 * (legacy-bridge/surface-data.ts); Today reads what it publishes through `useSurface("reports_headline")`.
 *
 * It follows the period Reports shows (`shownReportPeriod`, kept in this browser), as the one `reports` surface did when Today
 * read it, so the line and the leaks say the same last N days Reports prints. Held by period, with when each was read, as Reports'
 * own views are: a pick of one this tab has read paints at once (`paintHeldHeadline`, called by `setReportRange`), and is read
 * again behind it only if it has aged (`isHeadlineStale`).
 *
 * It has no live-feed rule. Its page is Today, whose own surface the live feed re-reads on a message; the headline counts a period
 * of days and reaches for the people pool and the calendar for its booking line, so a message would move it by one in a hundred
 * at the price of the heaviest read there is. The `reports` surface's rule (`onlyOnItsPage`) let every message pass while Today
 * was on screen, so Today's line never moved on one either; this one is read at boot, when the tab returns, by Retry, after the
 * workspace's zone is saved (refresh-map.ts), when the period is picked (period.ts) and, being on-demand, when Today comes on
 * screen after it has aged.
 */
import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import { MIN_MS, toHeadlineVM, type ReportHeadlineVM } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { setSurfaceValue } from "../surface-values";
import { shownReportPeriod } from "./surface";

/** How old a held headline may be before a pick of its period, or Today's coming on screen, reads it again. */
const HEADLINE_STALE_MS = 5 * MIN_MS;

/** A period's headline, and when this tab read it. */
interface Held {
  vm: ReportHeadlineVM;
  readAt: number;
}

/** The periods this tab has read: going back to one paints at once, and a read behind it keeps it current. */
const held = heldViews<Held>(4);

/** Paint the headline this tab holds for the period now shown; whether it did. The read behind it is the caller's. */
export function paintHeldHeadline(): boolean {
  const have = held.get(shownReportPeriod());
  if (!have) return false;
  setSurfaceValue("reports_headline", have.vm);
  window.dispatchEvent(new CustomEvent("surface:reports_headline"));
  return true;
}

/** Whether the headline for the period now shown is held at all, and was read within HEADLINE_STALE_MS: when not, it wants a read. */
export function isHeadlineStale(): boolean {
  const have = held.get(shownReportPeriod());
  return !have || Date.now() - have.readAt > HEADLINE_STALE_MS;
}

export const reportsHeadlineOverride: SurfaceOverride = {
  key: "reports_headline",
  value: "reports_headline",
  events: ["surface:reports_headline"],
  // A period's reads take their turn; a pick of another period is read at once (activateOverride).
  view: () => shownReportPeriod(),
  apply: async () => {
    const period = shownReportPeriod();
    const { headline } = await read("GET reports/headline", { query: { period } });
    const vm = toHeadlineVM(headline);
    // Held for the period it is of, even if the page has moved on: the read was made, and a pick back to it paints it.
    held.hold(period, { vm, readAt: Date.now() });
    // A pick of another period while this read was out: its answer is for a period left, and is never painted over the new one.
    if (period !== shownReportPeriod()) return;
    setSurfaceValue("reports_headline", vm);
  },
};
```

Write the whole of `apps/dashboard/src/surfaces/reports/period.ts`:

```ts
/**
 * The period Reports shows, changed (moved from legacy-bridge/inbox-verbs.ts, decision 0015): the choice is kept in
 * this browser, and the read goes through the runner, so the cache, the status and the pill agree with what is on screen.
 */
import type { ReportPeriodId } from "@chanlytics/contracts";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { surfaceValue } from "../surface-values";
import { isHeadlineStale, paintHeldHeadline, reportsHeadlineOverride } from "./headline";
import { keepReportPeriod, paintHeldReports, reportsOverride, shownReportPeriod } from "./surface";

/** Whether the period was changed: `false` when its read failed, and the page still shows the one it had. */
export async function setReportRange(period: ReportPeriodId): Promise<boolean> {
  const prev = surfaceValue("reports")?.period ?? period;
  keepReportPeriod(period);
  // Today's line and Worth a look say the period too (the headline). One this tab holds paints at once; it is read behind that
  // only when none is held for the period or the held one is old (headline.ts), so a pick on Reports does not double the heaviest
  // read for a line nobody is looking at. Its sentence always names its own period, so it is never wrong, only a read behind.
  paintHeldHeadline();
  if (isHeadlineStale()) void refreshSurfaces([reportsHeadlineOverride]);
  // A period this tab has read paints at once; the read behind it keeps it current (the loading standard's held
  // views). Only a period never read waits for its read.
  if (paintHeldReports()) {
    void refreshSurfaces([reportsOverride]);
    return true;
  }
  await refreshSurfaces([reportsOverride]);
  // A newer pick was made while this one loaded: the surface dropped this answer (a period left), and the newer pick decides what
  // the page keeps and says. This one failed nothing, so it takes nothing back.
  if (shownReportPeriod() !== period) return true;
  // The override writes the period it fetched. Anything else means the fetch failed and the page is still showing the
  // old period, so the preferred period goes back too, or the next background refresh would load the new one silently.
  if (surfaceValue("reports")?.period !== period) {
    keepReportPeriod(prev);
    // And Today says the period kept: the headline of the period that failed may have landed behind the pick.
    paintHeldHeadline();
    return false;
  }
  return true;
}
```

- [ ] **Step 4: The tests of other files that name the refreshed surfaces, and the one request that must not mistake the headline for the report**

```swap
##FILE tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs
##FROM
    ["settings", "people", "reports", "today"],
##TO
    ["settings", "people", "reports", "reports_headline", "today"],
##END
##FILE tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs
##FROM
  (await importSrc("apps/dashboard/src/surfaces/reports/surface.ts")).reportsOverride,
##TO
  (await importSrc("apps/dashboard/src/surfaces/reports/surface.ts")).reportsOverride,
  (await importSrc("apps/dashboard/src/surfaces/reports/headline.ts")).reportsHeadlineOverride,
##END
##FILE tooling/scripts/tests/shell/empty-failed.test.mjs
##FROM
    if (u.pathname.endsWith("/reports/campaigns")) return json(200, { ok: true, data: { report: campaignsDto() } });
##TO
    if (u.pathname.endsWith("/reports/campaigns")) return json(200, { ok: true, data: { report: campaignsDto() } });
    // A pick also reads the headline Today draws (period.ts), when none is held for it: a period's counts, in the wire's shape.
    if (u.pathname.endsWith("/reports/headline"))
      return json(200, {
        ok: true,
        data: {
          headline: {
            period: u.searchParams.get("period"),
            days: 7,
            empty: false,
            messages_in: 1,
            messages_before: null,
            answered_ai: 1,
            answered_you: 0,
            unanswered: 0,
            answered_share: 1,
            calls: 0,
            booking: null,
          },
        },
      });
##END
##FILE e2e/reports.spec.ts
##FROM
      (r) => r.url().includes("/api/v1/reports") && r.url().includes("period=7d") && r.method() === "GET",
##TO
      // The Reports read alone: a pick also reads `reports/headline` (Today's line) and `reports/campaigns`, and the first of those is no answer.
      (r) =>
        new URL(r.url()).pathname.endsWith("/api/v1/reports") && r.url().includes("period=7d") && r.method() === "GET",
##END
```

- [ ] **Step 5: Format, run, typecheck**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/reports/headline.ts apps/dashboard/src/surfaces/reports/period.ts apps/dashboard/src/surfaces/surface-values.ts apps/dashboard/src/legacy-bridge/LegacyApp.tsx apps/dashboard/src/legacy-bridge/refresh-map.ts tooling/scripts/tests/reports/headline/headline-surface.test.mjs tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs e2e/reports.spec.ts
git add apps/dashboard/src/surfaces/reports/headline.ts tooling/scripts/tests/reports/headline/headline-surface.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/headline-surface.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/billing/billing.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/metrics-truth.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS. `message-fan-out` still says a message re-reads `conversations`, `inbox` and `today` and nothing else with the headline in its list (it has no rule); `empty-failed`'s period-pick tests pass with the extra read answered; `billing.test.mjs` (which reads `LegacyApp.tsx`'s override list ending `googleOverride, billingOverride`) is unaffected by the insertion after `reportsOverride`; `metrics-truth.test.mjs` still finds `setReportRange`'s signature and `keepReportPeriod(prev);` in `period.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/surfaces/reports/headline.ts apps/dashboard/src/surfaces/reports/period.ts apps/dashboard/src/surfaces/surface-values.ts apps/dashboard/src/legacy-bridge/LegacyApp.tsx apps/dashboard/src/legacy-bridge/refresh-map.ts tooling/scripts/tests/reports/headline/headline-surface.test.mjs tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs e2e/reports.spec.ts
git commit -m "Today's headline is a surface of its own, held by period, painted on a pick and read behind it only when it must be, and never read by the live feed." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Today reads the headline: its period line and Worth a look, word for word, and it stops loading the report

**Why:** the swap. `todayPeriodLine` and `todayLeaks` take the headline's view model (`ReportsLike`, the look-alike of the report's view model that Today's tests built by hand, is deleted with the cases it allowed), Today's two pages read it through `useSurface("reports_headline")`, and `ROUTE_DRAWS.today` draws it instead of `reports`. The contracts, the pages, the registry and the tests that name them move together because they share one type; the proof that no word moved is Review Focus 1.

**The failure door, and why it is a hook:** the card's foot says `today-period-failed` and the band says `today-leaks-failed` when the headline's read failed. `surfaceFailed(key)` (`surfaces/today/shell.ts`) asks `window.__surfaceFailed(page, param)`, which maps its argument through `routeSurfaceFor` (`ROUTE_SURFACE`), a table of routes that has no `reports_headline`: that door is false for every key but a route's own, so a card that used it could never draw its failure. The pages read `useSurfaceFailed("reports_headline")` (`surfaces/use-surface.ts`) instead, a hook called before any early return, which draws again when the surface's status moves (`useSurface` redraws only when the value does, and dropping `"reports"` from `useMoved` would have lost that redraw). The page tests drive it through the real status, `setStatus("reports_headline", "seeded")`, so they fail on a door that answers false; `setStatus` has no reset, so the one test that fails the headline is the **last test of `today-page.test.mjs`**, and the two assertions that used a stand-in leave the tests they were in.

**Files:**
- Create: `tooling/scripts/tests/today/_headline.mjs`
- Modify: `packages/contracts/src/today/today-period.ts` (whole file), `today-leaks.ts`, `packages/contracts/src/today/index.ts`; `apps/dashboard/src/surfaces/today/pages/card.tsx`, `leaks.tsx`, `brief-pane.tsx`, `apps/dashboard/src/surfaces/today/shell.ts`, `apps/dashboard/src/legacy-bridge/surface-registry.ts`
- Modify (tests): `tooling/scripts/tests/reports/headline/report-headline.test.mjs`, `tooling/scripts/tests/today/today-leaks.test.mjs`, `tooling/scripts/tests/today/today-page.test.mjs`, `tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs`
- Regenerate: `packages/contracts/src/browser.generated.ts`, `packages/*/dist`; the lint and dead-export baselines, the ratchets (banked)

- [ ] **Step 1: The shared fixture, built by the real builders**

Create `tooling/scripts/tests/today/_headline.mjs`:

```js
/**
 * What Today draws of Reports, built the way the surface builds it and never typed by hand: a report's series through contracts'
 * headlineOf and toHeadlineVM (the wire's shape and the words it becomes). The period's counts sit on the series' last day, so
 * the sums are exactly what is asked for; `before` is the period before's customer messages (null: nothing was lived then, and
 * nothing is compared); `booking` is the calendar's line over the same days (null: none counted).
 */
import { REPORT_RANGES, headlineOf, toHeadlineVM } from "@chanlytics/contracts";

const dayKey = (n) => new Date(Date.UTC(2026, 7, 1 + n)).toISOString().slice(0, 10);
const empty = (day) => ({
  day,
  messages_in: 0,
  conversations: 0,
  answered_ai: 0,
  answered_you: 0,
  unanswered: 0,
  out_ai: 0,
  out_you: 0,
  escalations: 0,
  calls: 0,
  call_seconds: 0,
  new_contacts: 0,
});

export function headline({ days = 7, in: messages = 0, ai = 0, you = 0, none = 0, calls = 0, before = null, booking = null } = {}) {
  const period = REPORT_RANGES.find((r) => r.days === days)?.id ?? "month";
  const series = Array.from({ length: days * 2 }, (_, i) => empty(dayKey(i)));
  const last = days * 2 - 1;
  series[last] = { ...series[last], messages_in: messages, answered_ai: ai, answered_you: you, unanswered: none, calls };
  if (before !== null) series[0] = { ...series[0], messages_in: before };
  const dto = {
    timezone: "America/New_York",
    days,
    span_days: days * 2,
    today: dayKey(last),
    series,
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  };
  return toHeadlineVM(headlineOf(dto, period, booking));
}
```

- [ ] **Step 2: Write the failing tests: the words held equal, and the fixtures moved to the headline**

Append the words tests to `tooling/scripts/tests/reports/headline/report-headline.test.mjs` (`swap`):

```swap
##FILE tooling/scripts/tests/reports/headline/report-headline.test.mjs
##FROM
import { headlineOf, isReportDto, toBookingReportVM, toHeadlineVM, toReportVM } from "@chanlytics/contracts";
##TO
import {
  headlineOf,
  isReportDto,
  toBookingReportVM,
  toHeadlineVM,
  toReportVM,
  todayLeaks,
  todayPeriodLine,
} from "@chanlytics/contracts";
##END
##FILE tooling/scripts/tests/reports/headline/report-headline.test.mjs
##FROM
  assert.equal(isReportDto(null), false);
  assert.equal(isReportDto("report"), false);
});
##TO
  assert.equal(isReportDto(null), false);
  assert.equal(isReportDto("report"), false);
});

/**
 * Today's period line as it was written over the report's own view model (contracts today-period.ts, until the headline): the
 * oracle the new line is held to. It reads the page's `period.now`, `answered`, the messages tile's comparison and `calls`.
 */
const periodLineOver = (page) => {
  const total = page.answered.totals.in;
  if (page.empty) return `${page.period.now}: nobody wrote or called.`;
  const compare = page.tiles.find((t) => t.id === "messages")?.compare;
  const parts = [`${total} message${total === 1 ? "" : "s"}${compare ? ` (${compare})` : ""}`];
  if (page.answered.share !== null) parts.push(`${Math.round(page.answered.share * 100)}% answered by the receptionist`);
  if (page.calls.total) parts.push(`${page.calls.total} call${page.calls.total === 1 ? "" : "s"}`);
  return `${page.period.now}: ${parts.join(", ")}.`;
};

for (const [name, dto, period, booking] of MATRIX)
  test(`${name}: Today's period line says what it said over the report's own view model`, () => {
    const line = todayPeriodLine(toHeadlineVM(headlineOf(dto, period, booking)));
    assert.deepEqual(line, { text: periodLineOver(toReportVM(dto, { profile: null })), to: "reports" });
  });

test("Worth a look's two rows that read Reports say what they said: the booking gap and the messages nobody answered, text and arithmetic", () => {
  // Three messages nobody answered on the first of September, and one of the twelve who asked is on the calendar.
  const series = reportDto().series.map((d) => (d.day === "2026-09-01" ? { ...d, unanswered: 3 } : d));
  const dto = { ...reportDto(), series };
  const asked = { calendar: "ok", days: 7, asked: 12, booked: 1 };
  const page = toReportVM(dto, { profile: null });
  const totals = page.answered.totals;
  const booking = toBookingReportVM(asked);
  const { rows } = todayLeaks(toHeadlineVM(headlineOf(dto, "7d", asked)), null, []);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["never-booked", "unanswered"],
  );
  assert.equal(
    rows[0].text,
    `Only ${booking.booked} of the ${booking.asked} people who wrote or called in the last ${page.rangeLabel} got onto the calendar.`,
  );
  assert.equal(rows[0].math, booking.headline);
  assert.equal(rows[1].text, `${totals.none} customer messages never got an answer at all.`);
  assert.equal(
    rows[1].math,
    `of ${totals.in} in the last ${page.rangeLabel} · the receptionist answered ${totals.ai}, you answered ${totals.you}`,
  );
  const unread = todayLeaks(toHeadlineVM(headlineOf(dto, "7d", null)), null, []).rows.map((r) => r.id);
  assert.deepEqual(unread, ["unanswered"], "no calendar read is a setup step, not a leak");
});
##END
```

Move the fixtures of `today-leaks.test.mjs` onto the headline. Write `codemod-leaks.mjs` to the scratchpad and run it from the worktree root (`node <scratchpad>/codemod-leaks.mjs`):

```js
import fs from "node:fs";
const file = "tooling/scripts/tests/today/today-leaks.test.mjs";
const raw = fs.readFileSync(file, "utf8");
const crlf = raw.includes("\r\n");
let t = raw.replace(/\r\n/g, "\n");
const once = (from, to) => {
  const n = t.split(from).length - 1;
  if (n !== 1) throw new Error(`wanted one, found ${n}: ${from.slice(0, 70)}`);
  t = t.replace(from, () => to);
};
const every = (re, to, wanted) => {
  const n = (t.match(re) ?? []).length;
  if (n !== wanted) throw new Error(`${re}: wanted ${wanted}, found ${n}`);
  t = t.replace(re, to);
};
const between = (start, end, to) => {
  const a = t.indexOf(start);
  const b = t.indexOf(end);
  if (a < 0 || b < a) throw new Error(`markers not found: ${start.slice(0, 50)}`);
  t = t.slice(0, a) + to + t.slice(b);
};

// The mockup's sample goes (its round trip is the headline's words test now); the shared fixture comes.
once(
  `// The mockup's sample is a real ReportsSurface (reportDto through toReportVM): the round trip the period line is tested on.\nimport { reportsSample } from "../../../../apps/dashboard/src/surfaces/reports/sample.ts";\n`,
  `import { headline } from "./_headline.mjs";\n`,
);
// The salon's numbers, as the headline says them.
between(
  `/** The salon's own numbers on 17 Sep 2026`,
  `const NOW = new Date("2026-09-21T16:00:00Z");`,
  `/** The salon's own numbers on 17 Sep 2026, which is where every rule below came from: thirty days, 0 of the 18 who asked booked. */
const reports = (over = {}) =>
  headline({ days: 30, in: 21, ai: 16, you: 1, none: 4, booking: { calendar: "ok", days: 30, asked: 18, booked: 0 }, ...over });

`,
);
every(/vm: \{ answered: \{ totals: \{ in: (\d+), ai: (\d+), you: (\d+), none: (\d+) \} \} \}/g, "in: $1, ai: $2, you: $3, none: $4", 11);
every(/booking: \{ present: true, headline: "[^"]*", sub: "", pct: \d+, asked: (\d+), booked: (\d+) \}/g, 'booking: { calendar: "ok", days: 30, asked: $1, booked: $2 }', 8);
every(/booking: \{ present: false \}/g, "booking: null", 10);
once(
  `  const noCal = reports({
    booking: {
      present: false,
      headline: "—",
      sub: "Connect your calendar under Settings › Business to see who booked.",
      pct: null,
      asked: 0,
      booked: 0,
    },
  });`,
  `  const noCal = reports({ booking: { calendar: "none", days: 30, asked: 0, booked: 0 } });`,
);
// The period line's two tests: the cases the old type allowed (a view model with no answered, a campaigns read that failed) are gone with it.
between(
  `test("the last seven days in one sentence, in Reports' own numbers and words`,
  `/* ------------------------------ the runs' words ------------------------------ */`,
  `test("the last seven days in one sentence, in Reports' own numbers and words, each read from the headline Reports' series makes", () => {
  const r = headline({ days: 7, in: 23, ai: 21, you: 1, none: 1, calls: 4, before: 19 });
  assert.deepEqual(todayPeriodLine(r), {
    text: "Last 7 days: 23 messages (up from 19), 91% answered by the receptionist, 4 calls.",
    to: "reports",
  });
  const quiet = headline({ days: 30 });
  assert.equal(todayPeriodLine(quiet).text, "Last 30 days: nobody wrote or called.");
  const noReplies = headline({ days: 7, in: 1, ai: 0, you: 1, calls: 1 });
  assert.equal(
    todayPeriodLine(noReplies).text,
    "Last 7 days: 1 message, 0% answered by the receptionist, 1 call.",
    "no comparison without one; the singulars; the lead from the period's own words",
  );
  assert.equal(todayPeriodLine(null), null);
});

`,
);
if (/\.vm\b|\bvm:|reportsSample|__REPORTS/.test(t)) throw new Error("a look-alike of the report's view model is left in the file");
fs.writeFileSync(file, crlf ? t.replace(/\n/g, "\r\n") : t);
console.log("today-leaks.test.mjs moved to the headline");
```

Expected: the script prints its line; a count that is not what it says stops it before anything is written (eleven `vm: { answered: { totals: ... } }` overrides, eight `present: true` bookings after the old fixture's own is replaced, ten `present: false`). Then do the same for `today-page.test.mjs`, `codemod-page.mjs`:

```js
import fs from "node:fs";
const file = "tooling/scripts/tests/today/today-page.test.mjs";
const raw = fs.readFileSync(file, "utf8");
const crlf = raw.includes("\r\n");
let t = raw.replace(/\r\n/g, "\n");
const once = (from, to) => {
  const n = t.split(from).length - 1;
  if (n !== 1) throw new Error(`wanted one, found ${n}: ${from.slice(0, 70)}`);
  t = t.replace(from, () => to);
};
const every = (from, to, wanted) => {
  const n = t.split(from).length - 1;
  if (n !== wanted) throw new Error(`${from.slice(0, 60)}: wanted ${wanted}, found ${n}`);
  t = t.split(from).join(to);
};
const between = (start, end, to) => {
  const a = t.indexOf(start);
  const b = t.indexOf(end);
  if (a < 0 || b < a) throw new Error(`markers not found: ${start.slice(0, 50)}`);
  t = t.slice(0, a) + to + t.slice(b);
};

once(`import { PLAN } from "../_lead-fixtures.mjs";\n`, `import { PLAN } from "../_lead-fixtures.mjs";\nimport { headline as periodHeadline } from "./_headline.mjs";\n`);
// The week Today's card and Worth a look read, from the headline's builders: 24 messages, 21 answered by the receptionist.
between(
  `const tile = (id, value, compare = null) =>`,
  `const list = (id, label, count, action = null) =>`,
  `/** What Today draws of Reports: the week of 24 messages, up from 19, two of the eighteen who asked on the calendar. */
const headline = (over = {}) =>
  periodHeadline({
    in: 24,
    ai: 21,
    you: 1,
    none: 2,
    calls: 4,
    before: 19,
    booking: { calendar: "ok", days: 7, asked: 18, booked: 2 },
    ...over,
  });
`,
);
// The headline is a surface of its own, read through the seam (setSurfaceValue), as the day is.
once(
  `    if (k === "today") setSurfaceValue("today", v);\n`,
  `    if (k === "today") setSurfaceValue("today", v);\n    else if (k === "headline") setSurfaceValue("reports_headline", v);\n`,
);
// The demo test: the sample the mockup no longer reads carried Reports once; it is one name fewer.
once(`    __TODAY_SAMPLE: {\n      __REPORTS: reports(),\n      __PEOPLE: people(),`, `    __TODAY_SAMPLE: {\n      __PEOPLE: people(),`);
once(`for (const name of ["__REPORTS", "__PEOPLE", "__BROADCASTS", "__CALENDAR", "__PLAYBOOKS", "__notifs"])`, `for (const name of ["__PEOPLE", "__BROADCASTS", "__CALENDAR", "__PLAYBOOKS", "__notifs"])`);
// The three weeks that booked and answered, so the rows under test are the only ones.
const BOOKED = `headline({ in: 23, ai: 23, you: 0, none: 0, booking: { calendar: "ok", days: 7, asked: 18, booked: 17 } })`;
every(
  `  const R = {
    ...reports(),
    vm: { ...reports().vm, answered: { totals: { in: 23, ai: 23, you: 0, none: 0 } } },
    booking: { present: true, headline: "17 of 18 booked", sub: "", pct: 94, asked: 18, booked: 17 },
  };`,
  `  const R = ${BOOKED};`,
  2,
);
once(
  `    __REPORTS: {
      ...reports(),
      vm: { ...reports().vm, answered: { totals: { in: 23, ai: 23, you: 0, none: 0 } } },
      booking: { present: true, headline: "17 of 18 booked", sub: "", pct: 94, asked: 18, booked: 17 },
    },
    __PEOPLE: { ...people(), lists: [list("quiet", "Quiet 30+ days", 1, null)] },`,
  `    headline: ${BOOKED},
    __PEOPLE: { ...people(), lists: [list("quiet", "Quiet 30+ days", 1, null)] },`,
);
every(`__REPORTS: reports()`, `headline: headline()`, 16);
every(`__REPORTS: undefined`, `headline: undefined`, 3);
every(`__REPORTS: R`, `headline: R`, 2);
every(`todayLeaks(reports(),`, `todayLeaks(headline(),`, 3);
every(`todayPeriodLine(reports())`, `todayPeriodLine(headline())`, 1);
// The two failure assertions leave the tests that go on to draw other things: a failure is told by the real status (`setStatus`, which
// has no reset), and one test at the end of the file holds both (below).
once(
  `  failed.add("reports");
  const broke = draw(TodayCard);
  assert.equal(byTestId(broke, "today-period"), null);
  assert.match(textOf(byTestId(broke, "today-period-failed")), /Couldn't read Reports/);
  failed.clear();
  const loading = draw(TodayCard);`,
  `  const loading = draw(TodayCard);`,
);
once(
  `  set({ headline: undefined, __PEOPLE: people() });
  failed.add("reports");
  assert.match(textOf(byTestId(draw(TodayLeaks), "today-leaks-failed")), /Couldn't read Reports/);
  failed.clear();
`,
  ``,
);
// Each band names the surfaces it draws from.
once(`    ["the day's card", TodayCard, ["today", "reports"]],`, `    ["the day's card", TodayCard, ["today", "reports_headline"]],`);
once(`    ["Worth a look", TodayLeaks, ["reports", "people", "today"]],`, `    ["Worth a look", TodayLeaks, ["reports_headline", "people", "today"]],`);
// The report's own names only: the calendar's `c.vm.feed` and `cal.vm.feed` are not a look-alike of anything.
if (/__REPORTS|reports\(\)|vm: \{ \.\.\.reports|\bR\.vm\b/.test(t)) throw new Error("a look-alike of the report's view model, or its mirror, is left in the file");
t =
  t.replace(/\n*$/, "\n") +
  `
// LAST in the file: a surface's failure cannot be taken back (surface-status.ts has no reset), so every test above saw the headline unfailed.
test("a headline whose read failed says so where its lines would be, on the card and in Worth a look; one that landed clears it", async () => {
  const { setStatus } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-status.ts");
  clear();
  set({ today: busy(), headline: undefined, __PEOPLE: people() });
  setStatus("reports_headline", "seeded");
  const broke = draw(TodayCard);
  assert.equal(byTestId(broke, "today-period"), null);
  assert.match(textOf(byTestId(broke, "today-period-failed")), /Couldn't read Reports/);
  assert.match(textOf(byTestId(draw(TodayLeaks), "today-leaks-failed")), /Couldn't read Reports/);
  // The shell's door maps its argument through the routes' surfaces and knows no \`reports_headline\`: it says nothing of this one.
  assert.equal(failed.has("reports_headline"), false, "the page does not ask the stand-in");
  set({ headline: headline() });
  setStatus("reports_headline", "live");
  assert.equal(byTestId(draw(TodayCard), "today-period-failed"), null, "a headline that landed is not failed");
});
`;
fs.writeFileSync(file, crlf ? t.replace(/\n/g, "\r\n") : t);
console.log("today-page.test.mjs moved to the headline");
```

The boot-order test names the surface Today draws (`swap`):

```swap
##FILE tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs
##FROM
    "reports",
    "live",
    "broadcasts",
##TO
    "reports",
    "reports_headline",
    "live",
    "broadcasts",
##END
##FILE tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs
##FROM
  for (const k of ["calendar", "broadcasts", "reports"])
##TO
  for (const k of ["calendar", "broadcasts", "reports_headline"])
##END
##FILE tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs
##FROM
        "../surfaces/reports/surface",
        "surfaces/notifications",
##TO
        "../surfaces/reports/surface",
        "../surfaces/reports/headline",
        "surfaces/notifications",
##END
```

- [ ] **Step 3: Run them to verify they fail**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/today/_headline.mjs tooling/scripts/tests/today/today-leaks.test.mjs tooling/scripts/tests/today/today-page.test.mjs tooling/scripts/tests/reports/headline/report-headline.test.mjs tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs
git add tooling/scripts/tests/today/_headline.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/report-headline.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-leaks.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-page.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs
```
Expected: FAIL. The new words tests and `today-leaks.test.mjs` throw `TypeError: Cannot read properties of undefined (reading 'rangeLabel')` or `'answered'` (the contracts still read `reports.vm`); `today-page.test.mjs` fails where the card and Worth a look read `__REPORTS` (the headline is published and nothing reads it); `surface-boot.test.mjs` fails on `reports_headline` not among what Today draws.

- [ ] **Step 4: Contracts: the period line and Worth a look read the headline**

Write the whole of `packages/contracts/src/today/today-period.ts`:

```ts
/**
 * The period line at the foot of the day's card (today-day.ts): the last seven, thirty or ninety days (or the month so far) in one
 * sentence, every number one Reports prints. It reads the headline (`ReportHeadlineVM`, reports/report-headline.ts), which is also
 * what Worth a look reads of Reports (today-leaks.ts): the period's counts as the server summed them from the one series Reports
 * is drawn from, and the words they are said in.
 */
import type { ReportHeadlineVM } from "../reports/report-headline";

/**
 * The period in one sentence at the foot of the day's card, with a door to Reports, which was rebuilt on 19 September to carry
 * exactly this material. Every number is one Reports prints: its period words (`lead`), the messages' comparison in counts, the
 * receptionist's share rounded as its tile rounds it, its calls. Not its median reply: that is Reports' own figure, and with it
 * the foot ran three lines on a phone (22 Sep). "Messages", not "customer messages": the card's figure above already says whose.
 * It reads nothing of the campaigns: that read failed on its own (#686) and a line that dereferenced it took the whole page down;
 * the headline has none.
 */
export function todayPeriodLine(r: ReportHeadlineVM | null): { text: string; to: "reports" } | null {
  if (!r) return null;
  if (r.empty) return { text: `${r.lead}: nobody wrote or called.`, to: "reports" };
  const parts = [
    `${r.messages.total} message${r.messages.total === 1 ? "" : "s"}${r.messages.compare ? ` (${r.messages.compare})` : ""}`,
  ];
  if (r.answered.share !== null) parts.push(`${Math.round(r.answered.share * 100)}% answered by the receptionist`);
  if (r.calls) parts.push(`${r.calls} call${r.calls === 1 ? "" : "s"}`);
  return { text: `${r.lead}: ${parts.join(", ")}.`, to: "reports" };
}
```

`today-leaks.ts` and the barrel (`swap`):

```swap
##FILE packages/contracts/src/today/today-leaks.ts
##FROM
 * Reports (today-period.ts's `ReportsLike`) or People already publishes, in the order of what they cost.
##TO
 * Reports (the headline, reports/report-headline.ts) or People already publishes, in the order of what they cost.
##END
##FILE packages/contracts/src/today/today-leaks.ts
##FROM
import type { ReportsLike } from "./today-period";
##TO
import type { ReportHeadlineVM } from "../reports/report-headline";
##END
##FILE packages/contracts/src/today/today-leaks.ts
##FROM
interface LeakFacts {
  reports: ReportsLike | null;
##TO
interface LeakFacts {
  reports: ReportHeadlineVM | null;
##END
##FILE packages/contracts/src/today/today-leaks.ts
##FROM
function leakFactsOf(
  reports: ReportsLike | null,
##TO
function leakFactsOf(
  reports: ReportHeadlineVM | null,
##END
##FILE packages/contracts/src/today/today-leaks.ts
##FROM
  if (!(reports && b && b.present && b.pct !== null && (b.asked ?? 0) >= 5 && b.pct <= 25)) return null;
  const asked = b.asked ?? 0;
  const booked = b.booked ?? 0;
  const never = list("asked_never_booked");
  const text =
    booked === 0
      ? `${asked} people wrote or called in the last ${reports.vm.rangeLabel}. Not one of them is on the calendar.`
      : `Only ${booked} of the ${asked} people who wrote or called in the last ${reports.vm.rangeLabel} got onto the calendar.`;
##TO
  if (!(reports && b && b.present && b.pct !== null && b.asked >= 5 && b.pct <= 25)) return null;
  const { asked, booked } = b;
  const never = list("asked_never_booked");
  const text =
    booked === 0
      ? `${asked} people wrote or called in the last ${reports.rangeLabel}. Not one of them is on the calendar.`
      : `Only ${booked} of the ${asked} people who wrote or called in the last ${reports.rangeLabel} got onto the calendar.`;
##END
##FILE packages/contracts/src/today/today-leaks.ts
##FROM
  const a = reports && reports.vm.answered ? reports.vm.answered.totals : null;
##TO
  const a = reports ? reports.answered : null;
##END
##FILE packages/contracts/src/today/today-leaks.ts
##FROM
  const math = `of ${a.in} in the last ${reports.vm.rangeLabel} · the receptionist answered ${a.ai}, you answered ${a.you}`;
##TO
  const math = `of ${reports.messages.total} in the last ${reports.rangeLabel} · the receptionist answered ${a.ai}, you answered ${a.you}`;
##END
##FILE packages/contracts/src/today/today-leaks.ts
##FROM
export function todayLeaks(
  reports: ReportsLike | null,
##TO
export function todayLeaks(
  reports: ReportHeadlineVM | null,
##END
##FILE packages/contracts/src/today/index.ts
##FROM
export { todayPeriodLine } from "./today-period";
export type { WeekTileLike, ReportsLike } from "./today-period";
##TO
export { todayPeriodLine } from "./today-period";
##END
```

- [ ] **Step 5: Build, and run the contracts-level tests**

```bash
corepack pnpm exec prettier --write packages/contracts/src/today/today-period.ts packages/contracts/src/today/today-leaks.ts packages/contracts/src/today/index.ts
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter "./packages/*" build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/report-headline.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-leaks.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-day.test.mjs
```
Expected: PASS. `report-headline.test.mjs` now holds the headline's words equal to the report's for the five periods, and the two leak rows' text and arithmetic equal; `today-leaks.test.mjs` says what it said over fixtures the real builders make (its default `reports()` is "0 of 18 booked": `toBookingReportVM` makes the headline, the percentage and the floor the rules read). `corepack pnpm -r typecheck` is expected to fail in the dashboard until the next step (`ReportsLike` is gone from the card and the leaks band).

- [ ] **Step 6: The pages read the headline through the seam; Today draws it instead of the report**

```swap
##FILE apps/dashboard/src/surfaces/today/pages/card.tsx
##FROM
  type BroadcastVM,
  type ReportsLike,
  type TodayFigureId,
##TO
  type BroadcastVM,
  type TodayFigureId,
##END
##FILE apps/dashboard/src/surfaces/today/pages/card.tsx
##FROM
import { useSurface } from "../../use-surface";
##TO
import { useSurface, useSurfaceFailed } from "../../use-surface";
##END
##FILE apps/dashboard/src/surfaces/today/pages/card.tsx
##FROM
import { appNavigate, doorGlyph, borrowed, workspaceClock, surfaceFailed, useMoved } from "../shell";
##TO
import { appNavigate, doorGlyph, borrowed, workspaceClock, useMoved } from "../shell";
##END
##FILE apps/dashboard/src/surfaces/today/pages/card.tsx
##FROM
  useMoved(["today", "reports"]);
  const [open, setOpen] = useState<TodayFigureId | null>(null);
##TO
  useMoved(["today"]);
  // The period in one small read (the headline), through the seam, and whether its read failed, by the seam's own hook: both hooks, so
  // they stand before the early return below. (`surfaceFailed("reports_headline")` is false for ever: the shell's door maps its
  // argument through the routes' surfaces, which name no headline.)
  const R = useSurface("reports_headline");
  const headlineFailed = useSurfaceFailed("reports_headline");
  const [open, setOpen] = useState<TodayFigureId | null>(null);
##END
##FILE apps/dashboard/src/surfaces/today/pages/card.tsx
##FROM
  const R = borrowed<ReportsLike>("__REPORTS");
  const period = R ? TODAY_HELPERS.periodLine(R) : null;
  // Not read yet is not failed: the foot is silent while Reports loads and says so when its read failed.
  const reportsFailed = !R && surfaceFailed("reports");
##TO
  const period = R ? TODAY_HELPERS.periodLine(R) : null;
  // Not read yet is not failed: the foot is silent while Reports loads and says so when its read failed.
  const reportsFailed = !R && headlineFailed;
##END
##FILE apps/dashboard/src/surfaces/today/pages/card.tsx
##FROM
              surface="reports"
              testid="today-period-failed"
##TO
              surface="reports_headline"
              testid="today-period-failed"
##END
##FILE apps/dashboard/src/surfaces/today/pages/leaks.tsx
##FROM
import type { PeopleListsLike, ReportsLike, TodayLeakVM } from "@chanlytics/contracts";
##TO
import type { PeopleListsLike, TodayLeakVM } from "@chanlytics/contracts";
##END
##FILE apps/dashboard/src/surfaces/today/pages/leaks.tsx
##FROM
import { surfaceValue } from "../../surface-values";
import { TODAY_HELPERS } from "../helpers";
##TO
import { surfaceValue } from "../../surface-values";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { TODAY_HELPERS } from "../helpers";
##END
##FILE apps/dashboard/src/surfaces/today/pages/leaks.tsx
##FROM
  useMoved(["reports", "people", "today"]);
  const [open, setOpen] = useState<string | null>(null);
  const R = borrowed<ReportsLike>("__REPORTS");
##TO
  useMoved(["people", "today"]);
  const [open, setOpen] = useState<string | null>(null);
  // Reports' period in one small read (the headline), through the seam, and whether its read failed, by the seam's own hook (the
  // shell's `surfaceFailed` knows only the routes' surfaces: it is false for ever for the headline).
  const R = useSurface("reports_headline");
  const headlineFailed = useSurfaceFailed("reports_headline");
##END
##FILE apps/dashboard/src/surfaces/today/pages/leaks.tsx
##FROM
    !R && surfaceFailed("reports")
      ? ["Reports", "reports"]
##TO
    !R && headlineFailed
      ? ["Reports", "reports_headline"]
##END
##FILE apps/dashboard/src/surfaces/today/pages/brief-pane.tsx
##FROM
  useMoved(["today", "reports", "broadcasts"]);
##TO
  useMoved(["today", "broadcasts"]);
##END
##FILE apps/dashboard/src/surfaces/today/shell.ts
##FROM
 * A surface the bridge published, by its global's name (`__REPORTS`, `__PEOPLE`, `__BROADCASTS`, ...): what the page
##TO
 * A surface the bridge published, by its global's name (`__PEOPLE`, `__BROADCASTS`, `__CALENDAR`, ...): what the page
##END
##FILE apps/dashboard/src/legacy-bridge/surface-registry.ts
##FROM
    "broadcasts",
    "reports",
    "playbooks",
##TO
    "broadcasts",
    "reports_headline",
    "playbooks",
##END
##FILE apps/dashboard/src/legacy-bridge/surface-registry.ts
##FROM
 * broadcasts, the card's period line and Worth a look from reports, the day's
##TO
 * broadcasts, the card's period line and Worth a look from the reports headline (one small read, never the whole report), the day's
##END
```

`brief-pane.tsx` read nothing of Reports (it named the surface only to redraw on it); the card's and the band's own `useSurface` now draw them when the headline lands.

- [ ] **Step 7: Run everything this touched**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/today/pages/card.tsx apps/dashboard/src/surfaces/today/pages/leaks.tsx apps/dashboard/src/surfaces/today/pages/brief-pane.tsx apps/dashboard/src/surfaces/today/shell.ts apps/dashboard/src/legacy-bridge/surface-registry.ts
corepack pnpm -r typecheck
for f in $(find tooling/scripts/tests/today -name "*.test.mjs" ! -name "*.db.test.mjs" | sort); do node tooling/scripts/checks/test.mjs "$f" || break; done
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/report-headline.test.mjs
```
Expected: typecheck clean; every Today test PASSES, `today-page.test.mjs` among them with its sentences read back from contracts (the foot's line is still `/^Last 7 days: 24 messages \(up from 19\), 88% answered by the receptionist, 4 calls\.$/`); `surface-boot.test.mjs` shows Today's boot reading `today`, `setup`, `calendar`, `broadcasts`, `reports_headline`, ... in the page's order, ahead of every stranger, and that the surface exists among the overrides' keys.

- [ ] **Step 8: Bank what fell, and commit**

```bash
corepack pnpm lint
corepack pnpm check:dead-exports
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
```
Expected: lint and dead exports clean (`ReportsLike` and `WeekTileLike` left with their last reader; a fall that either reports is banked with `corepack pnpm lint -- --update` and `corepack pnpm check:dead-exports -- --update`); the ratchets name nothing that rose.

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add packages/contracts/src/today/today-period.ts packages/contracts/src/today/today-leaks.ts packages/contracts/src/today/index.ts packages/contracts/src/browser.generated.ts packages/*/dist apps/dashboard/src/surfaces/today/pages/card.tsx apps/dashboard/src/surfaces/today/pages/leaks.tsx apps/dashboard/src/surfaces/today/pages/brief-pane.tsx apps/dashboard/src/surfaces/today/shell.ts apps/dashboard/src/legacy-bridge/surface-registry.ts tooling/scripts/tests/today/_headline.mjs tooling/scripts/tests/today/today-leaks.test.mjs tooling/scripts/tests/today/today-page.test.mjs tooling/scripts/tests/reports/headline/report-headline.test.mjs tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -m "Today's period line and Worth a look read the headline, word for word, and Today stops loading the whole report for them." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The `__REPORTS` mirror is deleted: Ask's context reads the seam

**Why:** after Task 7 the only reader of `window.__REPORTS` is Ask's page context (`legacy-bridge/ask/context.ts`, `w.__REPORTS?.days`). It moves to `surfaceValue("reports")`, and the mirror's one line goes. The next tasks make that value absent until Reports has been on screen in this tab (Task 9), so the provider answers the route alone for a value not read, as it already does for one never read: the test below holds it, and Task 9 greps for any other reader. `git grep -n "__REPORTS"` found these readers: `ask/context.ts`, Today's card and leaks band (Task 7), and the tests named below; the writers were `declareSurfaceValue("reports", "__REPORTS")` and the seam's own `mirrorTo`.

**Files:**
- Modify: `apps/dashboard/src/surfaces/reports/surface.ts`, `apps/dashboard/src/surfaces/surface-values.ts`, `apps/dashboard/src/surfaces/use-surface.ts`, `apps/dashboard/src/legacy-bridge/ask/context.ts`
- Modify (tests): `tooling/scripts/tests/reports/reports-seam.test.mjs` (whole file), `tooling/scripts/tests/shell/empty-failed.test.mjs`, `tooling/scripts/tests/ask/ask-page-context.test.mjs`

- [ ] **Step 1: Write the failing tests**

Write the whole of `tooling/scripts/tests/reports/reports-seam.test.mjs`:

```js
/**
 * What a surface that has left the shell reads from the seam, typed (decision 0015, step 3): the value the override
 * publishes under its key, the name it is mirrored under for the pages that have not moved (Today's own day is still read as
 * `TODAY_DATA`; Reports has none since its last readers, Today and Ask, moved to the seam on 6 October 2026), the tab's cache
 * keeping it beside the window's globals, and `useSurface` handing it to a component and drawing that component again when
 * the surface moves.
 *
 * The real store, the real cache and the real hook, over a window with sessionStorage and the page tests' stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, redrawWanted, quiet } from "../_legacy-react.mjs";

const CACHE = "chanlytics.surfaces.v1";
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    peek: (k) => m.get(k),
  };
};
installLegacyReact();
globalThis.sessionStorage = storage();
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.__ACTIVE_WORKSPACE = "t-salon";

const S = "../../../../apps/dashboard/src";
const values = await import(`${S}/surfaces/surface-values.ts`);
const cache = await import(`${S}/legacy-bridge/surface-cache.ts`);
// Importing an override declares its mirror, as the app's boot does: Today's names one, Reports' and Google's none.
await import(`${S}/surfaces/today/surface.ts`);
await import(`${S}/surfaces/reports/surface.ts`);
// The surface's signal, from the module the surface reads it through (the stub's own copy is the shell pages').
const { surfaceMoved: surfaceLanded } = await import(`${S}/legacy-bridge/surface-status.ts`);
const { useSurface } = await import(`${S}/surfaces/use-surface.ts`);

const REPORTS = { vm: { days: 30 }, days: 30, fetchedAt: 1 };
const TODAY = { standing: { headline: "Nothing needs you." } };

test("a value is held under its key and mirrored under the name the pages that have not moved read; nothing held is nothing on both", () => {
  assert.equal(values.surfaceValue("today"), undefined, "before the first read there is nothing");
  values.setSurfaceValue("today", TODAY);
  assert.equal(values.surfaceValue("today"), TODAY, "held as it was published, by identity");
  assert.equal(globalThis.TODAY_DATA, TODAY, "and mirrored under its old name, the one object");
  values.setSurfaceValue("today", undefined);
  assert.equal(values.surfaceValue("today"), undefined);
  assert.equal(globalThis.TODAY_DATA, undefined, "the mirror goes with the value");
  values.setSurfaceValue("reports", REPORTS);
  assert.equal(values.surfaceValue("reports"), REPORTS, "Reports' is held under its key");
  assert.equal(globalThis.__REPORTS, undefined, "and under no other name: Today and Ask, its last readers, read the seam");
  values.setSurfaceValue("reports", undefined);
  values.setSurfaceValue("google", { dto: { ready: {} }, fetchedAt: 2 });
  assert.equal(
    values.surfaceValue("google").fetchedAt,
    2,
    "Google's is held under its key, for Today's line and Setup",
  );
  assert.equal(globalThis.__GOOGLE, undefined, "and under no other name: every page that read it has moved");
  values.setSurfaceValue("google", undefined);
  assert.equal(values.surfaceValue("google"), undefined);
});

test("the tab's cache keeps the value beside the globals a surface owns, and gives it back before React draws", () => {
  values.setSurfaceValue("reports", REPORTS);
  cache.snapshotSurface("reports", [], "t-salon", undefined, "reports");
  cache.flushSurfaceCache();
  const kept = JSON.parse(globalThis.sessionStorage.peek(CACHE));
  assert.deepEqual(kept.surfaces.reports, { $value: REPORTS }, "the value, under its reserved name");
  values.setSurfaceValue("reports", undefined);
  const restored = cache.hydrateSurfaceCache();
  assert.ok(restored.has("reports"), "the surface has its real data before it draws: no loading state");
  assert.deepEqual(values.surfaceValue("reports"), REPORTS);
  values.setSurfaceValue("reports", undefined);
});

test("a surface with no global and no value caches nothing; a name in the cache that is no surface's key is not taken for one", () => {
  const before = globalThis.sessionStorage.peek(CACHE);
  cache.snapshotSurface("nothing", [], "t-salon");
  cache.flushSurfaceCache();
  assert.equal(globalThis.sessionStorage.peek(CACHE), before, "nothing to keep, nothing written");
  values.restoreSurfaceValue("not-a-surface", { a: 1 });
  assert.equal(values.surfaceValue("not-a-surface"), undefined, "a name that is no surface's key holds nothing");
  values.restoreSurfaceValue("toString", { a: 1 });
  assert.equal(values.surfaceValue("toString"), undefined, "a name every object has is no key");
  assert.equal(typeof globalThis.toString, "function", "and the window's own is left as it is");
});

test("useSurface answers the surface's value and draws its component again when the surface moves, and not for another's", () => {
  values.setSurfaceValue("reports", undefined);
  const Page = () => globalThis.React.createElement("div", { "data-days": useSurface("reports")?.days ?? "none" });
  fresh();
  assert.equal(
    Page().props["data-days"],
    "none",
    "before the first read: nothing, which the page says as its own empty state",
  );
  values.setSurfaceValue("reports", REPORTS);
  quiet();
  surfaceLanded("today");
  assert.equal(redrawWanted(), false, "another surface's read is not this page's");
  surfaceLanded("reports");
  assert.equal(redrawWanted(), true, "this surface's rows landed: draw again");
  assert.equal(again(Page).props["data-days"], 30, "and the draw has the value");
  values.setSurfaceValue("reports", undefined);
});
```

The period-pick tests read the seam, not the window, and Ask's context reads the seam (`swap`):

```swap
##FILE tooling/scripts/tests/shell/empty-failed.test.mjs
##FROM
const { reportsOverride } = await import("../../../../apps/dashboard/src/surfaces/reports/surface.ts");
console.error = realConsoleError;
##TO
const { reportsOverride } = await import("../../../../apps/dashboard/src/surfaces/reports/surface.ts");
console.error = realConsoleError;
const { surfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
##END
##FILE tooling/scripts/tests/shell/empty-failed.test.mjs
##FROM
  const R = globalThis.window.__REPORTS;
  assert.ok(R && R.vm, "the receptionist's own numbers are published");
##TO
  const R = surfaceValue("reports");
  assert.ok(R && R.vm, "the receptionist's own numbers are published");
##END
##FILE tooling/scripts/tests/shell/empty-failed.test.mjs
##FROM
  assert.ok(globalThis.window.__REPORTS.campaigns, "read, so published");
##TO
  assert.ok(surfaceValue("reports").campaigns, "read, so published");
##END
##FILE tooling/scripts/tests/shell/empty-failed.test.mjs
##FROM
  const R = globalThis.window.__REPORTS;
  assert.deepEqual(
    R.facts.map((f) => f.id),
##TO
  const R = surfaceValue("reports");
  assert.deepEqual(
    R.facts.map((f) => f.id),
##END
##FILE tooling/scripts/tests/shell/empty-failed.test.mjs
##FROM
  const shown = () => globalThis.window.__REPORTS?.period;
##TO
  const shown = () => surfaceValue("reports")?.period;
##END
##FILE tooling/scripts/tests/ask/ask-page-context.test.mjs
##FROM
const { surfaceFor } = await import("../../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");
##TO
const { surfaceFor } = await import("../../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
##END
##FILE tooling/scripts/tests/ask/ask-page-context.test.mjs
##FROM
  assert.deepEqual(ctx({ __REPORTS: { days: 90 } }, "reports").view, "90");
##TO
  // Reports' view is the days its surface shows, read through the seam: nothing read yet is the route alone.
  assert.equal(ctx({}, "reports").view, null);
  setSurfaceValue("reports", { days: 90 });
  assert.deepEqual(ctx({}, "reports").view, "90");
  setSurfaceValue("reports", undefined);
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/reports/reports-seam.test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs tooling/scripts/tests/ask/ask-page-context.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-seam.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-page-context.test.mjs
```
Expected: FAIL. `reports-seam.test.mjs`: `globalThis.__REPORTS` is still the one object ("and under no other name"); `ask-page-context.test.mjs`: the Reports provider still reads the window, so `view` is null where the seam holds 90.

- [ ] **Step 3: Delete the mirror; Ask's context reads the seam**

```swap
##FILE apps/dashboard/src/surfaces/reports/surface.ts
##FROM
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";

// Today and Ask, which have not moved, still read this under its old name.
declareSurfaceValue("reports", "__REPORTS");

/* ------------------------------- Reports --------------------------------- */
##TO
import { setSurfaceValue } from "../surface-values";

/* ------------------------------- Reports --------------------------------- */
##END
##FILE apps/dashboard/src/surfaces/reports/surface.ts
##FROM
  /** The days the period is (Month: the days since the 1st): what Today and Ask read. */
##TO
  /** The days the period is (Month: the days since the 1st): what Ask reads. */
##END
##FILE apps/dashboard/src/surfaces/surface-values.ts
##FROM
 * A legacy page reads its rows off `window` (`window.__REPORTS`), which is the only place a script the frame loads can
##TO
 * A legacy page reads its rows off `window` (`window.__PEOPLE`), which is the only place a script the frame loads can
##END
##FILE apps/dashboard/src/surfaces/surface-values.ts
##FROM
 * A key may also name a **mirror**, the window global the pages that have not moved still read (Today and Ask read
 * `__REPORTS`). The mirror is written whenever the value is, so the two never say different things, and it is a line
 * to delete on the day its last reader moves: `declareSurfaceValue("reports", "__REPORTS")` is the whole of it.
##TO
 * A key may also name a **mirror**, the window global the pages that have not moved still read (Today's own day is read as
 * `TODAY_DATA`). The mirror is written whenever the value is, so the two never say different things, and it is a line
 * to delete on the day its last reader moves: `declareSurfaceValue("calendar", "__CALENDAR")` is the whole of it. Reports'
 * went on 6 October 2026, when Today and Ask, its last readers, moved to the seam.
##END
##FILE apps/dashboard/src/surfaces/use-surface.ts
##FROM
 * The typed door onto the seam, where the shell's pages read `window.__REPORTS`. A surface reads nothing off `window`.
##TO
 * The typed door onto the seam, where the shell's pages read `window.__PEOPLE`. A surface reads nothing off `window`.
##END
##FILE apps/dashboard/src/legacy-bridge/ask/context.ts
##FROM
import { surfaceFor } from "./palette";
##TO
import { surfaceValue } from "@/surfaces/surface-values";
import { surfaceFor } from "./palette";
##END
##FILE apps/dashboard/src/legacy-bridge/ask/context.ts
##FROM
  __REPORTS?: { days?: number } | null;
  __PLAYBOOKS?: { rows?: Array<{ id: string; name?: string }> } | null;
##TO
  __PLAYBOOKS?: { rows?: Array<{ id: string; name?: string }> } | null;
##END
##FILE apps/dashboard/src/legacy-bridge/ask/context.ts
##FROM
const reports: Provider = (w) => ({
  view: typeof w.__REPORTS?.days === "number" ? String(w.__REPORTS.days) : null,
  rows: [],
});
##TO
/** Reports' view is the days it shows, read through the seam (the surface's value), as the server's context provider describes them. */
const reports: Provider = () => {
  const days = surfaceValue("reports")?.days;
  return { view: typeof days === "number" ? String(days) : null, rows: [] };
};
##END
```

- [ ] **Step 4: Run, prove nothing reads it, bank**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/reports/surface.ts apps/dashboard/src/surfaces/surface-values.ts apps/dashboard/src/surfaces/use-surface.ts apps/dashboard/src/legacy-bridge/ask/context.ts
git grep -n "__REPORTS" -- apps packages tooling e2e
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-seam.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-page-context.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-page.test.mjs
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm check:dead-exports
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
```
Expected: `git grep` prints nothing (the documents under `docs/` that name it are history, and are not searched here); the four tests PASS; typecheck, lint and dead exports clean. The ratchets are expected to name **no fall** from this deletion (Choice 9: `windowUse` never saw `__REPORTS`, which was read by a string and through a typed parameter); if one reports a fall, it is banked here with the flags above, and the pull request says what fell.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/surfaces/reports/surface.ts apps/dashboard/src/surfaces/surface-values.ts apps/dashboard/src/surfaces/use-surface.ts apps/dashboard/src/legacy-bridge/ask/context.ts tooling/scripts/tests/reports/reports-seam.test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs tooling/scripts/tests/ask/ask-page-context.test.mjs tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -m "The __REPORTS mirror is deleted: Ask reads the Reports period through the seam, as every surface that has moved does." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Reports boots only where it is drawn: the runner learns a surface that is read where it is drawn, and Today's boot stops reading the three report routes

**Why:** this is what the part is for, and without it the part saves nothing. `bootInPasses` (`legacy-bridge/surface-runner.ts:344`) boots the page's own surfaces and the ones it names in `ROUTE_DRAWS`, then **every other override as a "stranger"** (its second pass). Today, every page in the app reads `GET reports`, `reports/campaigns` and `reports/reach-outs` a moment after it loads, and after Tasks 4 to 8 Today would read those **and** the headline. Swapping what Today draws is not enough; the boot has to stop reading what no page on screen draws.

The capability is one field, named by `docs/naming.md` (a boolean is a state or a question: `onDemand`, `isStale`), and it is used by two overrides. An override marked `onDemand` is: **skipped by the second pass** of the boot; **left out of a return to the tab's reads** and of the shell's Retry-all, unless the page on screen draws it; and **read when a page that draws it comes on screen**, the first time and again when its `isStale` says it has aged. A refresh asked for **by name** (a write's `refresh-map`, a period pick, one Retry button) is still made: the caller knows what it wants. The place that hears the address move is `readWhatWasMissed` (`surface-registry.ts`), which LegacyApp already wires over the runner's refresh for the surfaces that let a live event pass while their page was elsewhere: reading what was never read is the same job, and one list of what is due means a surface that missed an event and was never read is read once, not twice (`activateOverride` queues a second read behind the first, so two paths would double the very read this removes). The gate needs nothing: a page whose own surface was never read has it read as it comes on screen, and `__surfaceGate` opens when that read lands, as for every surface (the test holds it).

**What this cannot do, said plainly:** it does not stop a page that **draws** the heavy read from reading it. Reports reads `reports`, `reports/campaigns` and `reports/reach-outs` where it is on screen, as before; the saving is every other page's boot. It also changes what a `reports` value is: it is **absent until Reports has been on screen** in this tab, so a reader off Reports must fall back. The readers of `surfaceValue("reports")` were found by `git grep -n 'surfaceValue("reports")\|useSurface("reports")' -- apps`: Reports' own page, `period.ts` (which is called from that page), and Ask's context (Task 8), which answers the route alone for a value not read, as it does for a value never read at all. No reader off Reports remains.

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/surface-data.ts`, `apps/dashboard/src/legacy-bridge/surface-runner.ts`, `apps/dashboard/src/legacy-bridge/surface-registry.ts`, `apps/dashboard/src/surfaces/reports/surface.ts`, `apps/dashboard/src/surfaces/reports/headline.ts`
- Create: `tooling/scripts/tests/reports/headline/on-demand-boot.test.mjs`

- [ ] **Step 1: Write the failing test**

It runs the real runner over recording overrides (the harness `message-fan-out.test.mjs` uses), wired as `LegacyApp.tsx` wires it (`startSurfaces`, then `readWhatWasMissed` over the runner's refresh), on the real routes' registry. The keys are the real ones, so the registry's own `ROUTE_DRAWS` decides what a page draws. `setStatus` has no reset, so the tests run in the order written: the first is the only one that sees `reports` unread.

Create `tooling/scripts/tests/reports/headline/on-demand-boot.test.mjs`:

```js
/**
 * A surface marked `onDemand` (surface-data.ts) is read where it is drawn and nowhere else: the boot's two passes leave it alone unless
 * the page on screen draws it, a return to the tab and the shell's Retry-all read only what is drawn here, and a page that draws it
 * has it read as it comes on screen: once, and again when it says it has aged. Run on the real runner and the real routes' registry
 * (`reports` is Reports' own surface; `reports_headline` is one Today draws), the way LegacyApp wires them, each read recorded
 * rather than made. A surface not marked behaves as it always did.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { historyOf, legacyAddress } from "../../shell/address/_address.mjs";

const heard = new Map();
const win = {
  __ACTIVE_WORKSPACE: "ws-1",
  location: { pathname: "/w/acme", search: "", hash: "#/today", assign() {}, replace() {}, reload() {} },
  addEventListener(type, fn) {
    if (!heard.has(type)) heard.set(type, new Set());
    heard.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    heard.get(type)?.delete(fn);
  },
  dispatchEvent(ev) {
    for (const fn of [...(heard.get(ev.type) ?? [])]) fn(ev);
    return true;
  },
};
globalThis.window = win;
historyOf(win);
const docHeard = new Map();
globalThis.document = {
  visibilityState: "visible",
  title: "",
  addEventListener: (type, fn) => docHeard.set(type, fn),
  removeEventListener: (type) => docHeard.delete(type),
};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 14) => {
  for (let i = 0; i < n; i += 1) await tick();
};
win.__shell = (await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts")).addressApi(win);
win.CHANLY = { nav() {}, address: await legacyAddress() };
const runner = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { reportsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");

let aged = false;
/** The real keys, so the registry's own routes decide what a page draws: the page's own, one it draws, and two it does not. */
const world = (asked) => {
  const read = (key, extra = {}) => ({ key, apply: async () => void asked.push(key), ...extra });
  return [
    read("workspace"),
    read("today"),
    read("inbox"),
    read("reports", { onDemand: true }),
    read("reports_headline", { onDemand: true, isStale: () => aged }),
  ];
};
/** A runner over them, wired as LegacyApp wires it; `go` moves the address as Back does, `away` leaves the tab and comes back. */
async function running(hash) {
  win.location.hash = hash;
  const asked = [];
  const overrides = world(asked);
  const stop = runner.startSurfaces(overrides, () => () => {});
  const off = registry.readWhatWasMissed(overrides, (keys) => void runner.refreshSurfaces(overrides.filter((o) => keys.includes(o.key))), win);
  await settle(30);
  return {
    asked,
    overrides,
    take: () => asked.splice(0).sort(),
    go: async (to) => {
      win.location.hash = to;
      win.dispatchEvent({ type: "popstate" });
      await settle();
    },
    away: async (ms) => {
      const on = docHeard.get("visibilitychange");
      document.visibilityState = "hidden";
      on();
      const real = Date.now;
      Date.now = () => real() + ms;
      document.visibilityState = "visible";
      on();
      Date.now = real;
      await settle();
    },
    stop: () => {
      stop();
      off();
    },
  };
}

test("on Today neither pass reads Reports' three routes: what Today draws, and the strangers not marked, are read as ever", async () => {
  const r = await running("#/today");
  try {
    assert.deepEqual(
      r.take(),
      ["inbox", "reports_headline", "today", "workspace"],
      "REGRESSION: every page's boot read the report beside its own (and `reports` is Reports' own surface: three routes)",
    );
    assert.equal(status.isSurfaceReady("reports"), false, "never read: nothing of it is held");
    // A quick return reads nothing while every surface that ought to be live is: an unread on-demand surface must not defeat that.
    await r.away(1_000);
    assert.deepEqual(r.take(), [], "REGRESSION: one unread surface made every return read every surface again");
    // A long absence reads what is drawn here, and still not what is not.
    await r.away(10 * 60_000);
    assert.deepEqual(r.take(), ["inbox", "reports_headline", "today", "workspace"], "a return reads what Today draws");
    // The shell's Retry-all, the same.
    await runner.refreshAllSurfaces();
    assert.deepEqual(r.take(), ["inbox", "reports_headline", "today", "workspace"], "Retry-all on Today does not read Reports");
  } finally {
    r.stop();
  }
});

test("moving to Reports reads its surface once and its gate opens; moving back to Today reads nothing new", async () => {
  const r = await running("#/today");
  try {
    r.take();
    assert.equal(status.isSurfaceReady("reports"), false);
    await r.go("#/reports");
    assert.deepEqual(r.take(), ["reports"], "read as its page comes on screen, once");
    assert.equal(status.isSurfaceReady("reports"), true, "the gate (`__surfaceGate`) opens when the read lands: no page waits for ever");
    await r.go("#/reports/people");
    assert.deepEqual(r.take(), [], "a move between its lenses reads nothing");
    await r.go("#/today");
    assert.deepEqual(r.take(), [], "back on Today: the headline is held and fresh, and Reports is not read");
    // The headline aged while away: coming back to Today reads it again, once. Reports is not Today's, and is left.
    aged = true;
    await r.go("#/reports");
    r.take();
    await r.go("#/today");
    assert.deepEqual(r.take(), ["reports_headline"], "an aged headline is read again as Today comes back");
    aged = false;
    // What is asked for by name is made wherever the page is: a zone saved reads the report.
    await runner.refreshSurfaces([r.overrides.find((o) => o.key === "reports")]);
    assert.deepEqual(r.take(), ["reports"], "a named refresh is a request: the caller knows");
  } finally {
    r.stop();
  }
});

test("a page that opens on Reports reads its surface in its own pass, and neither the headline nor an unmarked stranger is mistaken for it", async () => {
  const r = await running("#/reports");
  try {
    assert.deepEqual(r.take(), ["inbox", "reports", "today", "workspace"], "Reports' own, and the unmarked strangers: not the headline Today draws");
  } finally {
    r.stop();
  }
});

test("the two overrides that read Reports are the two marked, and nothing else in this part is", () => {
  assert.equal(reportsOverride.onDemand, true, "the whole report, its campaigns and its reach-outs");
  assert.equal(reportsHeadlineOverride.onDemand, true);
  assert.equal(typeof reportsHeadlineOverride.isStale, "function", "a headline ages: the page that draws it asks");
  assert.equal(reportsOverride.isStale, undefined, "Reports' own is kept current by its live-feed rule and by its page's arrival");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/on-demand-boot.test.mjs`
Expected: FAIL. The first test: `reports` is read in the boot's second pass (the list has it among the strangers) and the quick return reads every surface again. The second: nothing reads `reports` when Reports comes on screen (it was read at boot, so its gate was open, and the arrival rule does not exist yet) or the headline when Today returns aged. The fourth: neither override is marked.

- [ ] **Step 3: The field, the runner's three leaves, the arrival rule, the two marks**

```swap
##FILE apps/dashboard/src/legacy-bridge/surface-data.ts
##FROM
  view?: () => string;
}
##TO
  view?: () => string;
  /**
   * Read only where it is drawn. The boot's second pass (every surface nobody on screen draws), a return to the tab and the
   * shell's Retry-all leave it alone unless the page on screen is drawn from it (its own surface, or one the route names in
   * ROUTE_DRAWS); and it is read as such a page comes on screen: the first time, and again when `isStale` says it has aged
   * (surface-registry.ts readWhatWasMissed). A refresh asked for by name (a write's, a pick's, one Retry) is still made.
   */
  onDemand?: boolean;
  /** For an `onDemand` surface: whether what it holds has aged enough that its page, coming on screen, reads it again. */
  isStale?: () => boolean;
}
##END
##FILE apps/dashboard/src/legacy-bridge/surface-runner.ts
##FROM
export async function refreshAllSurfaces(): Promise<void> {
  await refreshSurfaces(activeOverrides);
}
##TO
export async function refreshAllSurfaces(): Promise<void> {
  // Every surface the running runner holds that a page on screen draws: a surface read only where it is drawn waits for its page.
  const drawn = screenOwn(window);
  await refreshSurfaces(activeOverrides.filter((o) => !o.onDemand || drawn(o)));
}
##END
##FILE apps/dashboard/src/legacy-bridge/surface-runner.ts
##FROM
    const statuses = getSurfaceStatuses();
    const allLive = overrides.every((o) => statuses.get(o.key) === "live");
##TO
    const statuses = getSurfaceStatuses();
    // A surface read only where it is drawn, and not drawn here, is none the feed could have let go stale: it does not count.
    const drawn = screenOwn(window);
    const allLive = overrides.every((o) => (o.onDemand && !drawn(o)) || statuses.get(o.key) === "live");
##END
##FILE apps/dashboard/src/legacy-bridge/surface-runner.ts
##FROM
    const screen = screenRank(window);
    void inLanes(
      [...overrides].sort((x, y) => screen(x) - screen(y)),
##TO
    const screen = screenRank(window);
    const drawn = screenOwn(window);
    void inLanes(
      // What is drawn here, as the boot reads it; a surface read only where it is drawn waits for its page.
      overrides.filter((o) => !o.onDemand || drawn(o)).sort((x, y) => screen(x) - screen(y)),
##END
##FILE apps/dashboard/src/legacy-bridge/surface-runner.ts
##FROM
  const pagesOwn = queued.filter((o) => o.key === "workspace" || own(o));
  const strangers = queued.filter((o) => !pagesOwn.includes(o));
##TO
  const pagesOwn = queued.filter((o) => o.key === "workspace" || own(o));
  // A stranger that is read only where it is drawn is not booted: its page reads it as it comes on screen (readWhatWasMissed).
  const strangers = queued.filter((o) => !pagesOwn.includes(o) && !o.onDemand);
##END
##FILE apps/dashboard/src/legacy-bridge/surface-registry.ts
##FROM
import { isSurfaceFailed, isSurfaceReady, onSurfaceStatusChange } from "./surface-status";
##TO
import { getSurfaceStatuses, isSurfaceFailed, isSurfaceReady, onSurfaceStatusChange } from "./surface-status";
##END
##FILE apps/dashboard/src/legacy-bridge/surface-registry.ts
##FROM
/**
 * Each move of the address: a surface whose page comes on screen and that let an event pass is read once, through
 * the runner (`read`, the running runner's refresh). Answers the stop.
 */
export function readWhatWasMissed(
  overrides: readonly { key: string }[],
  read: (keys: string[]) => void,
  win: Window = window,
): () => void {
  const onMove = () => {
    const due = overrides.filter((o) => missedWhileAway.has(o.key) && ownsTheScreen(o.key, routeOnScreen(win)));
    for (const o of due) missedWhileAway.delete(o.key);
    if (due.length) read(due.map((o) => o.key));
  };
  return hearAddress(onMove, win);
}
##TO
/**
 * Each move of the address: what its page draws and has not read is read once, through the runner (`read`, the running
 * runner's refresh). Two kinds of surface are due. One that let a live event pass while its page was elsewhere, when its page
 * owns the screen. And one marked `onDemand` (surface-data.ts), when a page that draws it (its own surface, or one the route
 * names) is on screen and it has never been read this session, or says it has aged: one list, so a surface that missed an event
 * and was never read is read once. Answers the stop.
 */
export function readWhatWasMissed(
  overrides: readonly { key: string; onDemand?: boolean; isStale?: () => boolean }[],
  read: (keys: string[]) => void,
  win: Window = window,
): () => void {
  const onMove = () => {
    const route = routeOnScreen(win);
    const { page, param } = pageOfRoute(route);
    const drawn = routeSurfaces(page, param);
    const readBefore = (key: string) => getSurfaceStatuses().get(key) === "live";
    const due = overrides.filter((o) =>
      o.onDemand
        ? drawn.includes(o.key) && (missedWhileAway.has(o.key) || !readBefore(o.key) || !!o.isStale?.())
        : missedWhileAway.has(o.key) && ownsTheScreen(o.key, route),
    );
    for (const o of due) missedWhileAway.delete(o.key);
    if (due.length) read(due.map((o) => o.key));
  };
  return hearAddress(onMove, win);
}
##END
##FILE apps/dashboard/src/surfaces/reports/surface.ts
##FROM
export const reportsOverride: SurfaceOverride = {
  key: "reports",
  value: "reports",
##TO
export const reportsOverride: SurfaceOverride = {
  key: "reports",
  value: "reports",
  // Read where Reports is drawn and nowhere else: every other page's boot leaves the whole report, the campaigns' and the reach-outs'
  // reads alone (Today reads the headline, headline.ts). It is read as its page comes on screen.
  onDemand: true,
##END
##FILE apps/dashboard/src/surfaces/reports/headline.ts
##FROM
export const reportsHeadlineOverride: SurfaceOverride = {
  key: "reports_headline",
  value: "reports_headline",
##TO
export const reportsHeadlineOverride: SurfaceOverride = {
  key: "reports_headline",
  value: "reports_headline",
  // Read where Today is drawn, as Today comes on screen, and again then when it has aged (a pick on Reports keeps it fresh behind the
  // control: period.ts).
  onDemand: true,
  isStale: isHeadlineStale,
##END
```

- [ ] **Step 4: Run the test, and every test that names the boot, the return or the arrival**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/legacy-bridge/surface-data.ts apps/dashboard/src/legacy-bridge/surface-runner.ts apps/dashboard/src/legacy-bridge/surface-registry.ts apps/dashboard/src/surfaces/reports/surface.ts apps/dashboard/src/surfaces/reports/headline.ts tooling/scripts/tests/reports/headline/on-demand-boot.test.mjs
git add tooling/scripts/tests/reports/headline/on-demand-boot.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/on-demand-boot.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/surface-registry.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/route-waits.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/route-prefetch.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/shell-status.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/client-refresh-behind.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/headline-surface.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-page-context.test.mjs
git grep -n 'surfaceValue("reports")\|useSurface("reports")' -- apps
corepack pnpm -r typecheck
```
Expected: all PASS. `message-fan-out.test.mjs` is the proof that a surface not marked behaves as before and that the arrival rule did not double a read: its "Reports let two messages pass, and is read once as it comes on screen" still says `["reports"]`, now because `reports` was never read at boot, with one `due` entry for the one reason or both. `surface-boot.test.mjs` shows Today's boot in the page's order and the strangers after it, with the on-demand ones absent. `refresh-coverage.test.mjs` is unchanged: a write's list still names `reportsOverride` and a named refresh is still made. `git grep` prints only `reports-page.tsx`, `period.ts` and `legacy-bridge/ask/context.ts`. If a test of the boot pinned `reports` among Today's strangers, it is changed in this task to the on-demand truth and the commit says which.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/legacy-bridge/surface-data.ts apps/dashboard/src/legacy-bridge/surface-runner.ts apps/dashboard/src/legacy-bridge/surface-registry.ts apps/dashboard/src/surfaces/reports/surface.ts apps/dashboard/src/surfaces/reports/headline.ts tooling/scripts/tests/reports/headline/on-demand-boot.test.mjs
git commit -m "Reports boots only where it is drawn: a surface marked on-demand is skipped by the boot's second pass and by a return, and read as its page comes on screen." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Today says a reply that waited the hold went out as the hold ended, by the one rule

**Why:** spec D14 (deferred from phase A): "Today's number mostly measures the setting." Today's reply-speed words come from `metrics_summary`'s `median_reply_seconds_ai` (`today-figures.ts`, `today-bands.ts`: four sentences), not from the report, and a reply the owner held for a minute has a median of a minute whatever the receptionist's speed. This task changes the words and leaves the data for Task 11: `MetricsSummaryDto` gains an optional `reply_hold`, a four-number summary the server makes with `holdOf` over the day's replies (the label of the hold most replies waited, and how many went out as it ended, later than it, and with none), and every sentence takes its speed from one function, `replySpeedOf`, over that summary, so the one rule (`classOf` and its ten-second slack stay private to `report-speed.ts`) is applied once, on the server, and the browser, the phone and Ask read what it made. With no `reply_hold` (an older server, a longer window, a failed read, a day on which no reply waited a hold) every sentence says what it said. `figuresOf` stands at exactly its 200-line baseline, so the answered figure's clause is one module-level `speedClause`, and the line it replaces is replaced by one line.

**Files:**
- Create: `tooling/scripts/tests/today/today-reply-hold.test.mjs`
- Modify: `packages/contracts/src/reports/report-speed.ts`, `packages/contracts/src/reports/index.ts`, `packages/contracts/src/today/today-metrics.ts` (whole file), `today-facts.ts`, `today-bands.ts`, `today-figures.ts`
- Regenerate: `packages/contracts/src/browser.generated.ts`, `packages/*/dist`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/today/today-reply-hold.test.mjs`:

```js
/**
 * How fast the receptionist replied, said against the hold the owner set (spec D14, deferred from phase A): where most of the day's
 * replies waited a hold, Today says they went out as it ended (or later than it) by the one rule Reports reads (report-speed.ts
 * `holdOf`, whose slack no sentence here writes); else the median, as it did. The same words in the day's four sentences: the
 * answered figure's clause, the recap's line, Ask's fact and the calm headline's detail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { holdOf, replyHoldDtoOf, toTodayVM } from "@chanlytics/contracts";

const NOW = new Date("2026-08-27T15:00:00Z"); // 11:00 America/New_York
/** A day of four messages the receptionist answered, its median 62 seconds, and the hold summary the server adds (or none). */
const metrics = (hold, period = {}) => ({
  workspace: { name: "Harbor Studio", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+15550100188" }],
  window: {
    days: 1,
    since: "2026-08-27T04:00:00+00:00",
    since_local: "2026-08-27T00:00:00",
    now_local: "2026-08-27T11:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 4,
    messages_out_ai: 4,
    messages_out_you: 0,
    conversations_active: 4,
    answered_by_ai: 4,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: 62,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
    ...period,
  },
  ...(hold === undefined ? {} : { reply_hold: hold }),
});
/** The four sentences about speed, as the day says them. */
const said = (m) => {
  const vm = toTodayVM(m, [], [], [], NOW);
  return {
    clause: vm.figures.find((f) => f.id === "answered").meta,
    line: vm.recap.line,
    fact: vm.recap.facts.find((f) => f.label === "Typical reply time").value,
    detail: vm.standing.detail,
  };
};
/** The summary the server makes (server/metrics/metrics.ts) of replies that each waited the owner's minute, taking these seconds: the one rule's. */
const held = (...seconds) => replyHoldDtoOf(holdOf(seconds.map((s) => ({ s, hold: 60 }))));
const MEDIAN = {
  clause: "typically in 1m 2s, none handed over",
  line: "4 messages in, 4 answered by the receptionist, typically in 1m 2s.",
  fact: "1m 2s",
  detail: "It answered 4 of the 4 on its own, typically in about 1m 2s.",
};

test("most replies went out as the hold ended: every sentence says so, and none says a minute", () => {
  assert.deepEqual(said(metrics(held(60, 61, 64, 90))), {
    clause: "typically as your 1-minute hold ended, none handed over",
    line: "4 messages in, 4 answered by the receptionist, typically as your 1-minute hold ended.",
    fact: "as your 1-minute hold ended",
    detail: "It answered 4 of the 4 on its own, typically as your 1-minute hold ended.",
  });
});

test("most replies went out after the hold, not as it ended: later than the hold, in the same four places", () => {
  assert.deepEqual(said(metrics(held(100, 120, 75, 61))), {
    clause: "typically later than your 1-minute hold, none handed over",
    line: "4 messages in, 4 answered by the receptionist, typically later than your 1-minute hold.",
    fact: "later than your 1-minute hold",
    detail: "It answered 4 of the 4 on its own, typically later than your 1-minute hold.",
  });
});

test("the edge of 'as it ended' is the one rule's: a reply a few seconds past its hold went out as it ended, a late one did not", () => {
  const ended = "typically as your 1-minute hold ended, none handed over";
  assert.equal(said(metrics(held(70, 70, 70, 70))).clause, ended, "ten seconds past is the queue's own tick");
  assert.equal(said(metrics(held(71, 71, 71, 71))).clause, "typically later than your 1-minute hold, none handed over");
});

test("a hold few replies waited says nothing of the receptionist's speed: the median, as before", () => {
  const some = [
    { s: 12, hold: 0 },
    { s: 70, hold: 60 },
    { s: 8, hold: 0 },
    { s: 9, hold: 0 },
  ];
  assert.deepEqual(said(metrics(replyHoldDtoOf(holdOf(some)))), MEDIAN);
});

test("no summary sent (an older server, a longer window, a failed read), or none made (no reply waited a hold): what it said before, word for word", () => {
  assert.deepEqual(said(metrics(undefined)), MEDIAN);
  assert.deepEqual(said(metrics(null)), MEDIAN);
  const none = replyHoldDtoOf(holdOf([{ s: 62, hold: 0 }, { s: 62, hold: 0 }]));
  assert.equal(none, null, "replies sent with no hold make no summary");
  assert.deepEqual(said(metrics(none)), MEDIAN, "and say the median");
});

test("no median, no sentence about speed, whatever was read: the figure's clause drops it, Ask's fact says there is not enough, the detail goes", () => {
  const none = said(metrics(held(60, 61, 64, 90), { median_reply_seconds_ai: null }));
  assert.deepEqual(none, {
    clause: "none handed over",
    line: "4 messages in, 4 answered by the receptionist.",
    fact: "—",
    detail: null,
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-reply-hold.test.mjs`
Expected: the first, second and third tests FAIL (the sentences say `typically in 1m 2s`: `reply_hold` is not read), the other three PASS (they pin what is said today).

- [ ] **Step 3: The one rule says the words; the metrics carry the replies; the four sentences take them**

Save as `task6.swap` and run it (Standing rules):

```swap
##FILE packages/contracts/src/reports/report-speed.ts
##FROM
/**
 * How fast, beside the hero: against the hold where most replies waited one, since the setting is not the
 * receptionist's speed. Where most replies had no hold, the hold says nothing of them and the median does. The
 * count of replies is the hold's own, the replies it saw.
 */
export function heroSpeed(replies: number, medianLabel: string, hold: ReportHoldVM | null): string {
  if (!replies) return "";
  const held = hold ? hold.atEnd + hold.later : 0;
  const seen = hold ? hold.unheld + held : 0;
  if (!hold || held * 2 <= seen) return ` Half of its replies went out within ${medianLabel}.`;
  if (hold.atEnd >= hold.later) return ` ${hold.atEnd} of ${seen} went out as your ${hold.label} hold ended.`;
  return ` ${hold.later} of ${seen} took longer than your ${hold.label} hold.`;
}
##TO
/** The counts of a hold the sentences need: what the metrics carry to Today, and what `ReportHoldVM` has beside them. */
type HoldCounts = Pick<ReportHoldVM, "label" | "atEnd" | "later" | "unheld">;

/**
 * The summary the day's metrics carry (snake_case: it rides a route): the hold most replies waited, in words, and how many replies
 * went out as it ended, later than it, and with none. Constant in size, whatever the day held; made on the server by `holdOf` and
 * read by `replySpeedOf`, so the rule's slack is applied once.
 */
export interface ReplyHoldDto {
  label: string;
  at_end: number;
  later: number;
  unheld: number;
}

/** The hold's summary for the wire: null where no reply waited a hold. */
export const replyHoldDtoOf = (hold: ReportHoldVM | null): ReplyHoldDto | null =>
  hold ? { label: hold.label, at_end: hold.atEnd, later: hold.later, unheld: hold.unheld } : null;

/** The replies a hold was counted over: those that waited it (as it ended, or later) and those sent with none. */
const repliesSeen = (hold: HoldCounts): number => hold.unheld + hold.atEnd + hold.later;

/**
 * Whether most of the replies seen waited a hold (more than half): the one test for saying the speed against the hold,
 * which Reports' hero and Today's sentences both ask. A hold that few replies waited says nothing of the receptionist's speed.
 */
const waitedHold = (hold: HoldCounts): boolean => (hold.atEnd + hold.later) * 2 > repliesSeen(hold);

/**
 * How fast, beside the hero: against the hold where most replies waited one, since the setting is not the
 * receptionist's speed. Where most replies had no hold, the hold says nothing of them and the median does. The
 * count of replies is the hold's own, the replies it saw.
 */
export function heroSpeed(replies: number, medianLabel: string, hold: ReportHoldVM | null): string {
  if (!replies) return "";
  if (!hold || !waitedHold(hold)) return ` Half of its replies went out within ${medianLabel}.`;
  const seen = repliesSeen(hold);
  if (hold.atEnd >= hold.later) return ` ${hold.atEnd} of ${seen} went out as your ${hold.label} hold ended.`;
  return ` ${hold.later} of ${seen} took longer than your ${hold.label} hold.`;
}

/** How fast the receptionist replied, as a sentence says it: the median, or the hold's words where most replies waited one. */
export type ReplySpeed = { held: false; seconds: number } | { held: true; words: string };

/**
 * The reply speed in the words Today's sentences take ("typically in 34s", "typically as your 1-minute hold ended"): the median,
 * or, where most replies waited the owner's hold, against it (spec D14), by the classes `holdOf` counts and the test the hero
 * asks. Null with no median to speak of.
 */
export function replySpeedOf(median: number | null, hold: ReplyHoldDto | null): ReplySpeed | null {
  if (median === null) return null;
  const counts: HoldCounts | null = hold && {
    label: hold.label,
    atEnd: hold.at_end,
    later: hold.later,
    unheld: hold.unheld,
  };
  if (!counts || !waitedHold(counts)) return { held: false, seconds: median };
  return {
    held: true,
    words: counts.atEnd >= counts.later ? `as your ${counts.label} hold ended` : `later than your ${counts.label} hold`,
  };
}
##END
##FILE packages/contracts/src/reports/index.ts
##FROM
export { holdOf } from "./report-speed";
export type { ReportHoldVM } from "./report-speed";
##TO
export { holdOf, replyHoldDtoOf } from "./report-speed";
export type { ReportHoldVM, ReplyHoldDto } from "./report-speed";
##END
##FILE packages/contracts/src/today/today-facts.ts
##FROM
import type { MetricsSummaryDto } from "./today-metrics";
##TO
import type { ReplySpeed } from "../reports/report-speed";
import { todayReplySpeed, type MetricsSummaryDto } from "./today-metrics";
##END
##FILE packages/contracts/src/today/today-facts.ts
##FROM
  live: MetricsSummaryDto["now"];
  /** Whether the calls read succeeded; false means the rows omit the phone, and the card says so. */
##TO
  live: MetricsSummaryDto["now"];
  /** How fast the receptionist replied: the median, or where most replies waited the owner's hold, against it (todayReplySpeed). */
  speed: ReplySpeed | null;
  /** Whether the calls read succeeded; false means the rows omit the phone, and the card says so. */
##END
##FILE packages/contracts/src/today/today-facts.ts
##FROM
    live: metrics.now,
    // Null: the calls read failed. The card says so rather than counting none.
##TO
    live: metrics.now,
    speed: todayReplySpeed(metrics),
    // Null: the calls read failed. The card says so rather than counting none.
##END
##FILE packages/contracts/src/today/today-bands.ts
##FROM
import { durationWords } from "../shared/clock";
import type { TodayFacts } from "./today-facts";
##TO
import type { ReplySpeed } from "../reports/report-speed";
import { durationWords } from "../shared/clock";
import type { TodayFacts } from "./today-facts";
##END
##FILE packages/contracts/src/today/today-bands.ts
##FROM
export function secondsPhrase(s: number): string {
  return durationWords(s);
}
##TO
export function secondsPhrase(s: number): string {
  return durationWords(s);
}

/**
 * How a sentence about speed finishes ("typically ..."): "in 34s", "in about 34s", or, where most replies waited the owner's hold,
 * against it ("as your 1-minute hold ended"). The one place Today's speed is said, over contracts' `replySpeedOf`.
 */
export const speedIn = (s: ReplySpeed, about = false): string =>
  s.held ? s.words : `in ${about ? "about " : ""}${secondsPhrase(s.seconds)}`;

/** The clause the answered figure ends on ("typically in 34s", or against the hold); "" with no reply to speak of. */
export const speedClause = (s: ReplySpeed | null): string => (s === null ? "" : `typically ${speedIn(s)}`);
##END
##FILE packages/contracts/src/today/today-bands.ts
##FROM
export function todayAskFacts(f: TodayFacts): TodayFactVM[] {
  const { period, callMinutes } = f;
  return [
    { label: "Messages in", value: String(period.messages_in) },
    { label: "Answered by the receptionist", value: `${period.answered_by_ai} of ${period.messages_in}` },
    period.median_reply_seconds_ai === null
      ? { label: "Typical reply time", value: "—", hint: "Not enough replies yet" }
      : { label: "Typical reply time", value: secondsPhrase(period.median_reply_seconds_ai) },
##TO
export function todayAskFacts(f: TodayFacts): TodayFactVM[] {
  const { period, callMinutes, speed } = f;
  return [
    { label: "Messages in", value: String(period.messages_in) },
    { label: "Answered by the receptionist", value: `${period.answered_by_ai} of ${period.messages_in}` },
    speed === null
      ? { label: "Typical reply time", value: "—", hint: "Not enough replies yet" }
      : { label: "Typical reply time", value: speed.held ? speed.words : secondsPhrase(speed.seconds) },
##END
##FILE packages/contracts/src/today/today-bands.ts
##FROM
export function todayTrafficLine(f: TodayFacts): string {
  const { period, callMinutes } = f;
  const trafficParts: string[] = [];
  if (period.messages_in > 0) {
    trafficParts.push(
      `${period.messages_in} message${period.messages_in === 1 ? "" : "s"} in, ${period.answered_by_ai} answered by the receptionist${
        period.median_reply_seconds_ai === null ? "" : `, typically in ${secondsPhrase(period.median_reply_seconds_ai)}`
      }`,
    );
  }
##TO
export function todayTrafficLine(f: TodayFacts): string {
  const { period, callMinutes, speed } = f;
  const trafficParts: string[] = [];
  if (period.messages_in > 0) {
    trafficParts.push(
      `${period.messages_in} message${period.messages_in === 1 ? "" : "s"} in, ${period.answered_by_ai} answered by the receptionist${
        speed === null ? "" : `, typically ${speedIn(speed)}`
      }`,
    );
  }
##END
##FILE packages/contracts/src/today/today-bands.ts
##FROM
  return calmHeadline(f.period);
##TO
  return calmHeadline(f);
##END
##FILE packages/contracts/src/today/today-bands.ts
##FROM
function calmHeadline(period: TodayFacts["period"]): TodayHeadline {
##TO
function calmHeadline({ period, speed }: TodayFacts): TodayHeadline {
##END
##FILE packages/contracts/src/today/today-bands.ts
##FROM
  const detail =
    period.median_reply_seconds_ai !== null && period.messages_in > 0
      ? `It answered ${period.answered_by_ai} of the ${period.messages_in} on its own, typically in about ${secondsPhrase(
          period.median_reply_seconds_ai,
        )}.`
      : null;
##TO
  const detail =
    speed !== null && period.messages_in > 0
      ? `It answered ${period.answered_by_ai} of the ${period.messages_in} on its own, typically ${speedIn(speed, true)}.`
      : null;
##END
##FILE packages/contracts/src/today/today-figures.ts
##FROM
import { andList, secondsPhrase } from "./today-bands";
##TO
import { andList, secondsPhrase, speedClause } from "./today-bands";
##END
##FILE packages/contracts/src/today/today-figures.ts
##FROM
import type { MetricsSummaryDto } from "./today-metrics";
##TO
import { todayReplySpeed, type MetricsSummaryDto } from "./today-metrics";
##END
##FILE packages/contracts/src/today/today-figures.ts
##FROM
      p.median_reply_seconds_ai !== null ? `typically in ${secondsPhrase(p.median_reply_seconds_ai)}` : "",
##TO
      speedClause(todayReplySpeed(m)),
##END
```

Write the whole of `packages/contracts/src/today/today-metrics.ts`:

```ts
/**
 * What Today's brief reads from the metrics summary (server/metrics.ts): the workspace, its wires and the day's
 * counts, with the email wire the database cannot see and the summary of the hold the day's replies waited. What the brief says is
 * today-vm.ts; the brief that reads this is today-brief.ts.
 */
import type { EmailSetupDto } from "../email/mailbox";
import { replySpeedOf, type ReplyHoldDto, type ReplySpeed } from "../reports/report-speed";

/**
 * One wire a workspace can be reached on.
 *
 * `metrics_summary` answers the ROUTING rows (tenant_channels, 00087). Email
 * is not one of them: a workspace's email line is its `mailboxes` row plus the
 * deployment's mail domain (mailbox.ts), and the domain lives in EMAIL_DOMAIN,
 * which the database cannot see. `emailWires` below puts it in the same list,
 * from the same read Setup and Connections use, so the three cannot disagree.
 */
export interface MetricsChannelDto {
  kind: string;
  /** `tenant_channels.status`: "active" or "disabled"; "active" for a mailbox that exists. */
  status: string;
  /** The phone number customers reach this wire on; null on a wire that is not a number. */
  number: string | null;
  /** Where customers reach a wire that is not a number: the workspace's email address. */
  address?: string | null;
}

/**
 * The email wire, for that list.
 *
 * A workspace HAS email when this deployment has it and the owner has made the
 * mailbox (00129), the judgement `emailSetupFor` already makes for Setup and
 * Connections. Nothing switches a mailbox off, so a mailbox that exists is a
 * wire that is connected: `last_error` is an intake that failed, which
 * Connections tells as "Waiting on us", and a failed intake is not a wire that
 * is down.
 */
export function emailWires(email: EmailSetupDto | null | undefined): MetricsChannelDto[] {
  return email?.ready && email.mailbox
    ? [{ kind: "email", status: "active", number: null, address: email.mailbox.address }]
    : [];
}

export interface MetricsSummaryDto {
  workspace: { name: string; timezone: string; status: string };
  channels: MetricsChannelDto[];
  /**
   * False when the workspace's email line could not be read (server/metrics.ts
   * caught the mailbox read): the count above the work is short by a wire it
   * cannot name, and says so rather than printing a smaller whole. Absent is
   * true, as every payload the database answers is.
   */
  linesRead?: boolean;
  /**
   * How the day's replies sat against the hold the owner set: the hold most replies waited, in words, and how many went out as it
   * ended, later than it, and with none (`holdOf`, the one rule both reports read; four numbers, however long the day). What
   * `metrics_summary` does not carry (it answers the median, and the median of a held reply is the hold): added beside the
   * function's answer by the server (server/metrics/metrics.ts) from `first_replies`. Absent from an older server's answer, from a
   * longer window, from a read that failed and from a day on which no reply waited a hold, and the sentences then say the median.
   */
  reply_hold?: ReplyHoldDto;
  window: { days: number; since: string; since_local: string; now_local: string };
  now: {
    escalations_open: number;
    oldest_open_escalation_at: string | null;
    threads_needing_human: number;
    threads_snoozed: number;
    threads_awaiting_reply: number;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
  };
  period: {
    messages_in: number;
    messages_out_ai: number;
    messages_out_you: number;
    conversations_active: number;
    answered_by_ai: number;
    answered_by_you: number;
    unanswered_in_window: number;
    median_reply_seconds_ai: number | null;
    send_failures: number;
    escalations_new: number;
    escalation_reasons: Record<string, number>;
    calls: number;
    call_seconds: number;
    call_sentiments: Record<string, number>;
    calls_voicemail: number;
    new_contacts: number;
  };
}

/**
 * How fast the receptionist replied over the window: its median, or, where most replies waited the owner's hold, against it
 * ("as your 1-minute hold ended", spec D14). One reading of one rule (reports/report-speed.ts) for every sentence Today says about
 * speed, so the figure's clause, the recap's line, Ask's fact and the headline's detail never disagree. Null with no reply to speak of.
 */
export function todayReplySpeed(m: MetricsSummaryDto): ReplySpeed | null {
  return replySpeedOf(m.period.median_reply_seconds_ai, m.reply_hold ?? null);
}
```

- [ ] **Step 4: Build, run**

```bash
corepack pnpm exec prettier --write packages/contracts/src/reports/report-speed.ts packages/contracts/src/reports/index.ts packages/contracts/src/today/today-metrics.ts packages/contracts/src/today/today-facts.ts packages/contracts/src/today/today-bands.ts packages/contracts/src/today/today-figures.ts tooling/scripts/tests/today/today-reply-hold.test.mjs
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter "./packages/*" build
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-reply-hold.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-hold.test.mjs
for f in $(find tooling/scripts/tests/today -name "*.test.mjs" ! -name "*.db.test.mjs" | sort); do node tooling/scripts/checks/test.mjs "$f" || break; done
corepack pnpm -r typecheck
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
```
Expected: the ratchet (run without `UPDATE_BASELINES`: a rise is a stop) names no rise: `figuresOf` stands at exactly 200 lines in `complexity.json`, and the clause is one line for one line (`speedClause(todayReplySpeed(m))`), so it neither rises nor needs banking. The new test PASSES (six tests); `reports-hold.test.mjs` PASSES unchanged (the hero's words came through the shared `waitedHold` by value); every Today test PASSES with the words it asserted before (`typically in 34s, 2 handed over`, `typically in 38s`, `typically in about ...`); typecheck clean.

- [ ] **Step 5: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add packages/contracts/src/reports/report-speed.ts packages/contracts/src/reports/index.ts packages/contracts/src/today/today-metrics.ts packages/contracts/src/today/today-facts.ts packages/contracts/src/today/today-bands.ts packages/contracts/src/today/today-figures.ts packages/contracts/src/browser.generated.ts packages/*/dist tooling/scripts/tests/today/today-reply-hold.test.mjs
git commit -m "Today says a reply that waited your hold went out as it ended, by the one rule Reports reads, and never calls a hold a speed." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Today's metrics carry the day's hold summary, read beside `metrics_summary` and never a reason to blank the page

**Why:** Task 10 reads `reply_hold`; nothing sends it yet. `metricsSummaryFor` (the one door for the metrics: the page's `GET metrics`, `GET today` for the phone app and Ask's `today` reader all read through it) reads `first_replies` beside the function, for a one-day window, through `packages/db` (the one place the function is called by name), **from 26 hours back** (a local day is at most 25 hours long, so the window's own midnight is always inside the read; two days was twice what it needed), keeps the replies the window's own midnight keeps, runs `holdOf` over them **on the server**, and hands Today a four-number summary where it first sent a list. No migration: `first_replies(p_tenant_id, p_start)` is granted to `authenticated` (00303) and is SECURITY INVOKER, so RLS decides what a member reads, as it does for `metrics_summary`. `firstReplies` goes in a module of its own, `first-replies.ts`, which gives `packages/db/src/repositories/reports/` (a folder of one module) its second by the rule.

**Files:**
- Create: `packages/db/src/repositories/reports/first-replies.ts`, `tooling/scripts/tests/reports/headline/metrics-replies.test.mjs`
- Modify: `packages/db/src/index.ts`, `apps/dashboard/src/server/metrics/metrics.ts` (whole file), `apps/dashboard/src/server/log.ts`
- Regenerate: `packages/db/dist`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/headline/metrics-replies.test.mjs`:

```js
/**
 * The day's hold beside the metrics (server/metrics/metrics.ts; packages/db `firstReplies`): `first_replies`, the one rule for
 * who answered and how fast (00303), read in the same breath as `metrics_summary` for a one-day window from 26 hours back, kept to
 * the window's own midnight, run through `holdOf` on the server and handed on as `reply_hold`: the hold most replies waited and how
 * many went out as it ended, later than it, and with none; four numbers, however long the day. So the browser, GET today and Ask say
 * reply speed against the hold from one reading. A read that fails costs the clause, never the page; a longer window is none of
 * Today's and reads none; a day on which no reply waited a hold sends nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOUR_MS } from "@chanlytics/contracts";
import { firstReplies } from "@chanlytics/db";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { metricsSummaryFor } = await importSrc("apps/dashboard/src/server/metrics/metrics.ts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONVERSATION = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
/** A row of `first_replies` as PostgREST answers it. */
const row = (over) => ({
  asked_at: "2026-09-18T14:00:00.250+00:00",
  conversation_id: CONVERSATION,
  ai_at: "2026-09-18T14:01:00.850+00:00",
  human_at: null,
  who: "ai",
  ai_seconds: 60.6,
  ai_hold_s: 60,
  ...over,
});
const SUMMARY = {
  workspace: { name: "Harbor Studio", timezone: "America/New_York", status: "active" },
  channels: [],
  window: {
    days: 1,
    since: "2026-09-18T04:00:00+00:00",
    since_local: "2026-09-18T00:00:00",
    now_local: "2026-09-18T11:00:00",
  },
  now: {},
  period: { messages_in: 4, median_reply_seconds_ai: 62 },
};
/** A workspace's database: the metrics function, and `first_replies` where the world models it (or fails where it is a function). */
const world = (answer) =>
  fakeDb(
    {
      memberships: [
        { user_id: "u1", tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
      ],
      mailboxes: [],
    },
    {},
    { metrics_summary: () => SUMMARY, ...(answer ? { first_replies: answer } : {}) },
  );
const dbWith = (answers) => {
  const asked = [];
  return { asked, db: { rpc: async (name, args) => (asked.push([name, args]), answers[name]) } };
};

test("firstReplies: the receptionist's replies as report_series lists them, whole seconds, and nobody else's", async () => {
  const since = new Date("2026-09-16T20:00:00Z");
  const { db, asked } = dbWith({
    first_replies: {
      error: null,
      data: [
        row({ ai_seconds: 60.6, ai_hold_s: 60.2 }),
        row({ who: "you", ai_seconds: null, ai_hold_s: null }),
        row({ ai_seconds: 7.4, ai_hold_s: null }),
      ],
    },
  });
  assert.deepEqual(await firstReplies(db, A, since), [
    { asked_at: "2026-09-18T14:00:00.250+00:00", s: 61, hold: 60 },
    { asked_at: "2026-09-18T14:00:00.250+00:00", s: 7, hold: 0 },
  ]);
  assert.deepEqual(asked, [["first_replies", { p_tenant_id: A, p_start: since.toISOString() }]]);
  const down = dbWith({ first_replies: { data: null, error: { message: "boom", code: "08006" } } });
  await assert.rejects(firstReplies(down.db, A, since), /first_replies.*boom/);
});

test("a one-day window carries the day's hold: from the replies the window's own midnight keeps, by the one rule, four numbers", async () => {
  const db = world(() => [
    row({ asked_at: "2026-09-17T23:30:00.000+00:00", ai_seconds: 61.4 }),
    row({ asked_at: "2026-09-18T14:00:00.250+00:00", ai_seconds: 60.6 }),
    row({ asked_at: "2026-09-18T15:00:00.000+00:00", ai_seconds: 95.2 }),
    row({ asked_at: "2026-09-18T15:30:00.000+00:00", who: "you", ai_seconds: null, ai_hold_s: null }),
    row({ asked_at: "2026-09-18T16:00:00.000+00:00", ai_seconds: 7.4, ai_hold_s: 0 }),
  ]);
  const m = await metricsSummaryFor(db, A, 1);
  // The reply before the window's midnight is not the day's; of the three that are: one went out as its minute ended, one after it
  // (95 seconds against 60, past the queue's own tick), one was sent with no hold at all.
  assert.deepEqual(m.reply_hold, { label: "1-minute", at_end: 1, later: 1, unheld: 1 });
  assert.equal(m.replies, undefined, "no list goes over the wire: the browser, the phone and Ask each get four numbers");
  assert.equal(m.period.median_reply_seconds_ai, 62, "the median is the function's, untouched");
  const [call] = db.seen.filter((q) => q.rpc === "first_replies");
  const lookback = Date.now() - Date.parse(call.args.p_start);
  assert.ok(
    Math.abs(lookback - 26 * HOUR_MS) < 10_000,
    "from 26 hours back: a local day is at most 25, so the window's own midnight is always inside it",
  );
  assert.equal(call.args.p_tenant_id, A);
});

test("a day on which no reply waited a hold sends no summary: the function's answer as it was", async () => {
  const db = world(() => [row({ ai_hold_s: 0 }), row({ ai_hold_s: null, asked_at: "2026-09-18T16:00:00.000+00:00" })]);
  const m = await metricsSummaryFor(db, A, 1);
  assert.equal(m.reply_hold, undefined);
  assert.deepEqual(m, SUMMARY, "byte for byte what the function answered");
});

test("a longer window reads no replies: the period's are Reports' (report_series), and the answer is the function's alone", async () => {
  const db = world(() => [row({})]);
  const m = await metricsSummaryFor(db, A, 7);
  assert.equal(m.reply_hold, undefined);
  assert.equal(db.seen.filter((q) => q.rpc === "first_replies").length, 0);
});

test("a replies read that fails costs the clause and nothing else: Today draws, saying the median it said before", async () => {
  const db = world(() => {
    throw new Error("connection refused");
  });
  const was = console.error;
  console.error = () => {};
  try {
    const m = await metricsSummaryFor(db, A, 1);
    assert.equal(m.reply_hold, undefined);
    assert.equal(m.period.median_reply_seconds_ai, 62);
    assert.equal(m.linesRead, undefined, "the lines were all read: only the replies were not");
  } finally {
    console.error = was;
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/metrics-replies.test.mjs`
Expected: FAIL at load: `firstReplies` is not exported by `@chanlytics/db`.

- [ ] **Step 3: The repository, the export, the door, the event**

Create `packages/db/src/repositories/reports/first-replies.ts`:

```ts
/**
 * The receptionist's first replies (`first_replies`, 00303): the one rule for who answered and how fast, which `report_series` and
 * `metrics_summary` both read, asked for Today's day so its sentences about speed can say each reply against its hold. The one place
 * the function is called by name, in a module of its own beside the report functions (report-series.ts); the dashboard asks on the
 * session client, so RLS decides what a member reads (SECURITY INVOKER). A read that fails throws: "we could not read" is never "none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/**
 * The receptionist's first replies asked since `since`, each as `report_series` lists them: the seconds it took and the seconds it
 * was held, whole as the SQL rounds them (`round(ai_seconds)`, `round(coalesce(ai_hold_s, 0))`), so a reply is the same class on
 * Reports and on Today at the slack's edge. Only the ones the receptionist answered; each keeps the moment it was asked, so a
 * caller can keep a window's own.
 */
export async function firstReplies(
  db: Db,
  tenantId: string,
  since: Date,
): Promise<{ asked_at: string; s: number; hold: number }[]> {
  const { data, error } = await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: since.toISOString() });
  if (error) throw new Error(`first_replies: ${error.message}`);
  return (data ?? []).flatMap((r) =>
    Number.isFinite(r.ai_seconds)
      ? [
          {
            asked_at: r.asked_at,
            s: Math.round(r.ai_seconds),
            hold: Number.isFinite(r.ai_hold_s) ? Math.round(r.ai_hold_s) : 0,
          },
        ]
      : [],
  );
}
```

```swap
##FILE packages/db/src/index.ts
##FROM
export { reportSeries, campaignSeries, reachOutReport } from "./repositories/reports/report-series";
##TO
export { reportSeries, campaignSeries, reachOutReport } from "./repositories/reports/report-series";
export { firstReplies } from "./repositories/reports/first-replies";
##END
##FILE apps/dashboard/src/server/log.ts
##FROM
  "today_email_line_read_failed",
  "today_searches_fetch_failed",
##TO
  "today_email_line_read_failed",
  "today_replies_read_failed",
  "today_searches_fetch_failed",
##END
```

Write the whole of `apps/dashboard/src/server/metrics/metrics.ts`:

```ts
/**
 * The numbers behind Today, and the wires they are counted on.
 *
 * `metrics_summary` answers the routing rows. A workspace's email line is its
 * mailbox and this deployment's mail domain, which the database cannot see,
 * so it is added here, from `emailSetupFor`, the same read Setup and
 * Connections make. For a one-day window the hold the day's replies waited is added too (`reply_hold`: the one rule's count of
 * the replies that went out as the hold ended, later, and with none, from `first_replies`, which both reports read), because the
 * function answers the median and the median of a held reply is the hold. Both readers of the function come through this one door,
 * so the page's Today and Ask's Today count the same lines and say the same speed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOUR_MS, emailWires, holdOf, replyHoldDtoOf, type MetricsSummaryDto } from "@chanlytics/contracts";
import { firstReplies, type Database } from "@chanlytics/db";
import { emailSetupFor } from "../connections/email";
import { log } from "@/server/log";

/** The window the day's replies are read over: Today's one day. A longer window carries none (a period's replies are Reports', report_series). */
const REPLIES_WINDOW_DAYS = 1;

/**
 * How far back the day's replies are read: a local day is at most 25 hours long (a clock put back), so 26 always holds the window's
 * own midnight, which is only known once the function has answered, and the read cannot wait for it.
 */
const REPLIES_LOOKBACK_MS = 26 * HOUR_MS;

type RecentReplies = Awaited<ReturnType<typeof firstReplies>>;

/**
 * The receptionist's replies of the last 26 hours with the hold each waited, read beside the function so no wall clock waits for
 * them. Null when the read failed (logged): the sentence then says the median, as it did.
 */
function recentReplies(supabase: SupabaseClient<Database>, tenantId: string): Promise<RecentReplies | null> {
  return firstReplies(supabase, tenantId, new Date(Date.now() - REPLIES_LOOKBACK_MS)).catch((e: unknown) => {
    log.error("today_replies_read_failed", { error: e });
    return null;
  });
}

/** The hold the window's own replies waited, by the one rule: those the window's midnight keeps. Undefined where none waited one. */
function holdSummary(rows: RecentReplies, since: string): MetricsSummaryDto["reply_hold"] {
  const from = Date.parse(since);
  return replyHoldDtoOf(holdOf(rows.filter((r) => Date.parse(r.asked_at) >= from))) ?? undefined;
}

/** Null when the function answered nothing, or answered its own error; each caller refuses in its own words. */
export async function metricsSummaryFor(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  days: number,
): Promise<MetricsSummaryDto | null> {
  // Together, not waterfalled: one indexed row must not sit behind three
  // plpgsql aggregates on Today's wall clock, and neither must the day's replies.
  const [res, email, recent] = await Promise.all([
    supabase.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: days }),
    // A mailbox that cannot be read is a line that cannot be counted, which is
    // its own state (callsRead is the same shape), never a blank Today and
    // never a count that is short by one.
    emailSetupFor(supabase, tenantId).catch((e: unknown) => {
      log.error("today_email_line_read_failed", { error: e });
      return null;
    }),
    days === REPLIES_WINDOW_DAYS ? recentReplies(supabase, tenantId) : Promise.resolve(null),
  ]);
  if (res.error) throw new Error(res.error.message);
  const answered = res.data as unknown as MetricsSummaryDto | null;
  if (!answered || (answered as unknown as { error?: string }).error) return null;
  const hold = recent === null ? undefined : holdSummary(recent, answered.window.since);
  const dto = hold === undefined ? answered : { ...answered, reply_hold: hold };
  if (email === null) return { ...dto, linesRead: false };
  const wires = emailWires(email);
  // Untouched where there is no email line: a deployment without the channel
  // gets exactly the payload the function answered.
  return wires.length ? { ...dto, channels: [...(dto.channels ?? []), ...wires] } : dto;
}
```

- [ ] **Step 4: Build, run, bank**

```bash
corepack pnpm exec prettier --write packages/db/src/repositories/reports/first-replies.ts packages/db/src/index.ts apps/dashboard/src/server/metrics/metrics.ts apps/dashboard/src/server/log.ts tooling/scripts/tests/reports/headline/metrics-replies.test.mjs
git add packages/db/src/repositories/reports/first-replies.ts tooling/scripts/tests/reports/headline/metrics-replies.test.mjs
corepack pnpm --filter "./packages/*" build
git diff --stat -- packages/db/dist/index.d.ts
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/metrics-replies.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/email/mailbox-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-route.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-tool-names.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/log-events.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-repository.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
corepack pnpm -r typecheck
```
Expected: `git diff --stat packages/db/dist/index.d.ts` shows only the added `firstReplies` declaration (no `agrees?:` hunks); the new test PASSES (five tests), and every other test PASSES unchanged: the worlds that fake `metrics_summary` do not model `first_replies`, so the fake refuses it as the database refuses an unmodelled function, the read is caught and logged, and the answer is the function's alone; `log-events.test.mjs` finds `today_replies_read_failed` declared and spelled; `tree-shape` shows `packages/db/src/repositories/reports` at two modules; the ratchets name no rise (the function is called by name inside `packages/db`, where it is allowed, and the casts in `metrics.ts` are the two it had).

- [ ] **Step 5: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add packages/db/src/repositories/reports/first-replies.ts packages/db/src/index.ts packages/*/dist apps/dashboard/src/server/metrics/metrics.ts apps/dashboard/src/server/log.ts tooling/scripts/tests/reports/headline/metrics-replies.test.mjs
git commit -m "Today's day carries the hold its replies waited, as four numbers worked out on the server, read beside the metrics and never a reason to blank the page." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: What stopped loading, measured on the real runner: Today's three routes for one, and every other page's boot reading none

**Why:** the pull request says what stopped being asked, and what stopped is the **boot**, not only Today's period line. After this part both overrides still exist (the Reports page reads `reports`), so one test starts the **real runner** (`startSurfaces`, both of its passes) over every override the app registers on route `today` and on route `inbox`, before and after: the report overrides real, over a recording `fetch` on the fixtures of a busy workspace's thirty days (the requests and the bytes of both passes), the others recorded. "Before" is the runner as it was (no `onDemand`, Today drawing `reports`, no headline) and "after" is this branch's. A second test counts the database's doors per route over the in-memory double (what the three routes read, and what the headline reads). The tests hold the direction, so they cannot rot, and print the numbers for the pull request.

**Files:**
- Create: `tooling/scripts/tests/reports/headline/headline-boot.test.mjs`

- [ ] **Step 1: Write the test**

Create `tooling/scripts/tests/reports/headline/headline-boot.test.mjs`:

```js
/**
 * What the boot stopped loading for Reports' sake (the lenses spec, D17 and §6.5). Before, the runner booted every override on every
 * page, so the report (GET reports, reports/campaigns, reports/reach-outs: three routes and four view models built in the browser) was
 * read on the Inbox as a stranger and on Today as a surface it draws; now Today draws `reports_headline`, one small read, and the
 * report is read where Reports is on screen. The real runner is started over every override (the report's real, over a recording
 * fetch on a busy workspace's thirty days; the others recorded) on `today` and on `inbox`, both passes counted, before and after; and
 * the database's doors are counted per route over the in-memory double. The direction is held; the numbers are printed for the pull
 * request.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { headlineOf } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { campaignDto, cday, reportDto, rday } from "../_report-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
installLegacyReact();
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
const keepError = console.error;
console.error = () => {};
const { reportsOverride } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { reportsHeadlineOverride } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
console.error = keepError;
const { ROUTE_DRAWS } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/rate-limit.ts");
const reportsRoute = await importSrc("apps/dashboard/app/api/v1/reports/route.ts");
const campaignsRoute = await importSrc("apps/dashboard/app/api/v1/reports/campaigns/route.ts");
const reachOutsRoute = await importSrc("apps/dashboard/app/api/v1/reports/reach-outs/route.ts");
const headlineRoute = await importSrc("apps/dashboard/app/api/v1/reports/headline/route.ts");
beforeEach(() => setRateStore(memoryStore()));

/* ---- a busy workspace's thirty days, and the thirty before them ---- */
const DAYS = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 7, 6 + i)).toISOString().slice(0, 10));
const busyReport = () =>
  reportDto({
    days: 30,
    span_days: 60,
    today: DAYS[59],
    series: DAYS.map((d, i) =>
      rday(d, {
        messages_in: 9 + (i % 5),
        conversations: 6,
        answered_ai: 7,
        answered_you: 1,
        unanswered: 1,
        out_ai: 7,
        out_you: 1,
        escalations: i % 4 === 0 ? 1 : 0,
        calls: 1 + (i % 3),
        call_seconds: 140,
        new_contacts: i % 2,
      }),
    ),
    replies: DAYS.slice(30).flatMap((day) => Array.from({ length: 7 }, (_, k) => ({ day, s: 60 + k, hold: 60 }))),
    arrivals: DAYS.slice(30).flatMap((d) => Array.from({ length: 8 }, (_, q) => ({ d, q: 36 + q, n: 1 }))),
  });
const busyCampaigns = () => ({
  ...campaignDto(),
  days: 30,
  span_days: 60,
  today: DAYS[59],
  series: DAYS.map((d) => cday(d, { sent: 3, delivered: 3, read: 2, replied: 1 })),
});
const NO_REACH_OUTS = {
  timezone: "America/New_York",
  days: 30,
  today: DAYS[59],
  since: DAYS[30],
  has_reach_out: false,
  totals: { written: 0, delivered: 0, bounced: 0, wrote_back: 0, interested: 0, booked: 0, said_no: 0, handed: 0 },
  series: [],
  chains: [],
  angles: [],
  other_angles: { written: 0, wrote_back: 0 },
  no_angle: 0,
  domains: [],
};
const BOOKING = { calendar: "ok", days: 30, asked: 140, booked: 60 };
const BODIES = {
  reports: { report: busyReport(), booking: BOOKING, deals: null, profile: null },
  "reports/campaigns": { report: busyCampaigns() },
  "reports/reach-outs": { report: NO_REACH_OUTS },
  "reports/headline": { headline: headlineOf(busyReport(), "30d", BOOKING) },
};

/* ---- the runner: both passes of a boot over every override, before and after ---- */
const sent = [];
globalThis.window.fetch = async (url) => {
  const route = new URL(String(url), "https://app.chanlytics.com").pathname.replace("/api/v1/", "");
  const body = BODIES[route];
  assert.ok(body !== undefined, `a read this test does not model: ${route}`);
  const text = JSON.stringify({ ok: true, data: body });
  sent.push({ route, bytes: Buffer.byteLength(text) });
  return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
};
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
const S = "apps/dashboard/src";
const { startSurfaces } = await importSrc(`${S}/legacy-bridge/surface-runner.ts`);
/** Every other override the app registers (LegacyApp.tsx), recorded rather than read: the runner decides what is read. */
const OTHERS = [
  (await importSrc(`${S}/legacy-bridge/surface-data.ts`)).workspaceOverride,
  (await importSrc(`${S}/surfaces/inbox/conversations-surface.ts`)).conversationsOverride,
  (await importSrc(`${S}/surfaces/inbox/surface.ts`)).inboxOverride,
  (await importSrc(`${S}/surfaces/today/surface.ts`)).todayOverride,
  (await importSrc(`${S}/legacy-bridge/surfaces/settings.ts`)).settingsOverride,
  (await importSrc(`${S}/surfaces/people/surface.ts`)).peopleOverride,
  (await importSrc(`${S}/surfaces/leads/surface.ts`)).leadsOverride,
  (await importSrc(`${S}/surfaces/live/surface.ts`)).liveOverride,
  (await importSrc(`${S}/surfaces/campaigns/broadcasts/surface.ts`)).broadcastsOverride,
  (await importSrc(`${S}/surfaces/campaigns/playbooks/surface.ts`)).playbooksOverride,
  (await importSrc(`${S}/surfaces/campaigns/reach-out/surface.ts`)).reachOutsOverride,
  (await importSrc(`${S}/legacy-bridge/reach-out/replies.ts`)).repliesOverride,
  (await importSrc(`${S}/surfaces/settings/partner/surface.ts`)).partnerOverride,
  (await importSrc(`${S}/surfaces/calendar/surface.ts`)).calendarOverride,
  (await importSrc(`${S}/legacy-bridge/surfaces/notifications.ts`)).notificationsOverride,
  (await importSrc(`${S}/surfaces/setup/surface.ts`)).setupOverride,
  (await importSrc(`${S}/legacy-bridge/google.ts`)).googleOverride,
  (await importSrc(`${S}/surfaces/settings/billing/surface.ts`)).billingOverride,
];
const settle = async (n = 40) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};
/**
 * The runner started on `hash` over every override, and what both its passes read. Before: no `onDemand` (the runner as it was: the
 * report is a stranger on every page but Reports), Today drawing the report, and no headline. After: this branch's.
 */
async function bootOn(hash, after) {
  window.location.hash = hash;
  sent.length = 0;
  const asked = [];
  const drawn = ROUTE_DRAWS.today;
  if (!after) ROUTE_DRAWS.today = drawn.map((k) => (k === "reports_headline" ? "reports" : k));
  const overrides = [
    ...OTHERS.map((o) => ({ ...o, apply: async () => void asked.push(o.key) })),
    after ? reportsOverride : { ...reportsOverride, onDemand: false },
    ...(after ? [reportsHeadlineOverride] : []),
  ];
  const stop = startSurfaces(overrides, () => () => {});
  try {
    await settle();
  } finally {
    stop();
    ROUTE_DRAWS.today = drawn;
  }
  return { routes: sent.map((s) => s.route).sort(), requests: sent.length, bytes: sent.reduce((n, s) => n + s.bytes, 0), asked };
}
const REPORT_ROUTES = ["reports", "reports/campaigns", "reports/reach-outs"];

test("on Today, one small route is read for Reports' sake where three large ones were, in either pass", async (t) => {
  assert.ok(ROUTE_DRAWS.today.includes("reports_headline"), "Today draws the headline");
  assert.ok(!ROUTE_DRAWS.today.includes("reports"), "and no longer the report");
  const before = await bootOn("#/today", false);
  const after = await bootOn("#/today", true);
  t.diagnostic(
    `Today's boot, both passes, on a busy workspace's 30 days: before ${before.requests} requests, ${before.bytes} bytes (${before.routes.join(", ")}); after ${after.requests} request, ${after.bytes} bytes (${after.routes.join(", ")})`,
  );
  assert.deepEqual(before.routes, REPORT_ROUTES);
  assert.deepEqual(after.routes, ["reports/headline"]);
  assert.ok(after.bytes * 20 < before.bytes, `a few hundred bytes for tens of thousands: ${after.bytes} against ${before.bytes}`);
});

test("on any other page the report is no longer read at all: it was a stranger in the second pass of every boot, and is now left to its own page", async (t) => {
  const before = await bootOn("#/inbox", false);
  const after = await bootOn("#/inbox", true);
  t.diagnostic(
    `The Inbox's boot, both passes: before ${before.requests} requests, ${before.bytes} bytes (${before.routes.join(", ")}); after ${after.requests} requests, ${after.bytes} bytes`,
  );
  assert.deepEqual(before.routes, REPORT_ROUTES, "REGRESSION it measures: every page's boot read the report beside its own");
  assert.deepEqual(after.routes, [], "the Inbox's boot reads nothing of Reports: not the report, and not Today's headline");
  assert.equal(after.asked.includes("inbox"), true, "and still reads what it draws, and the strangers not marked");
});

/* ---- the server: which doors each route reaches for ---- */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const req = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const world = () => ({
  tables: {
    memberships: [
      {
        user_id: "u1",
        tenant_id: A,
        role: "viewer",
        tenants: { slug: "harbor", name: "Harbor Studio", timezone: "America/New_York" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    tenants: [],
    tenant_config: [],
    policies: [],
  },
  rpcs: {
    report_series: (a) => ({ ...busyReport(), days: a.p_days }),
    campaign_series: (a) => ({ ...busyCampaigns(), days: a.p_days }),
    reach_out_report: () => NO_REACH_OUTS,
    people_list: () => [],
  },
});
const doorsOf = async (route) => {
  const w = world();
  const ctx = { supabase: fakeDb(w.tables, {}, w.rpcs), userId: "u1", email: "ada@example.com", params: {} };
  await route.GET.run(req(`?period=30d&workspace=${A}`), ctx);
  return new Set(ctx.supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`)));
};

test("the database is asked less: the headline reaches for the report's series, People and the calendar, and not for the campaigns', the reach-outs' or the deals", async (t) => {
  const before = new Set();
  for (const route of [reportsRoute, campaignsRoute, reachOutsRoute]) for (const door of await doorsOf(route)) before.add(door);
  const after = await doorsOf(headlineRoute);
  t.diagnostic(`doors, before (three routes): ${[...before].sort().join(", ")}`);
  t.diagnostic(`doors, after (one route): ${[...after].sort().join(", ")}`);
  for (const door of after) assert.ok(before.has(door), `the headline reaches for nothing new: ${door}`);
  for (const door of ["rpc:report_series", "rpc:people_list"]) assert.ok(after.has(door), `still read: ${door}`);
  for (const door of ["rpc:campaign_series", "rpc:reach_out_report"]) {
    assert.ok(before.has(door), `read before: ${door}`);
    assert.ok(!after.has(door), `no longer read: ${door}`);
  }
});
```

- [ ] **Step 2: Run it**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/reports/headline/headline-boot.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/headline-boot.test.mjs
```
Expected: PASS, with three printed lines of the shape `# Today's boot, both passes, on a busy workspace's 30 days: before 3 requests, <tens of thousands of> bytes (reports, reports/campaigns, reports/reach-outs); after 1 request, <a few hundred> bytes (reports/headline)`, `# The Inbox's boot, both passes: before 3 requests, <tens of thousands of> bytes (...); after 0 requests, 0 bytes` and the two sorted door lists (the three routes' union holds `rpc:campaign_series`, `rpc:reach_out_report`, `rpc:report_series`, `rpc:people_list` and the table reads; the headline's holds `rpc:report_series`, `rpc:people_list` and the config read the booking line makes). Copy those lines into the pull request. If a door the test names is not what the double records (the double is the arbiter of what the readers call), the assertion's own message says which: fix the test's expectation to what the reader's code reads, never the reader.

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/tests/reports/headline/headline-boot.test.mjs
git commit -m "What the boot stopped loading is recorded on the real runner: Today's one request for three, no report read on any other page, the bytes, and the doors the database is no longer asked." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The docs, and the verification before the push

**Files:**
- Modify: `apps/dashboard/src/legacy/CLAUDE.md`, `docs/system-prd.md`
- Regenerate/bank: `tooling/scripts/tests/baselines/*.json`, `docs/debt.md`, `docs/takeover.md`, the lint and dead-export baselines

- [ ] **Step 1: The docs say what moved**

`apps/dashboard/src/legacy/CLAUDE.md` (two exact replacements on the long lines; `swap`):

```swap
##FILE apps/dashboard/src/legacy/CLAUDE.md
##FROM
the booking's `words`, `__REPORTS.facts`)
##TO
the booking's `words`, the surface's `facts`)
##END
##FILE apps/dashboard/src/legacy/CLAUDE.md
##FROM
then `__today.periodLine` with the page's one door to Reports)
##TO
then `__today.periodLine` over the headline (`useSurface("reports_headline")`: one small read, `GET reports/headline`, of the period Reports shows, never the whole report; Worth a look reads it too) with the page's one door to Reports)
##END
```

`docs/system-prd.md`: the seam table's `reports` row becomes two rows. Write `docs-rows.mjs` to the scratchpad and run it from the worktree root, then let Prettier re-pad the table (the diff is that table's):

```js
import fs from "node:fs";
const f = "docs/system-prd.md";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
const lines = raw.replace(/\r\n/g, "\n").split("\n");
const at = lines.findIndex((l) => /^\| reports\s+\|/.test(l));
if (at < 0 || !lines[at].includes("__REPORTS")) throw new Error("the seam table's reports row is not where it was");
lines.splice(
  at,
  1,
  "| reports | `/reports`, `/reports/campaigns`, `/reports/reach-outs` | — (read through `useSurface(\"reports\")`; no window name since 6 Oct 2026) | messages, conversations, escalations, while its page is on screen; on-demand: read where Reports is drawn, and nowhere else |",
  "| reports_headline | `/reports/headline` | — (read through `useSurface(\"reports_headline\")`: Today's period line and Worth a look) | none: on-demand, read where Today is drawn (at boot, as Today comes back once it is five minutes old), on return to the tab, on Retry, with the zone and on a period pick that holds none |",
);
fs.writeFileSync(f, crlf ? lines.join("\n").replace(/\n/g, "\r\n") : lines.join("\n"));
```

```bash
node <scratchpad>/docs-rows.mjs
corepack pnpm exec prettier --write docs/system-prd.md apps/dashboard/src/legacy/CLAUDE.md
git diff --stat -- docs/system-prd.md apps/dashboard/src/legacy/CLAUDE.md
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-paths.test.mjs
```
Expected: the stat shows the table's rows in `docs/system-prd.md` (the new row's first cell is wider than the old widest, so Prettier re-pads the table's lines and no others) and two lines of `legacy/CLAUDE.md`; `docs-paths` PASSES.

- [ ] **Step 2: Everything that is not a test of a file**

```bash
corepack pnpm --filter "./packages/*" build
git status --short packages
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm check:dead-exports
corepack pnpm format:check
```
Expected: no dist drift after the Task 11 commit (`git status --short packages` empty); typecheck, lint and format clean; `check:dead-exports` clean: every export this plan added has a reader (`headlineOf` and `isReportDto` the reader, `toHeadlineVM` the surface, `firstReplies` the metrics door, `shownReportPeriod` the surface's guard and the pick, `paintHeldHeadline` and `isHeadlineStale` the pick and the override, `lensShownHere` the page, `REPORT_PERIOD_IDS` the routes' query, `replyHoldDtoOf` the metrics door, `reportsHeadlineOverride` the app, the refresh map and the pick, `bookingOf` neither exported nor needed, `reportPeriodAsked` the route). A fall is banked with `corepack pnpm lint -- --update` and `corepack pnpm check:dead-exports -- --update`; a number that rose is a stop.

- [ ] **Step 3: The ratchets bank what fell**

```bash
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
```
Expected: only falls, if any (Task 7's deleted look-alike may have lowered a lint warning count). The window-globals ratchet is expected to be unchanged (Choice 9). Nothing rose; if the ratchets name a rise, find what added it and remove it before going on.

- [ ] **Step 4: The tests of what this branch changed**

```bash
for f in $(find tooling/scripts/tests/reports/headline -name "*.test.mjs" | sort); do node tooling/scripts/checks/test.mjs "$f" || break; done
node tooling/scripts/checks/changed-tests.mjs --list origin/main HEAD
```
Run each file the second command lists, one per command (`node tooling/scripts/checks/test.mjs <file>`); expected all PASS. The list holds, at least, the Today, Reports, Ask, shell, routes, receptionist and email files this plan touched, and the rules and ratchets it always runs. No `*.db.test.mjs` is run: no migration changed, and CI's replay runs them only when database paths change.

- [ ] **Step 5: The build, the bundle, the journeys**

```bash
df -h .
corepack pnpm --filter @chanlytics/dashboard build
corepack pnpm check:bundle
E2E_BASE_URL=http://localhost:3100 corepack pnpm e2e -- e2e/today/today.spec.ts e2e/reports.spec.ts
```
Expected: the build and `check:bundle` pass within the workspace route's budget (it prints the figures: say them in the pull request; this part adds one small override and a view-model function to the route and deletes a look-alike, so a fall is the likely outcome, banked with `corepack pnpm check:bundle -- --update`; a rise past the band is argued with a row under "Rises" in `docs/debt.md`, never raised to what was measured). The Today spec's period line test finds `today-period` (its sentence now from the headline, `Last 30 days: N messages ...`, and one `Open Reports` door) and Worth a look's rows keep their arithmetic; the Reports spec still draws every lens from the report's own read. Both need the local dashboard running with the session minted as `docs/runbook.md` ("See a real page") and `e2e/session.ts` say. Then look at the app at 1440 and 390 in both themes with the network panel open. **Today:** one `reports/headline` read in its boot, no `reports`, `reports/campaigns` or `reports/reach-outs`. **Another page** (the Inbox, People): none of the four, after the page's own reads settle. **Reports:** open it from the Inbox: the three report reads once, the gate opens, and a move between its lenses reads nothing; pick 7 days: `reports`, `reports/campaigns`, `reports/reach-outs` and one `reports/headline`; pick 30 days again at once: no `reports/headline` (it is held and fresh); go back to Today: it says `Last 7 days` or `Last 30 days` to match the pick, and reads nothing new; leave it six minutes and come back to Today from another page: one `reports/headline`. On Reports: the Reviews lens shows nothing while Google is out, a one-day Month says "1 day", and the arrow keys on the period control go on from 30 days to Month. Then delete this worktree's `apps/dashboard/.next`.

- [ ] **Step 6: Commit what the verification changed**

```bash
git add apps/dashboard/src/legacy/CLAUDE.md docs/system-prd.md tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -m "The docs say Today reads one small headline and Reports leaves the window, and what fell in this part is banked." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

**What the pull request says** (its title: "Reports, finished: Today reads a small headline, Reports boots where drawn, part 1 cleared"; its body ends with the house's generated-by line): *For a customer:* Today's numbers and sentences are unchanged, and a day on which most replies waited the owner's hold now says they went out as it ended, where it said "typically in 1m". On Reports, the Reviews lens no longer says nothing is linked before Google has been read or after a read failed, a one-day period says "1 day", and the period control can be arrowed on to Month while a period loads. *What stopped* (measured in Task 12, quote its three lines): **no page but Reports reads `GET reports`, `reports/campaigns` and `reports/reach-outs` any more.** The runner booted every override it was given a moment after any page loaded, so the Inbox and People paid for the report beside their own page and Today paid for it and would have paid for the headline too; an override can now be marked on-demand, and the two that read Reports are: Today reads one `reports/headline` in its place, and Reports reads its three where it is on screen. Part 1's loose ends (three tasks) and the review's fixes to this part's own design are listed in the commits. *Before merging:* nothing to set or apply; no migration. *Deploy order:* either (the new route is new, the old routes stand for an open tab, `reply_hold` is an addition an old client ignores, and the three routes' `period` is now a closed set that refuses what they already refused, with a validation message). *What it does not do:* the booking line is still counted on the server from the people pool and the calendar feed, so §14's budget for Today's boot is met when `report_headline` is SQL (phase C); Reports still reads its three routes when it opens; and the `reports` value is absent until Reports has been on screen in a tab (Ask's context answers the route alone until then).

---

## What part 3 and phase C start from

When this branch lands, Reports is finished as a frame: its period control never holds, its lenses say unread, failed and unlinked apart, and it is drawn from the kit's figures, links and tooltips. Today draws no `reports` surface: its card and Worth a look read `reports_headline` (`surfaces/reports/headline.ts`, held by period with when each was read, following the period Reports shows), a flat view model of six counts, one share and the booking line (`contracts/reports/report-headline.ts`), summed on the server by `headlineOf` from the same facts `toReportVM` is built from; `window.__REPORTS` is gone and Ask reads the seam; **the runner has `onDemand`**, and the two overrides that read Reports are the two that use it, so a page that does not draw Reports never reads it; `GET reports/headline` is the Overview's read in waiting (phase C draws its tiles from it, per lens, and `report_headline` as SQL is where booking leaves the people pool and the feed); `first_replies` is called from `packages/db` (its own module) for Today's day, and its sentences about speed say the hold by `replySpeedOf` over a four-number summary, which the Receptionist lens's dot plot and Ask's report tool can read too. What waits: **part 3** (`person_moments.new_at`, one rule for "new"); **the head-started read** for the headline (`PREFETCH_READS.today`); a **live rule** for the headline if Today's line is ever wanted to move on a message (it would need booking in SQL first); the **proof's and the figure's one-message waits** ("answered in 1m 18s"), which say a measured wait and are not a speed; and any further surface that should boot only where it is drawn (People's pages of contacts are the heaviest other candidate; each is one field and a line in its test).

## Self-review

**Spec coverage (phase B, PR 2, and the review's two lists):**

| Spec or review item | Where |
| --- | --- |
| D17 Overview and Today read one small headline read, never the whole page | Tasks 4 to 7: the DTO, the reader and route, the surface, the swap; Tasks 9 and 12: no other page reads the report, measured |
| §6.5 `GET /api/v1/reports/headline?period=`; Today's `ROUTE_DRAWS` swaps `reports` for `reports_headline`; `card.tsx` and `leaks.tsx` read the new surface | Tasks 5, 6, 7 (the route is the spec's name; the key is the spec's) |
| §6.5 over `report_headline(p_tenant, p_period)`, per lens `has`, the Overview's figures, ≤ 150 ms, ≤ 6 KB | **Not here:** the brief fixes no new SQL; the DTO is a few hundred bytes (Task 4 holds under 400); the lens facts and the SQL are phase C |
| §6.5 "Today's boot loses `report_series`, the people pool, the feed and the deals" | **Partly:** loses the deals, the campaigns', the reach-outs' and the browser's building of four view models (Task 12); keeps `report_series` and the booking's pool and feed, which the brief keeps on the server (phase C moves booking into SQL) |
| §14 Today's boot budget | Task 12 prints what it measured; the rest is phase C |
| D14 reply speed against the hold, deferred from phase A (§12 A1, Today's side) | Tasks 10 and 11 |
| D18 one definition per fact | `headlineOf` over `periodFactsOf`/`answeredOf`; `bookingOf`; `replySpeedOf` over `holdOf`; `repliesSeen`; `REPORT_PERIOD_IDS`; `plural`; no second implementation of a count or of the slack |
| §13 testing: moves equal by value; Today's boot before and after | Tasks 4 and 7 (the oracle), Tasks 9 and 12 |
| Brief 5: `__REPORTS` deleted, every reader moved | Tasks 7 (Today) and 8 (Ask, the mirror, the tests); the window-globals fall is not available (Choice 9) |
| Brief 7: route policy, docs/api.md, typed client, readers rule | Task 5 (and Task 3 for the closed `period`) |
| Review A1 (the failure door) | Task 7, Choice 8 |
| Review A2 (the boot) | Task 9, Choice 11; Task 12 |
| Review A3 (`figuresOf` stays at its baseline) | Task 10 (`speedClause`; the ratchet is run) |
| Review A4 (`codemod-page.mjs` guard) | Task 7 |
| Review A5 (the period pick) | Task 6, Choice 12 |
| Review A6 (26 hours, a summary, not pairs) | Task 11, Choice 6 |
| Review A7 (the e2e matcher, the one-day fixture, Choice 5, `SURFACE_LABELS`, one `repliesSeen`) | Tasks 6, 4, Choice 5 and Task 9, Task 6, Task 10 |
| Review B1 to B12 (part 1's loose ends) | Tasks 1 (B1, B2, B7, B8), 2 (B3, B4, B5), 3 (B6, B9, B10, B11) and Task 11 (B12, `first-replies.ts`) |

**The brief's eight points:** 1 (one small read, no new SQL, one derivation, a DTO of what Today draws, a view-model function, word-for-word proof, no look-alike, no fake tile, no `as unknown as`) Tasks 4, 5 and 7 (Choices 2 to 4); 2 (booking on the server, the same function, moved, no copy) Task 5 (`bookingOf`); 3 (the period) Choice 1, Task 6; 4 (the seam: key, held views, refresh rule, `ROUTE_DRAWS`, `useSurface`) Tasks 6, 7 and 9 (Choice 5 says why the refresh rule is not copied and what replaces it); 5 (the mirror) Tasks 7 and 8; 6 (reply words against the hold, no SQL copy of the slack, no migration) Tasks 10 and 11 (Choices 6 and 7); 7 (route policy and docs) Task 5; 8 (measure) Task 12.

**Placeholders:** none. Where a task edits a file it names the text it replaces, and a count that must hold is checked by the codemods before they write; where it moves a test's fixtures it says what each override became. Two things are named as assumed rather than read, and a task's first run settles each: the stub window's `location` accepts an assigned hash in `on-demand-boot.test.mjs` and `headline-boot.test.mjs` (if it is read-only there, those two copy the plain `win` object `message-fan-out.test.mjs` builds, which is why the harness is named), and the route kernel's membership read gives `report-routes.test.mjs` the zone from the `tenants` row it is handed (`with-route.ts:275` selects `tenants (slug, name, timezone)`).

**Type and name consistency, checked by reading:** `ReportHeadlineDto` (eleven fields, snake_case) is what `headlineOf` answers, what the route returns under `headline` and what the surface's `read("GET reports/headline")` types from the handler; `ReportHeadlineVM` (flat: `period`, `days`, `rangeLabel`, `lead`, `empty`, `messages {total, compare}`, `answered {ai, you, none, share}`, `calls`, `booking: BookingReportVM`) is what `toHeadlineVM` makes, what `todayPeriodLine` and `todayLeaks` read, the value type of `SurfaceValues["reports_headline"]`, and what `tests/today/_headline.mjs` builds through the real builders; `ReportPeriodId` is the surface's `shownReportPeriod()` and the route's `reportPeriodAsked`, and `REPORT_PERIOD_IDS` is its closed set; `HoldReply` (`{ s, hold? }`) is `ReportDto.replies`' element's shape and what `firstReplies` answers (with its `asked_at` dropped when the window keeps it); `ReplyHoldDto` (`{ label, at_end, later, unheld }`) is what `replyHoldDtoOf` makes of `holdOf`'s answer, `MetricsSummaryDto.reply_hold` and what `replySpeedOf` reads; `ReplySpeed` is `replySpeedOf`'s answer, `TodayFacts.speed` and what `speedIn` finishes; `onDemand` and `isStale` are `SurfaceOverride`'s, read by the runner and `readWhatWasMissed` and set by the two Reports overrides; the surface key `reports_headline` is `SurfaceValues`' key, `SURFACE_KEYS`', the override's `key` and `value`, `SURFACE_LABELS`', `ROUTE_DRAWS.today`'s entry and the pages' `useSurface` and `useSurfaceFailed`.
