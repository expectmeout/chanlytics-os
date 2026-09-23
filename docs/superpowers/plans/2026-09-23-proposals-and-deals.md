# Proposals and Deals, One Record — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the proposal part of the deal (link, value, valid until, reason for passing), switch the whole deal layer on by one workspace answer, record-and-send through one shared sheet, and show the deal where the work happens: the person page, the thread, a Pipeline in People, Today, the Calendar and Reports.

**Architecture:** The design is `docs/decisions/0007-a-proposal-is-part-of-the-deal.md`; read it first. One migration (00157) moves the link onto `deals` and adds `tenants.sells_by`. Contracts own every word and rule (`deals.ts`, a new `deal-sheet.ts`, a new `pipeline.ts`). The legacy shell gets one shared `DealSheet` (on the record kit's `RecordSheet`), a deal card on the person page, a Pipeline scope that reuses `PeopleTable`, and small additions to Today, the Calendar peek and Reports. Sends go through the Inbox's existing reply courier.

**Tech stack:** Supabase Postgres (SQL doors, RLS, forward-only migrations), pnpm/turbo monorepo with committed `packages/*/dist`, Next.js dashboard with the legacy JSX shell (in-browser globals via `window`), Node's test runner with a stub React (`tooling/scripts/tests/_hook-frames.mjs`), Playwright e2e.

---

## Conventions every task follows

- **Worktree:** each PR is built in its own sibling worktree off `origin/main` (`../cm-<topic>`), then `corepack pnpm install --frozen-lockfile --prefer-offline`. Never work in the shared checkout.
- **The gate before a PR:** `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm format:check`. Commit only the dists with a real `git diff -w` change; `git checkout --` the CRLF-only ones.
- **Legacy files:** a new `.jsx` goes in BOTH `apps/dashboard/src/legacy-bridge/manifest.ts` and `apps/dashboard/src/legacy/Chanlytics.html`, same order (`legacy-harness.test.mjs:71-97`). Every edited legacy file (`.jsx` and `.css`) gets its `?v=` bumped in `Chanlytics.html`. Files share one Babel scope: export with `Object.assign(window, …)`, no top-level object-rest patterns.
- **Words:** every sentence a page shows comes from `packages/contracts`. Tests execute the code; never add a source-text assertion (`readCode`/`readRaw`).
- **Commits:** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. PR bodies say what changes for a customer, what to set or apply before merging, and the deploy order, and end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Database locally:** use an isolated stack so other sessions' stacks are untouched. Copy `supabase/{config.toml,migrations,seed.sql,templates}` to a scratch dir, set `project_id = "cm-proposals-test"`, shift every port (54321→55421, 54322→55422, 54320→55420, 54329→55429, 54323→55423, 54324→55424, 54327→55427, inspector 8083→8093), then with `SB=~/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe` (2.116.0, the CI pin): `"$SB" start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector --workdir <dir>`. Export `SUPABASE_WORKDIR=<dir>`, `SUPABASE_CLI="$SB"`, `SUPABASE_URL=http://127.0.0.1:55421` and the demo keys from `"$SB" status -o env --workdir <dir>`. After adding a migration: copy it into `<dir>/supabase/migrations/`, `"$SB" db reset --local --workdir <dir>`, then `corepack pnpm gen:schema-sets` and `node tooling/scripts/check-db-types.mjs` (writes) then `--check`, and `corepack pnpm test:db`. Stop with `"$SB" stop --workdir <dir> --no-backup`.
- **Production push** (Claude's to run): the PR is green; from the PR's worktree with `supabase/.temp/.` copied in from the main checkout, `"$SB" db push --linked --dry-run` lists ONLY 00157, then `db push --linked --yes`, then read back with `db query --linked` (aggregate so the answer fits). Push BEFORE merging, because the new code reads the new columns.

---

## PR 1 · The record

Branch `design/a-proposal-is-part-of-the-deal` (worktree `cm-proposals`, already created). Nothing a customer sees changes except: a booking workspace's More menu no longer offers "Send the proposal", and a proposal's value shows wherever the deal's facts do.

### Task 1.1 · Migration 00157

**Files:** Create `supabase/migrations/00157_a_proposal_is_part_of_the_deal.sql`.

- [ ] **Header**, a few lines: the proposal moves onto the deal (0007), and the workspace says how its customers buy.
- [ ] **Deal columns** exactly as in 0007's Shape: `proposal_url` (00154's CHECK word for word), `valid_until date`, `lost_reason` (CHECK in `price, timing, elsewhere, no_reply, not_a_fit, other`). `comment on column` for each.
- [ ] **`tenants.sells_by`**: `text`, CHECK `sells_by is null or sells_by in ('booking','proposal')`, `grant update (sells_by) on public.tenants to authenticated;` (00084 already has the owner update policy and the table-wide revoke), a column comment.
- [ ] **`deal_record` v2.** `drop function if exists public.deal_record(uuid, text, uuid, integer, text, timestamptz, integer, text, text, jsonb);` then `create function public.deal_record(...)` with 00156's ten parameters followed by `p_proposal_url text default null, p_valid_until date default null, p_lost_reason text default null, p_clear text[] default null`. Copy 00156's body (`:94-236`) and change only:
  - New refusals after the existing checks: `bad_link` when `p_proposal_url` fails the column's rule (test it in the door so the answer is a refusal, not a 23514); `bad_reason` when `p_lost_reason` is outside the set; `bad_clear` when any `p_clear` element is outside `proposal_url, valid_until, amount, note`.
  - The new-row insert also writes `proposal_url` and `valid_until`.
  - The move's update: `proposal_url` is null when `'proposal_url' = any(p_clear)`, else `coalesce(p_proposal_url, proposal_url)`; the same for `valid_until`; `amount` in `p_clear` nulls both `amount_cents` and `per`; `note` in `p_clear` nulls `note`. `lost_reason` becomes `coalesce(p_lost_reason, <old reason when the row was already lost>)` when `p_stage = 'lost'`, and null for any other stage.
  - A same-stage call still writes no event. Events keep their data exactly (no link, amount, note or reason in them).
  - Grants as 00156 (`:238-241`), and the function comment restated.
- [ ] **`deals_erase_on_contact`**: `create or replace`, the update also sets `proposal_url = null`.
- [ ] **`set_person_proposal` write-through.** `create or replace` with 00154's signature and body (`:57-85`), then, after the contact's update and its event: lock the person's current open deal (`stage in ('proposed','won')`, proposed first, newest). If it is proposed, set its `proposal_url` to the new link (null when cleared) and bump `version`. If there is no open deal and the link is non-empty, insert a proposed deal (`service` null, `proposed_at` now, `proposal_url`, `source 'person'`, `created_by` the caller, `lead_id` by `deal_record`'s rule) and its `deal.proposed` event in `deal_record`'s data shape. A won deal is left alone.
- [ ] **Backfill, idempotent.** (a) For each contact with a `proposal_url` (not erased, not merged), set it on their current open deal where that deal has none. (b) For each such contact with no open deal, insert a proposed deal dated by the newest `contact.proposal_set` event with `set` true (else `now()`), `created_by` null, `source 'person'`, and one `deal.proposed` event per inserted row in `deal_record`'s data shape with `by` null. Read 00154's event insert for how that event names its subject.
- [ ] **`sells_by` backfill**: `proposal` where it is null and the tenant has any deal, any live contact with a `proposal_url`, or a non-empty `consult_first` array (`jsonb_typeof(... #> '{brain,profile,booking_rules,consult_first}') = 'array'` and length > 0).
- [ ] **`people_list` v3**: `drop function if exists public.people_list(uuid, uuid, text, integer, integer);` then create it from 00156 (`:294-534`) with three more columns after `deal_per`: `deal_proposal_url text`, `deal_valid_until date`, `deal_lost_reason text`, selected in the `dl` lateral. Grants and comment as 00156.
- [ ] Every statement re-runnable (`if not exists`, `drop … if exists`, `create or replace`, backfills guarded by `is null` / `not exists`).

