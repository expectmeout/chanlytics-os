# 0006 · A proposal waiting gets a follow-up

**Status:** built (the Pipeline, worked, PR 6: 6a #974 and 6b, 24 September
2026): the trigger, its class, 00167, the run and the link it freezes on each
recipient; the Playbooks page, the Autonomy row, the starter and Ask, each only
where deals are on; one per workspace. The wait is the workspace's pace
([0008](0008-a-proposal-is-part-of-the-deal.md), amended), a week until it has
one. Where a follow-up runs, each proposal waiting says on the Pipeline when its
run goes ("Follow-up tomorrow", "Follow-up to approve tomorrow" under ask), and
Today's leak counts only the people it will not reach. Written against commit `e3d9dc6c` (PR #885,
23 September 2026), and verified against the code at it. Where this note and
the code disagree, the code wins. It is the second item
[0004](0004-deals-record.md) held for later: _"a follow-up playbook, which needs
an Autonomy class because every list trigger but booking is promotional today"_
(0004, step 5).

## Context

### Today already names the proposals nobody answered

`proposalsWaiting` (`packages/contracts/src/deals.ts:274-284`) keeps a person
whose deal is `proposed`, whose proposal went out at least
`WAITING_AFTER_DAYS` (7, `:32`) ago, and who has not written or called since
(`askedMs`, the later of their last message and their last call,
`packages/contracts/src/people.ts:1026-1029`). Today draws it as a leak:
_"N proposals went out more than a week ago with nothing back."_, tagged
_Waiting_, with _See who_ opening the _Proposal out_ list
(`packages/contracts/src/today.ts:1880-1902`). 0004 stopped there on purpose:
_"Today names the stale ones and a person sends the nudge, inside the window
rules, until an Autonomy class for it is decided"_. A week of silence means
the WhatsApp window has closed, so that nudge is a template.

### A playbook's class decides whose yes it needs

`purposeOfPlaybook` (`packages/contracts/src/consent.ts:191-201`) makes only
`booking` conversational. `reengage`, `campaign` and anything unknown are
marketing, which needs _Offers & news_ (`mayMessageFor`, `:74-87`). The wire
decides again from the template's own category: `purposeOfTemplate` calls only
`utility` and `authentication` conversational (`:187-189`), and `deliver.ts`
reads it (`packages/core/src/deliver.ts:524-540`). So a conversational class
still reaches a person without an offers yes only through a utility template.

The eight triggers (`packages/contracts/src/playbooks.ts:32-93`) have three
classes: `booking` (the visit reminder), `reengage` (win-back, save our
number, after the visit, lapsed) and `campaign` (welcome, the month's offer,
one of your lists). A list trigger reaches whoever its list names:
`audienceMembers` filters by the list's `test` and ignores its `needsDeals`
gate (`packages/contracts/src/broadcasts.ts:108-120`). An unknown trigger
reaches nobody: `playbookRunReach` returns no one when `triggerOf` finds
nothing (`playbooks.ts:232-233`).

### The classes are closed in four places

- **Contracts:** `POLICY_CLASSES` (`packages/contracts/src/config.ts:77`),
  their words (`:86-114`) and the modes each allows (`POLICY_CLASS_MODES`,
  `:167-175`).
- **The database:** `policies_class_check` (`00071_review_replies.sql:26-28`),
  `playbooks_policy_class_check` (`00063_visit_playbooks.sql:17-19`) and
  `playbooks_trigger_check` (`00155_a_list_may_keep_a_rule.sql:30-32`).
  `provision_tenant` seeds one policy row per class; its latest body is
  `00073_billing.sql:61-85`.
- **The Autonomy pane:** `UI_ROWS`
  (`apps/dashboard/src/legacy-bridge/policy-store.ts:63-99`), pinned to exactly
  seven ids by `policy-store.test.mjs:42-46`.
- **The generated sets:** `schema-sets.ts:118` holds `policies.class` exactly
  equal to `POLICY_CLASSES`.

The policies route refuses a class it does not know
(`apps/dashboard/app/api/v1/policies/route.ts:46`), and allows `veto` for
replies only (`:66-71`). A run reads its class's mode, and a class with no row
runs as `ask`: _"No row for the class means ask — the safest"_
(`packages/core/src/campaigns/run-playbook.ts:43-44`). The money lock checks
only `class = 'money'` (`00102_the_money_lock_holds.sql:29-44`).

