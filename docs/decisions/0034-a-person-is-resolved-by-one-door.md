# 0034 · A person is resolved by one door

**Status:** Decided on 6 October 2026 (Ruben: "all approved"), with 0031; step 0 (`create_person` refuses a number whose
person asked to be forgotten, 00331) built with the note; steps 1 and 3, and step 2's first two writers, built on 7
October 2026 (00342): `resolve_person`, called by `create_person` and `import_person`, with `contact_identities.assurance`
written by it and `person.resolved` in the catalogue, as evidence the purge takes; the rest of step 2 and step 4 built
the same day (00344): every writer matches through the door (`ingest_inbound`, `ingest_call`, `lead_set_stage` and
`reach_out_person` in SQL; the calendar sweep, the booking link and the email intake through `packages/db`'s
`resolvePerson`), a doubt is a row on `person_doubts` that the People page shows as "Same person?" with Merge (0028's
door) and Not the same (`person_doubt_dismiss`), and the two open questions are answered below; step 5, the lead link
on every identity, built the same day (00345): the door links the lead holding a person's number or address whenever it
learns one, and the insert trigger that did it once is gone. Proposed the same day. Written against
commit `b9a4d5c` (main, 5 October 2026) and verified against the code at it, and read again at `6a8e85f` (main, 6
October 2026), since which 0028's merge door (00326) and the message-status notice (00327) are in the code. Where this
note and the code disagree, the code wins.

## Context

### Nine writers, each matching its own way

A `contacts` row comes to exist on nine paths, traced on 5 October 2026:

| Path                                  | Where                                                                    | Matched by                 | Erasure checked  |
| ------------------------------------- | ------------------------------------------------------------------------ | -------------------------- | ---------------- |
| A text or an email                    | `ingest_inbound`, 00110 (its lookup has no erased or merged filter)      | identity, then phone       | at the door      |
| A call                                | `ingest_call`, 00164 (its own lock key and lookup)                       | voice identity, then phone | at the door      |
| Added by hand                         | `create_person`, 00053 (`POST contacts`)                                 | phone                      | since 00331      |
| A file                                | `import_person`, 00263                                                   | phone, then email          | yes              |
| The calendar sweep                    | `apps/edge/lib/calendar/calendar-people.ts` (a direct insert)            | phone                      | yes              |
| The board opening                     | `create_person` from `apps/dashboard/src/server/calendar/people-seen.ts` | phone                      | since 00331      |
| A lead marked Interested              | `lead_set_stage`, 00220 (`create_person`, or its own email-only insert)  | phone, else email          | in part          |
| A reach-out's first email             | `reach_out_person`, 00184 (email only; the lead's phone dropped)         | email                      | yes              |
| A booking link to a first-time caller | `apps/edge/lib/voice/call-booking-link.ts` (`getOrCreateContact`)        | phone                      | no event         |
| An address learned later              | `packages/db/src/repositories/email.ts`; `set_person_email` (00171)      | none: a backfill           | logged, no merge |

The database holds three uniques: `contacts_tenant_phone_uq` (partial, 00002), `contacts_tenant_email_uq` (partial, 00125) and `contact_identities (tenant_id, channel, external_id)` (00002). Everything else is code, and the code
differs: `normalizePhone` (`packages/contracts/src/shared/phone.ts`) calls itself the one normaliser and reads ten
digits as North American, while WhatsApp ingest builds `+digits` by hand and Google Places has its own `e164Of`.

### A merge by hand only, and a link that fires once

`contacts.merged_into_contact_id` (00002) is filtered on by every reader, and until 00326 was set by nothing and
cleared by erasure alone (00027, 00151). Since 00326 (decision 0028, built 5 October 2026) an owner merges two records
through one door, `merge_people(p_keep, p_merge)`: one transaction, never undone, the kept record taking the other's
identities, thread, calls, deals, leads, notes and list memberships, and the more careful of the two consent answers
standing. Nothing merges by itself and nothing suggests it: when an email-only person later writes on WhatsApp, or a
lead's person is made email-only and then phones, there are two people until an owner notices, and the log still says
"the owner merges them" (`email.ts`) with nothing to tell the owner. `contacts_link_lead` (00140) links a lead to a
person only on the person's insert, only when `auth.uid()` is null, so an arrival by email, a person added by hand or
imported, and an address learned later never link.

### An erased person could come back

`create_person` never asked whether a number had been erased; the digest kept for that purpose
(`contacts.erased_phone_hash`, 00263) was read by the sweep and by `import_person` and not by the door the board calls
when it opens (`apps/dashboard/app/api/v1/calendar/route.ts`). 00331 closes it with `import_person`'s refusal (PE001),
which the board skips as one person refused (`afterPersonRefused`, `packages/contracts/src/calendar/calendar-people.ts`).

