# 0004 · A deal is a record

**Status:** decided, not built. Written against commit `1b26296d` (PR #884,
23 September 2026), and verified against the code at it. Where this note and
the code disagree, the code wins.

## Context

### The product ends at the booking

The README says it: _"It does not book. The booking tool behind the link does
that"_ (`README.md:14`). The conversion the product counts is the booking,
computed from the owner's calendar feed at read time — `bookedAfterAsk`
(`packages/contracts/src/calendar-people.ts:675`), whose comment says the
booking is _"not a stage somebody moved a card into"_ (`:673`). The mockup's
Deal board is retired on purpose: `pipeline: "demo"`
(`apps/dashboard/src/legacy-bridge/surface-registry.ts:45`) and _"The Deal
board stays retired"_ (`:226`).

For a salon that is the whole story. For a business that sells an engagement
after a consultation — an agency, a consultant, a firm, a contractor — the
booking is a step. A lead books a short discovery call; a proposal follows; the
lead says yes and pays, or passes; a client then books longer calls for as long
as the engagement runs; one day it ends. Today the product records the first
step and nothing after it. Nothing anywhere says a proposal went out, that
somebody became a client, or that an engagement ended, so People cannot list
them, Today cannot notice a proposal waiting, Reports cannot count what came of
the consultations, and the receptionist offers a client the same consultation
it offers a stranger.

### The consultation-first shape already exists

A service carries a name, an optional length and a free-text price note
(`ServiceSchema`, `packages/contracts/src/config.ts:361-373`). The booking
rules carry `consult_first`, _"services that need a consultation before they
can be booked"_ (`config.ts:447`), which the prompt states (`:1308`) and which
`needsConsultation` and `offerFor` (`packages/contracts/src/availability.ts:824`,
`:849`) turn into an offer of the consultation, sized by the consultation
service the business lists; `offerLead` (`:877`) says so to the phone agent.
So "a thirty-minute discovery call first, the sixty-minute service after" is a
profile setting today. What is missing is the person-side fact: that this
person is past the consultation.

The phone availability tool computes that offer from a day and a service alone
(`availabilityAnswer`, `apps/edge/api/retell-availability.ts:60-65`); its body
type carries no caller (`:81`). The booking-link door on the same wire reads
the caller's number from the same body shape (`from_number`,
`apps/edge/api/retell-fn.ts:106`, normalized at `:125`).

### What the receptionist can be told about one person

Both receptionists introduce a person through one function. `readLeadContext`
reads the contact's name, consent and notes
(`packages/db/src/repositories/thread.ts:220-228`); `describeLead` (`:280`)
turns them into a few plain lines, ending with the owner's note: _"Notes from
the owner about them (use as facts, never read aloud or quoted)"_ (`:303`).
Chat reads it in `packages/core/src/inbound/answer.ts` beside the person's
visits; voice reads it at call start. It is the only per-person field either
prompt sees, and it is six hundred characters of free text.

### The journey has a seam, and the desk has a pattern

People's rail groups its computed lists as Attention, Journey and Reach; the
Journey group is _"where each person is on the way to a booking"_
(`packages/contracts/src/people.ts:1000`, the lists at `:1013`). Every reader
of those lists — the rail, the broadcast audiences, Ask's `search_people`, the
profile's chips, and Today's "Worth a look" (`todayLeaks`,
`packages/contracts/src/today.ts:1813`, over `LEAK_ORDER` at `:1808`, at most
`TODAY_LEAK_MAX` rows, `:1799`) — takes a new list without new wiring. A
People row's second line falls through their own words, a call summary, the
next visit, the last visit (`attentionRow`, `people.ts:1362-1372`). The
table's columns are one list with `on: false` for the ones a member turns on
(`PL_COLUMNS`, `apps/dashboard/src/legacy/pages/clients-a.jsx:1375`; Email and
Lists at `:1433-1434`). The thread's header chip reads the People row by id and
says who they are, apart from the bar that says where the conversation stands
(`apps/dashboard/src/legacy/pages/inbox-thread.jsx:416`, the chip at `:455`);
its Actions menu is a list of items (`:509-515`).