### A run knows each person's deal, but not their proposal link

The edge builds a run's people from `people_list`
(`apps/edge/lib/playbooks.ts:79-184`), so every row carries the `deal_*`
columns and `toPersonRowVM` gives it `deal` and `askedMs`. `people_list` does
not return `proposal_url`: the link lives on the person's detail
(`PersonDetailDto`, `people.ts:163`). Neither the send job's contact read
(`packages/jobs/src/handlers.ts:299`) nor any template slot knows it. The
slots are `first_name`, `business_name`, `booking_link`, `visit_when`,
`visit_service` and free text (`packages/contracts/src/templates.ts:189-196`,
parsed at `:237`). The proposal link's own design kept a slot out on purpose,
_"feasible later: the booking starter already carries its URL in a body slot"_
(`docs/superpowers/specs/2026-09-22-proposal-link-design.md:100-107`).

_Since [0008](0008-a-proposal-is-part-of-the-deal.md) (00160) the link lives on
the deal, and `people_list` returns it as `deal_proposal_url` beside the other
`deal_*` columns: every row a run is built from already carries the link of the
proposal it waits on. This note reads the deal's link from here on._

A visit playbook shows how a per-person fact reaches the send.
`visitFactsFor` (`playbooks.ts:510-526`) computes the visit's time and service
when the run is made. The run freezes them on each recipient
(`broadcast_recipients.facts`, `run-playbook.ts:119-151`), and the send fills
the slots from those facts, skipping a person whose value is missing
(`packages/core/src/messages/broadcast.ts:170-184`).

### The rules every run keeps

The rules live in `playbooks.ts`:

- **Hours and pace:** 9 to 20 by the business's clock, 25 people a run, a
  90-day gap (`:101-102`).
- **A week's breath:** _"One playbook message per person per week, across
  playbooks"_ (`:111-112`).
- **Order:** the longest-unheard first (`:279-297`).
- **Modes:** `auto` sends, `ask` holds each run for a person, and `never` is off
  (`planRun`, `:304-315`).
- **A person's press:** _Run now_ sends at once unless the class is `never`
  (`run-playbook.ts:51-56`).

## Decision

**A new trigger, _Proposal follow-up_, and a new Autonomy class for it,
_Follow-ups_.** It sends one message per proposal, with the proposal's link in
it, to a person whose proposal has waited a week with nothing back. It defaults
to `ask`, so every run waits for a person to approve it.

**The class is conversational.** A follow-up on a proposal the person asked for
is about their own request, as a visit reminder is about their own visit. So
`purposeOfPlaybook` counts `follow_up` with `booking`. The run then needs the
person's yes to visit messages, never _Offers & news_. The wire still has the
last word. The starter is filed with Meta as a utility template. If Meta files
it as marketing, the send needs the offers yes and says so, because the purpose
comes from the template's category (`deliver.ts:524-540`). It fails closed.

**Its modes are `auto`, `ask` and `never`,** as the route already allows for
every class but replies. The default for every workspace is `ask`. The class is
not money: the message states no figure, and no slot can carry one.

**Who it reaches is Today's rule, not a second one.** The waiting test moves out
of `proposalsWaiting` into `waitingOnProposal(row, nowMs)`. Today's leak and the
trigger both call it: _"One predicate per rule"_ (`CLAUDE.md`). A person is
eligible when:

- **they are waiting on a proposal,** by that rule;
- **their proposal has a link** (the deal's, `deals.proposal_url`, 00160;
  `deal_proposal_url` on their People row). Without one, the nudge would be a
  bare "just checking in", which is a person's to write. The leak still names
  them;
- **no playbook has written to them since the proposal went out.** One
  follow-up per proposal, read from the touches the run already loads
  (`touches.byThis`), never a second nudge;
- **the usual rules hold:** the visit-messages yes, the week's breath, the cap
  and the hours.