### Task 1.2 · Generated sets and types

- [ ] On the isolated stack: `db reset`, `corepack pnpm gen:schema-sets` (adds `deals.lost_reason`, `tenants.sells_by`), `check-db-types.mjs` (writes `packages/db/src/database.types.ts`), then both with `--check`.
- [ ] `packages/contracts/src/schema-sets.ts`: hold the two new sets with `Exactly` like `deals.stage` (`:157-160`).

### Task 1.3 · Contracts: `deals.ts`

**Files:** Modify `packages/contracts/src/deals.ts`, `packages/contracts/src/index.ts` (exports); Test `tooling/scripts/tests/deals.test.mjs`.

- [ ] `DEAL_LOST_REASONS` (`as const`, typed through `SchemaSet<"deals.lost_reason">`) and `DEAL_LOST_REASON_WORDS`: Price, Timing, Went elsewhere, No reply, Not a fit, Other.
- [ ] `SELLS_BY` (`SchemaSet<"tenants.sells_by">`), `SELLS_BY_QUESTION = "How customers buy"`, `SELLS_BY_WORDS`: `booking` → `{ label: "They book an appointment", sentence: "Bookings, reminders and the booking link." }`; `proposal` → `{ label: "Some get a proposal first", sentence: "Adds deals: a proposal on each person, a Pipeline in People, and a Deals section in Reports." }`. `dealsAreOn(sellsBy) => sellsBy === "proposal"`. Delete `dealsAreAThing` and move every caller (Task 1.7).
- [ ] `DealDto`, `DealColumns`, `DealFacts`, `dealFactsOf`: optional `proposal_url`, `valid_until` (`YYYY-MM-DD`), `lost_reason` (and `deal_*` twins), optional so an older database still parses.
- [ ] `DealVM`: `amount` at every stage (drop the won-only guard at `:167`; `facts` now carries it for a proposal too); `proposal: { url, host } | null` (host via `linkHost`); `validUntil: { day, words, lapsed } | null` for a proposed deal only ("Valid until Sep 30" / "Lapsed Sep 30", by the business's clock); `reason: { code, words } | null` for a passed deal.
- [ ] `parseAmount(words) => cents | null`, moved from `client-profile.jsx`'s `centsOf` with its exact rules ("2,500" → 250000, "-5" and "abc" → null); the page will import it through `window.__deal`.
- [ ] `amountTotalsWords(items)`: sums by `per` and joins, "$4,250 + $600 a month"; null when nothing has an amount.
- [ ] `waitingOnProposal(row, nowMs)` split out of `proposalsWaiting` (which now filters with it).
- [ ] `consultationsWithoutProposal(rows, nowMs)`: rows whose `consultedMs` (Task 1.4) is within the last `CONSULT_FOLLOW_DAYS = 7` days and who have no open deal, or whose deal is passed or ended with `sinceMs` before the consultation.
- [ ] `DEAL_REFUSALS` gains `bad_link` ("That is not a web address."), `bad_reason`, `bad_clear`.
- [ ] `DealMove` gains `mode: "propose" | "again" | "won" | "lost" | "ended"`, keeping `to`/`sameRow`/`label` so today's page keeps working until PR 2.
- [ ] Tests: the value at every stage (flip `deals.test.mjs:154-155` on purpose, saying why), `validUntil` and `reason` words, `dealsAreOn`, `parseAmount`'s cases, `amountTotalsWords`, `waitingOnProposal`, `consultationsWithoutProposal`, the new refusal sentences.

### Task 1.4 · Contracts: `people.ts`

- [ ] `PersonRowVM.consultedMs: number | null`: the end of the person's last visit when it was a consultation (`visits.last.consultation` and `visits.last.end`), in `toPersonRowVM`.
- [ ] `PersonVM.proposal` comes from the current deal's link when the current deal is proposed, else from `d.proposal_url` when there is no open deal, else null. `proposalSent` runs on that link.
- [ ] `personActs`' proposal act only where deals are on (`p.dealsOn`).
- [ ] The timeline's deal rows add the value ("Proposal sent · Color correction · $1,200") and the reason ("Passed · Color correction · Price").
- [ ] Tests in `people-vm.test.mjs`, `deals.test.mjs` and `person-honest.test.mjs` for each.

### Task 1.5 · The deal route and courier

**Files:** Modify `apps/dashboard/app/api/v1/contacts/[id]/deal/route.ts`, `apps/dashboard/src/legacy-bridge/people-detail.ts`; Test `tooling/scripts/tests/people-routes.test.mjs`.

- [ ] Body gains `proposal_url` (string ≤ 600; `normalizeLink`, and `whyNotALink`'s sentence as a validation refusal), `valid_until` (`/^\d{4}-\d{2}-\d{2}$/` or null), `lost_reason` (enum), `clear` (array of the four field names). Each reaches the rpc only when present, so the pinned argument lists (`people-routes.test.mjs:1052-1054, 1104-1112`) still hold; add new cases for each field.
- [ ] Courier `DealBody` mirrors it; `window.__deal` gains `reasons`, `reasonWords`, `parseAmount`, `sellsBy` words.

### Task 1.6 · The workspace answer

**Files:** Modify `apps/dashboard/app/api/v1/workspaces/route.ts`, the bridge that publishes the workspace list and the timezone courier (`legacy-bridge/identity.ts:72` and where `__WORKSPACES` is set), `tooling/scripts/tests/route-policy.json` only if the declaration changes; `refresh-map.ts`.

- [ ] GET selects `sells_by` (and the retry path at `:68` keeps working on a database that lacks it).
- [ ] PATCH takes `{ timezone?, sells_by? }` (at least one; `sells_by` must be one of `SELLS_BY`), updates what it was given, and counts rows (403 on none), as it does for the timezone.
- [ ] The bridge publishes `sellsBy` on the current workspace and generalizes the timezone courier to a workspace patch; the refresh map re-reads People, Reports and Today after it.
- [ ] Tests for the route (owner only, the set, the count) and the courier.

### Task 1.7 · Every gate reads the answer

- [ ] `apps/dashboard/src/server/deals.ts`: replace `anyDealRecorded` with a `sells_by` read.
- [ ] `apps/dashboard/app/api/v1/contacts/route.ts:40-46` and `contacts/[id]/route.ts:389-393, 477`: `deals_on: dealsAreOn(sells_by)`; keep `consult_first` where it is sent.
- [ ] `apps/dashboard/src/server/audience.ts:17-40`: `AudiencePool.deals_on` from `sells_by`.
- [ ] Reports: the route gives `dealReport` the answer and the Deals section is present only when deals are on.
- [ ] Today: `todayLeaks`' proposals-waiting row only when `people.dealsOn`.
- [ ] Update the tests that pinned the old gate (`deals.test.mjs:248-253`, `ask-turn.test.mjs:1225-1320`, `calendar-people.test.mjs:949-971`, `person-honest.test.mjs:1740-1760`).

### Task 1.8 · The receptionist and Ask read the deal's link

- [ ] `packages/db/src/repositories/thread.ts`: the deals select adds `proposal_url`; `proposalUrl` is the current deal's link when it is proposed, the person's when they have no open deal, else none. Update the pinned select (`lead-context.test.mjs:227-231`) and add cases for each branch.
- [ ] Ask: `propose_deal` (`apps/dashboard/src/server/ask/proposals.ts:129-144, 514-587`) takes `proposal_url`, `valid_until` and `lost_reason`, and says a proposal's value in its summary; `getPerson` (`tools.ts:643-757`) says the deal's value and link host in its facts. Tests in `ask-turn.test.mjs` and `ask-commit.test.mjs`.

### Task 1.9 · Database tests

- [ ] `deals.db.test.mjs`: the new fields on a new proposal; an edit keeps what it is not told and clears what `p_clear` names; `bad_link`, `bad_reason`, `bad_clear`; passing sets the reason and proposing again clears it; `people_list` returns the three new columns; erasure blanks the link.
- [ ] `person-proposal.db.test.mjs`: the door writes through to an open proposal, opens one where none, and leaves a client's deal alone.
- [ ] The backfill, proved once by hand: an isolated stack replayed to 00156, seeded with a contact holding a link and no deal, a contact holding a link and a proposed deal, and a tenant with `consult_first`; then 00157; then read back. Paste the before/after rows into the PR body.

### Task 1.10 · Docs

- [ ] `docs/decisions/0007-a-proposal-is-part-of-the-deal.md` and this plan.
- [ ] `docs/decisions/0004-deals-record.md`: its Status line says 0007 amends it, and each amended passage points to 0007.
- [ ] `docs/decisions/0006-a-proposal-follow-up.md`: the follow-up reads the deal's link.
- [ ] `docs/decisions/README.md` lists 0007.

### Task 1.11 · Ship

- [ ] The gate; the PR; the production push (dry run lists only 00157, push, read back the three deal columns, `sells_by` per tenant, and the salon's and RJ Capital's deals); merge on green; check on production that the salon still shows its deals and that Priya Nair's link now lives on a deal.

---

## PR 2 · One sheet, and the deal where the work is

Branch `design/one-sheet-for-every-deal-move`, off main after PR 1.

### Task 2.1 · Contracts: `deal-sheet.ts`

**Files:** Create `packages/contracts/src/deal-sheet.ts`, export it from `index.ts`; Test `tooling/scripts/tests/deal-sheet.test.mjs`.

- [ ] `DealSheetMode = "propose" | "edit" | "again" | "won" | "lost" | "ended"`.
- [ ] `dealSheetFor(mode, person, nowMs, tz) => DealSheetVM`, where `person` is the person VM's `{ name, services, deal, replyVia, replyWindow, consent, openThread, proposal, ownMessages }`. The VM names each field present for the mode, its label, hint and default:

  | Mode | Title | Fields | Save |
  |---|---|---|---|
  | propose | New proposal | service (only when the profile lists two or more), link, value + per, valid until, send + message | Record and send / Record |
  | edit | Edit the proposal | link, value + per, valid until | Save |
  | again | Propose again | as propose, service fixed | Record and send / Record |
  | won | Mark as client | when, agreed amount + per (the proposal's value by default), how they said yes | Mark as client |
  | lost | Passed | when, why (the six reasons), note | Record |
  | ended | End the engagement | when | End it |

  Words: link label "Proposal link", hint "A Google Doc, a PDF or any page you would send them."; value label "Value", hint "Optional. Only you see it: the receptionist never says a figure."; valid until "Valid until", hint "Optional."; the send switch "Send it now on WhatsApp" / "by email" / "as a text", by `replyVia`; the message defaults to `proposalMessage(url)` and must still contain the link.
- [ ] Send availability, one rule: the person has a thread, has not said stop or been marked do-not-contact, and free text can go on their wire (`proposalAction(...).ready`). When it cannot, `send.why` says so: "Their WhatsApp window has closed. Record it now, and send it from their thread when they write next.", "They asked not to be messaged.", "There is no conversation with them yet."
- [ ] `dealSheetBody(mode, draft, deal) => { body } | { problem }`: the route body with `clear` for every field the person emptied, `deal_id` and `version` for a same-row move, the service only for a new row, `parseAmount` for amounts (its problem sentence "An amount is a number, like 2,500."), `whyNotALink` for the link.
- [ ] `dealNextAct(person, nowMs)`: the card's one primary act by stage. Proposed with no link → "Add the link" (edit); with a link not sent and a send possible → "Send the proposal"; sent, waiting a week and a send possible → "Follow up"; otherwise → "Mark as client". Won → none. Passed → "Propose again". Ended or none → "Start a proposal".
- [ ] `proposalFollowUp(url)`: "Just checking the proposal reached you. Here it is again: <url>".
- [ ] Tests: every mode's fields and words, each send reason, the body with and without clears, the next act per stage.

### Task 2.2 · The sheet and its host

**Files:** Create `apps/dashboard/src/legacy/components/deal-sheet.jsx`; Modify `apps/dashboard/src/legacy/app-shell.jsx` (mount the host once, beside the shell's other overlays), `manifest.ts`, `Chanlytics.html`, `styles/record.css` if the sheet needs a class; Test `tooling/scripts/tests/deal-sheet.test.mjs`.

- [ ] `window.openDealSheet({ personId, mode, service? })` dispatches `deal:sheet`. `DealSheetHost` listens, reads the person through the existing detail courier (the same cache the person page uses), and draws `DealSheet`.
- [ ] `DealSheet` is `window.RecordSheet` with `onSave`, `saving`, `saveLabel`, the kit's fields only (`RecordField`, `RecordBox type="date"`, `RecordToggleGroup` for per and for the reasons, `RecordSwitch` for send), and a `select` in the kit's input style for the service. It joins `__recordFolds` as `deal-sheet` with a dirty test, as `BtSheet` does (`business-tab-gestures.jsx:785-791`).
- [ ] Save: `window.__recordDeal(personId, body)`. On success with send on, send through `window.threadVerbs(flash)` with the person's conversation (`threadId` without its `th-`), so the toast, the Undo and the email retry are the Inbox's own. Then close, flash "Proposal out · <name>" (or the stage's word), and dispatch `deal:recorded` with the person's id. A refused record keeps the sheet open with the refusal under the field it names; a refused send after a good record says "Recorded. It did not send: <reason>" and closes.
- [ ] Phone: the kit already makes it a sheet rising from the bottom; check nothing overflows at 375px.

### Task 2.3 · The deal card

**Files:** Create `apps/dashboard/src/legacy/pages/person-deal.jsx`; Modify `apps/dashboard/src/legacy/styles/clients.css`, `manifest.ts`, `Chanlytics.html`.

- [ ] `PersonDealCard({ p, canRecord })`, nothing when deals are off.
- [ ] **No deal:** one quiet line: "No proposal yet", with the consultation when there is one ("Consultation Fri, Sep 25" or "Consultation was Tue, Sep 22"), and "Start a proposal" (primary when a consultation ended in the last week).
- [ ] **A deal:** a card in `.cl-prof-up-visit`'s family (raised ground, 1px line, `radius-md`): the service (or "Proposal") and the value; three quiet steps (Consultation shown only when there is a consultation, Proposal out, Client) as 3px bars in the stage's tone; the link's host (opens in a new tab), whether it went ("Sent Sep 15 on WhatsApp", "Not sent yet"), the "valid until" words, and "Nothing back in 8 days" in the warn tone once a proposal has waited a week; then `dealNextAct` as the primary button and the other moves as quiet buttons (`dealMoves`). A client says "Client since Sep 18 · $120 a month"; a passed deal "Passed Sep 20 · Price" with "Propose again".
- [ ] Every button opens the sheet, except "Send the proposal" and "Follow up", which open the thread with the words ready exactly as the More menu's send does (`client-profile.jsx:1453-1456`).

### Task 2.4 · The person page

**Files:** Modify `apps/dashboard/src/legacy/pages/client-profile.jsx`.

- [ ] Remove `PersonDeal`, `DEAL_EMPTY`, `centsOf`, `recordDeal`, `dealFold` and the settings Deal row (#912), and `PersonProposal` with its About row: the link lives in the deal.
- [ ] Draw `PersonDealCard` in the left column above Coming up.
- [ ] Reload on `deal:recorded` for this person.
- [ ] Tests: rewrite the Deal tests in `person-honest.test.mjs` for the card (each stage's words and next act, nothing when deals are off, no About Proposal row, no settings Deal row) and the sheet through the real courier.

### Task 2.5 · The thread

**Files:** Modify `apps/dashboard/src/legacy/pages/inbox-thread.jsx` (Actions, `:501-542`).

- [ ] Replace "Record a deal…" with a Deal group by stage, only where deals are on: none → "Start a proposal"; proposed → "Send the proposal" (the deal's link: the People row's `deal.proposal.url`, else `thread.proposalUrl`), "Mark as client", "Passed…", "Edit the proposal"; client → "End the engagement…"; passed → "Propose again". Each opens the sheet, except the send, which keeps its `inbox:compose` event.
- [ ] Tests in `thread-controls.test.mjs` and `calls-in-the-thread.test.mjs`.

### Task 2.6 · E2e and docs

- [ ] `e2e/people.spec.ts`: the deal walk opens a person, presses "Start a proposal", fills the link, records without sending, and reads the card; it still self-skips where deals are off.
- [ ] `e2e/people-consent.spec.ts`: the proposal-link walk moves to the sheet and self-skips where deals are off (the nightly workspace answers "booking"; seeding it is Ruben's call).
- [ ] `apps/dashboard/src/legacy/CLAUDE.md`: the person page's deal card and the sheet.

---

## PR 3 · How customers buy

Branch `design/how-customers-buy`.

- [ ] **Business tab.** In the "What you offer" card (`business-tab-offer.jsx:150-202`), a first row "How customers buy": the answer's label, or "Not said yet"; its fold draws the two answers as `RecordToggleGroup` choices, each with its sentence, and saves through the workspace courier (PR 1), not through `PUT settings`, as the timezone row does. Add the fold to `FOLD_BLOCK` as `null` (`legacy-bridge/business-tab.ts:84-121`) and to the bridge test's `NOWHERE` list.
- [ ] **Create card.** `business-tab-create.jsx` asks the same question, "They book an appointment" chosen by default, and saves it with the workspace.
- [ ] **Consult first.** Its row hint, where deals are on: "A consultation for these is the first step of a deal."
- [ ] Tests: `business-tab-offer.test.mjs` row labels, the fold's save through the courier, the create card; `business-tab-folds.test.mjs` maps.

---

## PR 4 · The Pipeline

Branch `design/the-pipeline-is-a-view-of-people`.

### Task 4.1 · Contracts: `pipeline.ts`

- [ ] `pipelineOf(rows, nowMs, tz)` → `{ summary, groups, empty }`. Groups, in order: **Consultations** (a consultation ahead, or one held with no proposal, by `consultationsWithoutProposal`), **Proposal out**, **Clients**, **Passed or ended** (collapsed). Each group has a label, a count and a meta line (a value total from `amountTotalsWords` for proposals and clients).
- [ ] Row VM: name, service, value, time in stage ("8 d"), and one chip with a tone: "Fri 2:00 PM"; "Held Tue · no proposal yet" (warn); "No link" (warn); "Nothing back in 8 d" (warn); "They wrote Tue"; "Valid until Sep 30" / "Lapsed Sep 30" (warn); "Since Sep 18"; "Price · Sep 20".
- [ ] Order: held consultations oldest first, then upcoming soonest first; proposals waiting longest first; clients and closed newest first.
- [ ] Summary: "3 proposals out · $4,250 · 1 waiting over a week · 2 clients · $1,340 a month", saying only the parts that have something.
- [ ] Tests in `tooling/scripts/tests/pipeline.test.mjs`.

### Task 4.2 · `PeopleTable` sections

- [ ] `people-table.jsx`: an optional `sections` prop (`[{ key, label, meta, rows, collapsed, onToggle }]`) that draws one `<tbody>` per section with a header row (`<th scope="rowgroup" colSpan>`, no `id`, so the cursor and select-all skip it). Without `sections` the table is unchanged. On a phone the header row runs full width (`clients.css:2351-2352`).
- [ ] Tests in `people-table.test.mjs`.

### Task 4.3 · The scope, the tab and the route

- [ ] Create `apps/dashboard/src/legacy/pages/pipeline-scope.jsx`: `PipelineScope` draws People's rail and, in the main column, the summary line and `PeopleTable` with `sections` and the Pipeline's columns (People's person cell, service, value, in stage, the chip); a row opens the person. Empty: "No deals yet. Start a proposal from someone's page."
- [ ] `clients-a.jsx`: `PeopleScopeTabs` and `PeoplePhoneBar` gain "Pipeline" (`scope-pipeline`) only where deals are on; `onScope("pipeline")` goes to `clients/pipeline`; `ClientsA scope="pipeline"` draws `PipelineScope`.
- [ ] `app-shell.jsx`: a `clients/pipeline` branch before the profile catch-all (`:444`), crumbs "People / Pipeline", `activeNav = "clients"`; the route family regex (`:771`) gains `pipeline`. Where deals are off, the address shows People. `#/pipeline` keeps redirecting.
- [ ] `clients.css`: `.pt-scope` to `grid-auto-flow: column; grid-auto-columns: 1fr`; the section header and chips in the table's quiet style.
- [ ] Tests: the two-tab pins stay (deals off); new cases with deals on (three tabs, the route, `route-stay` between People and Pipeline in `shell-status.test.mjs`); the phone bar at 375px has no sideways scroll.

---

## PR 5 · Today and the Calendar

Branch `design/today-and-the-calendar-know-the-deal`.

- [ ] **Today.** `TodayLeakId` gains `consults-waiting`; `LEAK_ORDER` is never-booked, unanswered, consults-waiting, proposals-waiting, unreachable, quiet. Only where deals are on: "2 consultations in the last week ended with no proposal yet." (always a digit), tag "Next step", icon `calendar`, math that re-prints the Pipeline's number, up to two people linking to their pages, and "See who" to `clients/pipeline`. Widen `PeopleListsLike.rows` for the fields it reads. Tests in `today-leaks.test.mjs`; `e2e/today.spec.ts:133` accepts the tags "Waiting" and "Next step".
- [ ] **Calendar.** `CalendarBlockVM` gains `consultation` and the consult-first service its title names (set where `server/calendar.ts` builds the items, with `isConsultationTitle`). The peek (`calendar-real.jsx` `CrPanel`, `:157-244`) shows the person's deal stage beside their name when they have one (from `window.__PEOPLE`), and "Start a proposal" when the consultation is over and they have no open deal. Update the focus-order pin (`calendar-honest.test.mjs:326-365`).

---

## PR 6 · Reports

Branch `design/reports-says-how-deals-go`.

- [ ] `apps/dashboard/src/server/deals.ts` `dealReport`: read `stage, proposed_at, decided_at, amount_cents, per, currency, lost_reason, contact_id`; keep the cohort (proposals of the period); add the median days from proposal to a yes for the cohort's clients, what is open now (count and `amountTotalsWords`), where the cohort's clients came from (`came_from` from the People rows the route already reads), and the cohort's reasons for passing.
- [ ] `DealReportDto` / `toDealReportVM`: keep the three sentences; add `outcomes` (Became clients, Still waiting, Passed) for a `BarList` with `max` the cohort's size, and up to four more sentences ("Median 9 days to a yes.", "$4,250 still open across 3 proposals.", "2 of 3 new clients came from Leads.", "Price was the most common reason for passing, 2 of 3.").
- [ ] `reports-sections.jsx`: the Deals section draws the sentences, the `BarList` and the lines. No tile is added to the five.
- [ ] Tests: `deal-report.test.mjs` (the whole object), `reports-page.test.mjs`.

---

## PR 7 · The person's link retires

Only after PRs 1–6 are deployed and read back. **Code first, then the database:** the readers stop reading the column, then 00158 drops it.

- [ ] Code: remove the fallbacks (`thread.ts`, `dto.ts`'s contacts embed, `PersonDetailDto.proposal_url`, `InboxThreadVM.proposalUrl` in favour of the People row's deal), the details route's `proposal` field and its words, the e2e seed's `proposal_url: null`, and the tests of the old door.
- [ ] 00158 (pushed after the code deploys): repeat the backfill for any link set since 00157, then drop `set_person_proposal`, `contacts_erase_clears_proposal` and `contacts.proposal_url`. `contact.proposal_set` stays in `EVENT_KINDS`: event names never change.

---

## Self-review

- **Coverage:** every decision in 0007 has a task: the record (1.1–1.9), the switch (1.6, 1.7, PR 3), the sheet (2.1–2.2), the card (2.3–2.4), the thread (2.5), the Pipeline (PR 4), Today and the Calendar (PR 5), Reports (PR 6), the retirement (PR 7).
- **Either order:** 00157 is pushed before PR 1 merges; every later PR reads only what 00157 made; PR 7 is code first, database second.
- **Names:** `dealsAreOn`, `sells_by`/`SELLS_BY`, `proposal_url`, `valid_until`, `lost_reason`, `openDealSheet`, `deal:sheet`, `deal:recorded`, `PersonDealCard`, `PipelineScope`, `pipelineOf`, `dealSheetFor`, `dealSheetBody`, `dealNextAct` are used the same way throughout.
