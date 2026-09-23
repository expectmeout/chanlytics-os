# 0008 · A proposal is part of the deal

**Status:** built (PRs #927, #933, #937, #939, #938, #934, all merged 23
September 2026), and amended the same day by "The Pipeline is a workspace"
at the end of this note. Written against commit `d319dcdb` (PR #915,
23 September 2026), and verified against the code at it. Where this note and
the code disagree, the code wins. It amends [0004](0004-deals-record.md) where
it says so, and the plans are
`docs/superpowers/plans/2026-09-23-proposals-and-deals.md` and
`docs/superpowers/plans/2026-09-23-pipeline-one-workspace.md`.

## Context

### Two features that do not know each other

The proposal link and the deal were built a day apart and nothing joins them.

- **The link is on the person.** `contacts.proposal_url`
  (`supabase/migrations/00154_a_person_may_have_a_proposal.sql:19-31`), one per
  person, written by `set_person_proposal` (`:57-85`), whose event never
  carries the address. A second proposal overwrites the first.
- **The deal is on the engagement.** `deals`
  (`00156_a_deal_is_a_record.sql:27-51`) has no link, no expiry and no reason
  for passing. `DealDto` (`packages/contracts/src/deals.ts:53-67`) carries none
  of them.
- **Sending records nothing.** The More menu's "Send the proposal"
  (`apps/dashboard/src/legacy/pages/client-profile.jsx:1462-1463`) and the
  thread's (`inbox-thread.jsx:514-526`) fill the composer with
  `proposalMessage(url)` (`people.ts:446-448`). "Sent" is derived afterwards
  from the messages (`proposalSent`, `people.ts:511-526`).
- **Recording sends nothing.** `PersonDeal` (`client-profile.jsx:1005-1107`)
  asks for a date and a service; the link is never asked for.
- **A proposal has no value.** The page asks for an amount only on "Became a
  client" (`client-profile.jsx:1063-1070`), and `toDealVM` shows one only for
  won (`deals.ts:167`), although the door already stores an amount on a new
  proposed row (`00156:158-164`).
- **They switch on differently.** The link shows on every workspace
  (`client-profile.jsx:1442-1444`); deals show only where
  `dealsAreAThing(consultFirst, anyDeal)` holds (`deals.ts:272-275`), a
  booking rule nobody reads as a switch.

### Where each piece can live

- **Workspace settings.** `TenantConfigSchema`'s top level is not strict, but
  every section is (`packages/contracts/src/config.ts:553, 693, 703, 706-711`):
  a key added inside one is refused by an older edge, and the receptionist goes
  silent (`apps/edge/lib/tenant-runtime.ts:212-219, 244`). `PUT settings`
  writes the whole config (`settings/route.ts:129-149`), so a top-level key an
  older build does not know is dropped on its next save. The one typed
  workspace setting with its own door is the timezone: a column, an owner
  update policy and a column grant (`00084_workspace_timezone.sql`), written by
  `PATCH workspaces` (`apps/dashboard/app/api/v1/workspaces/route.ts:142-171`).
  Nothing on the edge reads a deals gate.
- **One sheet.** The record kit's `RecordSheet`
  (`legacy/components/record-sheet.jsx:57-165`) is a dialog on a desk and a
  sheet rising from the bottom on a phone, with its own Save and Cancel. Its
  fields are `RecordField`, `RecordBox` (a date among its types),
  `RecordToggleGroup` and `RecordSwitch` (`record-field.jsx`). Two sheets join
  the one-editor registry by hand (`business-tab-prompt.jsx:67-72`,
  `business-tab-gestures.jsx:785-791`).
- **One send.** `window.__inboxVerb` (`legacy-bridge/inbox-verbs.ts:89, 475`)
  posts `conversations/[id]/reply` from any page, given a conversation id, and
  `window.threadVerbs(flash)` (`thread-pane.jsx:68-150, 274`) adds the toast,
  the Undo and the email retry. A WhatsApp window that has shut is a 409
  (`packages/core/src/conversations/reply.ts:276-281`).
