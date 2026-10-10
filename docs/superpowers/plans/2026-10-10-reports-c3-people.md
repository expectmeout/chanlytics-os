# Reports phase C, lens 3: the People lens, drawn from what is stored (C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The People lens answers "who are they, are they growing, can I reach them, who is slipping away?" in the lenses spec's five parts (D7: sentence, against before, mix, time between steps, stuck now), from a read of its own: the window from one SQL function, the book as it stands now from the people pool with People's own predicates, and a new person is, in every Reports and Today figure, one who reached you.

**Architecture:** Two halves, one DTO. The window (the picked days and the period before): SQL `people_series` (migration 00395) -> repository `peopleSeries` -> reader `peopleReport` -> `GET /api/v1/reports/people` -> contracts DTO `PeopleDto` -> surface `reports_people` (a `periodSurface`, publishing `{ dto, key }`) -> the page folds it with `toPeopleReportVM` from the existing page-only entry `@chanlytics/contracts/report-lens`. As of now (never the window): the same reader folds the people pool the frame already reads (`everyoneOf(rc)`, turn-cached `people_list` rows) with `peopleNowOf`, which counts with People's own rules (`PersonRowVM`, the built-in lists through `membersOf`), so every number equals what People's lists show, and only counts leave the server. The head sentence is the lens's own, folded on the page and handed to `lensAnswerOf`; the frame's `lines.people` is its fallback. Migration 00394 first redefines `contact_first_moments` (a new person is their first reach-in), which Overview, Today, Ask and this lens all stand on. Each read fails alone, as C2's do.