The person's page records a fact about a person one way: `ConsentAsk`
(`apps/dashboard/src/legacy/pages/client-profile.jsx:895`) — a value, an armed
pick, then a "how" row that takes the answer in their own message or a form
with a note. Its route calls a SQL door and then records a decision
(`apps/dashboard/app/api/v1/contacts/[id]/consent/route.ts:64-74`); the
details route is the same shape at `role: "operator"`, `rate: "person_edit"`
(`apps/dashboard/app/api/v1/contacts/[id]/details/route.ts:35-39`). The
timeline offers a filter only for kinds present (`client-profile.jsx:798`).

### The finder's stages end where this begins

A lead is Ready, Contacted, Talking or Closed (`LEAD_STAGE_WORDS`,
`packages/contracts/src/leads.ts:77`); the one act that makes a person is a
call marked Interested (`outcomeMove`, `:607`). Every lead act carries the
row's `version` so an Undo can refuse a stale press
(`supabase/migrations/00142_the_leads_are_worked.sql:42`, `lead_undo` at
`:750`). A person the finder found says so on their page and carries the door
back to the lead.

### Money is fenced

The `money` class — _"Refunds · rates · negotiation … always goes to you"_
(`config.ts:113`) — is locked to `never` (`:174`) by a trigger. A price a chat
draft states is swapped before it sends; `never_quote_prices` (`:385`) is on by
default. Billing is the workspace paying Chanlytics; the Connections page keeps
a "Deposits" row under _Later_ (`packages/contracts/src/connections.ts:36`,
`:119`). Nothing observes a customer's payment, so "paid" cannot be inferred: it
has to be told.

### The uniform floor a new table must meet

`00126_a_workspace_has_a_mailbox.sql` is the worked example: create (`:21`),
`moddatetime` (`:58`), RLS on (`:60`), one member select policy (`:61`), a
comment (`:64`), the realtime publication (`:67`), writes revoked from
`authenticated`. `tenancy.db.test.mjs` enumerates tenant tables from the
database's own schema and fails one with no proof by name
(`tooling/scripts/tests/tenancy.db.test.mjs:17`, `TENANT_TABLES` at `:312`).
A person's erasure blanks what points at them
(`leads_erase_on_contact`, `00140_the_lead_finder_engine.sql:781`, the trigger
at `:809`); the events scrub is an allow-list over `contact.named` and
`contact.added` only (`00131_a_name_does_not_survive_an_erasure.sql:29`, `:98`).
Event kinds have no CHECK; a lint holds `EVENT_KINDS` to what is written and
fails a kind _"declared but nothing writes it"_
(`tooling/scripts/tests/event-kinds.test.mjs:104`), reading SQL inserts and
`emitEvent` calls alike (`:41`, `:67`). The ledger's verb and subject sets are
CHECKs widened by drop-and-add with the full list
(`00118_the_ledger_names_a_call_ended_by_hand.sql:12-13`,
`00114_the_ledger_names_an_export.sql:12-13`), mirrored in contracts
(`packages/contracts/src/enums.ts:333`, `:418`). The people read is a function
recreated whole when a returned column is added, _"the signature the same, so
every caller keeps calling it"_
(`00138_a_person_says_where_they_came_from.sql:34-39`, the columns at `:39-80`).
The next free migration number is 00154: 00153 is the held smart-lists PR
(`design/lists-that-keep-themselves`).

## Decision

A `deals` table: one row per engagement a person is deciding on or has taken,
and a rule about who writes it — **a person, through one route, or an Ask card
the person approves through the same route; later a payment webhook, with its
own source on the row; never the receptionist.** The receptionist reads a deal
and never writes one, exactly as it reads the calendar and never books.

**A stage is an owner's assertion, not a fact about time**, so unlike the
appointment statuses of 0002 it has no guard trigger: every move is allowed,
every move is an event, and the row's `version` refuses a stale press, the
leads' Undo rule. A mis-tap on a phone is undone by the next tap.