- **People's table.** `PeopleTable` (`legacy/pages/people-table.jsx:68`) has
  no sections. The scope switch is `PeopleScopeTabs`
  (`clients-a.jsx:1122-1127`), drawn as a two-column grid
  (`styles/clients.css:45-73`). `#/pipeline` is the retired demo board and
  redirects to People (`app-shell.jsx:700-706`, pinned by
  `e2e/people.spec.ts:238-246`); `#/clients/pipeline` is free, and joins
  People's route family only through the regex at `app-shell.jsx:771`.
- **Today's rows are counts.** Worth a look holds at most two rows
  (`today.ts:1803`), each "a re-print of a number another page already
  publishes" (#651), each with a digit (`e2e/signals.ts:71-81`), none written
  by a model.
- **Reports counts one cohort.** 0004 says the Deals section "counts one
  cohort, never a funnel of mixed populations"; `dealReport`
  (`apps/dashboard/src/server/deals.ts:22-53`) reads the proposals of the
  period and their outcomes.

## Decision

**The proposal is the deal's middle stage, and the deal holds it:** the link,
a value, an optional "valid until" date, and a reason when someone passes.
Recording a proposal and sending it are one act in one sheet. A workspace says
how its customers buy, and the whole deal layer is there or absent by that
answer. This supersedes 0004 on four points, each named where it applies.

### One record

- **`deals` gains `proposal_url`, `valid_until` and `lost_reason`.** The link
  keeps 00154's CHECK word for word. A reason is one of `price`, `timing`,
  `elsewhere`, `no_reply`, `not_a_fit`, `other`, with the deal's existing
  `note` for words.
- **A proposal carries a value.** The door already stores it; the sheet asks
  for it, and the page says it at every stage. _Amends 0004's "amounts are a
  client's fact"._
- **`deal_record` takes the three fields and says what to clear.** A move
  keeps what it is not told, as it does today, and `p_clear` names the fields a
  person emptied. Passing sets the reason; leaving "passed" clears it. A
  passed proposal sent again stands until the day it is given, or none: the
  old day was the proposal they passed on.
- **The person's link moves onto their deal.** The migration attaches every
  `contacts.proposal_url` to the person's open deal (a proposal first), else
  to their newest deal, as history. It opens a Proposal out only for someone
  with no deal at all, or whose link was set after their newest deal passed
  or ended; that proposal and its event are dated when the link was set.
  `set_person_proposal` writes through to the deal: an open proposal takes the
  link, and with no open deal it opens a Proposal out, only where deals are
  on. So a page from the release before this one cannot split the two. The
  column is read only for someone with no deal at all, for one release, then
  retired (step 7). `proposalLinkOf` is the one reading: the deal's link while
  it is a proposal out, none for any other deal, the person's only with no
  deal.

### One switch

- **`tenants.sells_by`**: `booking` or `proposal`; empty means not asked yet.
  Deals are on exactly when it is `proposal` (`dealsAreOn`, one predicate in
  contracts). _Supersedes 0004's gate:_ "Needs a consult first" goes back to
  being a booking rule, and a deal on file no longer switches anything.
- **The migration keeps what each workspace sees today:** `proposal` wherever a
  deal, a proposal link or a consult-first service exists.
- **Owners set it** in Settings › Business, "How customers buy", and a new
  workspace is asked on its create card. It is the timezone's shape: an owner
  update policy, a column grant, and `PATCH workspaces`.

### One sheet, everywhere

`DealSheet` is the only place a deal is created or moved. It is the record
kit's sheet, opened from anywhere by `window.openDealSheet({ personId, mode })`
and drawn once by a host in the shell. Its modes:

