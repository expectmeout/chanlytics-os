# Pipeline, worked — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the nine decisions Ruben approved on 23 September 2026 from the canvas "Pipeline, worked"
(https://claude.ai/artifact/YPMoyJfwPDbuqxv4W6ngrh, version 2): the Pipeline finds its own way (its rail, an address,
New proposal), each row carries its deal (the track, sort, columns, a selection), a next step is a dated note on the
person, the workspace's own pace says when deals usually close, and the proposal follow-up (0006) is built.

**Architecture:** The design is `docs/decisions/0008-a-proposal-is-part-of-the-deal.md` (its amendment "The Pipeline
is a workspace", revised here) and, for steps, `docs/decisions/0007-person-notes.md` (amended here, "A note may have a
day"); 0006 is built as written, its open questions answered as it recommends. Contracts own every rule and word; the
legacy pages compose them. Six PRs, in order, each correct in either deploy order.

**Tech stack:** as `2026-09-23-proposals-and-deals.md`: Supabase Postgres with SQL doors, pnpm/turbo with committed
`packages/*/dist`, the legacy JSX shell over `window`, Node's test runner with the stub React
(`tooling/scripts/tests/_hook-frames.mjs`), Playwright e2e.

---

## Conventions every task follows

- **Worktree** `cm-pipeline`, one branch per PR off `origin/main`, then `corepack pnpm install --frozen-lockfile
  --prefer-offline`. Never the shared checkout.
- **The gate before a PR:** `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm
  lint && corepack pnpm test && corepack pnpm format:check`. Commit only dists with a real `git diff -w` change.
- **Legacy files:** a new `.jsx` goes in `legacy-bridge/manifest.ts` and `legacy/Chanlytics.html`, same order; every
  edited legacy file (`.jsx`, `.css`) gets its `?v=` bumped. Export with `Object.assign(window, …)`.
- **Words:** every sentence a page shows comes from `packages/contracts`. Tests execute the code; no `readCode`/`readRaw`.
- **Review:** one combined review per PR, one fix round, then the gate (Ruben, 22 Sep: never re-review the fixes).
- **Look:** the scratchpad probe (`probe/pipeline.html` over the worktree's `src`) at 1280, 1440 and 390, both themes.
- **Migrations:** an isolated local stack (the proposals plan's recipe), `gen:schema-sets` and `check-db-types`, the db
  tests; then on the green PR: `db push --linked --dry-run` lists only this migration, push, read back, merge.
- **Merge** on green, squash, delete the branch; check the newest run on main.

---

## PR 1 · The Pipeline finds its way (no schema)

Branch `design/pipeline-finds-its-way`. For a customer: the Pipeline's rail holds its own views, on a phone behind the
standing line's first word; the peek is in the address, so Back closes it and a link opens a deal; New proposal starts
one from the Pipeline; "No link" is a plain fact; the wait is said once; Start a proposal names the consultation's
service; a recorded move shows on the row as the door answers; the List | Board choice follows the member.

### Task 1.1 · Contracts: views, the address, the line, the chip

**Files:** `packages/contracts/src/pipeline.ts`; test `tooling/scripts/tests/pipeline.test.mjs`.

- [x] Views and the address:

```ts
export type PipelineView = "all" | PipelineGroupKey | "waiting" | "lapsed" | `svc:${string}`;
export function isPipelineView(s: unknown): s is PipelineView;
/** clients/pipeline, clients/pipeline:v-proposals, clients/pipeline:v-s.Ad%20management:p-<uuid> */
export function pipelineRoute(v: { view?: PipelineView | null; peek?: string | null }): string;
export function parsePipelineRoute(route: string): { view: PipelineView; peek: string | null } | null;
```

  A service view is `v-s.<encodeURIComponent(name)>`; a group or kind is `v-<key>`; a peek is `p-<uuid>`; anything
  else in the address is ignored, as `parseLeadsRoute` ignores it.

- [x] `pipelineIn(vm, view)` (built as `pipelineOf(rows, nowMs, tz, view)`: the view is the Pipeline's fourth
  argument, so a view's groups, counts and chips come from the one pass): the same Pipeline with only the view's rows: a group view keeps that group alone (unfolded
  when it is Passed or ended); `waiting` the proposals `waitingOnProposal` holds; `lapsed` those whose `validUntil.lapsed`;
  `svc:<name>` rows whose deal is for that service. Groups with nobody drop. `summary` stays the whole Pipeline's.
- [x] `pipelineRail(vm)`: the rail's sections. Deals: All deals (every row), then each group with its count. Waiting on
  you: Nothing back in a week (`waiting`), Lapsed (`lapsed`), each only when its count is above zero. Services: each
  deal service with its count, most first, then by name, at most eight. Each row `{ view, label, count, tone }`.
- [x] The line's presses: `PipelineVM.line: { words: string; view: PipelineView | null; tone: "warn" | null }[]`, whose
  words are `summary`'s, in order; "N waiting over a week" presses to `waiting` in warn; "N lapsed" is a new part after it,
  to `lapsed` in warn. `summary` is kept as `line.map((p) => p.words)`.
- [x] Fixes: `proposalChip`'s "No link" is `tone: "plain"`; "Nothing back in N d" becomes `PIPELINE_WORDS.nothingBack`
  ("Nothing back"), the number said once in In stage.
- [x] Words (`PIPELINE_WORDS`): `rail` (Deals, All deals, Waiting on you, Nothing back in a week, Lapsed, Services),
  `views.all` for the phone's button, `newProposal` ("New proposal"), and the picker's: title "New proposal", sub "Who is
  it for?", search "Search people", none "No one matches.", add "Add someone new", name/number labels, go "Continue".
- [x] Tests: the route round-trips (a group, a kind, a service with a space and a colon, a peek, junk ignored, not the
  Pipeline's address); `pipelineIn` per view; `pipelineRail`'s rows and counts, zero hidden, eight services at most;
  `line`'s presses; the two fixes (flip the pinned chip words in the existing tests, saying why).

### Task 1.2 · Contracts: a proposal started from a consultation names its service

**Files:** `packages/contracts/src/deal-sheet.ts`; test `tooling/scripts/tests/deal-sheet.test.mjs`.

- [x] `DealAct` gains `service?: string | null`. `dealNextAct` and the quiet line's act (`quietOf`), when they start a
  proposal after a consultation, carry `consultServiceOf(p.consultationTitle, services, { consult_first })` from
  `DealPerson.services` and a new optional `DealPerson.consultFirst?: readonly string[]` (the person read's
  `consult_first`, where it is sent). Null where the title names none.
- [x] `person-deal.jsx` `pdRun` passes `service: a.service` to `openDealSheet`.
- [x] Tests: a held consultation titled with a consult-first service carries it; one naming none carries null.

### Task 1.3 · The row as the door answers

**Files:** `apps/dashboard/src/legacy-bridge/surface-data.ts` (People), `legacy-bridge/people-detail.ts`
(`recordDeal`); test `tooling/scripts/tests/pipeline.test.mjs` (the wire).

- [x] `placeDeal(personId, deal: DealDto)`: the People row's `deal_*` columns take the deal when it is the row's deal
  (same id) or an open one (proposed or won), then `publishPeople()`; the re-read behind, which the refresh map already
  asks for, corrects anything else. Nothing when People is not loaded or holds no such person.
- [x] `recordDeal` calls it on an answer that carries a deal.
- [x] Test: record a move on the fake wire; the row's group changes before any re-read.

### Task 1.4 · The shell follows the Pipeline's address

**Files:** `apps/dashboard/src/legacy/pages/app-shell.jsx`; test `tooling/scripts/tests/pipeline.test.mjs` (the
registry case) and the shell's own route tests where they pin `clients/pipeline`.

- [x] `clients/pipeline` and `clients/pipeline:<anything>` draw the Pipeline with `pipelineRoute={param}`; the mount key
  is `clients/pipeline` for all of them (`shellMountKey`); the family regex reads `pipeline(:|$)`; the crumbs are People ›
  Pipeline. Where deals are off, every such address draws People and says `#/clients`, as today.
- [x] `surface-registry.ts`: `routeSurfaceFor("clients", "pipeline:…")` is People, like `pipeline` (it already
  fell back to `clients`; `pipeline.test.mjs` now pins it for a view and a peek).

### Task 1.5 · The page: its rail, its address, its phone view, its saved view

**Files:** `apps/dashboard/src/legacy/pages/pipeline-scope.jsx`, `pages/clients-a.jsx` (`usePlControls` takes a page's
own keys; `PL_VIEW_KEYS.pipeline`), `styles/clients.css`; test `pipeline.test.mjs`.

- [x] `PipelineRail` (in pipeline-scope.jsx): `PeopleScopeTabs` at its head, then `RailSection`/`RailRow` over
  `pipelineRail`; a pick navigates to `pipelineRoute({ view })`, pressing the picked row again goes to All deals
  (`railToggle`). People's lists are not drawn here.
- [x] The line's parts with a view are buttons (People's `pl-standing-needs`), `aria-pressed` on the view shown.
- [x] A phone: `PeoplePhoneBar` gets `listLabel` (the view's label), `listCount`, `onLists`, and `trailing` (New
  proposal's +); `onLists` opens `PeopleListsSheet` with the same rail rows (`scopeTabs` off). No other row of controls.
- [x] The address: the view comes from `parsePipelineRoute(pipelineRoute)`; the peek follows Leads' rule
  (`clients-a.jsx` `peekAddr`): the address moved → the page follows it; the page opened a peek → push, the cursor walked
  it → replace, closed → back to the entry it pushed, or replace when it came with the address.
- [x] Saved view: `usePlControls` gains `extra` (the page's own keys) merged into the view it saves and returns
  `remembered`; the Pipeline passes `{ layout }` and keeps views on (`keepsView`), its device key `chanlytics-pipeline-view`.
  The localStorage key `pipeline.view` from #941 is read once as the first default, then never written.
- [x] Tests: the rail's rows and a pick's address; a line press; the phone's button and sheet; opening a row pushes
  `:p-<id>`, J replaces, Esc goes back; an address with `:p-` opens its peek; the layout saved through `__saveView`.

### Task 1.6 · New proposal

**Files:** create `apps/dashboard/src/legacy/pages/pipeline-new.jsx`; `pipeline-scope.jsx`; both script lists;
`styles/clients.css`; test `pipeline.test.mjs`.

- [x] `PipelineNew`, hookless: a desk's `RecordSheet` (no Save: the pick is the act) or a phone's `PhoneSheet`. A search
  box over People's rows (`plMatcher`), up to eight matches, each a row (face, name, where their deal stands); Add
  someone new opens name and number (People's `plAddPerson`, its refusals under the field). A pick, or an add, closes
  it and asks `openDealSheet({ personId, mode: "propose" })`. The state (open, words, the add draft) is the scope's.
- [x] The controls row's right end carries New proposal (`btn btn-primary btn-sm`, the page's one filled button), for
  an owner or an operator only (`gate("approve", …)` otherwise).
- [x] Tests: the picker's matches, an add, a pick asking the sheet.

### Task 1.7 · Docs, both lists, the look

- [x] `0008`'s amendment: the peek is in the address (reversing #941's sentence), the Pipeline's rail, New proposal.
- [x] `legacy/CLAUDE.md` Pipeline paragraph; this plan's PR 1 ticks.
- [x] The probe at 1280, 1440, 390, both themes; the gate; the PR; merge on green. The probe also found the table's
  foot counting the whole Pipeline in a view ("18 people" under Proposal out's six): it counts the view now.
- [x] The review's one round: a linked person kept against a remembered cursor (Pipeline and Leads); the deal door
  answers `current` (people_list's rule, `server/deals.ts currentDealOf`) for `placeDeal`, so a move on an older deal
  never moves the row; New proposal's desk focus by the record sheet's `focusOn`; the consult-first prefill in
  `dealSheetFor` for every door, not while that service is open; the phone sheet "Show"; the dead `keepsView`.

---

## PR 2 · The row carries the deal (no schema)

Branch `design/the-row-carries-the-deal`. For a customer: every row and card wears the deal's three steps; Sort and
Columns, kept in the member's view; a ⋯ on each row with the peek's acts; a selection with Mark as passed · N (why asked
once), Add to list, Export; the peek shows how to reach them and the deal's history, and on a phone pins its one act.

### Task 2.1 · Contracts

**Files:** `packages/contracts/src/pipeline.ts`; tests `pipeline.test.mjs`.

- [x] `PipelineRowVM.track: { key: "consultation" | "proposal" | "client"; at: "done" | "current" | "ahead"; tone }[]`:
  the consultation only where one was held or is ahead; a proposal out is current at Proposal; a client done, done,
  current; a passed or ended deal has no track (its chip says it).
- [x] `PIPELINE_SORTS = ["waiting", "value", "name"]` (built as the table's own column keys, `stage`, `value`, `name`,
  so a heading sorts the way People's do), `pipelineSorted(vm, sort, dir)` within each group; `waiting`
  is the Pipeline's own order; `value` orders by `annualCents(cents, per)` (a month × 12), none last.
- [x] Columns: Person (pinned), Service, Value, Stage (track + in stage), Came from (off), Valid until (off), the chip,
  the row's ⋯. Words in `PIPELINE_WORDS.columns`.
- [x] `pipelinePassMany(rows)` (a People row carries no deal version, so the page reads it from each person first):
  the selection's proposals out (each `{ personId, dealId }`) and the words:
  "Mark 2 as passed", "1 is not a proposal out and stays as it is".
- [x] `pipelinePeekDetail(person: PersonVM)`: reach rows (the number with Call and Copy, the address with Copy, the
  wire's state: "Window open · 20 h", "Approved messages only until they write", "Texts", "Email") and history (the
  timeline's deal rows and steps done, newest first, at most three, then their last message).

### Task 2.2 · The page

**Files:** `pipeline-scope.jsx`, `pipeline-peek.jsx`, `pipeline-board.jsx`, `clients-a.jsx` (the bulk bar takes a
page's acts), `styles/clients.css`; tests `pipeline.test.mjs`.

- [x] The table: selectable, Sort (a menu on a desk, as People's), Columns (`PeopleColumnsMenu`), the ⋯ (`MoreMenu`
  with the deal's acts from `dealMenuActs`, then Open the thread, Open their page).
- [x] The bulk bar (People's `.cl-bulk`): Mark as passed · N asks why once (`DEAL_LOST_REASONS` as a toggle group),
  then records each through `__recordDeal` one at a time and says the count; Add to list and Export as People's.
- [x] The peek: reach rows and history under the card; on a phone an act bar pins the card's next act and Call.
- [x] Sticky group heads; with the peek open on a desk the table keeps Person and the chip (at 1280 some 350px are
  left beside the peek, which holds two columns; the peek's card says the value).
- [x] The board: each card's ⋯ has Move to… (the columns `pipelineMove` allows); a column shows twenty, then Show more.
- [x] Tests for each; the look; the gate; the PR; merge.
- [x] The review's one round: the pass reads each person afresh and records only a deal still a proposal out (a
  teammate's client was being passed), in the bridge (`passDeals`) with one re-read after the last whatever it
  answered, fifty at a press, passed / changed / could not be marked, only the passed leaving the selection; no
  Call for do-not-contact; `__deal.next` published; the chip column fixed (a wordless Columns row); a
  consultation's row menu proposes; value sorts by what the row shows; the bar beside the peek; heads at
  `--pl-head` above hovered pins; Move to shown on touch; the pass question's focus and Esc; Leads' stage sort
  untouched.

---

## PR 3 · The harness serves People (tests)

Branch `tooling/the-harness-serves-people`. For a customer: nothing. For the repo: the Pipeline's e2e spec runs locally.

- [ ] `tooling/scripts/e2e-harness/scenarios.mjs`: a `pipeline` scenario (fictional, a studio that sends proposals:
  `sells_by: "proposal"`, eight people across the four groups, in `people_list`'s row shape).
- [ ] `server.mjs` answers `GET /api/v1/contacts` (the scenario's page), `/segments`, `/views` and
  `GET /api/v1/contacts/:id` from the scenario; `fixture-src.ts` installs the real People surface (`peopleOverride`)
  over them, so People and the Pipeline are real in the harness.
- [ ] `e2e/people.spec.ts`'s Pipeline walk passes on `pnpm e2e:local -- e2e/people.spec.ts --scenario=pipeline`, and a
  mutation (the peek not opening) turns it red.
- [ ] `e2e-harness.test.mjs` builds the new scenario; the gate; the PR; merge.

---

## PR 4 · A next step is a dated note (migration)

Branch `design/a-note-may-have-a-day`. For a customer: a note can take a day and becomes a step, for anyone, deals or
not; steps show on the person's page, the deal card, the Pipeline (a column, a view, the peek, the board), Today's day
panel and the thread; Done keeps it in the log; a step for a teammate rings them, as a note does.

### Task 4.1 · Migration `<next free number>_a_note_may_have_a_day.sql`

- [ ] `person_notes`: `due_on date`, `done_at timestamptz`, `done_by uuid references auth.users (id) on delete set
  null`, `deal_id uuid references public.deals (id) on delete set null`; CHECK `due_on is null or team_only` (a step is
  the team's; the receptionist never reads it); CHECK `done_at is null or due_on is not null`; an index on
  `(tenant_id, contact_id)` where `due_on is not null and done_at is null`.
- [ ] `person_note_add` and `person_note_edit`: drop and recreate with `p_due_on date default null`, `p_deal_id uuid
  default null` (the deal must be this person's: `bad_deal`), and on edit `p_clear_due boolean default false`; a day sets
  `team_only`. `person_note_done(p_note_id uuid, p_done boolean default true, p_version integer default null)`: a step
  only (`not_a_step`), the version checked (`moved`), `done_at`/`done_by` set or cleared, one event.
- [ ] `people_list` v5 (drop, recreate from the newest): `step_id`, `step_body`, `step_due_on`, `step_for_user_id`,
  `step_deal_id`: the earliest open step (by day, then written).
- [ ] Grants and comments as the doors before; every statement re-runnable.

### Task 4.2 · Generated sets and types, the db tests

- [ ] On the isolated stack: reset, `gen:schema-sets`, `check-db-types` (write, then `--check`).
- [ ] `person-notes.db.test.mjs`: a step is Team only, the CHECKs refuse the rest, done and undone, the version, a
  deal of someone else's refused, `people_list`'s step columns, erasure takes steps.

### Task 4.3 · Contracts

- [ ] `PersonNoteDto` gains `due_on`, `done_at`, `done_by_name`, `deal_id`; `PersonNoteVM.step: { day, words, due:
  "past" | "today" | "ahead", done, doneWords } | null`.
- [ ] `PersonRowVM.nextStep: { id, words, day, due, forWho, dealId } | null` from `step_*`.
- [ ] `stepDays(nowMs, tz)`: Today, Tomorrow, the next weekday names to Friday, Next week (Monday), and Pick a day.
- [ ] `todayStepsDue(rows, nowMs, tz, max = 3)`: the rows whose next step is today or past, the oldest first, and
  "and N more".
- [ ] `NOTE_WORDS`: Add a day, Due, Done, Undo, For, "A step is for the team only", Set a next step, Next step.
- [ ] `PEOPLE_LISTS` gains `steps_due` ("Steps due", Attention, every workspace).
- [ ] Tests for each.

### Task 4.4 · Routes and the bridge

- [ ] `POST contacts/[id]/notes` takes `due_on` (a real day), `deal_id`, `clear_due`; `POST contacts/[id]/notes/done`
  `{ note_id, done, version }`; `route-policy.json`; `gen-route-types`.
- [ ] `window.__personNotes.done`; the refresh map re-reads People and the person; `packages/db` realtime watches
  `person_notes`, and People refreshes on it.

### Task 4.5 · The pages

- [ ] Notes (`client-profile.jsx` `PersonNotes`): the composer's Day beside For (a day turns Team only on and holds it
  there); a step shows its day and a Done box; done, it is struck through with who and when.
- [ ] `components/step-sheet.jsx` (`window.openStepSheet({ personId, dealId, noteId })`, a host in the shell): the
  words, the day (`stepDays`, or a date), For; Save writes through `__personNotes.write`. Done, the toast offers Set the
  next one.
- [ ] The deal card: Next · words · day · for whom, with Done and Change; Set a next step (dashed) with none.
- [ ] The Pipeline: the Next step column (sortable, `next`), the Steps due view in the rail, the peek's next row, the
  board card's line.
- [ ] Today (`dashboard-a-day.jsx`): steps due at the head of the day panel, three at most, "and N more" to
  `clients/seg:steps_due`.
- [ ] The thread: a step due under the deal chip, with Done.
- [ ] Ask: `propose_deal` gains `next_step` and `next_step_due`; the commit writes the note after the deal.
- [ ] `0007` amended ("A note may have a day"); the look; the gate; the PR; the push; merge.

---

## PR 5 · Your pace (migration)

Branch `design/your-pace`. For a customer: once a workspace has five decided proposals, the peek and the deal card say
"usually decided in N days", and "waiting" means past that pace by a fifth, with seven days until then, everywhere.

- [ ] Migration: `deal_pace(p_tenant_id uuid) returns table (median_days integer, decided integer)` over the last 365
  days' yeses (whole days from the proposal to the yes), security invoker, for members and the service role.
- [ ] `GET contacts` answers `deal_pace` where deals are on; `packages/contracts` `dealPaceOf(dto)` (null under five)
  and `waitAfterDays(pace)` (`round(median × 1.2)`, between 3 and 30; 7 without a pace).
- [ ] `waitingOnProposal(row, nowMs, waitDays = WAITING_AFTER_DAYS)`: Today, the Pipeline, the deal card and People's
  lists pass the workspace's; the line says "N waiting longer than usual" once a pace applies.
- [ ] The words in the peek head and the card; tests; `0008` amended; the look; the gate; the PR; the push; merge.

---

## PR 6 · A proposal waiting gets a follow-up (0006, migration)

Branch `design/a-proposal-follow-up`. As `docs/decisions/0006-a-proposal-follow-up.md` Steps 1–6, with its open
questions answered as it recommends: a new class `follow_up`, `ask` by default, only with a link, and the wait is the
workspace's pace (PR 5) rather than a fixed week. The Pipeline then says when a proposal's follow-up goes
("Follow-up Tue 9:00 AM") and keeps "Nothing back" for those it will not reach, as 0006 says of Today.

- [ ] Its six steps, its tests (0006 "Tests"), the look, the gate, the PR, the push, merge; 0006's status: built.

---

## Self-review

- Every decision has its PR: 1 (B, all), 2 (steps as notes → PR 4), 3 (pace → PR 5), 4 (0006 → PR 6), 5 (rail → 1.5),
  6 (address → 1.5), 7 (New proposal → 1.6), 8 (track → 2.1), 9 (Today for every workspace → 4.3, 4.5).
- The fixes: No link and the wait (1.1), the saved view (1.5), the service (1.2), the row at once (1.3), notes live
  (4.4), the e2e walks (PR 3).
- Held: phase 3 (open tracking, accept, deposit), Reports' sub-pages, one row per open deal.