## Decision

1. **One door resolves a person:** `resolve_person`, a `security definer` function every writer calls, with the
   identity it saw and how it saw it. It checks the erasure digests first, normalises the phone with the workspace's
   country, matches provider identity, then phone, then email, links a lead whenever an identity is added, and emits
   `person.resolved` (new, matched, or filled) in the same transaction. It never merges on its own: a match by name
   alone, or a phone and an email that name two people, is a doubt, recorded for a person to settle.
2. **Each identity carries its assurance:** `contact_identities.assurance` in `observed` (it wrote to us on that
   wire), `asserted` (a member typed it), `found` (the finder or a feed named it). Resolution prefers observed over
   asserted over found, and a doubt between levels goes to the queue.
3. **A merge is 0028's door, and a doubt is its queue.** `merge_people` (00326) stays the one way two records become
   one: an owner's act, one transaction, never undone, the careful answer standing. This note adds no second door and
   no undo. It adds the queue in front of it: a doubt `resolve_person` records (two records one identity could belong
   to) is settled by an owner through that door, or dismissed for the pair, and never merges on its own. Reads follow
   `merged_into_contact_id` as they do today, and `erase_contact` erases the records merged into a person with it.
4. **A read never writes a person.** The board's write (`people-seen.ts`) moves to the sweep's path once the sweep is
   event-driven (0031, phase 2); until then it stays, behind 00331.

## Shape

```sql
alter table public.contact_identities
  add column if not exists assurance text not null default 'observed'
  check (assurance in ('observed', 'asserted', 'found'));

create table public.person_doubts (          -- the queue in front of merge_people (00326)
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  other_id    uuid not null references public.contacts (id) on delete cascade,
  seen        text not null,                 -- the identity either could own, as the door saw it
  settled_at  timestamptz,                   -- by merge_people, or by "not the same"
  settled_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  unique (tenant_id, contact_id, other_id)
);

create or replace function public.resolve_person(
  p_tenant_id uuid,
  p_channel   text,          -- whatsapp | sms | voice | email | null
  p_external  text,          -- the provider's identity, or null
  p_phone     text,          -- as seen; normalised inside
  p_email     text,
  p_name      text,
  p_assurance text,          -- observed | asserted | found
  p_source    text           -- for contact.added: inbound | call | manual | import | calendar | lead | reach_out
) returns jsonb;              -- { contact_id, outcome: new | matched | filled | doubt, doubt_id }
```

The verbs in core (`packages/core/src/people/`) take the outcome; the adapters at the doors know the table.

## Steps

**0 · The erasure gap.** 00331: built with this note. _Both orders:_ a door's body.

**1 · The door, called by nobody.** `resolve_person` beside the nine writers, with `person.resolved` in the catalogue
(0032 step 1) and `people/doors/resolve-person.db.test.mjs`. Built, 00342, with a `p_detail` the caller's own words for
`contact.added` ride in (a calendar guest's title, later a lead's id), so the event keeps the shape 00053 and 00170
wrote; the number is read as contracts' `normalizePhone` reads it until the workspace's country decides (Risks).
_Both orders:_ a function nothing calls.