| Mode      | Fields                                                           | Saves as                 |
| --------- | ---------------------------------------------------------------- | ------------------------ |
| `propose` | service, link, value and per, valid until, send it now + message | a new Proposal out       |
| `edit`    | link, value and per, valid until                                 | the same row, same stage |
| `again`   | as `propose`                                                     | passed → Proposal out    |
| `won`     | when, agreed amount and per, how they said yes                   | Client                   |
| `lost`    | when, why, a note                                                | Passed                   |
| `ended`   | when                                                             | Ended                    |

"Send it now" sends through the Inbox's own reply courier after the deal is
recorded, with the Inbox's toast and Undo. Where free text cannot go (a shut
WhatsApp window, someone who said stop, no conversation yet) the switch is off
and says why; the proposal is still recorded. _Replaces 0004's how-row and the
Deal row of #912._

### Shown where the work happens

- **Person page.** A deal card in the left column, above Coming up: the steps
  (Consultation, Proposal out, Client), the link and whether it went, the
  value, the "valid until" date, and one next act that fits the stage. With no
  deal, one quiet line and "Start a proposal". The About card's Proposal row
  and the card's Deal row go: the deal says it once.
- **Thread.** Actions gains a Deal group by stage, each item opening the sheet;
  "Send the proposal" reads the deal's link.
- **People › Pipeline.** A third tab beside People and Leads, only where deals
  are on, at `#/clients/pipeline`. `PeopleTable` gains sections; the Pipeline
  is People's rows grouped by stage with a one-line summary. _Amends 0004's "no
  Deals page, no board": this is a view of People, not a page._ A row opens
  its deal in a peek beside the rows, and on a desk the rows can be a board
  ("The Pipeline is a workspace", below).
- **Today.** One more counted row: consultations that ended in the last week
  with no proposal yet, with up to two names, re-printing the Pipeline's own
  number. Proposals waiting stays.
- **Calendar.** The peek of a consultation shows the person's stage, and "Start
  a proposal" once it is over with none. _Amends 0004's "the Calendar board —
  nothing changes"._
- **Reports.** The Deals section keeps its cohort: what became of the period's
  proposals as bars, the median days to a yes, what is still open, where
  clients came from, and why people passed. No tile is added.

### What it never does

It never sends without a person pressing a button, never infers a stage from a
customer's message, never tracks whether a link was opened (held: open
question 1), and never shows a deal, a proposal or a Pipeline on a workspace
whose customers book.

## Shape

```sql
-- 00160 · A proposal is part of the deal.
alter table public.deals
  add column if not exists proposal_url text
    check (proposal_url is null or (proposal_url = btrim(proposal_url)
           and char_length(proposal_url) between 10 and 500
           and proposal_url ~ '^https?://[^[:space:]]+$')),
  add column if not exists valid_until date,
  add column if not exists lost_reason text
    check (lost_reason is null or lost_reason in
           ('price', 'timing', 'elsewhere', 'no_reply', 'not_a_fit', 'other'));

alter table public.tenants
  add column if not exists sells_by text check (sells_by is null or sells_by in ('booking', 'proposal'));
grant update (sells_by) on public.tenants to authenticated;   -- 00084's door, one more column

-- deal_record: the older form is dropped, not overloaded (00137:37-43).
-- New parameters, all defaulted: p_proposal_url text, p_valid_until date,
-- p_lost_reason text, p_clear text[]  ('proposal_url' | 'valid_until' | 'amount' | 'note').
-- New refusals: bad_link, bad_reason, bad_clear.
-- people_list: + deal_proposal_url, deal_valid_until, deal_lost_reason.
-- deals_erase_on_contact: also blanks proposal_url.
-- set_person_proposal: also writes the link onto the person's open proposal, or opens one where deals are on.
-- The backfill: an open deal takes the link, else the newest deal as history; a Proposal out is opened only with
-- no deal, or when the link was set after the newest deal passed or ended, dated (with its event) when it was set.
```

Contracts, in the house's own files:

- `deals.ts` — `DealDto`, `DealVM` (value at every stage, `proposal {url,
host}`, `validUntil`, `reason`), `DEAL_LOST_REASONS` and words, `SELLS_BY`
  and words, `dealsAreOn`, `parseAmount` (moved from the page),
  `amountTotalsWords`, `waitingOnProposal` (split out of `proposalsWaiting`),
  `consultationsWithoutProposal`.
- `deal-sheet.ts` — the sheet's modes, fields, words, refusals and the send's
  availability, so the sheet says nothing of its own.
- `pipeline.ts` — `pipelineOf(rows, nowMs)`: the groups, their rows and the
  summary line.

Pages and components: `legacy/components/deal-sheet.jsx`,
`legacy/pages/person-deal.jsx`, `legacy/pages/pipeline-scope.jsx`, each in
`manifest.ts` and `Chanlytics.html`.

## Steps

The README rule governs every step: the two apps deploy independently, and the
database is pushed by hand, so each must be correct whichever goes first. Every
step below that reads a new column needs 00160 pushed first.

1. **The record.** 00160, contracts, the deal route's new fields, `PATCH
workspaces`' `sells_by`, every gate read from `sells_by`, the receptionist
   and Ask reading the deal's link (the person's only with no deal), and
   nothing of a deal where deals are off. _Both orders:_ an older page calls
   the door with the arguments it knows and gets the old behaviour; an older
   edge ignores new columns, and a newer one reading an older database treats
   every workspace as not asked.
2. **One sheet and the deal card.** The sheet and its host, the card, the
   thread's Deal group; the About Proposal row, the settings Deal row and
   `PersonDeal` go. _Both orders:_ the edge reads nothing new.
3. **The switch.** Settings › Business and the create card.
4. **The Pipeline.** `PeopleTable` sections, the tab, the route.
5. **Today and the Calendar.**
6. **Reports.**
7. **The person's link retires.** 00161 drops `set_person_proposal`, the
   trigger and the column once every reader is on the deal and both apps have
   deployed; the readers lose their fallback in the same change.

## Tests

- **Database:** `deals.db.test.mjs` gains the door's new fields, clears and
  refusals, and `people_list`'s new columns; `person-proposal.db.test.mjs`
  proves the write-through; the backfill is proved once on an isolated stack
  replayed to 00158 (the migration before it), seeded, then taken to 00160.
- **Contracts:** the value at every stage (`deals.test.mjs:154-155` flips on
  purpose), `dealsAreOn`, `parseAmount`, the sheet's words per mode,
  `pipelineOf`'s groups and summary, `waitingOnProposal` shared by Today and
  the Pipeline.
- **Pages:** the sheet per mode through the real courier; the card's next act
  per stage; the thread's Deal group; the Pipeline tab only where deals are on;
  the Today row's digit and cap; the Calendar peek's focus order.
- **E2e:** the deal walk goes through the sheet; the proposal walk records a
  deal; `#/pipeline` still redirects; the Today tag list gains the deal tags.

## Risks

- **A proposal with no link.** A deal recorded without one is honest (a PDF
  sent by email, a meeting) and says "No link" on the card and the Pipeline.
- **The mirror column.** Until step 7 there are two writers: the person's
  door (`set_person_proposal`) writes the person's column and through to their
  open proposal, and `deal_record` writes the deal alone. They can disagree:
  a link changed through the deal leaves the person's column behind, and a
  client's or a passed deal is never written from the person. Every reader
  goes through `proposalLinkOf`, which reads the person's column only for
  someone with no deal at all, so what disagrees is never read.
- **A workspace that answers "booking" with deals on file.** Its deals stay in
  the database and every surface hides them; answering "proposal" brings them
  back.
- **Two people on one engagement.** One open deal per person per service still
  holds; a household buying one service is one person's deal.

## Open questions for the owner