**The message.** One starter, `proposal_follow_up`, category utility, in English
and Spanish. It has three slots: the first name, the business's name and the
proposal link: _"Hi {first name}, just making sure the proposal from
{business} reached you: {proposal link}. Reply here with any questions."_ It
carries no price, date, amount or offer. The new slot kind is `proposal_link`, allowed
only on this trigger. `templateValues` refuses it anywhere else, as it refuses
a visit slot off a visit trigger (`template-values.ts:50-57`).

**Where it shows.** The trigger is offered only where deals are on
(`dealsAreOn`, 0008). A salon's Playbooks page, Autonomy pane and Ask never see
it. The Autonomy pane gains one row, _Follow-ups_, beside _Win-back_. Today's
leak keeps its words, and when the playbook is on, it counts only the people
the playbook will not reach (no link, or no yes). The leak's _See who_ then
opens exactly those.

**What it never does.** It never sends twice for one proposal, and never moves
the deal. It never writes to someone who wrote back, however briefly. It never
sends with no link, and it never reaches a salon.

## Shape

```ts
// packages/contracts/src/deals.ts: the one rule, shared by Today and the trigger.
export function waitingOnProposal(r: { deal: DealVM | null; askedMs: number | null }, nowMs: number): boolean;
export function proposalsWaiting<T extends { deal: DealVM | null; askedMs: number | null }>(rows: readonly T[], nowMs: number): T[] {
  return rows.filter((r) => waitingOnProposal(r, nowMs));
}

// packages/contracts/src/config.ts
export const POLICY_CLASSES = ["reply", "booking", "faq", "reengage", "campaign", "reviews", "money", "follow_up"] as const;
// POLICY_CLASS_WORDS.follow_up = { name: "Proposal follow-ups", short: "Follow-ups", note: "one nudge, with the proposal" }
// POLICY_CLASS_MODES.follow_up = ["auto", "ask", "never"]

// packages/contracts/src/playbooks.ts
{ id: "proposal_waiting", label: "Proposal follow-up", list: null, cls: "follow_up", kind: "deal",
  hint: "A proposal out a week with nothing back" }
// playbookRunReach: t.kind === "deal" → rows.filter((r) => waitingOnProposal(r, nowMs) && proposals.has(r.id))
// proposalFactsFor(trigger, url) → { proposal_link } frozen on the recipient, as visitFactsFor does

// packages/contracts/src/consent.ts
export function purposeOfPlaybook(c: string | null | undefined): SendPurpose {
  return c === "booking" || c === "follow_up" ? "conversational" : "marketing";
}
```

```sql
-- <next free number> · A proposal may be followed up.
-- Widen the three CHECKs, recreate provision_tenant with the eighth class, and
-- seed one row per workspace, mode 'ask', as 00071 seeded 'reviews' (:31-34).
alter table public.policies drop constraint if exists policies_class_check;
alter table public.policies add constraint policies_class_check
  check (class in ('reply','booking','faq','reengage','campaign','money','reviews','follow_up'));
alter table public.playbooks drop constraint if exists playbooks_policy_class_check;
alter table public.playbooks add constraint playbooks_policy_class_check
  check (policy_class in ('reengage','campaign','booking','follow_up'));
alter table public.playbooks drop constraint if exists playbooks_trigger_check;
alter table public.playbooks add constraint playbooks_trigger_check
  check (trigger in ('quiet_30','new_week','phoned_only','everyone_monthly','visit_tomorrow','visited',
                     'lapsed','saved_list','proposal_waiting'));
insert into public.policies (tenant_id, class, mode)
  select t.id, 'follow_up', 'ask' from public.tenants t
  on conflict do nothing;
```

The run reads no link of its own: each row's `deal_proposal_url` (people_list, 00160) is the link of the proposal its deal holds, and `proposals` is those rows'
links, keyed by person. The send resolves `proposalLink` from the recipient's
facts, and a missing one skips the person as `missing_value`, as a missing visit
does.

## Steps

The README rule governs every step: the two apps deploy independently, and the
database is pushed by hand, so each must be correct whichever goes first.

**1 · One rule.** `waitingOnProposal` out of `proposalsWaiting`, and Today
unchanged. _Both orders:_ nothing new is read.