**2 · The writers move, one at a time,** each keeping its old path for a release: `create_person` and `import_person`
first (members' doors, the smallest; built, 00342: each keeps its signature, its checks and its answer, and asks the
door for the match as a member's assertion), then the calendar sweep and the board, then `lead_set_stage` and
`reach_out_person`, then `ingest_call`, then the booking link and the email backfill, and `ingest_inbound` last, with
`inbound-executed.test.mjs`'s cases green. Built, 00344, the other seven in one change, each keeping its signature and
its answer (the board's write, `people-seen.ts`, reaches the door through `create_person` already): an arrival on the
wire (they wrote, they called: _observed_) writes no `contact.added`, since the message or the call is the record and
00306's trigger says the wire, and is never refused by the erasure digests, since a person who asked to be forgotten
and writes again is a new person, as the inbound doors always made them; a name the wire gave follows the wire
(`wa_profile_name`), a member's or the finder's fills `display_name` only where it is empty; an identity already held
is written only when its word gets stronger. The door defaults every argument but the workspace; `packages/db`'s
wrapper still names all nine of 00342's, an empty word for what it did not see, so a database on 00342 answers an
edge on 00344 with the first cut's match, and the email intake keeps naming a person known by address until 00344 is
on production. _Both orders:_ each writer's old path answers an older edge.

**3 · Assurance on identities.** The column, written by the door; readers ignore it until step 5. Built, 00342: observed
by default for every identity the inbound doors wrote before it, and a stronger word replaces a weaker one on the
door's upsert, never the reverse. _Both orders._

**4 · The doubt queue:** `person_doubts`, written by `resolve_person`, and the People page's "same person?" row with
Merge (0028's door, `POST /api/v1/contacts/[id]/merge`) and Not the same, which settles the pair. Built, 00344: a doubt
is raised only for a pair 0028's door could join (two numbers, or two addresses, are two people by rule), written once
per pair whichever way round, never the value itself, only which of the three was seen; the row says who else it could
be, Merge opens 0028's box with that record chosen (the owner's act), Not the same is any acting member's
(`person_doubt_dismiss`, `POST /api/v1/contacts/[id]/doubts/dismiss`, idempotent, refused in words for a pair the merge
joined); the merge settles the pair's own row and carries the merged record's other doubts to the kept one, and an
erasure takes every doubt naming the person (`contacts_change_settles_doubts`, a leg of the record's own triggers).
_Both orders:_ a table only the door writes and only a newer dashboard reads.

**5 · Leads link on every identity.** `contacts_link_lead` fires from the door on every identity added, not on insert
alone, and writes `lead.converted` with a version bump, which `lead_link_contact` never did (00184). _Both orders._
Built, 00345: `person_link_lead`, called by `resolve_person` when it makes a person, fills a number or an address, or adds
an identity, takes the lead holding the person's number, else their address, that names nobody yet, and converts it
through `lead_convert_by` (its version moved, `lead.converted` with how `arrived` for a person who wrote or called and
`added` for one a member, a file, the calendar or the finder named), writing `contact.added {source lead, lead_id}` for a
person it made whom no door had named, as the trigger did. The lead a caller converts itself (`lead_set_stage`, which
names it in `p_detail`) is skipped, a reach-out's cold first email holds the link off, and a link that fails warns and
is undone alone, never the arrival. The trigger and its function are dropped, since the door is the only writer of a
person. Tested in `database/event-shapes.db`, `messages/a-person-keeps-how-they-first-reached-us.db` (the lead is the
first touch, with its id as the ref) and `reach-out-replies/never-again.db` (the two new words).

## Tests

- **The door** (`people/doors/resolve-person.db.test.mjs`): the same person seen by WhatsApp, then SMS, then email is one
  row with three identities; an erased number is refused on every path; a name-only match is a doubt, not a merge; a
  found identity never overrides an observed one.
- **The nine writers** keep their existing cases (`inbound-executed`, `import-person.db`, `cron-calendar-door`,
  `retell-webhook-door`, the lead and reach-out suites) through each move.
- **The merge** is 0028's (`people/merge/merge-people.db.test.mjs`) and is not proved twice here: a doubt settled
  through it leaves the queue, and a pair dismissed is not raised again by the next arrival.
- **The queue** (`people/doors/person-doubts.db.test.mjs`): a member reads it and nobody but the doors writes it; not the
  same by an operator, once however often, and by nobody outside the workspace; the next arrival names the pair and
  reopens nothing; the merge settles the pair's row and carries the merged record's other doubts, once each, to the
  kept one, and the pair it joined cannot be dismissed; an erasure takes every doubt naming the person. The page's row
  (`people/person-honest.test.mjs`): the sentence, Merge with the record chosen whether or not People lists it, Not the
  same through its route and the page read again, and who may press which. The three writers in TypeScript run over
  the door modelled in `_fake-db.mjs` from the rows a world holds (`cron-calendar-door`, `calendar-counts`,
  `calendar-people`, `retell-fn-door`, `voice-booking-link`), the SQL itself proved on a stack.
- **00331** (`people/erasure/create-person-refuses-the-forgotten.db.test.mjs`): an erased number is refused with PE001 by hand
  and from the board, and the board goes on with the next person.

## Risks

- **`ingest_inbound` is the hot path.** It moves last, as a pure replacement of its lookup, with the lock it holds
  today.
- **A merge moves a thread**, and 00326 built that: the guard's one exception, the emptied thread deleted. What is
  this note's is the doubt around it: a pair dismissed must stay dismissed on the next arrival, and a doubt must never
  hold an arrival's reply.
- **The country.** A ten-digit number is North American today; the workspace's country (from its listing or its line)
  decides it after step 2, and a number that normalises differently is a doubt, never a silent change.

## Open questions

Answered on 7 October 2026, with step 4:

1. _Does a doubt reach the bell, or only the People page?_ The page only. The bell is for what needs a person today;
   a pair that might be one person waits with the record, and is seen the next time someone opens it. A count on
   People's rail is the next step if the queue grows unseen.
2. _Who settles a doubt?_ Not the same is any acting member's (owner, operator, a partner who showed their second
   factor), as a note's verdict is: it changes nothing but the queue. The merge stays the owner's (0028), since it
   cannot be undone.
