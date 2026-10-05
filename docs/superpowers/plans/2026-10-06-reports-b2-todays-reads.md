# Reports B2: Today's reads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today stops paying for Reports' whole read. Its period line and Worth a look read one small `GET reports/headline` (the same `report_series`, summed on the server by the period derivation the page's view model is built from, plus the booking line counted by the one function the report counts it with), through a surface of their own held by period; the `__REPORTS` window mirror is deleted and every reader of it moves to the seam; and Today's sentences about reply speed say a reply that waited the owner's hold went out "as your 1-minute hold ended", by the one rule contracts already holds (spec D14, deferred from phase A, and D17, §6.5).

**Architecture:** One derivation. `headlineOf` (contracts, `reports.ts`) sums a `ReportDto` with `periodFactsOf` and `answeredOf`, the facts `toReportVM` is built from, and answers a DTO of counts (`ReportHeadlineDto`: eleven fields, no day of the series); `toHeadlineVM` words it for Today and is what `todayPeriodLine` and `todayLeaks` now read (`ReportsLike` and its look-alike tiles are deleted). The reader `reportHeadline` (in `readers/report.ts`, which already holds `ReportQuery` and `reportDaysFor`) calls `reportSeries` and the report reader's own booking code, moved to one function `bookingOf` that both readers call. The route is `GET /api/v1/reports/headline?period=`. A surface override `reports_headline` (`surfaces/reports/headline.ts`) follows the period Reports shows, holds its views by period and is read at boot, on return, on Retry, after a zone is saved and on a period pick; `ROUTE_DRAWS.today` swaps `reports` for it and Today's two pages read it with `useSurface("reports_headline")`. Reply speed rides the day's metrics instead: `metricsSummaryFor` reads the day's first replies (`first_replies`, already granted, through `packages/db`) beside `metrics_summary`, so the browser's `toTodayVM`, `GET today` for the phone app and Ask's `today` reader all say the same words from `holdOf`, with no copy of the ten-second slack.