| Stored     | Word         | Written by                                     | Meaning                               |
| ---------- | ------------ | ---------------------------------------------- | ------------------------------------- |
| `proposed` | Proposal out | a person, an Ask card                          | sent, waiting on them                 |
| `won`      | Client       | a person, an Ask card, a payment webhook later | said yes or paid; the engagement runs |
| `lost`     | Passed       | a person                                       | they declined                         |
| `ended`    | Ended        | a person                                       | the engagement ended                  |

The words live once, in contracts (`DEAL_STAGE_WORDS`), and the pill is one
more `StateKind`. "Client" is a stage word, never a word for a person; the
glossary's rule stands.

**"Consultation booked" is derived, never stored.** A person whose next or last
visit names a consult-first service, or a service whose name contains
"consult", is on that list — the same fold `needsConsultation` uses — and the
list exists only where the workspace lists a consult-first service, the way
the calendar lists exist only with a calendar. The row starts when a person
records the proposal; the product never invents a deal.

**One open engagement per person per service.** A partial unique index holds
it; a new proposal to a person who is already a client for that service is
refused with a sentence. A lost proposal may be re-opened on the same row (it
is the same proposal); an ended engagement is re-signed as a new row, so tenure
and amounts keep their history.

**The amount is optional, and never reaches the prompt.** An amount in cents,
a `per` (once, month, year) and a short note; a free-text price the business
cannot state flatly is the service's `price_note`, which exists. Reports sums
what was recorded and says nothing about the rest.

**Evidence is optional, in the consent's shape.** A win may name the inbound
message it was given in, or a note saying where it was signed. The carriers
require it for consent; nothing requires it here, so the how-row offers it and
does not insist.

**Where it shows, each thing once:**

- **The person's page** — one rail section, after "Receptionist for <name>"
  and before the two consent asks, in `ConsentAsk`'s family and no new CSS.
  It says first and acts under it: _No proposal yet_ with the act _Proposal
  sent_; _Proposal out · since Sep 12_ with _Became a client_ and _Passed_;
  _Client · since Oct 1 · $2,500 a month_ with _Ended_; _Passed · Sep 20_ with
  _Proposal sent again_. An act opens the how-row: a date defaulting to today,
  amount and per on _Became a client_ only, a service picker only when the
  profile lists more than one service, and the optional evidence. The section
  is drawn only where deals are a thing here — the workspace lists a
  consult-first service or has recorded a deal — so a salon never sees it. The
  timeline gains a `deal` kind, one line per event, and its filter appears only
  when one exists. The About rows do not change.
- **People** — Journey gains _Consultation booked_, _Proposal out_, _Clients_
  and _Ended_. A `deal` column, `on: false`. The row's second line says
  _Proposal out · 6 d_ after their words and before the visit; a client's row
  keeps its visit, which is the more useful fact, and the column or pill says
  Client.
- **The thread** — the header chip beside the wires says the most
  decision-relevant fact: _Client · Ad management_, else _Proposal out · 6 d_,
  else the visit as today. One chip. The bar under the header is untouched.
  The Actions menu gains _Record a deal…_, which opens the profile's section.
- **Today** — Worth a look gains one leak, _Proposals waiting_: proposals out
  past a week with nothing back (their last inbound is older than the
  proposal), with the door to the list and _Ask why_. Not a queue row: the
  queue is what needs a person now.
- **Reports** — a Deals section only when any deal exists, the way Google's
  section exists only with keys. It counts one cohort, never a funnel of mixed
  populations: of the proposals sent in the period, how many became clients,
  passed, or are still waiting; beside it the stock, clients now and their
  monthly total where amounts were recorded. Counts over columns, in the house
  rule; computed beside `booking` in the reports route, `report_series`
  untouched.
