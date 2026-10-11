# 0045 · A person's fields and their answers each have one door

**Status:** Decided on 10 October 2026 (Ruben: "review and go with the best suggestions for chanlytics"), as recommended
here; not built. 0031's invariant 1 for `contacts`, the table with the most writers. Written against commit `ef0aea36a`
(main, 10 October 2026). Where this note and the code disagree, the code wins.

## Context

Twenty functions and modules write `contacts` (`tooling/scripts/tests/baselines/writers.json`, `writersByTable`); after
0034, `create_person`, `import_person`, `ingest_call`, `lead_set_stage` and `reach_out_person` reach it only through
`resolve_person`. The twenty, by what they write:

- **A person's own fields:** `set_person_email`, `set_person_name`, `set_person_notes`, `set_person_proposal`.
  `PUT contacts/[id]/details` calls the four in a row, each its own transaction, so a refusal on the second leaves half
  a change, and the "was" it reports is a read made before them. The edge fills an address a customer typed only where
  none is held, by a read before the write ("the race is accepted", `persist.ts`). No client sends notes or a proposal
  to that route any more: the person's notes are records (0007) and the proposal is the deal's (0006).
- **Their answers (consent):** `set_contact_consent`, `set_marketing_consent`, `set_email_marketing`,
  `set_email_offers_yes`, `stop_all_messages`, `record_provider_stop`, `note_yes_on_channel`, `ingest_inbound`'s STOP
  and START, and `email.ts`'s suppression of an address. Their locks differ (`FOR UPDATE` blocks a message's insert for
  that person; `FOR NO KEY UPDATE` does not), one rule (a lead's yes is never a member's) is written twice, and the
  events they write differ in shape (`previous` present in some, not others).
- **Resolution:** `resolve_person`, `merge_people`, `ingest_inbound`'s matching (0034, 0028): already one door each.
- **Derivations:** `person_set_first_touch`, `messages_stamp_offers_asked`, `contact_stop_ends_offers_yes`,
  `events_keep_consent_channels`: triggers that follow another write.
- **A one-off:** `erasure_rekey`, the keyed digests' migration script's door.

## Decision

1. **`person_set(contact, patch, mode)`** writes a person's name and address in one transaction. `set` is a member's word
   and may clear a field; `fill` writes only what is empty, which is what `resolve_person` and the edge do now, without
   the read before. It answers what was and what is, so the route and the Ask card report it from the write. It keeps
   today's refusals (`22023`, `23505`, `P0002`, `28000`), events (`contact.email_set`, `contact.named`) and the trigger
   that clears an address's suppression when the address changes. `set_person_email` and `set_person_name` stay one
   release as thin callers of it, as 0034's doors did, so either deploy order works.
2. **The notes and the proposal leave the route.** `PUT details` stops taking them; `set_person_notes` and
   `set_person_proposal` are dropped once production shows no page wrote through them since the change that stopped
   the clients (the count of `contact.noted` and `contact.proposal_set` events by source).
3. **One writer of a person's answers, several doors in front of it.** A single internal function is the only writer of
   the consent columns: a purpose (`conversational`, `marketing`, `email_marketing`, `address`) and one answer a call,
   `FOR NO KEY UPDATE`, its event in the same transaction with one shape, its authority from the session
   (`auth.uid()`, 00021) or the door that calls it. It is executable by no API role. `record_consent` is the member's
   door in front of it; the service role's doors (a STOP, a provider's stop, an unsubscribe, an email reply, an offers
   yes) call it; `set_email_marketing` keeps its own work beyond the person (the never-again list, the lead) and stops
   writing `contacts`. An address's suppression becomes the `address` answer, with its event.
4. **What stays.** `resolve_person` and `merge_people`; the four derivations, as the database's own backstop; and
   `erasure_rekey` until production's `erasure_keying.keyed_at` is set, then it goes.

`contacts` goes from twenty writers to eight, and to five when the derivations fold into the doors they follow.

## Steps

1. **`person_set`**, its callers moved (the route, the Ask card and its undo, the People board, the edge), the two
   wrappers.
2. **The answers' writer**, its doors moved one at a time, each change holding `consent/consent-paths.db.test.mjs`,
   `consent/stops/*`, `email/email-offers.db.test.mjs`, `consent/consent-channels.db.test.mjs` and
   `database/event-shapes.db.test.mjs` as they are.
3. **The drops**, once production's counts say so: the notes and proposal doors, `erasure_rekey`.

## Risks

- **A grant too wide.** `set_contact_consent` is executable by a member today and the service role's doors are not; one
  writer with a loose grant would let a member record a customer's yes or a provider's STOP. The writer is executable
  by no API role, and each door keeps its own grant.
- **The hot path.** `ingest_inbound` runs on every message; its STOP and START move only with the event's shape held by
  `event-shapes.db.test.mjs` and a measured lock.
- **Events read by triggers.** `events_keep_consent_channels` reads the consent event's `purpose`, `source` and
  `channel`; the one shape adds, it never renames.