1. **Open tracking** (the audit's decision 5) is held: a Chanlytics link that
   forwards to the proposal would tell the deal when it was opened, at the cost
   of the address not being the business's own.
2. **A second nudge.** The follow-up playbook (0006) now reads the deal's link;
   whether it may send twice for one proposal stays its own question.

## Amended 23 September 2026 · The Pipeline is a workspace

Written against commit `cb34c3ae` (PR #935), after the Pipeline review of the
same day scored the shipped Pipeline against the CRMs an agency already pays
for: it reported honestly where each deal stood, and nothing could be worked
from it. A row could only leave the page; no act was offered on a row; a
teammate's move never arrived until the list reloaded; and the words in the
box did not find a service. This amendment is the review's first phase, "one
workspace", made Chanlytics-shaped. The plan is
`docs/superpowers/plans/2026-09-23-pipeline-one-workspace.md`.

### The peek

A row opens its person's deal beside the rows, in the pane the lead's peek
uses (408px on a desk; the whole screen on a phone, pulled down to close),
never the person's page. The head is the row's -- who, the group and the
service -- there the moment it opens; the deal is the person page's own card
(`PersonDealOne`, `PersonDealQuiet` over `dealCardsOf`), drawn once the person
lands, the tab's copy at once and the read behind it, with every act the card
offers: a send opens their thread with the words in the box (the person page's
own path), and every other act opens the one deal sheet. Under it, the facts
People's row already says (when they were last heard, their words, what is
coming up) and two doors as quiet words: their page, their thread. Enter
opens it for the row under the cursor, Esc closes it, J and K walk on behind
it and it follows; focus moves into it as it opens and back to the row as it
closes. It re-reads the person when a deal is recorded on them
(`deal:recorded`), and closes when they leave the Pipeline. It lives in the
page's state, not the address: unlike a lead, a person has a page of their
own to link to.

### The board

On a desk the rows can be a board: the same four groups as columns (every
group, empty ones too, so a card has somewhere to drop), the same rows as
cards -- who, the service, the value beside the time in stage, the one chip.
The choice is kept per viewer on the device (`pipeline.view`). A card is a
button too: Enter opens its peek, and J and K walk the cards as they walk the
rows (each card carries the row's own id). A card dragged into another column
asks for the one deal sheet in the mode the move needs, and nothing else moves:

| From            | Into            | The sheet's mode                                      |
| --------------- | --------------- | ----------------------------------------------------- |
| Consultations   | Proposal out    | `propose`                                             |
| Proposal out    | Clients         | `won`                                                 |
| Proposal out    | Passed or ended | `lost`                                                |
| Clients         | Passed or ended | `ended`                                               |
| Passed or ended | Proposal out    | `again` for a passed deal, `propose` for an ended one |

A drop is a person's confirmation, never the record: the sheet still asks what
the move needs (the amount, the reason, the day), and a column the card cannot
go into dims while it is in hand. The rule is contracts' `pipelineMove`; the
browser's own drag and drop, no library. Only an owner or an operator drags,
as only they may record. A phone keeps the list.

### Live, and the words in the box

The People surface repaints on the `deals` table too (`packages/db`
`realtime.ts`, `peopleOverride.refreshOnTables`), so a teammate's move, or a
payment's, shows on the rows, the Pipeline and the peek without a reload; the
tab's own moves already re-read People through the refresh map. And the words
in the box find a deal's service, on People as on the Pipeline
(`plMatcher`).

### Still held

- **One row per open deal.** `people_list` returns one deal per person (the
  newest open), so a person with two open deals, one per service, shows one
  row. Its fix is a database change (the row carrying every open deal) and
  waits for its own note.
- **A pass in the history.** The timeline reads the deal rows, not their
  events, so a deal passed and then proposed again shows no "Passed" line.
  The events hold it; reading them into the timeline is its own change.
- **A next step on every deal, "going cold" against the workspace's own pace,
  open tracking, accepting, paying** are the review's later phases and the
  owner's decisions, none of them started here.