- **The receptionist** — one sentence per stage in `describeLead`, beside the
  owner's note, so chat and voice hear the same thing: a client is offered the
  service itself, not a consultation, and anything about their engagement or
  its cost goes to a person; a proposal out means say a named person will
  follow up, and hand over; passed means do not push. The phone availability
  door reads the caller's number the booking-link door already reads, looks up
  the deal, and `offerFor` takes a client flag that returns the service
  itself. Ask's openings do the same when a person is named. WhatsApp's
  openings are not filtered by length today, so there the sentence is the
  whole change.
- **Ask** — `get_person` carries the deal in its facts; `search_people` names
  the new lists; a `propose_deal` act tool in `propose_person_mode`'s shape
  returns a card the member approves through the route.
- **Leads** — a converted lead whose person is a client reads _Client_, derived
  from `leads.contact_id`; nothing stored.
- **Settings › Business, Setup, the Calendar board** — nothing changes. The
  offer already lives in services and consult-first; the board's windows are a
  service's, not a person's.

**What it never does:** no Deals page, no board, no amounts in any prompt, no
automatic follow-up, no stage inferred from a message or a calendar, no
receptionist writing a row. A proposal follow-up sits near the locked money
class; Today names the stale ones and a person sends the nudge, inside the
window rules, until an Autonomy class for it is decided.

## Shape

```sql
-- 00154 · A deal is a record.
create table public.deals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  contact_id     uuid not null references public.contacts (id) on delete cascade,
  lead_id        uuid references public.leads (id) on delete set null,
  -- The profile's service by name, as consult_first names one; null when the
  -- profile lists one service or none.
  service        text check (service is null or char_length(service) between 1 and 80),
  stage          text not null check (stage in ('proposed','won','lost','ended')),
  proposed_at    timestamptz not null default now(),
  decided_at     timestamptz,   -- won or lost: when they answered
  ended_at       timestamptz,
  amount_cents   integer check (amount_cents is null or amount_cents >= 0),
  per            text check (per is null or per in ('once','month','year')),
  currency       text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  note           text check (note is null or char_length(note) between 1 and 200),
  -- The consent's shape: { message_id } for their own message, { form: note } for one signed elsewhere.
  evidence       jsonb,
  -- Who wrote the stage. The product never writes 'receptionist': it does not decide.
  source         text not null default 'person' check (source in ('person','payment')),
  version        integer not null default 1,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- One open engagement per person per service.
create unique index deals_open_uq on public.deals (tenant_id, contact_id, coalesce(service, ''))
  where stage in ('proposed','won');
create index deals_tenant_stage on public.deals (tenant_id, stage);
create index deals_contact on public.deals (tenant_id, contact_id, created_at desc);
create trigger deals_set_updated_at before update on public.deals
  for each row execute function extensions.moddatetime('updated_at');
alter table public.deals enable row level security;
create policy deals_member_select on public.deals for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke insert, update, delete on public.deals from authenticated, anon;
revoke all on public.deals from anon;
alter publication supabase_realtime add table public.deals;

-- The one door: insert on 'proposed' with no id; move with the id and the
-- version the page saw. Acting members only (is_acting_member, 00014). Writes
-- the event in SQL so the kinds lint sees the emitter; the route records the
-- decision (record_deal on subject deal), as the consent route does.
create or replace function public.deal_record(
  p_contact_id uuid, p_stage text, p_deal_id uuid default null, p_version integer default null,
  p_service text default null, p_when timestamptz default null, p_amount_cents integer default null,
  p_per text default null, p_note text default null, p_evidence jsonb default null
) returns jsonb  -- { deal: {...} } or { error: 'moved' | 'already_open' | 'forbidden' | ... }
language plpgsql security definer set search_path = public as $$ ... $$;

-- A person erased keeps no words: the note and the evidence go; the stage,
-- the dates and the amount are the business's own facts and stay, as a
-- lead's counts do (00140).
create or replace function public.deals_erase_on_contact() returns trigger ...;
create trigger contacts_erase_blanks_deals after update of erased_at on public.contacts
  for each row execute function public.deals_erase_on_contact();

-- The ledger's words, widened with the full lists (00118, 00114):
--   decisions_verb_check          + 'record_deal'
--   decisions_subject_type_check  + 'deal'

-- The people read, recreated whole with the same signature (00138), gains the
-- row the pill shows — the newest open or current deal, else the newest of any:
--   deal_id uuid, deal_stage text, deal_service text, deal_proposed_at timestamptz,
--   deal_decided_at timestamptz, deal_ended_at timestamptz, deal_amount_cents integer, deal_per text
```