**Tech Stack:** Postgres/plpgsql on Supabase (SECURITY INVOKER functions), TypeScript (`packages/contracts`, `packages/db`, Next.js App Router dashboard), React with the repo's kit and hand-rolled SVG charts, `node:test` (run one file per command), Playwright for `e2e/`.

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (D1-D20, §6.4, §6.6, §7, §9 People, §13), the data catalog `docs/superpowers/specs/2026-10-02-reports-lenses-data-catalog.md` (People table), today's review `C:\Users\Ruben\Documents\Claude Projects\Claude Video\docs\reports-canvas\2026-10-10-reports-phase-c-review.md` (§3 defects, §5 People), and the controller's design for this lens (10 Oct 2026, rulings R1-R14, restated below because that file lives in a session scratchpad). Precedent: `docs/superpowers/plans/2026-10-10-reports-c2-receptionist.md` and its merged code (squash `fc6435292`, PR #1539). Written against origin/main `5cf37cefa` and moved by the controller onto `ef0aea36a` (#1537 merged: migrations 00381-00391; nothing it changed is a function this plan replaces, and 00383's `record_provider_stop` writes the same `contact.consent_changed` shape Task 2 counts), branch `reports/c3-people`, in `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-reports-heads` (every path below is from that root).

## Global Constraints

- **No commit, no push, no branch change, no new worktree, anywhere in this lane** (Ruben, 10 Oct 2026: work stays uncommitted until the lens is complete). Each task ends with a **Stage** step: the controller verifies the task, then runs the task's exact `git add` list, so the index holds the last verified state and the next task's diff is plain `git diff` (the lane's so far is `git diff --cached`). A new file is made known to git the moment it exists with `git add -N <file>` (the ratchets read `git ls-files`); that adds no content, and the controller stages the content. Nothing in this plan uses `git show HEAD`, `HEAD~1` or a commit sha of this lane.
- **Disk and the database:** no dashboard production build until Task 15, and `apps/dashboard/.next` is deleted right after it is measured. The throwaway Supabase stack is the controller's and serves Tasks 1 and 2 only: a new migration is copied into the stack's folder and applied with `supabase migration up --local`, never `supabase db reset` on a shared one; `gen:schema-snapshot`, `gen:db-types` and `gen:schema-sets` run on it; when Task 2 is done the stack is stopped with `supabase stop --no-backup`.
- **Bundle (CI of 10 Oct 2026, #1538 and #1540):** the ceilings are `tooling/scripts/tests/baselines/bundle-ceiling.json` (route JS 819,200, route CSS 163,840, each page's own JS 262,144 bytes gzipped) and are never raised for this lane; CI compares what the change adds with main's own build and wants a line `Bundle: <why>` in the PR description past 1 KB on the route or 2 KB on a page. There is no `--raise` and no `bundle-budget.json` now. The fold and its words are page-only (the existing entry `@chanlytics/contracts/report-lens`), so the route does not grow by them; the Reports page grows by what the lens adds. Measured once, in Task 15.
- **A ratio carries its n and greys under 5** (D9): the one constant is `REPORT_MIN_N = 5` (`packages/contracts/src/reports/report-tiles.ts`); a share of people is a ratio. **A number with no source is "—" with words; a count that is zero is shown as 0.** A share is not said at all when it is of fewer than five (the head, a card's line).
- **Colour (D10):** change words are plain ink; amber (`warn`) only for what needs you (steps overdue), red (`fail`) only for what failed (email that stopped working), never green, coral only the selected and the live.
- **Migrations:** 00394 and 00395 (renumbered by the controller on 10 Oct 2026: #1537 landed as 00381-00391 while this plan was written, so main's head is 00391 and 00378 stays the ledger's argued gap); if another lane lands first, renumber at push. Forward-only, re-runnable, `set local lock_timeout = '3s'`. Recorded with `node tooling/scripts/checks/migration-ledger.mjs --record`; the ledger's `gaps` keep 00378 (the doors lane's) until its file lands.
- **Folder caps (20 modules; a fail at 21):** `packages/contracts/src/reports` has 18 files and takes ONE (`report-mix.ts`) plus a nested folder `reports/people/` (4 files); `tooling/scripts/tests/reports` and `e2e` are at 20 (new tests go in `tooling/scripts/tests/reports/people/`, new e2e cases in the existing `e2e/reports.spec.ts`); `apps/dashboard/src/server/readers` is baselined at 32 and `apps/dashboard/src/legacy-bridge` at 34 (no new file in either); `apps/dashboard/src/surfaces/reports` goes 16 -> 17 (`people-surface.ts`), its `lenses/` 9 -> 11 (`people-mix.tsx` and `people-now.tsx`; `people.tsx` is rebuilt in place), `packages/db/src/repositories/reports` stays 2.
- **File and function limits:** `packages/contracts/src/reports/reports.ts` is 772 lines (800 is the cap; this lane makes it shorter); `sample.ts` is 606 (it stays under 720); the reader file `server/readers/report.ts` is 397; functions at most 150 lines, 30 branches, 5 levels (C2 hit the function-length ratchet once: keep one small function per part); no new `as unknown as`, `x!`, bare duration numbers (name them from `contracts/shared/time.ts`), unchecked `arr[0]` (use `.at(0)` or a default).
- **One predicate per rule:** a person's words = `public.message_is_a_persons_words(meta)`; a connected call = `public.call_connected(status, duration_ms)`; a first moment = `public.contact_first_moments` (redefined by 00394, read by `report_series`, `metrics_summary` and `people_series`); a live person = `erased_at is null and merged_into_contact_id is null`. As of now, People's own rules and no restatement of them: how long since they were heard is `PersonRowVM.heardDays` (`heardAt` + `localDaysBetween` + `QUIET_AFTER_DAYS`), a next step's standing is `PersonRowVM.nextStep.due` (`stepDayOf`), their ways in are `PersonRowVM.channels` (`channelsOf` is private to `person-row.ts`), a stopped address is `PersonRowVM.emailSuppressed` (`isEmailStopped`), and the lists are `membersOf` over `BUILTIN_LISTS` (`listMembers`).
- **Kit and styles:** a value is a token (no literal type size, radius, shadow, colour or blur in any stylesheet); no `style` prop and no raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>` in `src/surfaces`; layout-only rules in `reports.css`; a kit class has a `kit.css` rule, a `classes.json` name and a gallery entry; the chart kit's `.ck-*` rules live in `charts.css`.
- **A page fetches nothing:** it reads `useSurface`/`useFollower`; every sentence it draws is a view model's.
- **Export only what another non-test module reads** (knip holds dead exports to a baseline that may only fall; a value only a test reads is dead). A task whose export waits for a later task's reader says so in its Run step; Task 15 ends with none waiting.
- **No model call, no eval, no real send:** Ask's tool gains words only; the e2e seed writes terminal rows only (events and done steps: never a queued message, an open escalation, an open step, a suppressed address or a job), in the production e2e workspace.
- **Dist is tracked in git (CI fails on drift):** rebuild `packages/*/dist` (`corepack pnpm --filter "./packages/*" build`) after any `packages/*/src` change, and list the changed dist files in the task's Stage step.
- **Edit with the editor tool, never `sed -i` or a PowerShell rewrite** (Git Bash `sed` flips CRLF; PowerShell double-encodes). Run one test file per command: `node tooling/scripts/checks/test.mjs <file>`; database files: `corepack pnpm test:db -- <file>`. No full suite locally. Before a push (not part of this plan) the controller runs `corepack pnpm check:local`, which stamps the tree; a pull request then runs the tests of what it changed.
- **Names fixed here:** page-only entry `@chanlytics/contracts/report-lens` (existing); surface key `reports_people`; route `GET /api/v1/reports/people` (query `period` | `from`+`to`); SQL `public.people_series(p_tenant_id uuid, p_days integer default 30, p_end date default null)`; repository `peopleSeries`; reader `peopleReport`; DTOs `PeopleSeriesDto`, `PeopleNowDto`, `PeopleDto`; pool fold `peopleNowOf`; builder `peopleDtoOf`; fold `toPeopleReportVM`; migrations `00394_a_new_person_is_one_who_reached_you.sql` and `00395_the_people_lens_is_read_beyond_the_days_counts.sql`.

## The design's rulings this plan carries (R1-R14, decided, not reopened)

- **R1** A new person is their first reach-in: the first inbound customer message in a person's own words, or the first inbound connected call; never a moved-in history, never an erased person. 00394 redefines `contact_first_moments`, so Overview's New people, the kept "New people, adding up", Ask and Today follow. People's own "New this week" (7 days, `person_moments.new_at`) is not touched, the lens does not draw it, and the PR names it as the People surface's lane.
- **R2** Who reached you = distinct live people with an inbound person's-words customer message (`created_at` in the window) or an inbound connected call (`started_at`); new = those whose first reach-in is in the window, known = the rest; now and before. By channel, as people (a person once in each channel they used). Replaces the donut that added messages and calls.
- **R3** How they first came = `contacts.acquired_via` of the new people, nine values in words, null as "not recorded" (never guessed, its own row, last).
- **R4** Yeses and stops in the window = `contact.consent_changed` events, live people, leaving out `source in ('merge','stop')`, one per (person, purpose, answer); by how; figures now and before.
- **R5** Email that stopped working = `contact.email_suppressed` in the window by reason, distinct live people; plus "stopped now" from the pool. No phone equivalent exists: none is invented.
- **R6** As of now, from the pool with People's predicates: the fresh book (under 7, 7-30, 31-60, 61-90, 91+ local days, never heard from; 31+ sums to Quiet 30+ and is a door to it), where they stand (People's built-in lists, a door each), steps you owe (overdue and due today, door to Steps due; done on time and late in the window from SQL), channels per person.
- **R7** Kept: "When they reach you" (unit words from contracts) and "New people, adding up" (now on R1). The donut goes.
- **R8** The head is the lens's own: "N people reached you, M new (K before)" and, when the pool was read, a clause on who said yes to messages; where its read has not landed or failed, the frame's new-people sentence.
- **R9** A quiet period no longer hides the lens: the as-of-now half always draws; window cards with nothing say so in words.
- **R10** Ask's report tool says the same numbers in the same words (`peopleSaid`), one read.
- **R11** Deferred, named in the PR: coming back after a win-back (C4), new/returning/rebooked, usual gap, at risk, lifetime (need the appointments record, E), where they live (no postal code), list sizes over time (no nightly snapshot), People's "New this week" alignment.
- **R12** D9 and D10 as in Global Constraints. **R13** Bundle as in Global Constraints. **R14** Migrations 00394 and 00395, as in Global Constraints.

## Review Focus

The five conditions the design implies and no task's happy-path test would meet, most likely first. Each has its test in the task named.

1. **A period nobody reached you in** (R9; a young or quiet workspace): the strip says 0 (a true count) with its words and sets nothing against a dash; every window card says so in words, never a bar of nothing, `NaN` or a 0%; the book half still draws in full. Test: Task 2 (an empty workspace), Task 7 (all-zero facts), Tasks 11 and 12 (the page).
2. **Picked days in the past** (`p_end` before today): the window counts nothing after its last day, and the book is still "as of now" and says so; the head names the window's comparison, not the book's. Test: Task 2 (`p_end`), Task 9 (the pool is read whatever the window), Task 7 (words).
3. **A time zone east of UTC** (Auckland, Madrid): a message at 23:50 local belongs to that local day, a step done at 00:30 local the day after its day is late, and a person last heard 31 local days ago is Quiet even when 24-hour blocks say 30. Test: Task 2 (an Auckland workspace, expected values computed with `Intl` from the same instants), Task 6 (`peopleNowOf` with `Pacific/Auckland`, equal to People's lists).
4. **Rows that are not people as the lens counts them:** an erased person, a merged-away record, a moved-in history, automated mail (an out-of-office from a new address), a call we placed, a dial nobody took, and someone never heard from (an import): none is reached or new; they sit in the "never heard from" bucket and the "not recorded" row. Test: Task 1 (the first-moment rule), Task 2 (the live predicate), Task 6 (the pool).
5. **One of the two halves missing:** a database without 00395 draws the book and the kept cards and no window card and no failure; a pool that could not be read draws the window and says the book could not be read, with its Retry; both missing is Ask's `available: false`. Test: Task 9 (reader), Task 11 (page), Task 13 (Ask).

Also pinned where they belong: a person who said yes and then stopped counts once in each (Task 2); a merge restating an answer and a STOP ending the yes to offers are not a person's own answer (Task 2); a person who used two channels is in each (Task 2); a step done on its day is on time (Task 2); the Quiet buckets sum to the Quiet list and every count equals what People's rail shows for the same rows (Task 6); a share of fewer than five people is greyed and not said in the head (Tasks 7 and 11).

## Where the code differs from the design, and what this plan does

1. **There is no "kept new-people sentence" in the frame today.** The People head was `vm.lines.channels` (the first card's takeaway); the New people card has no takeaway. The fallback of R8 is a new `ReportLinesVM.people` (`newPeopleLine`, in `report-tiles.ts` beside `compareWords`), and `channelsLine` and `lines.channels`, which nothing reads once the donut goes, are deleted with the donut (Task 11; `reports.ts` ends shorter than its 772 lines).
2. **How the head is wired.** C2's head is built by the frame's own fold because it needs nothing else. This one needs the pool, so it follows Reviews' way: `lensAnswerOf` gains a `people` part (`{ head: string | null } | null`), the page folds the lens's DTO once in `ReportsPage` (the page-only fold), hands the head to `useReportsStanding` and the VM to the lens. Until the lens's own read lands (or when it failed, or the database has no 00395) the head is the frame's `lines.people`; the sentence therefore changes once on the first draw, which is accepted (the frame's read lands first).
3. **The head's clause on yeses is the standing count, not the window's.** "X said yes to messages" is read as the people the pool shows on the Said yes to messages list, worded so it cannot be taken for the window's: "...; 340 of 520 have said yes to messages", and left out when the book holds fewer than five people (a share of fewer is not said). The window's yeses are the strip's own figure.
4. **Doors are People's own address, `clients/seg:<id>`, not `lists/<id>`.** `/w/<slug>/lists/<id>` (`surfaces/people/lists-route.tsx`, `ROUTE_WORDS.segments = "lists"`) replaces itself with `clients/seg:<id>` once People's surface has loaded, one hop later, and says "Reading..." until then; Campaigns' playbook card already goes straight to `clients/seg:<id>` (`campaigns/playbooks/card-detail.tsx`). The words module holds the five ids and a test holds them to `BUILTIN_LISTS`.
5. **Which lists depend on the viewer: none of the five.** `ruleNeeds` of `opted_in`, `offers_ok`, `opted_out`, `steps_due` and `quiet` is empty (the fields `said_yes`, `can_receive`, `stopped`, `step_due` and `last_heard` need nothing; only `standing waiting_on_you` and `assigned` need a viewer), so the fold builds the pool's rows with `viewer: null`, the answer is the workspace's, and a test holds every list's needs empty so a later change fails first. What the lists do depend on is the channels the workspace can send on now (`offers_ok` is `canReceive.offers`): the reader loads `facts.channelsReady`, and a read that failed counts as WhatsApp alone, exactly as People's page does.
6. **The pool rows carry everything; the fold reads view models, not DTOs.** `people_list` rows (`everyoneOf` -> `PersonRowDto`) carry `last_inbound_at`, `last_inbound_call_at`, `step_*`, `channels`, `message_channels`, `call_count`, `has_chat`, `email_suppressed_at` and the consent columns, so no column is added. `channelsOf` is private, so the fold reads `PersonRowVM` made by `poolRowsOf` (`dealsOn: false`, `viewer: null`), which is what People's rail, Ask and a send already count from. The reader holds `rc.userId` and passes none.
7. **"Steps due" is the pair "overdue" and "due today".** A person is on the Steps due list when their earliest open step's day is today or before (`stepIsDue`), so the list is exactly overdue plus due today. The lens draws the pair (each a door to the list), not the list a third time, and a test holds the sum to the list's own count.
8. **People's rail counts the rows it holds; the lens counts everyone.** `peopleSurfaceOf` counts the pages People has loaded; the lens counts all of `everyoneOf`. They are the same people once People has read every page; the test builds the page from the same rows.
9. **R1 refinements.** The first inbound message is timed at `coalesce(channel_ts, created_at)` (as `message_moment` and `last_inbound_at` time it), not `channel_ts` alone, so a person whose provider sent no time is not silently never new; the function keeps the erased and the moved-in exclusions and needs no merged-away predicate (a merge moves their messages and calls). New in the lens = reached AND first moment in the period, so `new <= reached` always; the Overview's tile counts by first moment alone, and at a window's edge a delayed message can put one person on one side of it (named in the function's header, held equal in an ordinary world by a test). The tests that pin today's behaviour: `automated-mail.db.test.mjs` second test (inverted, Task 1); `report-answers.db.test.mjs`, `report-counts.db.test.mjs`, `report-days.db.test.mjs`, `report-window.db.test.mjs` and `today/a-person-who-never-wrote-is-not-new.db.test.mjs` hold under the new rule and are re-run (the first-moment test of `report-answers` has inbound customer messages and default-inbound calls; `report-days` also holds the index reads of the contacts pass to 42).
10. **"Messages and calls that came in" cannot be said.** `report_series` counts a connected call in either direction (`calls_w` has no `direction` filter), so the kept rhythm card's unit words are "messages and calls" (a contracts constant, `PEOPLE_RHYTHM_UNIT`), not "that came in". Restricting the frame's calls to inbound would move Overview's and Today's Calls figures and is not this lane's (Open question 1).
11. **Live refresh tables.** Spec §6.6 names `messages, calls, segment_members` for People. The lens reads no saved list, and it reads steps, so the tables are `messages`, `calls` and `person_notes` (all in the feed's `WATCHED`); the spec row is corrected in Task 15. A transcript turn of a live call is no change (`isLiveCallTurn`, as C2).
12. **The fresh book's door is a foot line, not the bars.** `BarList` makes every row of a list a door or none. Three rows opening one list would pretend to be three, so the card's bars are plain and its foot line, "N people have been quiet for more than 30 days" with the Quiet 30+ days list as its door, is the door of R6.
13. **The kit's Figure has no tone.** R12 gives amber to overdue steps and red to email that stopped working; the figure draws no tone today ("a figure is not a tone", `figure.tsx`: its change is plain ink). Task 4 adds one variant, `tone: "warn" | "fail"`, on the VALUE only, set only when the count is above zero; the change words stay plain ink.
14. **C2's mix helpers move once.** `MixPartVM`, `MixEntry`, `barsOf`, `mixOf`, `noMix`, `rankedEntries` and `ownWord` are private to the Receptionist's two modules; two lenses now need them, so they move unchanged to a shared page-only module `reports/report-mix.ts` (Task 5), and the page's `mixCard` moves to `lenses/shared.tsx` (Task 11). A pure move, held by C2's own tests.
15. **`ReportsSurface` stays; the lens's own surface carries `{ dto, key }` only.** The People fold needs no clock (no duration is said), so `PeopleSurface` has no `readAt`.
16. **Dead on the way out (the review's defect d, and the donut):** `recencyCells` (`people/people-lists.ts`, no reader, buckets that are not the Quiet rule's) and `RPT_CHANNELS` (`surfaces/reports/series.ts`, read by the donut alone) are deleted in Task 15 and Task 11; `RPT_CHANNEL_COLORS` stays (Campaigns reads it, and the lens's channel bars wear it).
17. **The registry's People row keeps its shape.** `REPORT_LENSES.people.empty` ("Nothing came in") is never reached once the lens stops hiding itself; the row keeps its shape (every lens has an `empty`) and only its `sub` changes (Task 8).

---

### Task 1: Migration 00394: a new person is one who reached you

**Files:**
- Create: `supabase/migrations/00394_a_new_person_is_one_who_reached_you.sql`, `tooling/scripts/tests/reports/people/first-moments.db.test.mjs`
- Modify: `supabase/migrations-ledger.json` (recorded), `supabase/schema.sql`, `packages/db/src/database.types.ts` (regenerated; unchanged expected), `tooling/scripts/tests/reports/receptionist/automated-mail.db.test.mjs` (the second test, lines 162-180), `packages/contracts/src/reports/report-metrics.ts` (the `new_people` definition), `packages/contracts/src/today/today-figures.ts` (the comment at lines 249-252)
- Modify (built): `packages/contracts/dist/*`

**Interfaces:**
- Consumes: `public.message_is_a_persons_words(p_meta jsonb)` (00299, widened by 00373), `public.call_connected(p_status text, p_duration_ms integer)` (00303), the function's current text in `supabase/schema.sql` (line 1766; 00303's), its callers `report_series` (`fresh`, schema.sql line 17523) and `metrics_summary` (`fresh_contacts`, line 9434).
- Produces: the same function, signature `public.contact_first_moments(p_tenant_id uuid) returns table (contact_id uuid, first_at timestamptz)`, `language sql stable set search_path = public`, SECURITY INVOKER, grants as the schema has them (`revoke all ... from public; grant all ... to authenticated, service_role`), now a person's FIRST REACH-IN: `least(` the earliest `coalesce(channel_ts, created_at)` of their inbound customer messages whose words are a person's (`direction = 'inbound' and sender = 'customer' and message_is_a_persons_words(meta)`), the earliest `started_at` of their inbound calls that connected (`direction = 'inbound' and call_connected(status, duration_ms)`) `)`; none for an erased person (`erased_at is not null`), for anyone with a `meta.backfill = 'true'` message, or for a person with neither. A comment on the function says so.

The rule being fixed: today the first moment is the earliest `channel_ts` of ANY message (an out-of-office from a new address, a list's mail, a reply the receptionist wrote) or the earliest connected call in EITHER direction (a call we placed). 00379's header deferred "a new person" to this lens. Callers: `report_series` (the Overview's New people tile and the kept "New people, adding up" card), `metrics_summary` (Today's New people figure and Ask's `today` tool) and, from 00395, `people_series`. Stays as it is: People's `person_moments.new_at` and its "New this week" list (7 days, spoken words in either direction, a call that did not fail, the row's own time as a floor), which is the People surface's lane; decision 0021's step 4 (re-point this function at `new_at`) is superseded for Reports and Today by this rule (Task 15 says so in the note).

- [ ] **Step 1: Write the failing tests**
  - `first-moments.db.test.mjs` (service-role client and the world helpers of `tooling/scripts/tests/reports/receptionist/automated-mail.db.test.mjs`, skipped without a local stack; each test builds its own workspace in UTC and removes it). Test 1, **"a first moment is the first inbound message in a person's own words or the first inbound call that connected: never automated mail, a reply we wrote, a call we placed, a moved-in history, an erased person or a dial nobody took"**: one person each, a conversation each. A: inbound whatsapp text, `channel_ts = created_at` 3 days ago. B: only an inbound email with `meta: { email: { claim: "auto_reply" } }`. C: only an outbound `ai` message (no `channel_ts`). D: only an outbound call (`direction: "outbound"`, `status: "ended"`, `duration_ms: 60000`). E: an inbound call, `status: "ended"`, `duration_ms: 60000`, 4 days ago. F: an inbound message with `channel_ts` null and `created_at` 2 days ago. G: an inbound message 1 day ago and an inbound connected call 5 days ago. H: an inbound message and another with `meta: { backfill: "true" }`. I: erased (`erased_at` set) with an inbound message. J: an inbound call, `status: "not_connected"`. Assert `contact_first_moments` returns exactly the contacts A, E, F, G, with `first_at` = A's time, E's `started_at`, F's `created_at` (the coalesce) and G's call (the earlier of its two). Test 2, **"Reports and Today say the same people are new, and they are the ones the function names"**: in the same world, `report_series(p_days: 7)` summed over its last 7 days' `new_contacts` equals `metrics_summary(p_days: 7).period.new_contacts` and both equal the number of those four whose `first_at` is in the last 7 days (A, E, F and G: all four).
  - `automated-mail.db.test.mjs`: the second test becomes **"a person whose only message was automated mail is no new person: the rule is a first reach-in in their own words"** (title and comment): `contact_first_moments` has no row for that contact, and `report_series` over 7 days and `metrics_summary` over 2 days both count 0 new people. The first test of that file is untouched.

- [ ] **Step 2: Run to see them fail**

Run: `corepack pnpm test:db -- tooling/scripts/tests/reports/people/first-moments.db.test.mjs` and `corepack pnpm test:db -- tooling/scripts/tests/reports/receptionist/automated-mail.db.test.mjs`
Expected: FAIL (B, C, D and J are first moments today; the automated-mail person is new).

- [ ] **Step 3: Write the migration.** Header of a few lines: the rule, the three readers, what stays (People's `new_at` and "New this week"), what the numbers do (Overview, Today and Ask dip by the people an automatic reply or a call we placed had made new; a new person is always one who reached you in the window), either deploy order works (no shape changes), re-runnable. `set local lock_timeout = '3s';` then `create or replace function public.contact_first_moments(...)` keeping the current text's structure (a `left join lateral` per aggregate, each run once per contact, so the contacts pass keeps its index reads) with the two laterals above and the `where c.tenant_id = p_tenant_id and c.erased_at is null and least(msg.at, call.at) is not null and not exists (select 1 from messages b where b.contact_id = c.id and coalesce(b.meta->>'backfill', 'false') = 'true')` of today; the grants as the schema has them; `comment on function`. Edit `report-metrics.ts`'s `new_people` to: "People whose first message in their own words, or first connected call to you, fell in this period, counted once. A message you or the receptionist sent, an automatic reply or a list's mail, a call you placed, people brought in with their history, people who asked to be forgotten, and people who have not written or phoned yet are not counted." (the metric-words test wants a sentence of more than 40 characters ending in a full stop; Task 7 keeps the count). Edit the comment in `today-figures.ts` ("the SQL's count of people whose first message of their own, or first call to us, came today (00394; 00254: never one who has had neither)"). Apply with `supabase migration up --local`; `node tooling/scripts/checks/migration-ledger.mjs --record`; `corepack pnpm gen:schema-snapshot`; `corepack pnpm gen:db-types`; `corepack pnpm gen:schema-sets` (no change to the last two expected); `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**, one per command, on the stack: the two files above; then `tooling/scripts/tests/reports/report-answers.db.test.mjs`, `report-counts.db.test.mjs`, `report-days.db.test.mjs` (the contacts pass must still read the person index at most 42 times for 7 people), `tooling/scripts/tests/reports/periods/report-window.db.test.mjs`, `tooling/scripts/tests/today/a-person-who-never-wrote-is-not-new.db.test.mjs`, `tooling/scripts/tests/platform/platform-metrics.db.test.mjs`; and without the stack: `tooling/scripts/tests/database/migrations.test.mjs`, `tooling/scripts/tests/database/migration-ledger.test.mjs`, `tooling/scripts/tests/reports/lenses/report-metric-words.test.mjs`, `tooling/scripts/tests/today/today-vm.test.mjs`.
Expected: PASS. A suite that counted an automated email or a call we placed as a new person now says the corrected number: fix its expectation and say why in a comment (the tests that failed are the ones that should); none is expected beyond the second automated-mail test.

- [ ] **Step 5: Stage**

```bash
git add supabase/migrations/00394_a_new_person_is_one_who_reached_you.sql supabase/migrations-ledger.json supabase/schema.sql packages/db/src/database.types.ts tooling/scripts/tests/reports/people/first-moments.db.test.mjs tooling/scripts/tests/reports/receptionist/automated-mail.db.test.mjs packages/contracts/src/reports/report-metrics.ts packages/contracts/src/today/today-figures.ts packages/contracts/dist
```

---

### Task 2: Migration 00395: `people_series`

**Files:**
- Create: `supabase/migrations/00395_the_people_lens_is_read_beyond_the_days_counts.sql`, `tooling/scripts/tests/reports/people/people-series.db.test.mjs`
- Modify: `supabase/migrations-ledger.json`, `supabase/schema.sql`, `packages/db/src/database.types.ts` (regenerated: the function appears under `Functions`)

**Interfaces:**
- Consumes: `contact_first_moments` (as Task 1 leaves it), `message_is_a_persons_words`, `call_connected`; and the writers of what it reads: `events` of kind `contact.consent_changed` (data `consent`, `source`, optional `purpose`: absent = the answer about their visit, `marketing` = offers, `email_marketing` = email offers; written by `ingest_inbound`, `set_contact_consent`, `set_marketing_consent`, `set_email_marketing`, `set_email_offers_yes`, `stop_all_messages`, `recordCarrierOptOut`, `recordWhatsAppOffersStop`, the merge door (source `merge`) and the trigger that ends a yes to offers on a STOP (source `stop`, consent `unknown`)), `events` of kind `contact.email_suppressed` (data `reason`: `hard_bounce`, `complaint`, `provider`; `apps/edge/lib/email/email-receipts.ts`), `contacts.acquired_via` (00306, 00307: `whatsapp, sms, email, call, ad, calendar, import, lead, manual`, null before it was kept), `person_notes` (`due_on`, `done_at`: a step is a note with a day, 00166).
- Produces: `public.people_series(p_tenant_id uuid, p_days integer default 30, p_end date default null) returns jsonb`, SECURITY INVOKER, `stable`, one statement, `set search_path = public`, the workspace's zone, `revoke all ... from public, anon; grant execute ... to authenticated, service_role`, a `comment on function` naming the sources. `{ "error": "unknown_tenant" }` for an unknown workspace (also what a non-member gets, RLS hiding the tenant row). Otherwise (`now` = the window, `before` = the same number of days before it; counts only, never a name):

```jsonc
{ "timezone": "Pacific/Auckland", "today": "2026-10-06", "end": "2026-10-06", "days": 30,
  "reached":    { "now": { "people": 40, "new": 12 }, "before": { "people": 31, "new": 8 } },
  "by_channel": { "now": { "whatsapp": 25, "sms": 3, "email": 6, "voice": 11 }, "before": { "whatsapp": 20, "sms": 2, "email": 5, "voice": 7 } },
  "first_came": { "by_via": { "whatsapp": 5, "call": 3, "ad": 1, "unknown": 3 } },
  "consent": { "now": { "yes":  { "total": 9, "by_source": { "customer_message": 6, "form": 2, "in_person": 1 }, "by_purpose": { "messages": 6, "offers": 2, "email_offers": 1 } },
                        "stop": { "total": 4, "by_source": { "customer_message": 2, "carrier": 1, "unsubscribe": 1 }, "by_purpose": { "messages": 2, "offers": 1, "email_offers": 1 } } },
               "before": { "yes": 7, "stop": 2 } },
  "email_stopped": { "total": 2, "by_reason": { "hard_bounce": 1, "complaint": 1 } },
  "steps": { "done": 11, "on_time": 8 } }
```

Definitions the SQL fixes (each held by a test below):
- **Live people** (`live`): `contacts` of the workspace with `erased_at is null and merged_into_contact_id is null`. Every count joins it.
- **Reached**: distinct live people with an inbound customer message whose words are a person's, over `real_msgs` (backfill left out) on channel `whatsapp`, `sms` or `email`, by `created_at` in the period, or an inbound call that connected (`direction = 'inbound' and call_connected(...)`) by `started_at`. **New**: reached AND the person's `contact_first_moments.first_at` is in the same period; `new <= people`; known = the rest (derived by contracts). `before` is the same on `[v_prior, v_start)`.
- **By channel, as people**: `count(distinct contact_id)` per channel (`voice` for the calls), a person once in each channel they used, so the four add to at least `people`.
- **First came**: the NEW people of the window by `coalesce(acquired_via, 'unknown')`; the values add up to `reached.now.new`. Erased people are out (`live`).
- **Consent**: events in `[v_prior, v_stop)` for a live subject, `data->>'consent' in ('opted_in','opted_out')`, `coalesce(data->>'source','') not in ('merge','stop')`, one per (person, purpose, answer, period) by `distinct on`, taking the earliest event's `source`. `purpose` reads absent as `messages`, `marketing` as `offers`, `email_marketing` as `email_offers`. `yes` is `opted_in`, `stop` is `opted_out`; `by_source` and `by_purpose` are of the window only, `before` is totals.
- **Email stopped**: `contact.email_suppressed` events of the window for live subjects, one per person (the earliest event's `reason`), `by_reason` adding up to `total`.
- **Steps**: `person_notes` of live people with `due_on is not null` and `done_at` in the window; `on_time` where `(done_at at time zone v_tz)::date <= due_on` (the workspace's day), so `done - on_time` are late. Steps are state, not history: a step marked done and then undone leaves the count, and one whose day was moved after it was done is judged by its day now (the header says so).

The CTE list, in order: `periods(is_now)`; `real_msgs` (`not materialized`, as 00380); `live`; `reach_msgs` and `reach_calls` (each carrying `contact_id`, `channel`, `is_now`, joined to `live`) and `reach_rows` (their `union all`); `reach_people` (distinct `contact_id, is_now`); `firsts` (`contact_first_moments` with `is_now` true/false for a first moment in the window/the period before, null otherwise); `new_people` (`reach_people` joined to `firsts` on both columns); `reach_stats`, `channel_stats`; `first_came`; `consent_ev` (`distinct on`) and `consent_stats`; `email_ev`; `steps_done`; the final `jsonb_build_object` with `coalesce(..., '{}'::jsonb)` for the open-keyed objects and zeros (never null) for the closed ones. The window is 00380's, copied: `v_days := least(greatest(coalesce(p_days, 30), 1), 90)`, `v_today`, `v_end := least(coalesce(p_end, v_today), v_today)`, `v_start`, `v_prior`, `v_stop`. Indexes it reads: `messages_tenant_inbound_recent`, `calls_tenant_started`, `events_tenant_kind_created`, `person_notes_steps_open` is not used (done steps are filtered by `done_at` over the tenant's notes, bounded by the window). The header says: the reached population is not `report_series.messages_in` (messages, any person's), nor People's lists (as of now); `contact_first_moments` is a scan of every contact of the workspace that `report_series` already pays, so opening the People lens pays it twice (Open question 2).

- [ ] **Step 1: Write the failing database tests** (`people-series.db.test.mjs`, service-role client, the helpers of `receptionist-series.db.test.mjs`: `workspace(slug, timezone)`, `person`, `inbound`, `dayAt`, `ago`; `events` are removed by hand with the tenant). Seven tests; each builds its own world and removes it:
  1. **"who reached you: people, not messages; new and known; now and before"** (UTC, `p_days: 7`; `dayAt(n, h)` = hour `h` UTC `n` days ago). A: whatsapp text at `dayAt(2,9)`, `dayAt(2,10)`, `dayAt(1,9)` and an email at `dayAt(1,11)`. B: an email at `dayAt(1,12)` and a whatsapp at `dayAt(30,12)`. C: only an email with `claim: "auto_reply"` at `dayAt(1,8)`. D: only an outbound `ai` message at `dayAt(1,8)`. E: an inbound call, `ended`, 60 s, at `dayAt(3,15)`. F: an inbound `not_connected` call. G: an outbound connected call. H: erased with a whatsapp at `dayAt(1,9)`. I: a contact with `merged_into_contact_id` = A's, a whatsapp at `dayAt(1,9)`. J: a whatsapp with `meta.backfill: "true"` at `dayAt(1,9)`. K: only a whatsapp at `dayAt(9,10)`. L: whatsapp at `dayAt(10,10)` and `dayAt(40,10)`. M: whatsapp at `dayAt(9,9)` and `dayAt(2,9)`. Expect `reached` = `{ now: { people: 4, new: 2 }, before: { people: 3, new: 2 } }` (now: A, B, E, M, new A and E; before: K, L, M, new K and M).
  2. **"by channel, as people: a person is in each channel they reached you on; and the new count is the one Reports and Today say"**: on test 1's world less H, I and J (a merge moves a person's messages; erased and moved-in are test 1's), `by_channel` = `{ now: { whatsapp: 2, sms: 0, email: 2, voice: 1 }, before: { whatsapp: 3, sms: 0, email: 0, voice: 0 } }`, and `reached.now.new` equals the sum of `report_series(p_days: 7)`'s last seven `new_contacts` and `metrics_summary(p_days: 7).period.new_contacts`.
  3. **"how they first came: the new people of the window by acquired_via, null as unknown, the known and the erased left out"**: new people X1, X2 (`acquired_via` set to `whatsapp` by an update after their messages), X3 `call`, X4 `ad`, X5 null; a known person Y with `manual`; an erased Z with `import`. Expect `first_came.by_via` = `{ whatsapp: 2, call: 1, ad: 1, unknown: 1 }`, and its values sum to `reached.now.new`.
  4. **"yeses and stops: one a person, a kind of message and an answer; a merge and a stop are no person's own; live people only"**: events inserted with chosen `created_at`. P1: `opted_in`/`customer_message` (no purpose) twice in the window, `opted_in`/`form` with `purpose: "marketing"`. P2: `opted_in`/`in_person`, and `opted_in` with `source: "merge"`. P4: `opted_out`/`customer_message`. P5: `opted_out`/`carrier`. P6: `opted_out`/`unsubscribe` with `purpose: "email_marketing"`, and `consent: "unknown"`/`stop` with `purpose: "marketing"`. P7 erased with an `opted_in`. P10: `opted_in`/`customer_message` and then `opted_out`/`customer_message`, both without a purpose, in the window (a person who changed their answer counts once in each). Before the window: P8 `opted_in` once, P9 `opted_out` twice (two purposes). Expect `consent.now.yes` = `{ total: 4, by_source: { customer_message: 2, form: 1, in_person: 1 }, by_purpose: { messages: 3, offers: 1, email_offers: 0 } }`, `consent.now.stop` = `{ total: 4, by_source: { customer_message: 2, carrier: 1, unsubscribe: 1 }, by_purpose: { messages: 3, offers: 0, email_offers: 1 } }`, `consent.before` = `{ yes: 1, stop: 2 }`.
  5. **"email that stopped working: a person once, by the first reason, live people only"**: P1 `hard_bounce` then `complaint` in the window, P2 `complaint`, P3 erased `provider`, P4 `hard_bounce` before the window. Expect `{ total: 2, by_reason: { hard_bounce: 1, complaint: 1 } }`.
  6. **"steps done in the workspace's own day: on its day or before is on time, after is late"** (an `Pacific/Auckland` workspace; notes inserted as the service role with `team_only: true`; dates computed with `Intl` from the same instants): S1 due day D, done 23:30 local on D (on time); S2 due D, done 00:30 local on D+1 (late); S3 due D+1, done two days before D (on time); S4 open (`done_at` null); S5 done 40 days ago; S6 a step of an erased person (its notes are deleted with them: the test erases after inserting). Expect `steps` = `{ done: 3, on_time: 2 }`.
  7. **"a window that ended, a zone east of UTC, a workspace with nothing, an unknown workspace"**: `p_end = today - 3` counts a message at `today - 4` and not one at `today - 1`, `end` is that day and `today` the real one; `p_end = today + 5` reads as today; in an Auckland workspace a message at 23:50 local the day before the window's first day is not in `reached.now` and one at 00:10 local on that day is (instants computed with `Intl`); a workspace with no rows answers `reached` zeros, `by_channel` zeros, `first_came.by_via = {}`, `consent.now.yes = { total: 0, by_source: {}, by_purpose: { messages: 0, offers: 0, email_offers: 0 } }`, `email_stopped = { total: 0, by_reason: {} }`, `steps = { done: 0, on_time: 0 }` and no error; `people_series(gen_random_uuid())` answers `{ error: "unknown_tenant" }`.

- [ ] **Step 2: Run to see them fail**

Run: `corepack pnpm test:db -- tooling/scripts/tests/reports/people/people-series.db.test.mjs`
Expected: FAIL (`Could not find the function public.people_series`).

- [ ] **Step 3: Write the migration.** Header (what it adds, the rule of each part above, the live predicate, the edge between the Overview's new count and this one, either deploy order works: the dashboard answers "no read yet" in words until this is applied, `isMissingDoor`), `set local lock_timeout = '3s';`, then the function with the CTEs above. Apply with `supabase migration up --local`; `node tooling/scripts/checks/migration-ledger.mjs --record`; `corepack pnpm gen:schema-snapshot`; `corepack pnpm gen:db-types`; `corepack pnpm gen:schema-sets` (no change expected).

- [ ] **Step 4: Run to verify**, on the stack: the new file; `tooling/scripts/tests/reports/people/first-moments.db.test.mjs`; `tooling/scripts/tests/reports/periods/report-window.db.test.mjs`; `tooling/scripts/tests/database/reads-go-through-their-own-rows.db.test.mjs`; then without it `tooling/scripts/tests/database/migrations.test.mjs`, `tooling/scripts/tests/database/migration-ledger.test.mjs`, `tooling/scripts/tests/docs/data-model.test.mjs` (functions only: no table moves).
Expected: PASS. **When this step is green the database work is done: ask the controller to stop the stack (`supabase stop --no-backup`).**

- [ ] **Step 5: Stage**

```bash
git add supabase/migrations/00395_the_people_lens_is_read_beyond_the_days_counts.sql supabase/migrations-ledger.json supabase/schema.sql packages/db/src/database.types.ts tooling/scripts/tests/reports/people/people-series.db.test.mjs
```

---

### Task 3: The repository: `peopleSeries`

**Files:**
- Modify: `packages/db/src/repositories/reports/report-series.ts` (after `receptionistSeries`, which starts at line 91; the header comment names `people_series` too), `packages/db/src/index.ts` (line ~219, beside `receptionistSeries`)
- Modify (built): `packages/db/dist/*`
- Test: `tooling/scripts/tests/reports/report-repository.test.mjs` (extend; copy the `receptionistSeries` cases at lines 170-200)

**Interfaces:**
- Consumes: `windowArgs`, `ReportWindow` (`report-series.ts`), `isMissingDoor` (`packages/db/src/repositories/templates.ts`).
- Produces: `peopleSeries(db: Db, tenantId: string, window: ReportWindow): Promise<Json | null>`: the function's answer; `null` on a database without the function (PostgREST `PGRST202`, via `isMissingDoor`), for a period or a window naming its last day alike; any other failure throws `Error("people_series: ...")`. The one place the function is called by name.

- [ ] **Step 1: Write the failing tests** (in `report-repository.test.mjs`, the file's own fake database and scripted `rpc`s, as the `receptionistSeries` cases do): `peopleSeries asks people_series for the window, naming the last day only when it is not today` (`{ days: 30, end: null }` asks `{ p_tenant_id, p_days: 30 }`; `{ days: 20, end: "2026-09-20" }` adds `p_end`); `peopleSeries is null where the database does not have the function yet (00395 not applied), for a period and for picked days, and throws for any other failure` (`PGRST202` -> null both ways; `XX000` -> rejects with `/people_series: boom/`).

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-repository.test.mjs`
Expected: FAIL (`peopleSeries` is not exported).

- [ ] **Step 3: Implement** `peopleSeries` exactly as `receptionistSeries` with `"people_series"`, its header comment saying 00395 and the deploy order (null = no function yet; the lens then draws the book and its kept cards); export it from `packages/db/src/index.ts`; `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**: `report-repository.test.mjs`, then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (the `.rpc("...")` count is inside `packages/db`, which is allowed). `peopleSeries` is read by Task 9's reader (dead until then).
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add packages/db/src/repositories/reports/report-series.ts packages/db/src/index.ts tooling/scripts/tests/reports/report-repository.test.mjs packages/db/dist
```

---

### Task 4: The kit's Figure gains a tone

**Files:**
- Modify: `apps/dashboard/src/surfaces/kit/figure/figure.tsx`, `apps/dashboard/src/surfaces/kit/figure/figure.type-test.ts`, `apps/dashboard/src/surfaces/kit/kit.css` (the Figure block, lines 4300-4385), `apps/dashboard/src/surfaces/kit/classes.json` (`is-fail` and `is-warn` under `modifiers`, sorted), `tooling/scripts/e2e-harness/kit-gallery.mjs` (the `figure` helper at line 598 and the Figure family at line 1833), `tooling/scripts/tests/styles/kit-components.test.mjs`, `packages/contracts/src/reports/report-tiles.ts` (`ReportTileVM` and `ReportStripTile`), `apps/dashboard/src/surfaces/reports/blocks.tsx` (`RptFigure`)
- Modify (built): `packages/contracts/dist/*`
- Test: `kit-components.test.mjs`, `figure.type-test.ts` (compiled by `tsc`), `tooling/scripts/tests/styles/kit-gallery.test.mjs`, `tooling/scripts/tests/reports/reports-page.test.mjs`

**Interfaces:**
- Consumes: `Figure` (`figure.tsx`), `cx`.
- Produces: `FigureProps.tone?: "warn" | "fail"` ("what needs you" / "what failed"): the figure wears `is-warn` or `is-fail` and its VALUE (never its change) is read in `var(--warn-ink)` or `var(--danger-ink)`; `ReportTileVM.tone?: "warn" | "fail"` and `ReportStripTile` picks it; `RptFigure` passes `tone={t.tone}`. No existing tile sets it.

- [ ] **Step 1: Write the failing tests.** `figure.type-test.ts`: positives `Figure({ label: "Steps overdue", value: "6", tone: "warn" })` and `tone: "fail"`; a `Holds<Exactly<FigureProps["tone"], "warn" | "fail" | undefined>>`; negatives under `// @ts-expect-error a tone is the kit's two, never a colour` for `tone: "ok"` and `tone: "var(--warn)"`. `kit-components.test.mjs` (the Figure test and `FIGURES`): `h(Figure, { label: "Steps overdue", value: "6", tone: "warn" })` draws className `"figure is-warn"`, `tone: "fail"` `"figure is-fail"`, none `"figure"`, a thin one with a tone `"figure is-thin is-warn"` (thin first); add `"figure-warn"` and `"figure-fail"` to `FIGURES`. Gallery: the Figure family gains `{ id: "figure-warn", html: figure({ tone: "warn" }) }` and `figure-fail` (the helper adds ` is-warn`/` is-fail` to the div); `kit-gallery.test.mjs` fails a class no entry draws, which holds `is-warn` and `is-fail` to it. `reports-page.test.mjs`: `RptStrip` over a tile with `tone: "warn"` draws a Figure whose props carry `tone: "warn"` (use the file's existing strip test as the shape).

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/kit-components.test.mjs` (FAIL: no `tone`), `corepack pnpm --filter @chanlytics/dashboard typecheck` (FAIL on the type test).

- [ ] **Step 3: Implement.** `figure.tsx`: the prop and `cx("figure", thin && "is-thin", tone && \`is-${tone}\`, className)`; the header comment now says "a figure's CHANGE is never a tone; its value is one only for what needs you or what failed (the reports lenses spec, D10)". `kit.css`, before the thin rule so a thin figure stays dim: `.figure.is-warn .figure-value { color: var(--warn-ink); }` and `.figure.is-fail .figure-value { color: var(--danger-ink); }` (tokens only). `classes.json`, the gallery, `report-tiles.ts` and `blocks.tsx` as above. `node tooling/scripts/gen/contracts-browser-entry.mjs` is not needed (no new name); `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**, one per command: `kit-components.test.mjs`, `kit-gallery.test.mjs`, `tooling/scripts/tests/styles/kit-css.test.mjs`, `reports-page.test.mjs`, `tooling/scripts/tests/reports/reports-vm.test.mjs`, `corepack pnpm --filter @chanlytics/dashboard typecheck`, `corepack pnpm lint`, `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`.
Expected: PASS, with `style-values.json` and `kit-primitives.json` unmoved.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/surfaces/kit/figure apps/dashboard/src/surfaces/kit/kit.css apps/dashboard/src/surfaces/kit/classes.json tooling/scripts/e2e-harness/kit-gallery.mjs tooling/scripts/tests/styles/kit-components.test.mjs packages/contracts/src/reports/report-tiles.ts apps/dashboard/src/surfaces/reports/blocks.tsx tooling/scripts/tests/reports/reports-page.test.mjs packages/contracts/dist
```

---

### Task 5: The mix helpers move to one page-only module

**Files:**
- Create: `packages/contracts/src/reports/report-mix.ts`
- Modify: `packages/contracts/src/reports/receptionist/receptionist-words.ts` (`MixEntry`, `ownWord`, `rankedEntries` leave), `packages/contracts/src/reports/receptionist/receptionist-report.ts` (`MixPartVM`, `barsOf`, `mixOf`, `noMix` leave), `packages/contracts/src/reports/report-lens.ts` (the `MixPartVM` type now from `report-mix`), `tooling/scripts/gen/contracts-browser-entry.mjs` (`PAGE_ONLY` gains `"reports/report-mix.ts"` after `"reports/report-window.ts"`), `packages/contracts/src/browser.generated.ts` (regenerated), `tooling/scripts/tests/shipping/browser-entry.test.mjs` (the `PAGE_ONLY` list)
- Modify (built): `packages/contracts/dist/*`

**Interfaces:**
- Consumes: the moved code, byte for byte.
- Produces: `report-mix.ts` exporting `type MixEntry = [id: string, label: string, value: number]`, `interface MixPartVM { rows: ReportBarVM[]; line: string | null; empty: string | null }`, `ownWord(words, key)`, `rankedEntries(counts, labelOf): MixEntry[]` (most first, the key's own order between equals), `barsOf(entries): ReportBarVM[]`, `mixOf(entries, line): MixPartVM`, `noMix(empty): MixPartVM`. Two lenses read them (the Receptionist's now, People's in Task 7).

- [ ] **Step 1: Write the failing test.** In `browser-entry.test.mjs`, the `PAGE_ONLY` list becomes `["reports/report-metrics.ts", "reports/report-window.ts", "reports/report-mix.ts", "reports/receptionist/receptionist-report.ts", "reports/receptionist/receptionist-words.ts"]` (the test already asserts every path names a file).

- [ ] **Step 2: Run to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs`
Expected: FAIL (the list and the missing file).

- [ ] **Step 3: Implement** the move with the editor tool (cut from the two modules, paste into `report-mix.ts`, import back; the Receptionist's behaviour is unchanged). `report-mix.ts` imports `ReportBarVM` as a type from `./reports` and nothing else. `node tooling/scripts/gen/contracts-browser-entry.mjs`; `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**, one per command: `browser-entry.test.mjs`, `tooling/scripts/tests/reports/receptionist/receptionist-report.test.mjs` (14 tests, unchanged), the same under `TEST_TZ=Pacific/Auckland` (PowerShell: `$env:TEST_TZ='Pacific/Auckland'; node tooling/scripts/checks/test.mjs ...`), `tooling/scripts/tests/reports/receptionist/receptionist-page.test.mjs`, `tooling/scripts/tests/repo/contracts-barrels.test.mjs`, `tooling/scripts/tests/repo/contracts-import-cycles.test.mjs`, `corepack pnpm --filter @chanlytics/contracts typecheck`, `corepack pnpm --filter @chanlytics/dashboard typecheck`.
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add packages/contracts/src/reports/report-mix.ts packages/contracts/src/reports/receptionist packages/contracts/src/reports/report-lens.ts tooling/scripts/gen/contracts-browser-entry.mjs packages/contracts/src/browser.generated.ts tooling/scripts/tests/shipping/browser-entry.test.mjs packages/contracts/dist
```

---

### Task 6: Contracts: the People DTO, its guard, and the book as the pool counts it

**Files:**
- Create: `packages/contracts/src/reports/people/people-record.ts`, `packages/contracts/src/reports/people/people-now.ts`, `tooling/scripts/tests/reports/people/_people-world.mjs`, `tooling/scripts/tests/reports/people/people-record.test.mjs`, `tooling/scripts/tests/reports/people/people-pool.test.mjs`
- Modify: `packages/contracts/src/reports/index.ts` (named exports), `packages/contracts/src/browser.generated.ts` (regenerated)
- Modify (built): `packages/contracts/dist/*`

**Interfaces:**
- Consumes: `PersonRowDto` (`people/person-dto.ts`), `poolRowsOf`, `poolListContext` (`people/audience-pool.ts`), `membersOf`, `resolveList`, `BUILTIN_LISTS`, `ruleNeeds` (`people/lists/lists.ts`, `list-rules.ts`), `QUIET_AFTER_DAYS` (`people/person-state.ts`), `ChannelsReady` (`broadcasts/reach-for.ts`), `PersonRowVM` fields `heardDays`, `nextStep`, `emailSuppressed`, `channels`.
- Produces (exported through `reports/index.ts`; the server reads them, a page imports only types):

```ts
// people-now.ts: the book as it stands now. Counts only; nothing of a person leaves.
export interface PeopleNowDto {
  people: number;                                        // live people the pool holds
  fresh: { under_7: number; d7_30: number; d31_60: number; d61_90: number; d91_up: number; never: number };
  lists: { opted_in: number; offers_ok: number; opted_out: number; quiet: number };   // People's own lists, counted by membersOf
  steps: { overdue: number; due_today: number };          // people whose EARLIEST open step's day is before / is today
  email_stopped: number;                                  // PersonRowVM.emailSuppressed
  wires: { whatsapp_only: number; sms_only: number; phone_only: number; email_only: number; several: number; none: number };
}
export function peopleNowOf(rows: readonly PersonRowDto[], o: { tz: string; nowMs: number; ready: ChannelsReady | null }): PeopleNowDto
// people-record.ts
export interface PeopleSeriesDto { /* people_series's own answer (Task 2's shape), timezone, today, end?, days, reached, by_channel, first_came, consent, email_stopped, steps */ }
export interface PeopleDto { timezone: string; today: string; end?: string; days: number; series: PeopleSeriesDto | null; now: PeopleNowDto | null }
export function isPeopleSeriesDto(answer: unknown): answer is PeopleSeriesDto   // timezone, today, days, reached and consent present; false for { error }
export function peopleDtoOf(series: PeopleSeriesDto | null, parts: { now: PeopleNowDto | null; head: { timezone: string; today: string; end?: string; days: number } }): PeopleDto
```

`peopleNowOf` builds the rows once with `poolRowsOf(rows, { tz, now: new Date(nowMs), viewer: null, dealsOn: false, ready })` and counts from them: `fresh` by `heardDays` (null: `never`; below 7: `under_7`; to 30: `d7_30`; 31-60, 61-90, 91+: the rest; the edges are `[7, QUIET_AFTER_DAYS + 1, 61, 91]` so the last three add up to the Quiet list); `lists` each by `membersOf(resolveList({ kind: "builtin", id }, []), vms, poolListContext({ calendar: "none", dealsOn: false, consultFirst: false, viewer: null }))`, and an `unknown` membership throws `Error("People's list <id> cannot be counted without a viewer")` (the reader logs it and the book half is `null`: a count is never made up); `steps` by `nextStep.due` (`past`, `today`); `wires` by `channels` (one: its name only; two or more: `several`; none: `none`). `peopleDtoOf` is pure: with `series === null` the DTO carries the window from `parts.head`; otherwise from the series (`end` only where present).

- [ ] **Step 1: Write the failing tests.** `_people-world.mjs` holds the lens's facts for Harbor Studio's 30 days, as the Receptionist's world does: `SERIES` (reached `now {40, 12}`, `before {31, 8}`; `by_channel` now `{ whatsapp: 25, sms: 3, email: 6, voice: 11 }`, before `{ whatsapp: 20, sms: 2, email: 5, voice: 7 }`; `first_came.by_via` `{ whatsapp: 5, call: 3, ad: 1, calendar: 1, unknown: 2 }`; consent now `yes { total: 9, by_source: { customer_message: 6, form: 2, in_person: 1 }, by_purpose: { messages: 6, offers: 2, email_offers: 1 } }`, `stop { total: 4, by_source: { customer_message: 2, carrier: 1, unsubscribe: 1 }, by_purpose: { messages: 2, offers: 1, email_offers: 1 } }`, before `{ yes: 7, stop: 2 }`; `email_stopped { total: 2, by_reason: { hard_bounce: 1, complaint: 1 } }`; `steps { done: 11, on_time: 8 }`), `POOL` (`people: 520`, `fresh { under_7: 60, d7_30: 140, d31_60: 90, d61_90: 70, d91_up: 110, never: 50 }`, `lists { opted_in: 340, offers_ok: 40, opted_out: 22, quiet: 270 }`, `steps { overdue: 6, due_today: 3 }`, `email_stopped: 4`, `wires { whatsapp_only: 300, sms_only: 20, phone_only: 60, email_only: 40, several: 70, none: 30 }`), `QUIET` (every window count 0, `by_via: {}`, the book unchanged), `dtoWith(over, pool)` (`timezone "America/New_York"`, `today "2026-09-04"`, `days 30`) and `held(dto, key)` for the surface (`{ dto, key }`). The facts add up (fresh to 520, quiet to 90 + 70 + 110, wires to 520, `by_via` to 12).
  - `people-record.test.mjs`: `isPeopleSeriesDto` is true for the full answer and false for `{ error: "unknown_tenant" }`, for a body without `reached`, and for `null`; `peopleDtoOf(SERIES, ...)` echoes the series' window (`end` only where it has one) and carries `now` as given; `peopleDtoOf(null, { now: POOL, head })` is `{ ...head, series: null, now: POOL }`; with `now: null` the book is null and the series stands (each half alone).
  - `people-pool.test.mjs` (rows built like `tooling/scripts/tests/people/people-vm.test.mjs`'s `row()`; NOW 4 Sep 2026 16:00Z, zone `America/New_York`; `ready()` as `tooling/scripts/tests/consent/reach-any.test.mjs` builds it): **"the book as the pool counts it"**: rows heard 2 hours ago, 7, 30, 31, 61 and 91 days ago, and never (no inbound message, no inbound call) fall in `under_7`, `d7_30`, `d7_30`, `d31_60`, `d61_90`, `d91_up`, `never`; a row whose only contact is its own outbound message is `never`; `people` is the row count. **"the last three buckets are the Quiet list"**: `d31_60 + d61_90 + d91_up === lists.quiet`, and a person heard 30 days ago is in neither. **"steps: the earliest open step decides"**: a person with a step due yesterday and another due next week is overdue once; due today is `due_today`; a step due tomorrow, a done step and no step are neither; `overdue + due_today` equals the Steps due list's own count. **"channels per person"**: a row with `channels: ["whatsapp"]` is `whatsapp_only`, `["sms"]`, `["voice"]` (a person who only phoned) and `["email"]` likewise, two or more `several`, none `none`. **"a stopped address"**: `email_suppressed_at` set counts once. **"it is what People's rail says"**: `peopleSurfaceOf({ tz, people: rows, page: null, saved: [], calendar: { state: "none", source: "your calendar" }, bookingLink: null, dealsOn: false, consultFirst: false, dealPace: null, followUp: null, channelsReady: ready, views: {}, viewsRead: true }, null, new Date(NOW))` lists `opted_in`, `offers_ok`, `opted_out`, `quiet` and `steps_due` with the counts `peopleNowOf` gives (`steps_due` = overdue + due today), for `ready()` with WhatsApp, with WhatsApp unable to send (`offers_ok` 0 in both, `opted_in` unchanged) and with `null` (WhatsApp alone). **"none of the five lists is about whoever is looking"**: `ruleNeeds` of `BUILTIN_LISTS` ids `opted_in`, `offers_ok`, `opted_out`, `steps_due` and `quiet` is `[]` (a rule that gains a need fails this first). **"days are the workspace's"** (`Pacific/Auckland`, NOW local 00:10): a person last heard at 23:50 local 31 calendar days earlier is in `d31_60` and the Quiet list although 30 days and 20 minutes have passed.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/people/people-record.test.mjs`
Expected: FAIL (`isPeopleSeriesDto` is not exported).

- [ ] **Step 3: Implement** the two modules and the barrel names (`PeopleDto`, `PeopleNowDto`, `PeopleSeriesDto` as types; `isPeopleSeriesDto`, `peopleDtoOf`, `peopleNowOf` as values). Each function is small and under the limits (one per part of the book). `node tooling/scripts/gen/contracts-browser-entry.mjs`; `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**, one per command: `people-record.test.mjs`, `people-pool.test.mjs`, each again under `TEST_TZ=Pacific/Auckland`, `tooling/scripts/tests/repo/contracts-barrels.test.mjs`, `tooling/scripts/tests/repo/contracts-import-cycles.test.mjs` (a Reports module importing People's: no People module imports Reports), `tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, `corepack pnpm --filter @chanlytics/contracts typecheck`, `corepack pnpm --filter @chanlytics/dashboard typecheck`.
Expected: PASS. `peopleNowOf`, `peopleDtoOf` and `isPeopleSeriesDto` are read by Task 9's reader (dead until then).

- [ ] **Step 5: Stage**

```bash
git add packages/contracts/src/reports/people/people-record.ts packages/contracts/src/reports/people/people-now.ts packages/contracts/src/reports/index.ts packages/contracts/src/browser.generated.ts tooling/scripts/tests/reports/people packages/contracts/dist
```

---

### Task 7: Contracts: the People fold, its words and its ten figures (page-only)

**Files:**
- Create: `packages/contracts/src/reports/people/people-words.ts`, `packages/contracts/src/reports/people/people-report.ts`, `tooling/scripts/tests/reports/people/people-report.test.mjs`
- Modify: `packages/contracts/src/reports/report-lens.ts` (exports `toPeopleReportVM`, `PEOPLE_RHYTHM_UNIT`, the types), `packages/contracts/src/reports/index.ts` (named exports), `packages/contracts/src/reports/report-tiles.ts` (ten metric ids), `packages/contracts/src/reports/report-metrics.ts` (ten definitions), `tooling/scripts/gen/contracts-browser-entry.mjs` (`PAGE_ONLY` gains `"reports/people/people-report.ts"` and `"reports/people/people-words.ts"`), `packages/contracts/src/browser.generated.ts` (regenerated), `tooling/scripts/tests/shipping/browser-entry.test.mjs` (the list and `toPeopleReportVM` absent from the entry, present in `dist/report-lens.js`), `tooling/scripts/tests/reports/lenses/report-metric-words.test.mjs` (the count is 36; the ten ids)
- Modify (built): `packages/contracts/dist/*`

**Interfaces:**
- Consumes: `PeopleDto`, `PeopleNowDto`, `PeopleSeriesDto` (Task 6), `MixPartVM`, `mixOf`, `noMix`, `rankedEntries`, `barsOf` (Task 5), `ReportStripTile` (with `tone`, Task 4), `REPORT_MIN_N`, `compareWords`, `beforeWords` (`report-tiles.ts`), `rangeLabelOf` (`reports.ts`), `PERSON_CAME_FROM_WORDS`, `PERSON_CHANNEL_WORDS` (`people/person-words.ts`, a leaf with no imports: it drags nothing into the page entry), `plural` (`shared/words`).
- Produces (the fold and its types also through `report-lens.ts`):

```ts
export type PeopleFigureVM = ReportStripTile;               // tone on the stuck figures
export interface PeopleReportVM {
  head: string | null;                                       // null: no window read, the frame's sentence stands
  windowAvailable: boolean;                                  // false: the database has no people_series yet
  nowAvailable: boolean;                                     // false: the pool could not be read
  strip: PeopleFigureVM[];                                   // [people who reached you, new people, yeses won, stops]
  channels: MixPartVM; firstCame: MixPartVM; yeses: MixPartVM; stops: MixPartVM;
  stepsDone: MixPartVM; emailStopped: MixPartVM;             // the window
  wires: MixPartVM;                                          // channels per person, as of now
  fresh: MixPartVM & { quiet: { line: string; door: string; label: string } | null };
  stuck: PeopleFigureVM[];                                   // [steps overdue, steps due today, email stopped working]
  stand: PeopleFigureVM[];                                   // [said yes to messages, can receive offers, opted out, quiet 30+ days]
}
export function toPeopleReportVM(dto: PeopleDto): PeopleReportVM
export const PEOPLE_RHYTHM_UNIT = "messages and calls";     // the kept rhythm card's unit (the frame's week and hours count both)
```

Ten new `ReportMetric` ids with a definition each in `report-metrics.ts` (each a sentence that says what is counted and ends "... are not counted."): `people_reached`, `yeses_won`, `stops_recorded`, `steps_overdue`, `steps_due_today`, `email_stopped_now`, `said_yes_messages`, `can_receive_offers`, `opted_out_now`, `quiet_now` (`new_people` already exists and was redefined in Task 1). Their gist: reached = wrote in their own words or phoned and was spoken to, counted once however often, with automatic mail, calls we placed, rang-out calls, moved-in history and the erased left out; yeses and stops = one answer a person for each kind of message (their visit, offers, offers by email), in their own words or recorded at the desk, with a merge restating an answer, a STOP ending a yes to offers and an import (which never records a yes) left out; steps = people whose EARLIEST open step's day is before / is today, as of now whatever period is picked, a step with no day, a done step and a later step left out; email stopped = people whose address bounced for good, complained or was stopped by the provider, as of now, no phone number being recorded as bad; said yes / can receive / opted out / quiet = People's own lists as of now, whatever period is picked, quiet being more than 30 days since THEY wrote or called (our own messages not theirs, never-heard not quiet). The words (`people-words.ts`), exact:
- **Head** `N` people who reached you, `M` new, `K` new before (all of the window), `P` people in the book and `Y` on the Said yes to messages list (both of the pool): `N === 0`: `"Nobody reached you in this period"`; else `` `${plural(N, "person", "people")} reached you, ${M} new` `` plus, when the period before had people, ` (${K === 0 ? "none" : K} ${beforeWords(rangeLabelOf(days))})`; then, when the book was read and `P >= REPORT_MIN_N`, `` `; ${Y} of ${P} have said yes to messages` ``; then `"."`. Example: `"40 people reached you, 12 new (8 the 30 days before); 340 of 520 have said yes to messages."`. `head` is null when the window is unavailable.
- **Strip** (all four: `compare` is `compareWords(now, before, rangeLabelOf(days), priorHad)` with `priorHad` true when the period before had any person, yes or stop): "People who reached you" (`people_reached`) value `N`, meta `"nobody wrote or called in this period"` for 0, else `` `${M} new · ${N - M} you knew already` ``; "New people" (`new_people`) value `M`, meta `"nobody new"` or `` `of the ${N} who reached you` ``, `n: N` and `minN: REPORT_MIN_N` when `N > 0`; "Yeses won" (`yeses_won`) value `Y`, meta the nonzero of `` `${n} to messages` ``, `` `${n} to offers` ``, `` `${n} to email offers` `` joined by `" · "`, else `"nobody said yes in this period"`; "Stops" (`stops_recorded`) value `S`, meta the nonzero of `` `${n} stopped all messages` ``, `` `${n} stopped offers` ``, `` `${n} stopped email offers` `` joined, else `"nobody asked to stop in this period"`.
- **Mix** (rows most first, zero rows left out unless said; each part has `line` or `empty`, never both): `channels` labels `PERSON_CHANNEL_WORDS` (WhatsApp, Text, Phone, Email), line `"A person who reached you more than one way is counted in each."`, empty `"Nobody reached you in this period."`; `firstCame` labels `PERSON_CAME_FROM_WORDS` plus `ad: "An ad"` and `unknown: "Not recorded"` always LAST, line `` `${known} of ${M} new people have a recorded way in.` ``, empty `"Nobody new reached you in this period."` for `M = 0` and `` `No way in is recorded for the ${plural(M, "new person", "new people")}.` `` when none is recorded; `yeses` (`customer_message` "Their own message", `form` "A form", `in_person` "In person", `phone` "By phone", any other key summed as "Another way", so the rows add up to the total), line `"Each person is counted once for each kind of message they said yes to."`, empty `"Nobody said yes in this period."`; `stops` (`customer_message` "Their own STOP", `carrier` "The carrier", `unsubscribe` "An unsubscribe", `complaint` "A complaint", `reply` "A reply", `whatsapp` "WhatsApp's offers stop", `in_person`, `phone`, `form` and `operator` summed as "Recorded by a member", any other "Another way"), line `"Each person is counted once for each kind of message they stopped."`, empty `"Nobody asked to stop in this period."`; `stepsDone` rows "Done on or before their day" (`on_time`) and "Done after their day", line `` `${on_time} of ${done} were done on or before their day.` `` when `done >= REPORT_MIN_N`, `` `${plural(done, "step was", "steps were")} done in this period.` `` when fewer (a share of fewer than five is not said), empty `"No step was done in this period."`; `emailStopped` labels `hard_bounce` "Bounced for good", `complaint` "Marked as spam", `provider` "Stopped by the email provider" (any other key, underscores to spaces), line `` `${plural(total, "address", "addresses")} stopped working in this period.` ``, empty `"No address stopped working in this period."`.
- **Book** (null parts when the pool was not read): `wires` in the order WhatsApp only, Text only, Phone only, Email only, "More than one way", "None yet" (zero rows left out), line `` `${several} of ${people} have reached you more than one way.` `` when `several > 0`, empty `"Nobody is in your book yet."` for 0 people; `fresh` six rows in time order, all kept (a bucket of 0 is a true count): "Under 7 days", "7 to 30 days", "31 to 60 days", "61 to 90 days", "91 days or more", "Never heard from", line `` `Of ${people} people: the days since they last wrote or called. Your own messages do not count.` ``, empty as `wires`, and `quiet` = `{ line: \`${plural(q, "person has", "people have")} been quiet for more than 30 days.\`, door: "clients/seg:quiet", label: "Quiet 30+ days" }` when `q > 0` (`q` = `lists.quiet`).
- **Stuck** (a count with its door; `tone`: `warn` on overdue when above 0, `fail` on email when above 0): "Steps overdue" (`steps_overdue`), meta `"no next step is past its day"` or `"people whose next step is past its day"`, door `clients/seg:steps_due`; "Steps due today" (`steps_due_today`), meta `"no next step is due today"` or `"people whose next step is due today"`, the same door; "Email stopped working" (`email_stopped_now`), meta `"every address works"` or `"people whose address no longer receives your email"`, no door.
- **Stand** (each `n: people`, `minN: REPORT_MIN_N`, meta `` `of ${people} people` `` or `"nobody is in your book yet"`): "Said yes to messages" (`said_yes_messages`, door `clients/seg:opted_in`), "Can receive offers" (`can_receive_offers`, `clients/seg:offers_ok`), "Opted out" (`opted_out_now`, `clients/seg:opted_out`), "Quiet 30+ days" (`quiet_now`, `clients/seg:quiet`). A test holds these four labels to `BUILTIN_LISTS`' own.

- [ ] **Step 1: Write the failing tests** (`people-report.test.mjs`, importing from `@chanlytics/contracts`; the world of Task 6):
  - `"the head: how many reached you, how many were new, and how many of the book have said yes"`: `toPeopleReportVM(dtoWith()).head` equals the example above; with `reached.before.people: 0` there is no parenthesis; with `reached.before.new: 0` and people before, `(none the 30 days before)`; with `POOL.people: 4` the clause is absent; with `now: null` the head ends after the window's words; with `series: null` the head is null; `reached.now.people: 0` gives `"Nobody reached you in this period"` and the clause.
  - `"the strip: people, new people, yeses and stops, each against the period before"`: the four figures' labels, values, metas and `compare` are `"up from 31"`, `"up from 8"` (with `n: 40, minN: 5`), `"up from 7"` and `"up from 2"`, values `"40"`, `"12"`, `"9"`, `"4"`, metas `"12 new · 28 you knew already"`, `"of the 40 who reached you"`, `"6 to messages · 2 to offers · 1 to email offers"`, `"2 stopped all messages · 1 stopped offers · 1 stopped email offers"`; `new people` with 3 reached carries `n: 3` (the kit greys it).
  - `"the mix says its rows and its line"`: `channels.rows` start `["WhatsApp", 25]`, `["Phone", 11]`, `["Email", 6]`, `["Text", 3]`; `firstCame` ends with `["Not recorded", 2]` although `WhatsApp` is 5 and its line is `"10 of 12 new people have a recorded way in."`; with every person unknown the part has `empty` `"No way in is recorded for the 12 new people."` and no rows; `yeses.rows` are `Their own message 6`, `A form 2`, `In person 1` and a key the words do not know (`"sms_reply": 1`) is summed into "Another way" so the rows add to the total; `stops.rows` sum `in_person`, `phone`, `form` and `operator` as "Recorded by a member"; `stepsDone.line === "8 of 11 were done on or before their day."`, and with `done: 3` it is `"3 steps were done in this period."` (no share); `emailStopped.rows` are `Bounced for good 1`, `Marked as spam 1` and its line `"2 addresses stopped working in this period."`.
  - `"the book as of now"`: `wires.rows` `300, 20, 60, 40, 70, 30` in the order above and its line `"70 of 520 have reached you more than one way."`; `fresh.rows` the six counts in time order and `fresh.quiet` = `{ line: "270 people have been quiet for more than 30 days.", door: "clients/seg:quiet", label: "Quiet 30+ days" }`; `stuck` values `"6"` (tone `warn`), `"3"`, `"4"` (tone `fail`), the first two with door `clients/seg:steps_due`; with every count 0 no figure carries a tone; `stand` values `"340"`, `"40"`, `"22"`, `"270"` with `n: 520`, doors `clients/seg:opted_in`, `offers_ok`, `opted_out`, `quiet` and labels equal to `BUILTIN_LISTS`' (`"Said yes to messages"`, `"Can receive offers"`, `"Opted out"`, `"Quiet 30+ days"`), and `parseListToken("seg:<id>")` resolves each door's id to a built-in.
  - `"nothing in the period: every window part is absent with words, never a zero percentage or NaN, and the book still stands"`: `QUIET` gives the strip values `"0"`, metas `"nobody wrote or called in this period"`, `"nobody new"`, `"nobody said yes in this period"`, `"nobody asked to stop in this period"`, no `compare`; each window mix has its `empty`; the book's parts are the pool's; `JSON.stringify(vm).includes("NaN") === false` and no value contains `"%"`.
  - `"each half alone"`: `{ ...dtoWith(), series: null }` gives `windowAvailable: false`, `head: null`, an empty strip, empty window parts and the full book; `{ ...dtoWith(), now: null }` gives `nowAvailable: false`, no `stuck`, no `stand`, the book parts empty (`noMix(null)`) and the full window.
  - `report-metric-words.test.mjs`: the count of definitions is 36 and each of the ten ids says what is not counted (`/\bnot counted\b/`), is more than 80 characters, ends in a full stop and is unlike every other; `new_people` keeps its place in the Overview's strip. `browser-entry.test.mjs`: `PAGE_ONLY` ends with the two People modules, and `toPeopleReportVM` is absent from `current.names` and present in `dist/report-lens.js`.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/people/people-report.test.mjs`
Expected: FAIL (`toPeopleReportVM` is not exported).

- [ ] **Step 3: Implement** the two modules and the registrations: `people-words.ts` holds the maps and the pure sentence helpers, `people-report.ts` the fold (one small function per part); the ten ids join `ReportMetric` and `METRIC_WORDS` (a `Record`, so a missing definition is a compile error); `reports/index.ts` names every export the server or a test reads; `report-lens.ts` adds `toPeopleReportVM`, `PEOPLE_RHYTHM_UNIT` and the types; the generator's `PAGE_ONLY` gains the two modules (the record modules are not page-only: the server reads them). `node tooling/scripts/gen/contracts-browser-entry.mjs`; `corepack pnpm --filter "./packages/*" build`.

- [ ] **Step 4: Run to verify**, one per command: `people-report.test.mjs` (UTC, and again under `TEST_TZ=Pacific/Auckland`), `report-metric-words.test.mjs`, `browser-entry.test.mjs`, `tooling/scripts/tests/repo/contracts-barrels.test.mjs`, `tooling/scripts/tests/repo/contracts-import-cycles.test.mjs`, `tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, `corepack pnpm --filter @chanlytics/contracts typecheck`, `corepack pnpm --filter @chanlytics/dashboard typecheck`.
Expected: PASS. `toPeopleReportVM` is read by Tasks 11-13 (dead until then).

- [ ] **Step 5: Stage**

```bash
git add packages/contracts/src/reports/people packages/contracts/src/reports/report-lens.ts packages/contracts/src/reports/index.ts packages/contracts/src/reports/report-tiles.ts packages/contracts/src/reports/report-metrics.ts tooling/scripts/gen/contracts-browser-entry.mjs packages/contracts/src/browser.generated.ts tooling/scripts/tests/shipping/browser-entry.test.mjs tooling/scripts/tests/reports/people/people-report.test.mjs tooling/scripts/tests/reports/lenses/report-metric-words.test.mjs packages/contracts/dist
```

---

### Task 8: The head: the frame's new-people sentence, the lens's answer, the registry words

**Files:**
- Modify: `packages/contracts/src/reports/reports.ts` (`ReportLinesVM` line 175 gains `people`; `linesOf` line 671 gains one property; the file grows by about three lines, to well under 800), `packages/contracts/src/reports/report-tiles.ts` (`newPeopleLine` beside `compareWords`), `packages/contracts/src/reports/lens-answer.ts`, `packages/contracts/src/reports/lenses.ts` (the People row's `sub`), `apps/dashboard/src/surfaces/reports/head.ts`, `apps/dashboard/src/surfaces/reports/reports-page.tsx` (its one call of `useReportsStanding` passes `null` for the new `people` until Task 11 folds one, so the tree stays typed)
- Modify (built): `packages/contracts/dist/*`
- Test: `tooling/scripts/tests/reports/reports-lines.test.mjs` (`lines.people` tests join), `tooling/scripts/tests/reports/lenses/report-lenses.test.mjs` (line 194)

**Interfaces:**
- Consumes: `compareWords`, `beforeWords`, `plural`, `PeriodFacts.priorHadAny`.
- Produces:
  - `newPeopleLine(newNow: number, newBefore: number, rangeLabel: string, priorHadAny: boolean): string` in `report-tiles.ts`: `newNow === 0`: `"Nobody new reached you in this period."`; else `` `${plural(newNow, "new person", "new people")} reached you` `` plus, when `priorHadAny`, ` (${newBefore === 0 ? "none" : newBefore} ${beforeWords(rangeLabel)})`, plus `"."`. `ReportLinesVM.people: string` = `newPeopleLine(tot.newPeople, prev.newPeople, rangeLabel, priorHadAny)` (always a sentence: a quiet period has one too). `lines.channels` stays until Task 11, where the donut that read it goes.
  - `lensAnswerOf(lens, parts)`: `parts` gains `people: { head: string | null } | null`; `case "people": return parts.people?.head ?? vm.lines.people;` (no `vm.empty` gate: R9).
  - `useReportsStanding(lens, R, reviews, people, act)`: `people: Pick<PeopleReportVM, "head"> | null` (a type import from `@chanlytics/contracts/report-lens`), passed on to `lensAnswerOf`.
  - `REPORT_LENSES.people.sub` = `"who reached you, whether you can reach them, and who is slipping away"`.

- [ ] **Step 1: Write the failing tests**
  - `reports-lines.test.mjs`: `"the People head's fallback: how many new people reached you, against the period before when there was one"`: a helper that spreads `new_contacts` over the first seven and last seven days of `weekDto([0, 7, 1, 3, 2, 5, 2])`: `(12, 8)` gives `"12 new people reached you (8 the 7 days before)."`, `(1, 0)` gives `"1 new person reached you (none the 7 days before)."`, `(0, 3)` gives `"Nobody new reached you in this period."`, and with a period before nobody lived in (`messages_in: 0` in its days) `(5, 0)` gives `"5 new people reached you."`; `lines().people` is a string for the quiet week too.
  - `report-lenses.test.mjs` (line 194 becomes): `lensAnswerOf("people", parts) === vm.lines.people`; with `people: { head: "40 people reached you, 12 new." }` it is that head; with `people: { head: null }` the frame's; with `vm: quiet` it is still the frame's sentence, never `undefined`. The page's head test (`reports-lens-page.test.mjs`, which passes no `people`) stays green as it is; the People head from a held read is Task 11's test.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-lines.test.mjs`
Expected: FAIL (`lines.people` is undefined).

- [ ] **Step 3: Implement** the signatures above (`wc -l` on `reports.ts` stays under 800). `corepack pnpm --filter "./packages/*" build`; `node tooling/scripts/gen/contracts-browser-entry.mjs` only if a barrel name moved (none does).

- [ ] **Step 4: Run to verify**, one per command: `reports-lines.test.mjs`, `report-lenses.test.mjs`, `tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs`, `reports-vm.test.mjs`, `reports-sample.test.mjs`, `reports-page.test.mjs`, `tooling/scripts/tests/ask/ask-turn.test.mjs` (Ask reads tiles by label, value and meta only), `corepack pnpm --filter @chanlytics/dashboard typecheck`, `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (file length).
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add packages/contracts/src/reports/reports.ts packages/contracts/src/reports/report-tiles.ts packages/contracts/src/reports/lens-answer.ts packages/contracts/src/reports/lenses.ts apps/dashboard/src/surfaces/reports/head.ts apps/dashboard/src/surfaces/reports/reports-page.tsx tooling/scripts/tests/reports/reports-lines.test.mjs tooling/scripts/tests/reports/lenses/report-lenses.test.mjs packages/contracts/dist
```

---

### Task 9: The reader, the route, the policy row and the client

**Files:**
- Modify: `apps/dashboard/src/server/readers/report.ts` (`peopleReport` and a private `bookOf` after `receptionistReport`), `apps/dashboard/src/server/log.ts` (line ~160: `"people_series_missing"` and `"people_pool_failed"`, sorted), `tooling/scripts/tests/route-policy.json` (a row between `GET reports/headline` and `GET reports/reach-outs`), `apps/dashboard/src/client/routes.generated.ts`, `packages/contracts/src/route-keys.generated.ts` (both regenerated), `docs/api.md` (regenerated)
- Create: `apps/dashboard/app/api/v1/reports/people/route.ts`
- Test: `tooling/scripts/tests/ask/readers.test.mjs` (a `peopleReport` section after the Receptionist's, which the file's `receptionistWorld`, `quietSeries`, `calIn`, `worldCtx`, `asked` and `logged` helpers serve), `tooling/scripts/tests/reports/periods/report-routes.test.mjs` (the route's periods, Month and refusals; copy the Receptionist's cases), `tooling/scripts/tests/ask/ask-routes.test.mjs` (the policy row)

**Interfaces:**
- Consumes: `peopleSeries(db, tenantId, window)` (Task 3), `isPeopleSeriesDto`, `peopleDtoOf`, `peopleNowOf`, `PeopleDto` (Task 6), `reportWindowFor`, `ReportQuery`, `everyoneOf` and `load(rc, facts.facts)`, `load(rc, facts.channelsReady)` (the turn's reads, `readers/facts.ts`), `log`.
- Produces: `export const peopleReport: Reader<ReportWindow, PeopleDto>` (name `"peopleReport"`, `rows: []`): reads `peopleSeries` and `bookOf(rc)` together. `bookOf` (private) reads `everyoneOf(rc)`, the zone and `facts.channelsReady` and answers `peopleNowOf(rows, { tz, nowMs: rc.now.getTime(), ready })`, or `null` after `log.error("people_pool_failed", { tenant_id, error })` (never fatal: each half fails alone). A `null` series -> `log.warn("people_series_missing", { tenant_id })` and `peopleDtoOf(null, { now, head })` with `head` from the zone and the window; an answer that is not `isPeopleSeriesDto` -> `AppError("not_found", "No workspace found for this report.", 404)`; any other failure of the series is the route's failure. The book is read for every window, ended ones included (it is "as of now"); no member-specific input reaches it (`rc.userId` is not passed), so the answer is the workspace's. `GET /api/v1/reports/people`: `read({ scope: workspace, rate: "aggregate", query: ReportQuery.pick({ period: true, from: true, to: true }), handle })`, the Receptionist route's twin with a header comment in its style. Policy row `{ "kind": "read", "scope": "workspace", "role": null, "rate": "aggregate", "spend": false }`.

- [ ] **Step 1: Write the failing tests**
  - Reader (in `readers.test.mjs`, the world helpers it already has; `people_list` rows with `last_inbound_at` offsets from `CAL_NOW` so the buckets differ, the channels tables as the file's People worlds give them): (a) `GET reports/people` answers its reader's payload byte for byte for 7, 30 and 90 days, with keys `["timezone", "today", "end", "days", "series", "now"]`; (b) a scripted `people_series` answer and four people: `now` equals `peopleNowOf(rows, { tz: "America/New_York", nowMs: CAL_NOW, ready })` for the same rows and the channels as the world has them, `now.people === 4`, and the series is carried as the database gave it; (c) `people_series` missing (`PGRST202`) gives `series: null`, `now` present, and one `people_series_missing` warn, and the route does not fail; (d) `{ error: "unknown_tenant" }` is the route's 404; (e) `people_list` failing gives `now: null`, the series present and one `people_pool_failed` log, and the route does not fail; (f) a window `{ days: 20, end: "2026-09-20" }` asks `people_series` with `p_end` and still reads the book; (g) a turn reads `people_series`, `people_list`, `tenants.select`, `tenant_channels.select` and `lines.select` once each, and a turn that already loaded People (`report`) reads `people_list` once; (h) the answer is the same for a member of another role (the book carries no per-member field).
  - `report-routes.test.mjs`: Month and `from`/`to` for the new route, `period=14d` refused with status 400, `days=7` ignored (thirty). `ask-routes.test.mjs`: the policy row is what is above.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs`
Expected: FAIL (`peopleReport` is not exported).

- [ ] **Step 3: Implement** the reader and the route as above. `node tooling/scripts/gen/route-types.mjs` and `corepack pnpm gen:api-reference`. Edit `tooling/scripts/tests/route-policy.json` by hand for the row, in the file's key order.

- [ ] **Step 4: Run to verify**, one per command: `readers.test.mjs`, `report-routes.test.mjs`, `ask-routes.test.mjs`, `tooling/scripts/tests/routes/route-policy.test.mjs`, `tooling/scripts/tests/routes/api-reference.test.mjs`, `tooling/scripts/tests/repo/log-events.test.mjs`, `node tooling/scripts/gen/route-types.mjs --check`, `corepack pnpm --filter @chanlytics/dashboard typecheck`, `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (`readers/` takes no new file).
Expected: PASS. `peopleDtoOf`, `isPeopleSeriesDto`, `peopleNowOf` and `peopleSeries` now have their reader.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/app/api/v1/reports/people/route.ts apps/dashboard/src/server/readers/report.ts apps/dashboard/src/server/log.ts tooling/scripts/tests/route-policy.json apps/dashboard/src/client/routes.generated.ts packages/contracts/src/route-keys.generated.ts docs/api.md tooling/scripts/tests/ask/readers.test.mjs tooling/scripts/tests/ask/ask-routes.test.mjs tooling/scripts/tests/reports/periods/report-routes.test.mjs packages/contracts/dist
```

---

### Task 10: The surface `reports_people` and its registrations

**Files:**
- Create: `apps/dashboard/src/surfaces/reports/people-surface.ts`, `tooling/scripts/tests/reports/people/people-surface.test.mjs`
- Modify: `apps/dashboard/src/surfaces/surface-values.ts` (the type at line ~46 and `SURFACE_KEYS` at ~180), `apps/dashboard/src/legacy-bridge/LegacyApp.tsx` (import ~47, `SURFACES` ~172, `SURFACE_LABELS` ~216), `apps/dashboard/src/legacy-bridge/surface-registry.ts` (`ROUTE_DRAWS`, line 210; the comments that name the two lenses now name three), `apps/dashboard/src/surfaces/reports/period.ts` (`followers`, line 27), `apps/dashboard/src/legacy-bridge/refresh-map.ts` (imports line 30; a `reportsPeople()` helper beside `receptionist()`; the writes below), `tooling/scripts/tests/_legacy-react.mjs` (the stub's list, line 121)
- Test: `people-surface.test.mjs` (copy `receptionist/receptionist-surface.test.mjs`), `tooling/scripts/tests/reports/headline/on-demand-boot.test.mjs`, `tooling/scripts/tests/reports/headline/headline-boot.test.mjs`, `tooling/scripts/tests/shell/surfaces/surface-boot.test.mjs`, `tooling/scripts/tests/shell/surfaces/message-fan-out.test.mjs` (lines 384 and 458: `#/reports/people` is no longer a page that hears nothing of the lens), `tooling/scripts/tests/shell/surfaces/surface-registry.test.mjs` (line 361: `people` leaves the list of lenses with no draws), `tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs`, `tooling/scripts/tests/reports/periods/report-range-follow.test.mjs`

**Interfaces:**
- Consumes: `periodSurface` (`period-surface.ts`), `shownReportRange`, `rangeQuery` (`surface.ts`), `read` (`@/legacy-bridge/api`), `onlyOnItsPage` (`surface-registry.ts`), `isLiveCallTurn` (`surface-realtime.ts`), `PeopleDto` (a TYPE import only: the surface imports no fold).
- Produces:

```ts
/** What the lens draws from: the answer as the route gave it (the page folds it) and the range it is of. */
export interface PeopleSurface { dto: PeopleDto; key: string }
export const reportsPeople = periodSurface({ key: "reports_people", shown: shownReportRange, of: (v) => v.key,
  read: async (range) => ({ dto: await read("GET reports/people", { query: rangeQuery(range) }), key: reportRangeKey(range) }),
  live: { refreshOnTables: ["messages", "calls", "person_notes"], refreshWhen: (c) => !isLiveCallTurn(c) && onItsPage(c), debounceMs: 800 } });
export const reportsPeopleOverride: SurfaceOverride;     // reportsPeople.override
export const forgetReportsPeople: () => void;            // reportsPeople.forget
```

`SurfaceValues.reports_people: PeopleSurface`; `ROUTE_DRAWS["reports/people"] = ["reports_people"]`; the follower `{ surface: reportsPeople, preReads: false }` in `period.ts`; `LegacyApp.tsx` label `reports_people: "People"`. `refresh-map.ts` gets `reportsPeople()` (as `receptionist()`: `forgetReportsPeople()`, then `[reportsPeopleOverride]` when `typeof window !== "undefined" && ownsTheScreen("reports_people", routeOnScreen())`, else `[]`), spread into the writes that change what the lens counts: `consentWrite` (a yes or a stop recorded, and `POST contacts/[id]/merge`), `DELETE contacts/[id]`, `PUT contacts/[id]/details` (an address changed clears a stopped one), `POST contacts` and `POST contacts/import` (who is in the book), the five note writes (`POST contacts/[id]/notes`, `.../notes/done`, `.../notes/remove`, `.../notes/decide`, `PUT contacts/notes`: steps), `readiness()` (a channel opened or closed moves "can receive offers") and `PATCH workspaces` (the zone moves the days). It hears the live feed only while the lens is on screen, 800 ms after the last change; a conversation write, a reply or a hold moves nothing it counts, so `thread()` does not name it.

- [ ] **Step 1: Write the failing tests.** `people-surface.test.mjs` (the Receptionist's cases, for this lens): the override's key/value/events/`onDemand`/`isStale`/`view()`; `refreshOnTables` equals `["messages", "calls", "person_notes"]`, `debounceMs === 800`, `refreshOnMessageInserts` undefined; `refreshWhen` is true for each table on `reports/people` and false on `reports/receptionist`, `reports/reviews`, `today`, and a live call turn (`calls` UPDATE with status `ongoing`) never moves it; `apply()` publishes `{ dto, key }` with `dto` the route's answer unfolded; `GET reports/people` is asked with `{ period: "30d" }` or `{ from, to }`; the follower's `current`/`coming`/`failed`; picked days named by their one key; `forget`. The other files assert the registrations as their Receptionist lines do (read where drawn and nowhere else; `routeDrawsFor("reports", "people")` and `("reports", "people:2026-09-01~2026-09-20")` are `["reports_people"]`; `ownsTheScreen("reports_people", "reports/people")` true and false elsewhere; a pick paints the held read and reads behind it only on the lens), and `refresh-coverage.test.mjs` asserts that the writes listed above forget what the lens held and, with the lens on screen (also over picked days), list `reports_people` once by name, while `POST conversations/[id]/reply`, `POST escalations/[id]/resolve` and `PUT settings` leave it alone.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/people/people-surface.test.mjs`
Expected: FAIL (the module does not exist).

- [ ] **Step 3: Implement** the surface and the registrations as above, beside the Receptionist ones (each a one- or two-line change; the comments that named the Reviews and Receptionist lenses now name the People lens too). `tooling/scripts/tests/_legacy-react.mjs`: the stub's list gains `["reports_people", "surface:reports_people"]`.

- [ ] **Step 4: Run to verify**, one per command, each of the Test files above, then `tooling/scripts/tests/shell/surfaces/route-prefetch.test.mjs`, `held-views.test.mjs`, `zone-remembered.test.mjs`, `read-cache.test.mjs`, `corepack pnpm --filter @chanlytics/dashboard typecheck`, `corepack pnpm lint`, `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (`legacy-bridge` takes no new file: it stays at 34).
Expected: PASS; `surface-registry`'s "every key is classified" tests name the new key.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/surfaces/reports/people-surface.ts apps/dashboard/src/surfaces/surface-values.ts apps/dashboard/src/legacy-bridge/LegacyApp.tsx apps/dashboard/src/legacy-bridge/surface-registry.ts apps/dashboard/src/surfaces/reports/period.ts apps/dashboard/src/legacy-bridge/refresh-map.ts tooling/scripts/tests/_legacy-react.mjs tooling/scripts/tests/reports tooling/scripts/tests/shell/surfaces
```

---

### Task 11: The page, part one: the lens's frame, the window cards, the wiring and the end of the donut

**Files:**
- Create: `apps/dashboard/src/surfaces/reports/lenses/people-mix.tsx`, `apps/dashboard/src/surfaces/reports/lenses/people-now.tsx`, `tooling/scripts/tests/reports/people/people-page.test.mjs`
- Modify: `apps/dashboard/src/surfaces/reports/lenses/people.tsx` (rebuilt), `apps/dashboard/src/surfaces/reports/lenses/shared.tsx` (`mixCard` arrives), `apps/dashboard/src/surfaces/reports/lenses/receptionist-mix.tsx` (imports `mixCard` from `shared.tsx`; its output is unchanged), `apps/dashboard/src/surfaces/reports/reports-page.tsx` (`OwnReads`, `useOwnReads`, `waitsOnItsRead`, the fold, `lensBody`, the head), `apps/dashboard/src/surfaces/reports/series.ts` (`RPT_CHANNELS` leaves), `apps/dashboard/src/surfaces/reports/blocks.tsx` (nothing new unless a part is read twice), `apps/dashboard/src/legacy/styles/reports.css` (layout only), `packages/contracts/src/reports/reports.ts` (the donut's sentence goes with the donut: `channelsLine`, `channelNoun`, `ReportLinesVM.channels` and its `linesOf` property; the file comes out shorter than 772 lines)
- Modify (built): `packages/contracts/dist/*`
- Test: `people-page.test.mjs`, `tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs` (`BODIES.people` line 102, `draw` line 74, the quiet test's loop at line 241), `tooling/scripts/tests/reports/reports-page.test.mjs` (see Step 1), `tooling/scripts/tests/reports/reports-lines.test.mjs` (the `where:` test at line 211 and `lines().channels` at line 230 go), `tooling/scripts/tests/reports/reports-where-when.test.mjs` (the `vm.lines.channels` assertions at lines 92 and 273 go; those tests keep `channelsOf`'s own assertions), `tooling/scripts/tests/reports/receptionist/receptionist-page.test.mjs` (unchanged, re-run)

**Interfaces:**
- Consumes: `useFollower("reports_people")` and `Follower` (`use-surface.ts`), `PeopleSurface` (Task 10), `toPeopleReportVM`, `PeopleReportVM`, `PEOPLE_RHYTHM_UNIT` from `@chanlytics/contracts/report-lens` (Task 7), `ChartCard`, `BarList`, `EmptyState`, `FailedRead`, `RptSection`, `RptStrip` (`blocks.tsx`), `RPT_CHANNEL_COLORS` (`series.ts`), the frame's `R.vm` (`week`, `hours`, `people`, `period`, `lines.rhythm`), `lensBody` and `useReportsStanding` (Task 8).
- Produces: `mixCard(part: MixPartVM, card: { title; testid; className; columns: [string, string] })` exported from `lenses/shared.tsx` (moved verbatim from `receptionist-mix.tsx`); `usePeopleFold(own: Follower<PeopleSurface>): PeopleReportVM | null` (a `useMemo` on `own.value.dto`, of the value held: a read of the period left still folds, the page dims it; `null` with no value) exported from `lenses/people.tsx` for `ReportsPage`; `PeopleLens({ R, pick, phone, own, fold }: LensProps & { own: Follower<PeopleSurface>; fold: PeopleReportVM | null })`. `reports-page.tsx`: `OwnReads.people`; in a demo with no read, `people: { value: peopleSample(R.range), state: "current" }` (Task 12); `waitsOnItsRead` also holds while `lens === "people" && own.people.state === "coming"`; `useReportsStanding(lens, R, reviews, own.people.state === "failed" ? null : fold, act)` (so a read of the period left still names its comparison, as Reviews does); `lensBody` passes `own` and `fold` (the lens draws the fold only while `own.state === "current"`). New test ids: `people-strip`, `chart-people-channels`, `chart-people-first`, `chart-people-yeses`, `chart-people-stops`, `chart-people-wires`, `chart-people-fresh`, `people-quiet-door`, `people-failed`, `people-now-failed`; the kept ones stay: `chart-rhythm`, `chart-people`. The old `chart-channels` and `channels-before` go.

What the lens draws, in order (the lens never draws `nothingCameIn`; R9):
1. **The head** (nothing to draw here: `head.ts` asks `lensAnswerOf`).
2. **Against before:** `<RptStrip tiles={fold.strip} className="quad" testid="people-strip" />` (only with the window available).
3. **The mix**, section "Your customers" (`bare`), three `rpt-grid` rows: *Who reached you, by channel* (`chart-people-channels`: `BarList` of `fold.channels` whose rows wear `RPT_CHANNEL_COLORS`, one colour a channel wherever it is drawn) with *How they first came* (`chart-people-first`) and the kept *New people, adding up* (`chart-people`, as today, on R1; its empty state says "Nobody new reached you in this period."); *How the yeses were won* (`chart-people-yeses`), *How the stops came* (`chart-people-stops`) and *Ways they reach you* (`chart-people-wires`, the book); *How fresh your book is* (`chart-people-fresh`: the six bars, then the foot line `people-quiet-door` with the fold's `quiet.line` and a `LinkButton routeDoor(quiet.door)` wearing `quiet.label`, the rules `.rpt-door-line` in `reports.css`) with the kept *When they reach you* (`chart-rhythm`: the radar and the hours as today, the unit words `PEOPLE_RHYTHM_UNIT`; with `R.vm.empty` it says "Nobody wrote or called in this period." instead of a radar of zeros). Every card takes its rows, line and empty words from the fold through `mixCard`.
4. While `own` is `coming` the kept cards (`chart-people`, `chart-rhythm`) draw from `R` and the others draw nothing; `failed` draws one `FailedRead` (`kind="card"`, `what="who reached you and who you can reach"`, `surface="reports_people"`, `testid="people-failed"`) in their place; a fold with `windowAvailable === false` (no 00395) draws no window card and no failure; one with `nowAvailable === false` draws one `FailedRead` (`what="who you can reach now"`, `testid="people-now-failed"`) where the book's cards stand and no Stuck now section.

- [ ] **Step 1: Write the failing tests**
  - `people-page.test.mjs` (the stub React and the `draw` helper of `reports-lens-page.test.mjs`, with `setSurfaceValue("reports_people", held(dtoWith(), "30d"))`; the `keepReportPeriod` the file's `draw` sets): **"the mix, in order, for a workspace that has everything"**: the test ids appear in this order: `people-strip`, `chart-people-channels`, `chart-people-first`, `chart-people`, `chart-people-yeses`, `chart-people-stops`, `chart-people-wires`, `chart-people-fresh`, `chart-rhythm`; the strip has four figures with metrics `people_reached`, `new_people`, `yeses_won`, `stops_recorded`. **"the channels wear the channel colours and say a person may be in each"**: `chart-people-channels` rows carry `RPT_CHANNEL_COLORS` for `whatsapp`, `sms`, `voice`, `email` and its takeaway is the fold's line; there is no `PieChart` and no `channels-before` anywhere on the lens. **"the fresh book's quiet door"**: `people-quiet-door` has `href "#/clients/seg:quiet"` and the fold's words; with `lists.quiet` 0 it is absent. **"a quiet period hides nothing"**: with `QUIET` and a quiet frame (`R.vm.empty`) no `reports-empty` is drawn, the strip says `"0"` four times, each window card draws its `empty` words and no bar, `chart-rhythm` says "Nobody wrote or called in this period.", and the book's cards (`chart-people-wires`, `chart-people-fresh`) draw. **"its own read out: the kept cards stand and the others are absent; failed: one failed read with its Retry; no function yet: no window card and no failure; the pool unreadable: the window and one failed read where the book stands"**. **"a share of too few is greyed and says so"**: `new_people` with 3 reached draws `n=3, minN=5`. **"the head says the lens's own sentence"**: with the read held the head is `fold.head`; before it (value undefined) or failed it is `lines.people`.
  - `reports-lens-page.test.mjs`: `BODIES.people` = `["people-strip", "chart-people-channels", "chart-people-first", "chart-people-yeses", "chart-people-stops", "chart-people-wires", "chart-people-fresh", "chart-rhythm", "chart-people"]`; `draw` also sets `reports_people` (current when of the period shown); the quiet test loop loses `"people"`; the head test passes `people` to `lensAnswerOf`; the dim-by-period rule also holds while `own.people.state === "coming"`.
  - `reports-page.test.mjs`: the card list (`chart-channels` at line 490) swaps it for the People ids above; the sections list at line 510 is unchanged here (Task 12 gives People's last two sections); `drawOnce` (line 200) also sets `reports_people` from `_people-world.mjs`'s `held`; the takeaway test drops `chart-channels` (line 527) and keeps `chart-rhythm` and `chart-people` empty/unchanged; the donut test (lines 551-565) becomes "the kept rhythm card: the week round a radar and the hours under it, 24 cells, in the contracts' unit words" (the pie assertions go); the channels' colours test (lines 699-709) points at `RPT_CHANNEL_COLORS`, whose order and values it holds; the `channels-before` test (815) and the v2 payload's `chart-channels` lines (827) go (the `chart-rhythm` line 830 stays); the demo test's `chart-channels` (1728) becomes `people-strip`.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/people/people-page.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement.** `people.tsx` keeps `rhythmTable`, `rhythmCard` and `peopleCard` (kept, unit words from the constant, empty words as above) and assembles the sections; `people-mix.tsx` holds the six window and book mix cards over `mixCard`; `people-now.tsx` the fresh card with its door line. The fold runs once per `own.value.dto` in `usePeopleFold`. `reports.css`: `.rpt-door-line` (the foot line of a card, the twin of `.rpt-booked-rest`: margin-top auto, a hairline above, `var(--text-sm)`, the muted ink), nothing else; no kit class named, no primitive word in a new class name. Delete `RPT_CHANNELS` from `series.ts` (its only reader was the donut) and, in `reports.ts`, the sentence the donut's takeaway read (`corepack pnpm --filter "./packages/*" build`).

- [ ] **Step 4: Run to verify**, one per command: `people-page.test.mjs`, `reports-lens-page.test.mjs`, `reports-page.test.mjs`, `reports-lines.test.mjs`, `reports-where-when.test.mjs`, `tooling/scripts/tests/reports/lenses/report-lenses.test.mjs`, `tooling/scripts/tests/reports/receptionist/receptionist-page.test.mjs`, `tooling/scripts/tests/reports/reports-seam.test.mjs`, `tooling/scripts/tests/reports/reports-honest.test.mjs`, `tooling/scripts/tests/shell/chart-kit.test.mjs`; `corepack pnpm --filter @chanlytics/dashboard typecheck`; `corepack pnpm lint`; `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` (`kit-primitives.json`, `style-values.json` and `inline-styles.json` must not move; any function over its limits is a red build).
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/surfaces/reports/lenses apps/dashboard/src/surfaces/reports/reports-page.tsx apps/dashboard/src/surfaces/reports/series.ts apps/dashboard/src/surfaces/reports/blocks.tsx apps/dashboard/src/legacy/styles/reports.css packages/contracts/src/reports/reports.ts tooling/scripts/tests/reports packages/contracts/dist
```

---

### Task 12: The page, part two: time between steps, stuck now, where they stand, and the demo sample

**Files:**
- Modify: `apps/dashboard/src/surfaces/reports/lenses/people.tsx` (the last two sections), `apps/dashboard/src/surfaces/reports/lenses/people-mix.tsx` (the steps card and the email card), `apps/dashboard/src/surfaces/reports/lenses/people-now.tsx` (the two strips), `apps/dashboard/src/surfaces/reports/sample.ts` (`peopleSample`), `apps/dashboard/src/surfaces/reports/reports-page.tsx` (the demo's `people` read), `apps/dashboard/src/legacy/styles/reports.css` (nothing unless a strip needs it: `quad` and `trio` exist)
- Test: `tooling/scripts/tests/reports/people/people-page.test.mjs` (extend), `tooling/scripts/tests/reports/reports-sample.test.mjs`, `tooling/scripts/tests/reports/reports-page.test.mjs` (the sections list at line 510 becomes `["The receptionist", "Time between steps", "Stuck now", "Your customers", "Time between steps", "Stuck now", "Campaigns"]`; the card list gains `people-time`, `chart-people-steps`, `chart-people-bounced`, `people-stuck`, `people-stand`), `tooling/scripts/tests/reports/lenses/reports-lens-page.test.mjs` (`BODIES.people` gains the same five ids)

**Interfaces:**
- Consumes: the fold's `stepsDone`, `emailStopped`, `stuck`, `stand` (Task 7), `RptStrip`, `RptSection`, `mixCard`.
- Produces: `peopleSample(range: ReportRange, today?: string): PeopleSurface` in `sample.ts` (a DTO from deterministic numbers, made from `reportsSample(range, today).vm` as `receptionistDto` is: the people who reached = a share of the sample's customers plus its callers, new = `vm.people.total`, the period before from `vm.people.prior`, channels shared from `vm.channels`, first touch, yeses, stops, steps and the book shared by weights over the sample's people; the same range on the same day is the same object; folded by the page through the real `toPeopleReportVM`). New test ids: `people-time`, `chart-people-steps`, `chart-people-bounced`, `people-stuck`, `people-stand`.

What the page adds, in order:
4. **Time between steps**, section `Time between steps` (`bare`, `testid="people-time"`): one `rpt-grid` of two cards, *Steps you set* (`chart-people-steps`: the two bars, the fold's line) and *Email that stopped working* (`chart-people-bounced`: the reasons).
5. **Stuck now**, section `Stuck now` (`bare`): `<RptStrip tiles={fold.stuck} className="trio" testid="people-stuck" />` (steps overdue in the amber ink and email stopped in the red, each only above zero, by the kit's tone; the first two are doors to the Steps due list) and `<RptStrip tiles={fold.stand} className="quad" testid="people-stand" />` (where they stand, a door each to its list, greyed under five people). Both only with the book available; the window parts only with the window.

- [ ] **Step 1: Write the failing tests**
  - `people-page.test.mjs`: **"the five parts, in order, for a workspace that has everything"** (extends the order test): `people-strip`, the mix ids of Task 11, `people-time`, `chart-people-steps`, `chart-people-bounced`, `people-stuck`, `people-stand`; the section labels in order are `Your customers`, `Time between steps`, `Stuck now`. **"the stuck figures are doors and wear their tone"**: `Steps overdue` has `href "#/clients/seg:steps_due"` and tone `warn`, `Steps due today` the same door and no tone, `Email stopped working` no door and tone `fail`; with 0 for all three no figure carries a tone. **"where they stand: four lists, a door each"**: hrefs `#/clients/seg:opted_in`, `...offers_ok`, `...opted_out`, `...quiet`; with 3 people the figures are `is-thin` (`n=3, minN=5`). **"no hours, no step, no stop in a quiet period: every window part says so"**: `chart-people-steps` and `chart-people-bounced` draw their `empty` words and no bar. **"a database without 00395: the book and the kept cards, nothing of the window and no failure; the pool unreadable: the window, one failed read where the book stands, no Stuck now"**.
  - `reports-sample.test.mjs`: `peopleSample("30d", TODAY)` folds through the real `toPeopleReportVM` with both halves available and consistent: `reached.now.new <= reached.now.people`, `first_came.by_via` sums to `reached.now.new`, `consent` totals equal their `by_source` and `by_purpose` sums, `steps.on_time <= steps.done`, the book's `fresh` sums to `people`, `quiet` equals the last three buckets, `wires` sum to `people`, no `NaN`; the same range on the same day is the same object; a picked range (`{ from, to }`) is named by its key and has no `end`-less read; `peopleSample` for `7d`, `30d` and `90d` all fold.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/people/people-page.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement** the last two sections and the cards over `mixCard` and `RptStrip`, and `peopleSample` (`sample.ts` stays under 720 lines; reuse its `sharedOver` and `sumOf`); `reports-page.tsx` wires the demo's read. Then look at the page in the demo: `corepack pnpm --filter @chanlytics/dashboard dev` and `/w/<slug>/reports/people` in a demo session at 1440 and 390 wide, both themes (a dev server is not a production build; stop it afterwards).

- [ ] **Step 4: Run to verify**, one per command: `people-page.test.mjs`, `reports-sample.test.mjs`, `reports-lens-page.test.mjs`, `reports-page.test.mjs` (also under `TEST_TZ=Pacific/Auckland`), `report-metric-words.test.mjs` (the strips name their metrics), `tooling/scripts/tests/shell/chart-kit.test.mjs`; `corepack pnpm --filter @chanlytics/dashboard typecheck`; `corepack pnpm lint`; `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`.
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/surfaces/reports/lenses apps/dashboard/src/surfaces/reports/sample.ts apps/dashboard/src/surfaces/reports/reports-page.tsx apps/dashboard/src/legacy/styles/reports.css tooling/scripts/tests/reports
```

---

### Task 13: Ask says what the page shows

**Files:**
- Modify: `apps/dashboard/src/server/ask/tools/read/report.ts` (the loads at lines 134-149, a `peopleSaid`, the description at line 209), `tooling/scripts/tests/ask/ask-registry.test.mjs` (a `REPORT_PEOPLE_WORDS` constant beside `REPORT_RECEPTIONIST_WORDS`, line 106, and one more `.replace` in the chain at line 424), `tooling/scripts/tests/fixtures/ask-tools-4-7.json` (the `report` description, four lines, one per role), `tooling/scripts/tests/ask/ask-turn.test.mjs` (the report cases), `tooling/scripts/tests/ask/ask-tool-names.test.mjs` (the report case and its reads)

**Interfaces:**
- Consumes: `peopleReport` (Task 9), `toPeopleReportVM`, `PeopleReportVM` (Task 7, from the package root: Ask is server code), `unread(t, "report", "people")` (`ask/tools/context.ts`), `receptionistSaid` (the pattern, `report.ts`).
- Produces: the report tool's answer gains `people`: `{ error: "the people numbers could not be read just now" }` where the read failed (never "nothing"); `{ available: false }` where the database has no function and the book could not be read either; else

```ts
{ head: string | null,
  window: null | { reached: figure[],            // the strip's four: { label, value, meta, change }
                   channels: mix, first_came: mix, yeses: mix, stops: mix, steps_done: mix, email_stopped: mix },
  book: null | { wires: mix, fresh: mix & { quiet: string | null }, stuck: figure[], stand: figure[] } }
// mix = { rows: string[], line } | { empty }; rows "label: value"; every sentence is the fold's
```
`window` is null where the database does not keep the numbers yet; `book` is null where the pool could not be read. The tool's one extra read shares the turn's People and channels reads with `report` (it loads nothing twice). The description gains one sentence naming `people`, after the Receptionist one. **No model call and no eval.**

- [ ] **Step 1: Write the failing tests.** `ask-turn.test.mjs`: the real tool over four worlds (a scripted `people_series` answer (Task 6's `SERIES` in the SQL's raw shape) with four people; a database with no function; a pool that fails; an empty period) and each exact object as above, including `people.head` equal to the fold's, `window.reached[0].value === "40"`, `book.stuck[0].value === "6"` and `book.stand[0].label === "Said yes to messages"` for the first world. `ask-tool-names.test.mjs`: the report's reads gain `people_series` and the people read once for the turn. `ask-registry.test.mjs`: the chain gains `.replace("receptionist says available false where the database does not keep these numbers yet, and error where they could not be read.", REPORT_PEOPLE_WORDS)` for every role, where the constant opens with that same ending and adds the People sentence; `words(tool)` is unchanged otherwise.

- [ ] **Step 2: Run to see them fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-registry.test.mjs`
Expected: FAIL (the registry's description is the old one while the test expects the new sentence).

- [ ] **Step 3: Implement** the tool, then re-freeze the fixture ONLY on its lines: run the registry test to read the new description for each role, then replace the old `report` description string by the new one in `ask-tools-4-7.json` with a one-off script written to the scratchpad directory (read the file as text, replace the exact JSON-escaped string, require exactly four replacements, write it back; the file is not `JSON.stringify(..., 2)`-shaped, so the text is edited, not reserialised). `git diff --stat tooling/scripts/tests/fixtures/ask-tools-4-7.json` must show four changed lines and nothing else.

- [ ] **Step 4: Run to verify**, one per command: `ask-registry.test.mjs`, `ask-turn.test.mjs`, `ask-tool-names.test.mjs`, `tooling/scripts/tests/ask/readers.test.mjs`, then the whole folder once: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask`.
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add apps/dashboard/src/server/ask/tools/read/report.ts tooling/scripts/tests/ask/ask-registry.test.mjs tooling/scripts/tests/ask/ask-turn.test.mjs tooling/scripts/tests/ask/ask-tool-names.test.mjs tooling/scripts/tests/fixtures/ask-tools-4-7.json
```

---

### Task 14: The nightly's workspace shows the lens, and the e2e spec reads it

**Files:**
- Modify: `tooling/scripts/ops/e2e-workspace.mjs` (a `convergePeople(db, T, ownerId, now)` called after `convergeReceptionist`, line 1108; `PEOPLE_PREFIX`; the header's "no open step" line; `verify`, line 1918), `e2e/reports.spec.ts` (the Overview test around line 198 and the address test around line 251; a `thePeopleLens` beside `theReceptionistLens`), `tooling/scripts/tests/e2e/e2e-workspace.test.mjs`
- Test: `tooling/scripts/tests/e2e/e2e-workspace.test.mjs` (executed over the in-memory database), `e2e/reports.spec.ts` (runs nightly against the seeded workspace)

**Interfaces:**
- Consumes: the seed's existing helpers (`must`, `deleteWhere`, `PEOPLE`, `TIMEZONE = "America/New_York"`, `atLocal`, `DAY_MS`), the rows' shapes in Task 2.
- Produces: rows the lens counts, all terminal and re-dated from `now` every run, none for a sweep to select (no sweep reads `due_on`, `contact.consent_changed` or `person_notes` done steps): `convergePeople` deletes the previous night's rows first (events by `data->>note = 'e2e-seed-p'` and kind; notes by body prefix `PEOPLE_PREFIX = "e2e seed step: "`) and writes
  - three `contact.consent_changed` events, one for each seeded person, `{ consent: "opted_in", source: "customer_message", channel: "whatsapp", note: "e2e-seed-p" }` dated seven days ago (the date of their `consent_updated_at`), so the yeses won are 3 and consistent with the people's own columns; no stop event (their columns say yes);
  - three done steps in `person_notes` (`team_only: true`, `author_kind: "member"`, `author_user_id` the owner, `done_by` the owner): Casey's due 5 days ago and done that day (on time), Casey's due 9 days ago and done 8 days ago (late), Robin's due 3 days ago and done 6 days ago (on time), each body starting with `PEOPLE_PREFIX`;
  - nothing else: no suppressed address, no open step, no queued row (an open step would add a row to Today and a person to the Steps due list, which other specs count).
  `verify` additionally requires: every note with the prefix is done and has a day; the three events exist with the note; no `queued` message exists in the workspace (as C2's).

- [ ] **Step 1: Write the failing tests.** `e2e-workspace.test.mjs`: after `main({ apply: true })` over the in-memory database the three events and the three done steps exist (counts by kind); a second run changes nothing but the dates; `verify` returns a problem when an open prefixed step or a queued message is planted; the header comment says the workspace has no open step. `e2e/reports.spec.ts` (written now, run nightly): a helper `hasPeopleSeries(page)` reads `GET /api/v1/reports/people?period=30d` with `apiGet` and says whether `series` is null (a database without 00395); in the Overview test after `lens-people` is clicked: `people-strip` has four `.figure`s with labels `["people who reached you", "new people", "yeses won", "stops"]` (lower-cased) when the series exists, the kept `chart-rhythm` and `chart-people` are visible either way, and the book's `chart-people-wires`, `chart-people-fresh`, `people-stuck` and `people-stand` are visible; `chart-people-channels` has no `button.ck-barlist-row`; the first figure's value equals `series.reached.now.people` from that API call (read, never hard-coded) and is at least 1; the stand figure `Said yes to messages` equals `now.lists.opted_in` and is at least 3, with an `a[href*="seg:opted_in"]`; `Steps overdue` is a count (`/^\d+$/`; the seed holds none, but a spec that failed halfway may have left one) with an `a[href*="seg:steps_due"]`. In the address test: `/w/<slug>/reports/people` loads on its own with `lens-people` `aria-current`, and a pick of `7d` makes a GET to `/api/v1/reports/people` with `period=7d` and requests no document. The spec tolerates `series: null` (asserts the book and kept cards and that no window card is drawn), as C2's does.

- [ ] **Step 2: Run the unit test to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/e2e/e2e-workspace.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement** `convergePeople` and the `verify` rows; before touching the dates, `grep -rn "person_notes\|consent_changed\|seg:\|steps" e2e` for any spec that counts steps, lists or Campaigns' yeses exactly: a spec that does gets its number updated in this task (none is expected: the seed adds no open step and `campaign_series` counts yeses in a window nothing asserts).

- [ ] **Step 4: Run to verify**: `e2e-workspace.test.mjs`; `tooling/scripts/tests/e2e/e2e-shape.test.mjs`; `tooling/scripts/tests/e2e/coverage-guard.test.mjs`; `tooling/scripts/tests/e2e/skip-ceiling.test.mjs`; `corepack pnpm exec playwright test --list e2e/reports.spec.ts` (the spec compiles; it runs against production nightly and is not run here); `corepack pnpm lint`; `corepack pnpm -r typecheck`.
Expected: PASS. Dry-run the script only: `node tooling/scripts/ops/e2e-workspace.mjs` (no `--apply`; it needs the env and writes nothing).

- [ ] **Step 5: Stage**

```bash
git add tooling/scripts/ops/e2e-workspace.mjs tooling/scripts/tests/e2e/e2e-workspace.test.mjs e2e/reports.spec.ts
```

---

### Task 15: The dead code, the bundle, the documents and the whole-lane check

**Files:**
- Modify: `packages/contracts/src/people/people-lists.ts` (`recencyCells` and `RECENCY_BUCKETS` go; `DAY_MS` only if nothing else reads it), the barrels that name `recencyCells` (`packages/contracts/src/people/index.ts`, regenerated `packages/contracts/src/browser.generated.ts`), `tooling/scripts/tests/people/people-vm.test.mjs` (the `recencyCells` import and its test at line 567 go), `docs/system-prd.md` (the routes list near line 545 gains `reports/people`; the surface table near line 647 gains `reports_people`; the Reports page row names the People lens's own read), `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (§6.4 rows, §6.6's People row, §9 People table, A6), `docs/superpowers/specs/2026-10-02-reports-lenses-data-catalog.md` (the People rows: "How fresh your book is" reads People's Quiet rule, not `person_moments.in_touch_at`), `docs/decisions/0021-people-are-paged-by-a-moment-the-database-keeps.md` (a dated note after step 4: superseded for Reports and Today by 00394), `docs/debt.md` and `docs/takeover.md` (the register, regenerated if a number moved), `docs/data-model.md` (regenerated), `C:\Users\Ruben\Documents\Claude Projects\Claude Video\docs\reports-canvas\2026-10-10-reports-phase-c-review.md` (§5 People built; §3's People row fixed, with the places it differs)
- Modify (built): `packages/contracts/dist/*`
- Test: the changed tests and the repo ratchets, below

**Interfaces:**
- Consumes: everything above. Produces: a lane in which the checks named under "Run" are green and the PR description's `Bundle:` line is written.

- [ ] **Step 1: Remove the dead code.** `recencyCells` has no reader but its test (the review's defect d: buckets of 24-hour blocks, not the Quiet rule's local days); delete it with `RECENCY_BUCKETS` and the test, then `node tooling/scripts/gen/contracts-browser-entry.mjs` and `corepack pnpm --filter "./packages/*" build`. `corepack pnpm check:dead-exports` must end at or below its baseline: every export this lane added has a non-test reader by now (say any that does not and why); bank a fall with `-- --update`, never `--raise`.

- [ ] **Step 2: Measure the bundle once.** Build the packages and check git shows no unexpected dist drift. Then ONE production build of the dashboard with placeholder public env (Git Bash: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder corepack pnpm --filter @chanlytics/dashboard build`; PowerShell: set both with `$env:` first), then `corepack pnpm check:bundle` (it holds the ceilings; a ceiling is never raised for this lane). **Delete `apps/dashboard/.next` immediately after the numbers are written down** (`Remove-Item -Recurse -Force apps/dashboard/.next` on this machine). Main's own numbers for the base commit are its recorded measurement (the Typecheck job's bundle summary on that commit, which the controller reads with `gh`); the route's JS must not grow past 1 KB against it (it should fall or hold: the fold is page-only), and the Reports page's growth is what the lens adds (C2's was 8.5 KB). If the route grew, STOP and report the largest movers (`check:bundle` prints them) to the controller; do not build a second time before a reclaim is agreed. Write the line for the PR description: `Bundle: the People lens's fold and words are page-only (report-lens); the Reports page grows by <N> KB gzipped for the lens's five parts, the kit's tone and the demo sample; the route does not grow.`

- [ ] **Step 3: The documents.** `docs/system-prd.md`: the surface table gets `reports_people | /reports/people | — (read through useFollower("reports_people"): the People lens's own read) | messages, calls (not a transcript turn of a call in progress), person_notes, while the lens is on screen, 800 ms after the last change; on-demand as the Receptionist's; a yes or a stop recorded, a merge, an erasure, a step, an address, a person added, a channel or the zone forgets it` in the style of the `reports_receptionist` row; the spec's §6.4 rows name `people_series` (00395), `peopleReport`, `reports_people`, `peopleNowOf` (the book counted in the reader from the pool) and `contact_first_moments` (00394); §6.6's People row reads `messages, calls, person_notes`; §9's People table moves to Built with the places it differs (the donut is gone and the channels are people; "Repeat contact" is not drawn; "email that bounced" has no phone equivalent; "New, returning and rebooked; the usual gap; at risk; lifetime" stay E; "Coming back after a win-back" stays C4; list sizes over time stay K10); A6 notes that Reports and Today share one rule (00394) and People's `new_at` is still its own; decision 0021 gets: "Step 4 as written is superseded for Reports and Today: since 00394 `contact_first_moments` is a person's first inbound message in their own words or first inbound connected call; People's `new_at` and its New this week keep their own rule until the People surface's lane." The review document (outside the repository, edited in place, LF): §5 People marked built 10 Oct 2026 in the uncommitted lane `reports/c3-people`, no PR yet, with the places it differs from the list; §3's People row marked fixed (head, quiet period, donut). A count written in prose carries its date (`tooling/scripts/tests/docs/counts-are-dated.test.mjs`) and a path in the docs opens something (`docs-paths.test.mjs`). `corepack pnpm gen:data-model` (no stack needed; functions only, expect no change) and `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs` only if the register names a number that moved.

- [ ] **Step 4: Run, one per command** (the lane's own files, then the ratchets):
  - `node tooling/scripts/checks/test.mjs` on each of: `tooling/scripts/tests/reports/people/people-record.test.mjs`, `people-pool.test.mjs`, `people-report.test.mjs`, `people-surface.test.mjs`, `people-page.test.mjs`, `tooling/scripts/tests/reports/reports-lines.test.mjs`, `reports-vm.test.mjs`, `reports-page.test.mjs`, `reports-sample.test.mjs`, `reports-where-when.test.mjs`, `report-repository.test.mjs`, `tooling/scripts/tests/reports/lenses` (the folder), `tooling/scripts/tests/reports/periods` (the folder), `tooling/scripts/tests/reports/headline` (the folder), `tooling/scripts/tests/reports/receptionist` (the folder, database files skip without a stack), `tooling/scripts/tests/ask` (the folder), `tooling/scripts/tests/shell/surfaces` (the folder), `tooling/scripts/tests/shell/chart-kit.test.mjs`, `tooling/scripts/tests/styles` (the folder), `tooling/scripts/tests/shipping/browser-entry.test.mjs`, `tooling/scripts/tests/people/people-vm.test.mjs`, `tooling/scripts/tests/today` (the folder), `tooling/scripts/tests/e2e/e2e-workspace.test.mjs`, `tooling/scripts/tests/database/migrations.test.mjs`, `tooling/scripts/tests/database/migration-ledger.test.mjs`, `tooling/scripts/tests/docs` (the folder), `tooling/scripts/tests/routes` (the folder), `tooling/scripts/tests/repo` (the folder: ratchets, barrels, cycles, log events, source scan).
  - `TEST_TZ=Pacific/Auckland` for `people-record.test.mjs`, `people-pool.test.mjs`, `people-report.test.mjs`, `people-page.test.mjs` and `reports-page.test.mjs` (PowerShell: `$env:TEST_TZ='Pacific/Auckland'`).
  - `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`, `corepack pnpm check:dead-exports`, `node tooling/scripts/gen/route-types.mjs --check`, `node tooling/scripts/gen/contracts-browser-entry.mjs --check`, `git status` shows no dist drift beyond the files this lane staged or changed.
  Expected: all PASS.

- [ ] **Step 5: Stage**

```bash
git add packages/contracts/src/people packages/contracts/src/browser.generated.ts tooling/scripts/tests/people/people-vm.test.mjs tooling/scripts/tests/baselines/dead-exports.json docs/system-prd.md docs/superpowers/specs/2026-10-02-reports-lenses-design.md docs/superpowers/specs/2026-10-02-reports-lenses-data-catalog.md docs/decisions/0021-people-are-paged-by-a-moment-the-database-keeps.md docs/debt.md docs/takeover.md docs/data-model.md docs/superpowers/plans/2026-10-10-reports-c3-people.md packages/contracts/dist
```

(The review document lives outside the repository checkout and is edited in place; it is not staged.)

---

## What the pull request says (for the controller, at the push; not a task)

- **What changes for a customer:** the People lens is rebuilt in the lenses' five parts (people, not messages; how they first came; the yeses and stops; how fresh the book is; steps; channels per person; email that stopped working), and a quiet period no longer hides it. **New people dip slightly on Overview, Today and Ask**: a person is new when they reached you in their own words or on a call they placed to you, so an out-of-office from a new address and a call you placed no longer make one (00394).
- **To apply before or after merging:** migrations 00394 and 00395 on Ruben's word, either deploy order (the dashboard answers "no read yet" in words until 00395 is applied; 00394 changes no shape). Renumbered at push only if another lane lands migrations first, recorded with `migration-ledger.mjs --record`.
- **Bundle:** the `Bundle:` line of Task 15, step 2.
- **Named, not done (R11):** coming back after a win-back (C4), new/returning/rebooked, the usual gap, at risk, lifetime (E), where they live (no postal code), list sizes over time (no nightly snapshot); People's own "New this week" (7 days, `person_moments.new_at`) is a second "new" on another page and aligning it is the People surface's lane; the Receptionist lens still hides itself in a quiet period (C2's gate).

## Open questions (not settled by the code; each has the default the tasks are written for)

1. **The rhythm card's unit.** `report_series` counts a connected call in either direction in its hours, week and channels, so the card says "messages and calls", not "that came in". Restricting `calls_w` to inbound would fix the words and move Overview's and Today's Calls. Default: leave it; its own change.
2. **A second pool read and a second first-moment scan.** The frame's `report` read and this lens each read all of People (`people_list`, paged) and each runs `contact_first_moments`; opening the lens pays both twice (an Ask turn shares the pool through the turn's cache). The alternatives are a server-side cache of the pool for a few seconds, or counting the five lists in SQL (a second statement of the rules, refused by "one predicate per rule"). Default: accept it, and measure on a large workspace before the PR.
3. **The head changes once on the first draw** (the frame's new-people sentence, then the lens's own). Default: accept; the alternative (say nothing until the lens's read lands) leaves the head empty longer.
4. **The Figure's tone** is a kit variant this lane adds so that D10's amber and red can be used where R12 says; if Ruben would rather the stuck figures stay plain ink, Task 4 and the `tone` fields come out and nothing else changes.
5. **Migration numbers** (R14): #1537 landed as 00381-00391 (10 Oct); this lane is 00394 and 00395, renumbered at push only if another lane lands first.
6. **The pool's cost for very large workspaces:** `peopleNowOf` builds a `PersonRowVM` for every person (the cost Ask's and a send's pool already pay). Default: accept; a lighter fold over the same functions is possible if a measurement asks for it.

## Self-review (run once, fixed inline)

- **Spec and design coverage.** R1: Tasks 1, 2 (agreement test), 15 (notes). R2-R5, the window half: Task 2 (SQL), Tasks 3, 6, 7 (repository, DTO, fold). R6, the book: Task 6 (counts, equal to People's rail), Task 7 (words), Tasks 11-12 (cards, doors). R7: Task 11 (kept cards, unit words from `PEOPLE_RHYTHM_UNIT`, donut gone). R8: Tasks 7 and 8 and 11 (head, fallback, wiring). R9: Tasks 7, 11, 12 (quiet period). R10: Task 13. R11: the PR section. R12: Tasks 4, 7, 12 (n, minimum, tones). R13: Task 15 (bundle). R14: Global Constraints and Tasks 1-2. D7's five parts: sentence (Task 8, 11), against before (strip, Task 11), mix (Task 11), time between steps (Task 12), stuck now (Task 12). D9: Tasks 7, 11. D10: Tasks 4, 7, 12. Every defect of the code map is fixed or named: (a) head, Task 8; (b) quiet period, Tasks 11-12; (c) donut, Task 11; (d) `recencyCells`, Task 15.
- **Verified against the code (grepped or read):** every path in a Files block that exists (the C2 modules `receptionist-*.ts`, `report-lens.ts`, `reports/index.ts`, `contracts-browser-entry.mjs`'s `PAGE_ONLY`, `reports-page.tsx`, `receptionist-surface.ts`, `period.ts`, `refresh-map.ts`, `surface-registry.ts`, `LegacyApp.tsx`, `surface-values.ts`, `sample.ts`, `series.ts`, `blocks.tsx`, `readers/report.ts`, `ask/tools/read/report.ts`, `e2e-workspace.mjs`, `e2e/reports.spec.ts`, `figure.tsx`, `kit.css`, `classes.json`, `kit-gallery.mjs`); the new files are in folders that take them (`contracts/src/reports` 18 files, `tooling/scripts/tests/reports` 20 files plus a new folder, `surfaces/reports` 16, `lenses/` 9); the five lists' ids and rules (`lists.ts` 123-191, 194-249: `opted_in` = `said_yes` messages, `offers_ok` = `can_receive` offers, `opted_out` = `stopped`, `steps_due` = `step_due`, `quiet` = `last_heard` more than 30) and that none needs a viewer (`list-rules.ts` `factNeeds`); `PersonRowVM` carries `heardDays`, `nextStep`, `emailSuppressed`, `channels`, `saidYes`, `canReceive`, `stopped` and `poolRowsOf` builds it; `QUIET_AFTER_DAYS` is exported; `people_list` carries `email_suppressed_at`, `last_inbound_call_at`, `step_*`; `contact_first_moments`' callers (`report_series`, `metrics_summary`) and every test that names it; `person_notes`' constraints; `events` kinds and their writers; `acquired_via`'s nine values; the routes' policy order; the live-feed `WATCHED` tables; `bundle-ceiling.json` and the CI facts of #1538 and #1540; the `Figure`'s CSS and tokens `--warn-ink` and `--danger-ink` in both themes; `isLiveCallTurn`; the registry test's chain and the fixture's convention.
- **Step scan.** Every test step names its tests and carries the values (SQL worlds with their expected objects, the fold's strings, the ordered ids); every code step carries the signature, the file and the pinned values; no body is written out. SQL: the shape and the CTE list are given because the signature does not determine them.
- **Names consistent.** `PeopleSeriesDto` (Task 2's shape = Task 6's type) -> `isPeopleSeriesDto`, `peopleDtoOf` (Task 6) -> the reader (Task 9) -> `PeopleSurface { dto, key }` (Task 10) -> `usePeopleFold` and `toPeopleReportVM` (Tasks 7, 11) -> `peopleSaid` (Task 13); `PeopleNowDto` (Task 6) is the book the fold words (Task 7); the metric ids of Task 7 are the strips' in Tasks 11-12; `tone` (Task 4) is set in Task 7 and drawn by `RptFigure`; `MixPartVM` (Task 5) is every mix's; `mixCard` (Task 11) is every card's; the ten test ids of Tasks 11-12 are the e2e's in Task 14; `reports_people` is the surface, the follower, the registry row, the label and the refresh helper's.
- **Review Focus.** The five conditions each have a test in the task named; the tests a person would not write from the happy path (the Auckland day boundaries, the merged and moved-in rows, the half-missing reads) are in Tasks 2, 6, 9 and 11.
- **Proportion.** Signatures, definitions, test names and values; no function body is written out. The plan is as long as C2's because the work spans the same layers.