**Tech Stack:** Next.js App Router route and readers (`apps/dashboard`), TypeScript (`packages/contracts`, `packages/db`), the surface seam (`legacy-bridge`, `surfaces`), `node:test` through `tooling/scripts/checks/test.mjs`, the in-memory database double (`tooling/scripts/tests/_fake-db.mjs`). No migration, no new SQL.

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (D14, D17, §6.5, §12 "Fix today's page (phase A)" for the deferred reply-speed item, §13, §14). Part 1 (#1424, the frame) is on main; its plan is `docs/superpowers/plans/2026-10-05-reports-b1-the-frame.md`, whose "Not in this plan" names this part.

**Written against** `309e93cb6` (origin/main, 5 Oct 2026, which holds #1424 as `bf2365fb9`), on branch `reports/b2-todays-reads`. Every path, name and line below was read on that tree; a line number is a locator, so re-find it by its text if main has moved.

---

## What this pull request is, and is not

It is PR 2 of phase B, "Today's reads". It adds one GET route and no migration; every task ends green (its own tests, `corepack pnpm -r typecheck` where a package or a type moved, and the ratchets it touches).

What a customer sees: nothing changes in Today's words (a test builds the old sentences from `toReportVM` and the new ones from the headline over the same series and holds them equal), except one: where most of a day's replies waited the owner's hold, "typically in 1m" becomes "typically as your 1-minute hold ended". What stops: Today's boot no longer reads `GET reports`, `reports/campaigns` and `reports/reach-outs` (the deals, the campaigns' series, the reach-outs' report, and the browser's building of four view models); it reads `reports/headline` (Task 8 measures it on fixtures).

### Not in this plan

- **Per-lens figures on the Overview, "Export this lens", Ask's `lens` parameter and its eval case** (phase C). The headline is built so the Overview can read it; nothing here draws it there.
- **"A person is new by one rule"** (`person_moments.new_at`, part 3, with its own runbook).
- **Any change to the Reports page itself** beyond leaving `__REPORTS`: its surface, its lenses, its period control and its reads stand. The one touch is that a period pick also re-reads the headline (Task 3).
- **`report_headline` as SQL** (spec §6.5) and with it the end of the people-pool and calendar-feed read for the booking line. The brief for this part keeps booking on the server by the same function, so §14's "Today's boot: no read of the people pool or the feed for Reports' sake" is met in phase C, when booking moves into SQL; what this part removes is named in Task 8.
- **Today's two one-message waits**: the card's "answered in 1m 18s" (the messages figure's clause) and the proof's "answered 1m 18s later" say how long the last reply took after its question: one measured wait, which is true as it stands, not a claim about the receptionist's speed.
- **A head-started read for the headline** (`PREFETCH_READS.today` in `contracts/shell/chrome.ts`) and **a live-feed rule for it** (Choice 5).
- **A demo sample for Today's period line**: Today has none (decision 0015, step 4) and none is added.

## Choices this plan makes where the brief did not settle them

1. **The headline follows the member's chosen Reports period, not a fixed one.** Today's words today are the one `reports` surface's, and that surface is read for `reportPeriod`, the stored choice (`surfaces/reports/surface.ts`, `view: () => reportPeriod`); `todayPeriodLine` leads with the report's `period.now` and `todayLeaks` says "the last ${reports.vm.rangeLabel}" (`contracts/today/today-period.ts`, `today-leaks.ts`). A fixed 30 days would change the words, the thresholds' meaning and the Month case for every member who picked another period; following it keeps them, and it is what spec §6.5 has the Overview read too. The cost is one coupling, paid once: `shownReportPeriod()` is exported from `surface.ts` (the one state, never a second reader of the storage key), and `setReportRange` paints a held headline and re-reads it (Task 3).
2. **The DTO holds counts and two derived facts, computed once on the server; the view model is Today's, not the report's.** `ReportHeadlineDto` carries `messages_in`, `messages_before` (null where the period before had no message and no call: `compareWords`' `priorHadAny`), the three answered counts, `answered_share`, `calls`, `empty`, the period, its days and the booking DTO. `empty` and `answered_share` are the facts `periodFactsOf` (new field `empty`) and `answeredOf` already compute for `toReportVM`; the view model recomputes neither (a third spelling of a share would be a bug even if it agreed). `ReportHeadlineVM` is flat and named for what Today says (`lead`, `rangeLabel`, `messages.compare`, `answered.share`, `calls`, `booking`); it has no tiles and no `vm` wrapper, and `ReportsLike`, `WeekTileLike` and the cases they allowed (`campaigns: null`, a `vm` with no `answered`) are deleted with their tests.
3. **`headlineOf` lives in `reports.ts`**, beside `toReportVM`, because `periodFactsOf` and `answeredOf` are file-private there (only the type `PeriodFacts` is exported) and exporting the internals so a neighbour could rebuild a second summary is how a count gets counted twice. Two one-word helpers come out of `periodFactsOf`/`toReportVM` so the headline says them once: `rangeLabelOf(days)` and `periodWords(rangeLabel)`. `reports.ts` is 666 lines, about 700 after.
4. **No cast.** `reportSeries` answers `Json`. The new reader checks it with a type guard, `isReportDto` (`report_series` answers `{ series, days, ... }` or its own `{ error }`), instead of the `as unknown as ReportDto` the page's reader uses. The page's reader keeps its cast (`tooling/scripts/tests/ask/readers.test.mjs` fakes `report_series` with a bare `{ days, tenant }`, which a guard would refuse); `casts.json` neither rises nor falls.
5. **The headline has no live-feed rule, where the brief said to copy the Reports surface's.** That rule is `onlyOnItsPage("reports", DEFAULT_REFRESH_TABLES)`: a message re-reads Reports only while Reports is on screen (`ownsTheScreen`, `surface-registry.ts`). The headline's page is Today, whose route's own surface is `today`, and `ownsTheScreen("reports_headline", <any route>)` is false everywhere, so the copied rule would be inert (every message recorded as missed, never read) and a subscription for nothing. It would also be wrong to make it live: the headline reads the people pool and the calendar feed for its booking line. So it is read at boot, when the tab returns, by Retry, after `PATCH workspaces` (a zone moves the period's day edges) and when the period is picked, which is when the `reports` surface's value moved on Today before. `message-fan-out.test.mjs`'s "a message re-reads the Inbox, Conversations and Today" holds with the override in its list (Task 3).
6. **Today's reply words ride the metrics read, not the headline** (the brief's "ideally"). `toTodayVM` is composed three times from `MetricsSummaryDto`: the browser (`surfaces/today/surface.ts`), `GET today` for the phone app (`app/api/v1/today/route.ts`) and Ask's `today` reader (`server/readers/today.ts`). A clause built from the headline would be said by the browser alone, and would be as old as the headline (read at boot) beside figures that move with every message. Carried by the metrics, one reading serves all three and moves with the day's figures. No migration is needed: `first_replies(p_tenant_id, p_start)` (00303) is granted to `authenticated`, and it is the function both `metrics_summary` and `report_series` read. `metricsSummaryFor` reads it beside `metrics_summary` (in the same `Promise.all`, so no wall clock waits for it), keeps the replies the window's own midnight keeps (`window.since`, which the function answered), and a read that fails costs the clause and nothing else (logged as `today_replies_read_failed`, the page says the median as it did). The SQL alternative (`metrics_summary` carrying the replies) is a migration and a throwaway-stack proof for a few kilobytes of one extra scan, and is not needed.
7. **The words.** Where most replies waited a hold (the test `heroSpeed` already makes, now one private function `waitedHold` in `report-speed.ts`): "typically as your 1-minute hold ended" when as many or more went out as it ended than later, "typically later than your 1-minute hold" otherwise; else the median as before ("typically in 34s", "in about 34s" in the calm headline's detail, "34s" as Ask's fact value). One function, `replySpeedOf(median, hold)` in `report-speed.ts`, is read by `todayReplySpeed(metrics)` (in `today-metrics.ts`) and every sentence takes `speedIn(speed)` from `today-bands.ts`; the ten-second slack stays in `classOf`, private, and is never written again. The pairs are rounded in `packages/db` as `report_series` rounds them (`round(ai_seconds)`, `round(coalesce(ai_hold_s, 0))`), so a reply is the same class on Reports and on Today at the slack's edge.
8. **The failure door stays `surfaceFailed("reports_headline")`** (`surfaces/today/shell.ts`, the documented line to delete when its owner moves), as `surfaceFailed("people")` does beside it; only the value is read through `useSurface`. The page tests drive failure through that door's stand-in (`failed.add`).
9. **The window-globals ratchet will not fall.** The brief expects the deletion to bank a fall, but `__REPORTS` is not in `window-globals.json`: `windowUse` (`tooling/scripts/tests/_ast.mjs`) counts `window.__X` and `window["__X"]` only, and every reader of `__REPORTS` reaches it by a string (`borrowed("__REPORTS")`) or through a typed parameter (`w.__REPORTS` in `ask/context.ts`). Task 5 runs the ratchet and banks whatever it reports; the executed proof that the mirror is gone is `reports-seam.test.mjs` (a value set under `reports` leaves `window.__REPORTS` undefined).
10. **Measure on the overrides themselves.** After this part both overrides still exist (the Reports page reads `reports`), so one test runs each over a recording `fetch` on a busy workspace's thirty-day fixtures and counts requests and bytes, and counts the database's doors per route over the in-memory double. The pull request quotes its output.

---

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `packages/contracts/src/reports/report-headline.ts` | create | `ReportHeadlineDto`, `ReportHeadlineVM`, `toHeadlineVM`, `isReportDto` |
| `packages/contracts/src/reports/reports.ts` | modify | `headlineOf`, `rangeLabelOf`, `periodWords`, `empty` in the period's facts |
| `packages/contracts/src/reports/report-speed.ts` | modify | `HoldReply` exported, `waitedHold`, `replySpeedOf`, `ReplySpeed` |
| `packages/contracts/src/reports/index.ts`, `packages/contracts/src/today/index.ts`, `packages/contracts/src/browser.generated.ts`, `packages/*/dist` | modify, regenerate | The barrels, the browser entry, the builds |
| `packages/contracts/src/today/today-period.ts`, `today-leaks.ts` | modify | The period line and Worth a look read `ReportHeadlineVM`; `ReportsLike` and `WeekTileLike` deleted |
| `packages/contracts/src/today/today-metrics.ts`, `today-facts.ts`, `today-bands.ts`, `today-figures.ts` | modify | `replies` on the metrics, `todayReplySpeed`, `speedIn`, the four sentences |
| `packages/db/src/repositories/reports/report-series.ts`, `packages/db/src/index.ts` | modify | `firstReplies`: the one place `first_replies` is called by name |
| `apps/dashboard/src/server/readers/report.ts` | modify | `bookingOf`, `reportPeriodAsked`, `reportHeadline` |
| `apps/dashboard/app/api/v1/reports/headline/route.ts` | create | `GET reports/headline` |
| `apps/dashboard/src/server/metrics/metrics.ts`, `apps/dashboard/src/server/log.ts` | modify | The day's replies beside `metrics_summary`; the event name |
| `apps/dashboard/src/surfaces/reports/headline.ts` | create | The `reports_headline` override, its held views |
| `apps/dashboard/src/surfaces/reports/surface.ts`, `period.ts` | modify | `shownReportPeriod`; the pick re-reads the headline; the mirror deleted |
| `apps/dashboard/src/surfaces/surface-values.ts`, `use-surface.ts` | modify | The `reports_headline` key; the headers' examples |
| `apps/dashboard/src/legacy-bridge/LegacyApp.tsx`, `refresh-map.ts`, `surface-registry.ts` | modify | The override registered; refreshed with the zone; Today draws it |
| `apps/dashboard/src/surfaces/today/pages/card.tsx`, `leaks.tsx`, `brief-pane.tsx`, `shell.ts` | modify | Read the headline through the seam |
| `apps/dashboard/src/legacy-bridge/ask/context.ts` | modify | Ask's Reports context reads the seam |
| `apps/dashboard/src/client/routes.generated.ts`, `packages/contracts/src/route-keys.generated.ts`, `tooling/scripts/tests/route-policy.json`, `docs/api.md` | regenerate | The route's row, its client key, its reference |
| `tooling/scripts/tests/reports/headline/{report-headline,headline-route,headline-surface,metrics-replies,headline-boot}.test.mjs` | create | The new folder's five tests |
| `tooling/scripts/tests/today/_headline.mjs`, `today-reply-hold.test.mjs` | create | The shared fixture, built by the real builders; Today's hold words |
| `tooling/scripts/tests/today/{today-leaks,today-page}.test.mjs`, `tooling/scripts/tests/reports/reports-seam.test.mjs`, `tooling/scripts/tests/{shell/empty-failed,shell/surfaces/surface-boot,shell/surfaces/message-fan-out,ask/ask-page-context,receptionist/business-tab/business-tab-zone}.test.mjs` | modify | The fixtures and doors that moved |
| `apps/dashboard/src/legacy/CLAUDE.md`, `docs/system-prd.md`, `tooling/scripts/tests/baselines/*.json`, `docs/debt.md`, `docs/takeover.md` | modify | The docs; banked falls |

Folder counts (`tree-shape.json`, 20 modules at most; the ratchets read `git ls-files`, so stage new files before running them): `packages/contracts/src/reports` 11 to 12; `packages/contracts/src/today` is at 20 and gets **no** new file (its changes go into existing modules); `packages/db/src/repositories/reports` stays at 1 (`firstReplies` joins `report-series.ts`); `apps/dashboard/src/server/readers` is over its limit and gets **no** new file (the reader joins `report.ts`); `apps/dashboard/src/surfaces/reports` 10 to 11 (plus its `lenses/` folder); `tooling/scripts/tests/today` 16 to 18; `tooling/scripts/tests/reports` is full and gets no file at its root: its new tests go in the new folder `tests/reports/headline/` (5 files); `tooling/scripts/tests/ask` is full and gets none.

## Standing rules for how this is done

- **Local commits only.** Nothing is pushed and no pull request is opened until Ruben says so. One pull request for the whole plan.
- **Sub-agents run on Sonnet.** Never `supabase db reset`; there is no database here, and no migration in this plan.
- **Never run the whole `pnpm test`.** Run the touched test files one per command, `node tooling/scripts/checks/test.mjs <one test file>`; the ratchets and the debt register where a task says so; `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm check:dead-exports` and `corepack pnpm format:check` where it says so. Before the push, Task 9's `changed-tests.mjs`.
- **Tests import `@chanlytics/contracts` and `@chanlytics/db` from `dist`.** After a contracts or db change: `corepack pnpm --filter "./packages/*" build`, then keep only the dist files that have a real diff:
  `for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done`.
  On this Windows machine `packages/db/dist/index.d.ts` gets four `agrees?:` comments spliced in by any build while `packages/db/src/database.types.ts` is CRLF, and that is a real diff the loop would keep. So, **before the first build of this work**, make that source LF in the working copy (git sees no change and it stays LF): `node -e "const fs=require('fs');const f='packages/db/src/database.types.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"`. After a build, `git diff --stat -- packages/db/dist/index.d.ts` shows nothing, or only the declaration Task 7 adds.
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
- **Dead exports are checked from Task 4 on**, where each export Tasks 1 to 3 add has its reader (`headlineOf`, `toHeadlineVM` and `isReportDto` the reader and the surface; `shownReportPeriod` the surface and the pick).
- **Bank every ratchet fall in the task that causes it.** `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, then the same for `tooling/scripts/tests/repo/debt-register.test.mjs`; `corepack pnpm lint -- --update` and `corepack pnpm check:dead-exports -- --update` for the lint and dead-export baselines. A rise is a stop, not a bank: find what added it.
- **No customer in the code.** Fixtures say `harbor`, `Harbor Studio`, `+1555010xxxx`, `example.com`. **One look:** no `[data-look=...]` selector (this plan draws nothing new).
- **Disk:** check free space before a dashboard build (`df -h .`) and delete this worktree's `apps/dashboard/.next` afterwards. A page change is looked at in the real app (`corepack pnpm --filter @chanlytics/dashboard dev`, `/w/<slug>/`), never the standalone mockup.

## Review Focus

1. **Today says word for word what it said.** Task 1 holds the headline's fields equal to the page's view model's, for the same series, over a matrix of periods; Task 4 holds the sentences equal (an oracle copy of the old sentences, built from `toReportVM`, against `todayPeriodLine` and the two rows of `todayLeaks` over the headline), and the migrated Today tests still say what they said.
2. **A count is counted once.** `headlineOf` reads `periodFactsOf` and `answeredOf`; booking is `bookingOf` for both readers; the ten-second slack is read only in `classOf`.
3. **Nothing reads `window.__REPORTS`**, and the mirror's one line is gone (Task 5).
4. **Today's boot asks one small read for three large ones**, and Task 8 prints the requests, the bytes and the doors.
5. **The reply-speed clause fails soft and either deploy order works**: a failed or absent replies read says the median as before (Task 7); an old client ignores `replies`; an old server sends none.

---

### Task 1: The headline, in contracts: one derivation of a period's counts, its small DTO and its view model

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
/** The periods the page offers over the world's fourteen days, and what Month is early in a month. */
const MATRIX = [
  ["the week, as the world has it", reportDto(), "7d", CALENDAR],
  ["a month on its first day: one day, against the thirteen before it", { ...reportDto(), days: 1 }, "month", CALENDAR],
  ["a month on its fifth day, the calendar unread", { ...reportDto(), days: 5 }, "month", null],
  [
    "thirty days of a workspace younger than two periods: nothing before it to compare",
    { ...reportDto(), days: 30 },
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

### Task 2: One small read: `GET reports/headline`, over the same `report_series` and the one booking function

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
      rows: [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${days} days` }],
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
      rows: [{ kind: "page", id: "reports", route: "reports", label: `Reports, ${days} days` }],
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
  period: z.string().optional(),
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

### Task 3: The headline is a surface: held by period, read at boot and when the period moves, never by the live feed

**Why:** Today reads surfaces through the seam. The headline needs a key, an override, held views by period (as Reports' own are, so a pick of a period this tab has read paints at once) and the places that re-read it. It is registered and read at boot from this task, but Today does not draw it until Task 4, so Today's words do not move here.

**Files:**
- Create: `apps/dashboard/src/surfaces/reports/headline.ts`, `tooling/scripts/tests/reports/headline/headline-surface.test.mjs`
- Modify: `apps/dashboard/src/surfaces/reports/surface.ts`, `apps/dashboard/src/surfaces/reports/period.ts` (whole file), `apps/dashboard/src/surfaces/surface-values.ts`, `apps/dashboard/src/legacy-bridge/LegacyApp.tsx`, `apps/dashboard/src/legacy-bridge/refresh-map.ts`, `tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs`, `tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs`, `tooling/scripts/tests/shell/empty-failed.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/headline/headline-surface.test.mjs`:

```js
/**
 * The headline's override (surfaces/reports/headline.ts): one read of GET reports/headline for the period Reports shows,
 * published under `reports_headline` through the seam as contracts' view model; held by period, so a pick of a period this tab has
 * read paints at once; an answer for a period left is dropped; a read that fails fails the surface, never an empty line; and no
 * live-feed rule of its own (the brief's "copy the Reports surface's" would be inert: no route's own surface is this one).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { headlineOf, toHeadlineVM } from "@chanlytics/contracts";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";
import { CALENDAR, reportDto } from "../_report-world.mjs";

installLegacyReact();
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});
const keepError = console.error;
console.error = () => {};
const { reportsHeadlineOverride, paintHeldHeadline } = await importSrc("apps/dashboard/src/surfaces/reports/headline.ts");
const { keepReportPeriod, shownReportPeriod } = await importSrc("apps/dashboard/src/surfaces/reports/surface.ts");
const { surfaceValue, setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
console.error = keepError;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const asked = [];
let parked = null;
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const period = u.searchParams.get("period");
  asked.push(`${u.pathname.replace("/api/v1/", "")} ${period}`);
  if (parked && parked.period === period) await parked.until;
  return json(200, { ok: true, data: { headline: headlineOf(reportDto(), period, CALENDAR) } });
};
const reset = (period) => {
  asked.length = 0;
  parked = null;
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

test("held by period: a period read is painted at once when picked again, one never read is not, and the answer for a period left is dropped", async () => {
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/headline-surface.test.mjs`
Expected: FAIL at load: `apps/dashboard/src/surfaces/reports/headline.ts` cannot be found.

- [ ] **Step 3: The key, the period's getter, the override**

`apps/dashboard/src/surfaces/surface-values.ts`, `surface.ts` and the registrations (`swap`):

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
##FILE apps/dashboard/src/surfaces/reports/surface.ts
##FROM
/** The one period every chart on Reports is scoped to, kept in this browser. */
export function keepReportPeriod(period: ReportPeriodId): void {
##TO
/** The period the page shows now: the headline Today reads is of it too (headline.ts), so the two say one period. */
export const shownReportPeriod = (): ReportPeriodId => reportPeriod;

/** The one period every chart on Reports is scoped to, kept in this browser. */
export function keepReportPeriod(period: ReportPeriodId): void {
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
 * read it, so the line and the leaks say the same last N days Reports prints. Held by period, as Reports' own views are: a pick of
 * one this tab has read paints at once (`paintHeldHeadline`, called by `setReportRange`) and is read again behind it.
 *
 * It has no live-feed rule. Its page is Today, whose own surface the live feed re-reads on a message; the headline counts a period
 * of days and reaches for the people pool and the calendar for its booking line, so a message would move it by one in a hundred
 * at the price of the heaviest read there is. The `reports` surface's rule (`onlyOnItsPage`) let every message pass while Today
 * was on screen, so Today's line never moved on one either; this one is read at boot, when the tab returns, by Retry, after the
 * workspace's zone is saved (refresh-map.ts) and when the period is picked (period.ts).
 */
import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import { toHeadlineVM, type ReportHeadlineVM } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { setSurfaceValue } from "../surface-values";
import { shownReportPeriod } from "./surface";

/** The periods this tab has read: going back to one paints at once, and the read behind it keeps it current. */
const held = heldViews<ReportHeadlineVM>(4);

/** Paint a period this tab holds for the one now shown; whether it did. The read behind it is the caller's. */
export function paintHeldHeadline(): boolean {
  const have = held.get(shownReportPeriod());
  if (!have) return false;
  setSurfaceValue("reports_headline", have);
  window.dispatchEvent(new CustomEvent("surface:reports_headline"));
  return true;
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
    // A pick of another period while this read was out: its answer is for a period left, and never lands on the new one.
    if (period !== shownReportPeriod()) return;
    const vm = toHeadlineVM(headline);
    held.hold(period, vm);
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
import { paintHeldHeadline, reportsHeadlineOverride } from "./headline";
import { keepReportPeriod, paintHeldReports, reportsOverride } from "./surface";

/** Whether the period was changed: `false` when its read failed, and the page still shows the one it had. */
export async function setReportRange(period: ReportPeriodId): Promise<boolean> {
  const prev = surfaceValue("reports")?.period ?? period;
  keepReportPeriod(period);
  // Today's line and Worth a look say the period too (the headline): one this tab has read paints at once, and every pick is read
  // again behind it. Its sentence always names its own period, so it is never wrong, only a read behind.
  paintHeldHeadline();
  void refreshSurfaces([reportsHeadlineOverride]);
  // A period this tab has read paints at once; the read behind it keeps it current (the loading standard's held
  // views). Only a period never read waits for its read.
  if (paintHeldReports()) {
    void refreshSurfaces([reportsOverride]);
    return true;
  }
  await refreshSurfaces([reportsOverride]);
  // The override writes the period it fetched. Anything else means the fetch failed and the page is still showing the
  // old period, so the preferred period goes back too, or the next background refresh would load the new one silently.
  if (surfaceValue("reports")?.period !== period) {
    keepReportPeriod(prev);
    return false;
  }
  return true;
}
```

- [ ] **Step 4: The tests of other files that name the refreshed surfaces**

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
    // A pick also reads the headline Today draws (period.ts): a period's counts, in the wire's shape.
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
```

- [ ] **Step 5: Format, run, typecheck**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/reports/headline.ts apps/dashboard/src/surfaces/reports/surface.ts apps/dashboard/src/surfaces/reports/period.ts apps/dashboard/src/surfaces/surface-values.ts apps/dashboard/src/legacy-bridge/LegacyApp.tsx apps/dashboard/src/legacy-bridge/refresh-map.ts tooling/scripts/tests/reports/headline/headline-surface.test.mjs tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/headline/headline-surface.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/billing/billing.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS. `message-fan-out` still says a message re-reads `conversations`, `inbox` and `today` and nothing else with the headline in its list (it has no rule); `empty-failed`'s period-pick test still passes with the extra read answered; `billing.test.mjs` (which reads `LegacyApp.tsx`'s override list ending `googleOverride, billingOverride`) is unaffected by the insertion after `reportsOverride`.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/surfaces/reports/headline.ts apps/dashboard/src/surfaces/reports/surface.ts apps/dashboard/src/surfaces/reports/period.ts apps/dashboard/src/surfaces/surface-values.ts apps/dashboard/src/legacy-bridge/LegacyApp.tsx apps/dashboard/src/legacy-bridge/refresh-map.ts tooling/scripts/tests/reports/headline/headline-surface.test.mjs tooling/scripts/tests/receptionist/business-tab/business-tab-zone.test.mjs tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs tooling/scripts/tests/shell/empty-failed.test.mjs
git commit -m "Today's headline is a surface of its own, held by period, read at boot and when the period moves, and never by the live feed." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Today reads the headline: its period line and Worth a look, word for word, and it stops loading the report

**Why:** the swap. `todayPeriodLine` and `todayLeaks` take the headline's view model (`ReportsLike`, the look-alike of the report's view model that Today's tests built by hand, is deleted with the cases it allowed), Today's two pages read it through `useSurface("reports_headline")`, and `ROUTE_DRAWS.today` draws it instead of `reports`. The contracts, the pages, the registry and the tests that name them move together because they share one type; the proof that no word moved is Review Focus 1.

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
every(`failed.add("reports")`, `failed.add("reports_headline")`, 2);
// Each band names the surfaces it draws from.
once(`    ["the day's card", TodayCard, ["today", "reports"]],`, `    ["the day's card", TodayCard, ["today", "reports_headline"]],`);
once(`    ["Worth a look", TodayLeaks, ["reports", "people", "today"]],`, `    ["Worth a look", TodayLeaks, ["reports_headline", "people", "today"]],`);
if (/__REPORTS|reports\(\)|\.vm\b/.test(t)) throw new Error("a look-alike of the report's view model, or its mirror, is left in the file");
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
  useMoved(["today", "reports"]);
  const [open, setOpen] = useState<TodayFigureId | null>(null);
##TO
  useMoved(["today"]);
  // The period in one small read (the headline), through the seam: a hook, so it stands before the early return below.
  const R = useSurface("reports_headline");
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
  const reportsFailed = !R && surfaceFailed("reports_headline");
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
import { useSurface } from "../../use-surface";
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
  // Reports' period in one small read (the headline), through the seam.
  const R = useSurface("reports_headline");
##END
##FILE apps/dashboard/src/surfaces/today/pages/leaks.tsx
##FROM
    !R && surfaceFailed("reports")
      ? ["Reports", "reports"]
##TO
    !R && surfaceFailed("reports_headline")
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

### Task 5: The `__REPORTS` mirror is deleted: Ask's context reads the seam

**Why:** after Task 4 the only reader of `window.__REPORTS` is Ask's page context (`legacy-bridge/ask/context.ts`, `w.__REPORTS?.days`). It moves to `surfaceValue("reports")`, and the mirror's one line goes. `git grep -n "__REPORTS"` found these readers: `ask/context.ts`, Today's card and leaks band (Task 4), and the tests named below; the writers were `declareSurfaceValue("reports", "__REPORTS")` and the seam's own `mirrorTo`.

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
### Task 6: Today says a reply that waited the hold went out as the hold ended, by the one rule

**Why:** spec D14 (deferred from phase A): "Today's number mostly measures the setting." Today's reply-speed words come from `metrics_summary`'s `median_reply_seconds_ai` (`today-figures.ts`, `today-bands.ts`: four sentences), not from the report, and a reply the owner held for a minute has a median of a minute whatever the receptionist's speed. This task changes the words and leaves the data for Task 7: `MetricsSummaryDto` gains an optional `replies` (each reply's seconds and the seconds it was held, the shape `report_series` lists), and every sentence takes its speed from one function over `holdOf`, the one rule (`classOf` and its ten-second slack stay private to `report-speed.ts`). With no `replies` (an older server, a longer window, a failed read) every sentence says what it said.

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
import { toTodayVM } from "@chanlytics/contracts";

const NOW = new Date("2026-08-27T15:00:00Z"); // 11:00 America/New_York
/** A day of four messages the receptionist answered, its median 62 seconds, and the day's replies as the server hands them (or none). */
const metrics = (replies, period = {}) => ({
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
  ...(replies === undefined ? {} : { replies }),
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
/** Replies that each waited the owner's minute, taking these seconds. */
const held = (...seconds) => seconds.map((s) => ({ s, hold: 60 }));
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
  assert.deepEqual(said(metrics(some)), MEDIAN);
});

test("no replies read, or none listed, or an older server's answer: what it said before, word for word", () => {
  assert.deepEqual(said(metrics(undefined)), MEDIAN);
  assert.deepEqual(said(metrics([])), MEDIAN);
  assert.deepEqual(said(metrics([{ s: 62, hold: 0 }, { s: 62, hold: 0 }])), MEDIAN, "replies sent with no hold are the median");
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
Expected: the first, second and third tests FAIL (the sentences say `typically in 1m 2s`: `replies` is not read), the other three PASS (they pin what is said today).

- [ ] **Step 3: The one rule says the words; the metrics carry the replies; the four sentences take them**

Save as `task6.swap` and run it (Standing rules):

```swap
##FILE packages/contracts/src/reports/report-speed.ts
##FROM
/** A reply as ReportDto carries it: the seconds it took, and the seconds it was held (0 or absent: no hold). */
interface HoldReply {
##TO
/** A reply as ReportDto carries it: the seconds it took, and the seconds it was held (0 or absent: no hold). */
export interface HoldReply {
##END
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
/**
 * Whether most of the replies seen waited a hold (more than half): the one test for saying the speed against the hold,
 * which Reports' hero and Today's sentences both ask. A hold that few replies waited says nothing of the receptionist's speed.
 */
const waitedHold = (hold: ReportHoldVM): boolean =>
  (hold.atEnd + hold.later) * 2 > hold.unheld + hold.atEnd + hold.later;

/**
 * How fast, beside the hero: against the hold where most replies waited one, since the setting is not the
 * receptionist's speed. Where most replies had no hold, the hold says nothing of them and the median does. The
 * count of replies is the hold's own, the replies it saw.
 */
export function heroSpeed(replies: number, medianLabel: string, hold: ReportHoldVM | null): string {
  if (!replies) return "";
  if (!hold || !waitedHold(hold)) return ` Half of its replies went out within ${medianLabel}.`;
  const seen = hold.unheld + hold.atEnd + hold.later;
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
export function replySpeedOf(median: number | null, hold: ReportHoldVM | null): ReplySpeed | null {
  if (median === null) return null;
  if (!hold || !waitedHold(hold)) return { held: false, seconds: median };
  return {
    held: true,
    words: hold.atEnd >= hold.later ? `as your ${hold.label} hold ended` : `later than your ${hold.label} hold`,
  };
}
##END
##FILE packages/contracts/src/reports/index.ts
##FROM
export type { ReportHoldVM } from "./report-speed";
##TO
export type { ReportHoldVM, HoldReply } from "./report-speed";
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
import { andList, secondsPhrase, speedIn } from "./today-bands";
##END
##FILE packages/contracts/src/today/today-figures.ts
##FROM
import type { MetricsSummaryDto } from "./today-metrics";
##TO
import { todayReplySpeed, type MetricsSummaryDto } from "./today-metrics";
##END
##FILE packages/contracts/src/today/today-figures.ts
##FROM
  const p = m.period;
  const live = m.now;
##TO
  const p = m.period;
  const live = m.now;
  const speed = todayReplySpeed(m);
##END
##FILE packages/contracts/src/today/today-figures.ts
##FROM
      p.median_reply_seconds_ai !== null ? `typically in ${secondsPhrase(p.median_reply_seconds_ai)}` : "",
##TO
      speed !== null ? `typically ${speedIn(speed)}` : "",
##END
```

Write the whole of `packages/contracts/src/today/today-metrics.ts`:

```ts
/**
 * What Today's brief reads from the metrics summary (server/metrics.ts): the workspace, its wires and the day's
 * counts, with the email wire the database cannot see and the day's replies with the hold each waited. What the brief says is
 * today-vm.ts; the brief that reads this is today-brief.ts.
 */
import type { EmailSetupDto } from "../email/mailbox";
import { holdOf, replySpeedOf, type HoldReply, type ReplySpeed } from "../reports/report-speed";

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
   * The receptionist's first replies of a one-day window, each the seconds it took and the seconds it was held: what
   * `metrics_summary` does not carry (it answers the median, and the median of a held reply is the hold). Added beside the
   * function's answer by the server (server/metrics/metrics.ts) from `first_replies`, the rule both reports read; absent from an
   * older server's answer, from a longer window and from a read that failed, and the sentences then say the median.
   */
  replies?: HoldReply[];
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
  return replySpeedOf(m.period.median_reply_seconds_ai, holdOf(m.replies));
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
```
Expected: the new test PASSES (six tests); `reports-hold.test.mjs` PASSES unchanged (the hero's words came through the shared `waitedHold` by value); every Today test PASSES with the words it asserted before (`typically in 34s, 2 handed over`, `typically in 38s`, `typically in about ...`); typecheck clean.

- [ ] **Step 5: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add packages/contracts/src/reports/report-speed.ts packages/contracts/src/reports/index.ts packages/contracts/src/today/today-metrics.ts packages/contracts/src/today/today-facts.ts packages/contracts/src/today/today-bands.ts packages/contracts/src/today/today-figures.ts packages/contracts/src/browser.generated.ts packages/*/dist tooling/scripts/tests/today/today-reply-hold.test.mjs
git commit -m "Today says a reply that waited your hold went out as it ended, by the one rule Reports reads, and never calls a hold a speed." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Today's metrics carry the day's replies, read beside `metrics_summary` and never a reason to blank the page

**Why:** Task 6 reads `replies`; nothing sends them yet. `metricsSummaryFor` (the one door for the metrics: the page's `GET metrics`, `GET today` for the phone app and Ask's `today` reader all read through it) reads `first_replies` beside the function, for a one-day window, through `packages/db` (the one place the function is called by name), keeps the replies the window's own midnight keeps, and hands them on. No migration: `first_replies(p_tenant_id, p_start)` is granted to `authenticated` (00303) and is SECURITY INVOKER, so RLS decides what a member reads, as it does for `metrics_summary`.

**Files:**
- Create: `tooling/scripts/tests/reports/headline/metrics-replies.test.mjs`
- Modify: `packages/db/src/repositories/reports/report-series.ts`, `packages/db/src/index.ts`, `apps/dashboard/src/server/metrics/metrics.ts` (whole file), `apps/dashboard/src/server/log.ts`
- Regenerate: `packages/db/dist`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/headline/metrics-replies.test.mjs`:

```js
/**
 * The day's replies beside the metrics (server/metrics/metrics.ts; packages/db `firstReplies`): `first_replies`, the one rule for
 * who answered and how fast (00303), read in the same breath as `metrics_summary` for a one-day window, kept to the window's own
 * midnight and handed on as `replies`, each the seconds it took and the seconds it was held, whole as report_series rounds them,
 * so the browser, GET today and Ask say reply speed against the hold from one reading. A read that fails costs the clause, never
 * the page; a longer window is none of Today's and reads none.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
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

test("a one-day window carries the day's replies: those the window's own midnight keeps, whole, and the function's answer as it was", async () => {
  const db = world(() => [
    row({ asked_at: "2026-09-17T23:30:00.000+00:00", ai_seconds: 61.4 }),
    row({ asked_at: "2026-09-18T14:00:00.250+00:00", ai_seconds: 60.6 }),
    row({ asked_at: "2026-09-18T15:00:00.000+00:00", ai_seconds: 95.2 }),
    row({ asked_at: "2026-09-18T15:30:00.000+00:00", who: "you", ai_seconds: null, ai_hold_s: null }),
    row({ asked_at: "2026-09-18T16:00:00.000+00:00", ai_seconds: 7.4, ai_hold_s: 0 }),
  ]);
  const m = await metricsSummaryFor(db, A, 1);
  assert.deepEqual(m.replies, [
    { s: 61, hold: 60 },
    { s: 95, hold: 60 },
    { s: 7, hold: 0 },
  ]);
  assert.equal(m.period.median_reply_seconds_ai, 62, "the median is the function's, untouched");
  const [call] = db.seen.filter((q) => q.rpc === "first_replies");
  const lookback = Date.now() - Date.parse(call.args.p_start);
  assert.ok(Math.abs(lookback - 2 * 86_400_000) < 10_000, "from two days back, so the window's midnight is always inside it");
  assert.equal(call.args.p_tenant_id, A);
});

test("a longer window reads no replies: the period's are Reports' (report_series), and the answer is the function's alone", async () => {
  const db = world(() => [row({})]);
  const m = await metricsSummaryFor(db, A, 7);
  assert.equal(m.replies, undefined);
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
    assert.equal(m.replies, undefined);
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

Save as `task7.swap` and run it:

```swap
##FILE packages/db/src/repositories/reports/report-series.ts
##FROM
 * `reach_out_report` is a definer that checks the member again). A read that fails throws: "we could not read" is never "none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
##TO
 * `reach_out_report` is a definer that checks the member again). A read that fails throws: "we could not read" is never "none".
 *
 * Beside them, `firstReplies`: the one rule for who answered and how fast (`first_replies`, 00303), which `report_series` and
 * `metrics_summary` both read, asked for Today's day so its sentences about speed can say each reply against its hold.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
##END
##FILE packages/db/src/repositories/reports/report-series.ts
##FROM
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, data };
}
##TO
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, data };
}

/**
 * The receptionist's first replies asked since `since`, each as `report_series` lists them: the seconds it took and the seconds it
 * was held, whole as the SQL rounds them (`round(ai_seconds)`, `round(coalesce(ai_hold_s, 0))`), so a reply is the same class on
 * Reports and on Today at the slack's edge. Only the ones the receptionist answered; each keeps the moment it was asked, so a
 * caller can keep a window's own. SECURITY INVOKER: RLS decides what a member reads. A read that fails throws.
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
##END
##FILE packages/db/src/index.ts
##FROM
export { reportSeries, campaignSeries, reachOutReport } from "./repositories/reports/report-series";
##TO
export { reportSeries, campaignSeries, reachOutReport, firstReplies } from "./repositories/reports/report-series";
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
 * Connections make. For a one-day window the day's replies are added too, each with the hold it waited
 * (`first_replies`, the rule both reports read), because the function answers the median and the median of a held reply is the
 * hold. Both readers of the function come through this one door, so the page's Today and Ask's Today count the same lines and
 * say the same speed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, emailWires, type HoldReply, type MetricsSummaryDto } from "@chanlytics/contracts";
import { firstReplies, type Database } from "@chanlytics/db";
import { emailSetupFor } from "../connections/email";
import { log } from "@/server/log";

/** The window the day's replies are read over: Today's one day. A longer window carries none (a period's replies are Reports', report_series). */
const REPLIES_WINDOW_DAYS = 1;

type RecentReplies = Awaited<ReturnType<typeof firstReplies>>;

/**
 * The receptionist's replies of the last two days with the hold each waited, read beside the function so no wall clock waits for
 * them: two days back always holds the window's own midnight, which is only known once the function has answered. Null when the
 * read failed (logged): the sentence then says the median, as it did.
 */
function recentReplies(supabase: SupabaseClient<Database>, tenantId: string): Promise<RecentReplies | null> {
  return firstReplies(supabase, tenantId, new Date(Date.now() - 2 * DAY_MS)).catch((e: unknown) => {
    log.error("today_replies_read_failed", { error: e });
    return null;
  });
}

/** The ones the window's own midnight keeps: what the function counted its median over. */
function repliesIn(rows: RecentReplies, since: string): HoldReply[] {
  const from = Date.parse(since);
  return rows.filter((r) => Date.parse(r.asked_at) >= from).map(({ s, hold }) => ({ s, hold }));
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
  const dto = recent === null ? answered : { ...answered, replies: repliesIn(recent, answered.window.since) };
  if (email === null) return { ...dto, linesRead: false };
  const wires = emailWires(email);
  // Untouched where there is no email line: a deployment without the channel
  // gets exactly the payload the function answered.
  return wires.length ? { ...dto, channels: [...(dto.channels ?? []), ...wires] } : dto;
}
```

- [ ] **Step 4: Build, run, bank**

```bash
corepack pnpm exec prettier --write packages/db/src/repositories/reports/report-series.ts packages/db/src/index.ts apps/dashboard/src/server/metrics/metrics.ts apps/dashboard/src/server/log.ts tooling/scripts/tests/reports/headline/metrics-replies.test.mjs
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
Expected: `git diff --stat packages/db/dist/index.d.ts` shows only the added `firstReplies` declaration (no `agrees?:` hunks); the new test PASSES (four tests), and every other test PASSES unchanged: the worlds that fake `metrics_summary` do not model `first_replies`, so the fake refuses it as the database refuses an unmodelled function, the read is caught and logged, and the answer is the function's alone; `log-events.test.mjs` finds `today_replies_read_failed` declared and spelled; the ratchets name no change (the function is called by name inside `packages/db`, where it is allowed, and the casts in `metrics.ts` are the two it had).

- [ ] **Step 5: Commit**

```bash
for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done
git add packages/db/src/repositories/reports/report-series.ts packages/db/src/index.ts packages/*/dist apps/dashboard/src/server/metrics/metrics.ts apps/dashboard/src/server/log.ts tooling/scripts/tests/reports/headline/metrics-replies.test.mjs
git commit -m "Today's day carries each reply's hold, read beside the metrics and never a reason to blank the page." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: What Today stopped loading, measured on fixtures

**Why:** the pull request says what Today stopped asking for. After this part both overrides still exist (the Reports page reads `reports`), so one test runs each over a recording `fetch` on the fixtures of a busy workspace's thirty days (the requests and the bytes the old boot made, and the new one), and counts the database's doors per route over the in-memory double (what the three routes read, and what the headline reads). The test holds the direction, so it cannot rot, and prints the numbers for the pull request.

**Files:**
- Create: `tooling/scripts/tests/reports/headline/headline-boot.test.mjs`

- [ ] **Step 1: Write the test**

Create `tooling/scripts/tests/reports/headline/headline-boot.test.mjs`:

```js
/**
 * What Today's boot stopped loading for Reports' sake (the lenses spec, D17 and §6.5). Before, Today drew the `reports` surface,
 * which reads three routes (GET reports, reports/campaigns, reports/reach-outs) and builds four view models in the browser; now it
 * draws `reports_headline`, one small read. Both overrides are run for real over a recording fetch on a busy workspace's thirty
 * days (the Reports page still reads the first), and the database's doors are counted per route over the in-memory double. The
 * direction is held; the numbers are printed for the pull request.
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

/* ---- the browser: what a boot reads, and how many bytes come back ---- */
const sent = [];
globalThis.window.fetch = async (url) => {
  const route = new URL(String(url), "https://app.chanlytics.com").pathname.replace("/api/v1/", "");
  const body = BODIES[route];
  assert.ok(body !== undefined, `a read this test does not model: ${route}`);
  const text = JSON.stringify({ ok: true, data: body });
  sent.push({ route, bytes: Buffer.byteLength(text) });
  return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
};
const boot = async (override) => {
  sent.length = 0;
  await override.apply();
  return { routes: sent.map((s) => s.route), requests: sent.length, bytes: sent.reduce((n, s) => n + s.bytes, 0) };
};

test("Today's boot reads one small route for Reports' sake, where it read three large ones", async (t) => {
  assert.ok(ROUTE_DRAWS.today.includes("reports_headline"), "Today draws the headline");
  assert.ok(!ROUTE_DRAWS.today.includes("reports"), "and no longer the report");
  const before = await boot(reportsOverride);
  const after = await boot(reportsHeadlineOverride);
  t.diagnostic(
    `Today's boot, for Reports' sake, on a busy workspace's 30 days: before ${before.requests} requests, ${before.bytes} bytes (${before.routes.join(", ")}); after ${after.requests} request, ${after.bytes} bytes (${after.routes.join(", ")})`,
  );
  assert.deepEqual(before.routes, ["reports", "reports/campaigns", "reports/reach-outs"]);
  assert.deepEqual(after.routes, ["reports/headline"]);
  assert.ok(after.bytes * 20 < before.bytes, `a few hundred bytes for tens of thousands: ${after.bytes} against ${before.bytes}`);
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
Expected: PASS, with two printed lines of the shape `# Today's boot, for Reports' sake, on a busy workspace's 30 days: before 3 requests, <tens of thousands of> bytes (reports, reports/campaigns, reports/reach-outs); after 1 request, <a few hundred> bytes (reports/headline)` and the two sorted door lists (the three routes' union holds `rpc:campaign_series`, `rpc:reach_out_report`, `rpc:report_series`, `rpc:people_list` and the table reads; the headline's holds `rpc:report_series`, `rpc:people_list` and the config read the booking line makes). Copy those lines into the pull request. If a door the test names is not what the double records (the double is the arbiter of what the readers call), the assertion's own message says which: fix the test's expectation to what the reader's code reads, never the reader.

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/tests/reports/headline/headline-boot.test.mjs
git commit -m "What Today's boot stopped loading is recorded: one request for three, the bytes, and the doors the database is no longer asked." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The docs, and the verification before the push

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
  "| reports | `/reports`, `/reports/campaigns`, `/reports/reach-outs` | — (read through `useSurface(\"reports\")`; no window name since 6 Oct 2026) | messages, conversations, escalations, while its page is on screen |",
  "| reports_headline | `/reports/headline` | — (read through `useSurface(\"reports_headline\")`: Today's period line and Worth a look) | none: read at boot, on return to the tab, on Retry, with the zone and with the period |",
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
Expected: no dist drift after the Task 7 commit (`git status --short packages` empty); typecheck, lint and format clean; `check:dead-exports` clean: every export this plan added has a reader (`headlineOf` and `isReportDto` the reader, `toHeadlineVM` the surface, `firstReplies` the metrics door, `shownReportPeriod` and `paintHeldHeadline` the surface and the pick, `reportsHeadlineOverride` the app, the refresh map and the pick, `bookingOf` neither exported nor needed, `reportPeriodAsked` the route). A fall is banked with `corepack pnpm lint -- --update` and `corepack pnpm check:dead-exports -- --update`; a number that rose is a stop.

- [ ] **Step 3: The ratchets bank what fell**

```bash
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
```
Expected: only falls, if any (Task 4's deleted look-alike may have lowered a lint warning count). The window-globals ratchet is expected to be unchanged (Choice 9). Nothing rose; if the ratchets name a rise, find what added it and remove it before going on.

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
Expected: the build and `check:bundle` pass within the workspace route's budget (it prints the figures: say them in the pull request; this part adds one small override and a view-model function to the route and deletes a look-alike, so a fall is the likely outcome, banked with `corepack pnpm check:bundle -- --update`; a rise past the band is argued with a row under "Rises" in `docs/debt.md`, never raised to what was measured). The Today spec's period line test finds `today-period` (its sentence now from the headline, `Last 30 days: N messages ...`, and one `Open Reports` door) and Worth a look's rows keep their arithmetic; the Reports spec still draws every lens from the report's own read. Both need the local dashboard running with the session minted as `docs/runbook.md` ("See a real page") and `e2e/session.ts` say. Then look at Today at 1440 and 390 in both themes with the network panel open: one `reports/headline` read in its boot, no `reports`, `reports/campaigns` or `reports/reach-outs`; pick 7 days on Reports and come back: Today says `Last 7 days`. Then delete this worktree's `apps/dashboard/.next`.

- [ ] **Step 6: Commit what the verification changed**

```bash
git add apps/dashboard/src/legacy/CLAUDE.md docs/system-prd.md tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -m "The docs say Today reads one small headline and Reports leaves the window, and what fell in this part is banked." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

**What the pull request says** (its body, ending with the house's generated-by line): *For a customer:* Today's numbers and sentences are unchanged, and a day on which most replies waited the owner's hold now says they went out as it ended, where it said "typically in 1m". Today opens with one small read of Reports instead of three large ones (the measured requests, bytes and doors from Task 8). *Before merging:* nothing to set or apply; no migration. *Deploy order:* either (the new route is new, the old routes stand for an open tab, and `replies` is an addition an old client ignores). *What it does not do:* the booking line is still counted on the server from the people pool and the calendar feed, so §14's budget for Today's boot is met when `report_headline` is SQL (phase C).

---

## What part 3 and phase C start from

When this branch lands, Today draws no `reports` surface: its card and Worth a look read `reports_headline` (`surfaces/reports/headline.ts`, held by period, follows the period Reports shows), a flat view model of six counts, one share and the booking line (`contracts/reports/report-headline.ts`), summed on the server by `headlineOf` from the same facts `toReportVM` is built from; `window.__REPORTS` is gone and Ask reads the seam; `GET reports/headline` is the Overview's read in waiting (phase C draws its tiles from it, per lens, and `report_headline` as SQL is where booking leaves the people pool and the feed); `first_replies` is called from `packages/db` for Today's day and its sentences about speed say the hold by `replySpeedOf`, which the Receptionist lens's dot plot and Ask's report tool can read too. What waits: **part 3** (`person_moments.new_at`, one rule for "new"); **the head-started read** for the headline (`PREFETCH_READS.today`); a **live rule** for the headline if Today's line is ever wanted to move on a message (it would need booking in SQL first); the **proof's and the figure's one-message waits** ("answered in 1m 18s"), which say a measured wait and are not a speed.

## Self-review

**Spec coverage (phase B, PR 2):**

| Spec | Where |
| --- | --- |
| D17 Overview and Today read one small headline read, never the whole page | Tasks 1 to 4: the DTO, the reader and route, the surface, the swap; Task 8 measures it |
| §6.5 `GET /api/v1/reports/headline?period=`; Today's `ROUTE_DRAWS` swaps `reports` for `reports_headline`; `card.tsx` and `leaks.tsx` read the new surface | Tasks 2, 3, 4 (the route is the spec's name; the key is the spec's) |
| §6.5 over `report_headline(p_tenant, p_period)`, per lens `has`, the Overview's figures, ≤ 150 ms, ≤ 6 KB | **Not here:** the brief fixes no new SQL; the DTO is a few hundred bytes (Task 1 holds under 400); the lens facts and the SQL are phase C |
| §6.5 "Today's boot loses `report_series`, the people pool, the feed and the deals" | **Partly:** loses the deals, the campaigns', the reach-outs' and the browser's building of four view models (Task 8); keeps `report_series` and the booking's pool and feed, which the brief keeps on the server (phase C moves booking into SQL) |
| §14 Today's boot budget | Task 8 prints what it measured; the rest is phase C |
| D14 reply speed against the hold, deferred from phase A (§12 A1, Today's side) | Tasks 6 and 7 |
| D18 one definition per fact | `headlineOf` over `periodFactsOf`/`answeredOf`; `bookingOf`; `replySpeedOf` over `holdOf`; no second implementation of a count or of the slack |
| §13 testing: moves equal by value; Today's boot before and after | Tasks 1 and 4 (the oracle), Task 8 |
| Brief 5: `__REPORTS` deleted, every reader moved | Tasks 4 (Today) and 5 (Ask, the mirror, the tests); the window-globals fall is not available (Choice 9) |
| Brief 7: route policy, docs/api.md, typed client, readers rule | Task 2 |

**The brief's eight points:** 1 (one small read, no new SQL, one derivation, a DTO of what Today draws, a view-model function, word-for-word proof, no look-alike, no fake tile, no `as unknown as`) Tasks 1, 2 and 4 (Choices 2 to 4); 2 (booking on the server, the same function, moved, no copy) Task 2 (`bookingOf`); 3 (the period) Choice 1, Task 3; 4 (the seam: key, held views, refresh rule, `ROUTE_DRAWS`, `useSurface`) Tasks 3 and 4 (Choice 5 says why the refresh rule is not copied); 5 (the mirror) Tasks 4 and 5; 6 (reply words against the hold, no SQL copy of the slack, no migration) Tasks 6 and 7 (Choices 6 and 7); 7 (route policy and docs) Task 2; 8 (measure) Task 8.

**Placeholders:** none. Where a task edits a file it names the text it replaces, and a count that must hold is checked by the codemods before they write; where it moves a test's fixtures it says what each override became.

**Type and name consistency, checked by reading:** `ReportHeadlineDto` (eleven fields, snake_case) is what `headlineOf` answers, what the route returns under `headline` and what the surface's `read("GET reports/headline")` types from the handler; `ReportHeadlineVM` (flat: `period`, `days`, `rangeLabel`, `lead`, `empty`, `messages {total, compare}`, `answered {ai, you, none, share}`, `calls`, `booking: BookingReportVM`) is what `toHeadlineVM` makes, what `todayPeriodLine` and `todayLeaks` read, the value type of `SurfaceValues["reports_headline"]`, and what `tests/today/_headline.mjs` builds through the real builders; `ReportPeriodId` is the surface's `shownReportPeriod()` and the route's `reportPeriodAsked`; `HoldReply` (`{ s, hold? }`) is `ReportDto.replies`' element's shape, `MetricsSummaryDto.replies`' and `firstReplies`' (with its `asked_at` dropped when the window keeps it); `ReplySpeed` is `replySpeedOf`'s answer, `TodayFacts.speed` and what `speedIn` finishes; the surface key `reports_headline` is `SurfaceValues`' key, `SURFACE_KEYS`', the override's `key` and `value`, `ROUTE_DRAWS.today`'s entry and the pages' `useSurface`.