Events, record kinds, kept: `deal.proposed`, `deal.won`, `deal.lost`,
`deal.ended`, each with `{ deal_id, stage, from, service, by }` and never a
note or an evidence word, so the erasure scrub has nothing to reach.

```ts
// packages/contracts/src/deals.ts
export const DEAL_STAGES = ["proposed", "won", "lost", "ended"] as const;
export const DEAL_STAGE_WORDS: Record<DealStage, string> = { proposed: "Proposal out", won: "Client", lost: "Passed", ended: "Ended" };
/** The moves the section offers from each stage, in its own words. */
export const DEAL_MOVES: Record<DealStage | "none", { to: DealStage; label: string }[]>;
/** What the People row carries (people_list's deal_* columns), and what the pages say from it. */
export interface DealRowDto { ... }  export interface DealVM { stage; word; service; since; waitingDays; amountLine }
/** The sentence per stage the receptionist hears, beside the owner's note; never an amount. */
export function dealSentence(d: DealRowDto | null, now: number): string | null;
/** Today's leak: proposals out past a week with nothing back. */
export function proposalsWaiting(rows: PersonRowVM[], nowMs: number): number;
/** Whether the workspace's rows or its profile make deals a thing here. */
export function dealsAreAThing(rows: readonly PersonRowVM[], consultFirst: readonly string[]): boolean;

// packages/contracts/src/people.ts — PersonRowDto gains deal_* (optional: an older
// database returns none), PersonRowVM gains `deal: DealVM | null`; PEOPLE_LISTS gains
// consultation_booked (needsConsultFirst), proposal_out, clients, deal_ended.

// apps/dashboard/app/api/v1/contacts/[id]/deal/route.ts — write(), contactScope,
// role operator, rate person_edit: rpc deal_record, then recordDecision(..., "deal", id,
// "record_deal", { stage, from, by }). route-policy.json gains the row.

// apps/dashboard/src/legacy-bridge/people-detail.ts — window.__recordDeal(id, body).
// apps/dashboard/src/legacy/pages/client-profile.jsx — PersonDeal, a rail section.
```

## Steps

The README rule governs every step: the two apps deploy independently, and the
database is pushed by hand, so each must be correct whichever goes first.

**1 · The table, its door, and the words, read by nothing.** Migration 00154:
the table, the unique index, the erasure trigger, the door, the ledger CHECKs,
the people read's columns; `EVENT_KINDS`, `DECISION_VERBS` and
`DECISION_SUBJECTS` in contracts; `schema-sets.generated.ts` and the database
types regenerated; the `TENANT_TABLES` fixture. `PersonRowDto` takes the new
columns as optional. _Both orders:_ an older dashboard ignores columns it never
asked for; a newer one reads `undefined` from an older database and draws
nothing. The migration is Ruben's to push.

**2 · The verb, the page, the ledger.** The route, its policy row, the bridge
courier, the `deal` pill kind, the Activity words, the rail section and the
timeline lines. _Both orders:_ the section is drawn only when the people read
returned a `deal_stage` column, so a dashboard ahead of the database shows
nothing new; a database ahead of the dashboard is a table nobody reads.

**3 · Where it shows.** People's four lists, the column and the row sentence;
the thread's chip and menu item; Today's leak; Reports' cohort sentence. _Both
orders:_ every reader takes an absent deal as none.