**2 · The words and the sets.** The class, its words and modes, the trigger,
`PLAYBOOK_CLASS_LABEL`, `purposeOfPlaybook`, the slot kind and its label, and
the starter. The Autonomy pane draws the row only when the database returns
one, and `policy-store.test.mjs`'s pin widens to eight. _Both orders:_ the
database has no such row yet, so nothing draws, and the route's refusal of an
unknown class is moot.

**3 · The migration.** The three CHECKs, `provision_tenant`, and the seeded
rows, with the generated sets and types. _Both orders:_ an older dashboard
lists policies and ignores a class it does not know. An older edge never runs
a trigger it cannot find (`playbooks.ts:232-233`), and a class with no row
runs as `ask`.

**4 · The run.** The run takes each row's deal link, `playbookRunReach`
gains the `deal` branch, and the run freezes `proposal_link`. The send
resolves the slot. _Both orders:_ no playbook row names the trigger until a
person makes one in step 5.

**5 · The page.** Playbooks offers the trigger where deals are on, with
its icon and blurb (`apps/dashboard/src/legacy/pages/outbound-real.jsx:100-112`),
and the starter comes pre-filled. Ask's `propose_playbook` enum gains it
(`apps/dashboard/src/server/ask/proposals.ts:213`). Today's leak counts only
the people the playbook will not reach. _Both orders:_ the edge already runs it.

**6 · The template, filed.** The starter goes to Meta as utility for each
workspace that turns the playbook on, through the existing template-filing
path. Until Meta approves it, the run says the template is waiting, as any
unapproved template does.

## Tests

- **`deals.test.mjs`:** `waitingOnProposal` pins the leak's cases: 6 days not,
  7 days yes, a reply after the proposal not, a call after not, another stage
  not. `today-leaks.test.mjs` keeps its pins, which prove Today did not move.
- **`playbooks.test.mjs`:** the `deal` branch, run through `playbookRunReach`:
  - waiting with a link and a yes: reached;
  - no link: not reached;
  - opted out: not reached;
  - no visit-messages yes: not reached, counted under `noYes`;
  - a playbook message since the proposal: not reached, counted under
    `heardThis`;
  - a second run a week later: nobody.
- **`marketing-consent.test.mjs`:** `purposeOfPlaybook("follow_up")` is conversational.
  A marketing-category template on this trigger still needs the offers yes at
  the wire.
- **A new `template-values.test.mjs`:** `proposal_link` is refused off this
  trigger, as a visit slot is off a visit trigger.
- **A new `follow-up-class.db.test.mjs`:** the widened CHECKs accept the
  trigger and the class, and `provision_tenant` seeds `follow_up` as `ask`.
  `money-lock.db.test.mjs` stays green, the proof the lock did not move.
- **`policy-store.test.mjs`:** eight rows, and a salon's pane shows seven.

## Risks

- **A machine nudging a sale.** A follow-up on a proposal is the message most
  likely to feel pushy if it is wrong. Hence `ask` by default, one per
  proposal, the link in it, and never to someone who wrote back.
- **Meta's category.** Meta may file the starter as marketing. The send then
  needs the offers yes, and fewer people are reached. That is honest, not
  broken, but an owner should see why. The Playbooks page already says which
  yes a run needs (`playbooks.ts:697`).
- **A conversational class beside the promotional ones.** `follow_up` is the
  second class that reaches people without an offers yes. Every trigger added
  under it later inherits that. The class's words say what it is for, and a
  new trigger under it needs its own note.
- **Two readers of one rule.** Today and the trigger must never disagree about
  who is waiting. Extracting the predicate is step 1 for that reason.

## Open questions for the owner

1. **A new class, or `reengage`?** This note takes a new class, `follow_up`,
   because the nudge answers the person's own request. Reusing `reengage`
   needs no migration, but makes the nudge marketing, which needs an offers
   yes almost nobody who asked for a proposal has given.
2. **`ask` or `never` by default?** `ask` shows the owner each run and sends
   nothing until they approve it. `never` keeps it off until they turn it on.
   This note takes `ask`.
3. **A week, or the owner's choice?** The trigger uses Today's seven days.
   The playbook's own gap setting could make it 3 to 30 days, and the leak
   would then follow the same number.
4. **Only with a link?** Without a proposal link, the nudge has nothing to
   carry but a question. This note leaves those to a person. A second starter
   without the link would reach them too.