**4 · The receptionist and Ask.** `readLeadContext` reads the deal beside the
note, `describeLead` says the stage's sentence, the availability door reads
the caller and `offerFor` takes the client flag, Ask's openings too; Ask's
person facts, list names, `propose_deal` and one suggestion in each language.
_Both orders:_ the edge reads a table that step 1 made; before it exists the
read returns nothing and the sentence is not said.

**5 · Held for later, each its own note.** A payment webhook under
`apps/edge/api`, judged by a pure plan function as the email door is, writing
`won` with `source: 'payment'` and living under Connections' "Deposits" row; a
follow-up playbook, which needs an Autonomy class because every list trigger
but booking is promotional today (`purposeOfPlaybook`); and 0002's
appointments, which give _Consultation booked_ a kept and a missed.

## Tests

**Keep meaningful.** `people-honest`, `person-honest` and `calendar-people`
pin the rail's lists and the About rows; they stay green because About does
not change and the new lists are gated. `today` leak tests pin the four rows;
the fifth joins them. `standing` is untouched: a deal is not a standing.

**New.**

- `deals.db.test.mjs` — the door refuses a viewer and another workspace's
  member; a move with a stale version answers `moved`; a second proposal for
  an open service answers `already_open`; an erasure blanks the note and the
  evidence and keeps the stage; the people read returns the newest open deal.
- `deals.test.mjs` — the words, the moves per stage, the row sentence's order
  (their words, then a proposal, then the visit), the leak's week and
  nothing-back rule, `dealsAreAThing`.
- `describe-lead.test.mjs` — one sentence per stage, none without a deal, and
  never a digit of the amount.
- `retell-availability.test.mjs` — a client is offered the service's own
  length; a stranger the consultation; no caller, as today.
- `route-policy.test.mjs` — the new row is the review artifact for who may
  record a deal.
- `ask-proposals` — a `propose_deal` card commits through the route with
  `x-via: ask` and leaves its mark.
- The nightly `people.spec.ts` — the section appears on the seeded
  workspace only after it records a deal, and not on the salon scenario.

## Risks

- **A table invites a verb for the receptionist.** The charter is a decision,
  not a limit of the schema (0002 said the same). No verb takes the model's
  word for a stage.
- **A service by name drifts.** Rename the service and the deal keeps the old
  word; the house accepted the same for `consult_first`. Reports groups by the
  stored word.
- **"Client" is a stage word.** The glossary keeps "client" off a person; the
  pill's word is the engagement's, and the code names say `deal`, never
  `client`. "Proposal" is Ask's internal word for a card and 0002's word for a
  tentative hold; the deal's code names say `proposed` and never `Proposal`.
- **The default currency is an assumption.** Every live workspace bills in
  dollars; the column exists so the assumption is a value, not a literal.
- **Two PRs on one page.** Steps 2 and 3 both touch the person page and
  People; each is green alone. Re-test on a moved main before merging the
  second.
- **The number.** 00153 is held for the smart lists; this note takes 00154. If
  00153 lands renumbered, re-check before pushing.
- **The kinds lint.** The four kinds must arrive with their SQL emitter in
  the same change, or the lint fails them as dead.
- **The hook order.** A new section on the person page holds hooks; the page
  is drawn on the stub React's one global call order, so the section is drawn
  on every render, gated inside, never around.

## Open questions, and the answers taken

Put to the owner on 23 September 2026 and answered with _"continue as you
suggest"_:

1. **The words.** Proposal out, Client, Passed, Ended; "Deal" as the noun on
   the column and the Reports section. Taken.
2. **Amounts.** Optional, summed in Reports, never in a prompt. Taken.
3. **Who records a deal.** Operators and owners, as the details and consent
   routes allow (`role: "operator"`). Taken.
4. **Does Client change the reply mode?** No; the per-person mode exists for
   that. Taken.
5. **Follow-ups.** Today's leak alone; a playbook waits on its Autonomy class.
   Taken.
6. **0002 first?** Not required; _Consultation booked_ derives from the feed,
   and appointments sharpen it later. Taken.
7. **Do viewers see amounts?** Yes; viewers read everything else. Taken.
