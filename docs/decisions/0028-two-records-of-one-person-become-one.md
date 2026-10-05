# 0028 · Two records of one person become one

**Status:** Decided on 5 October 2026 (Ruben: "yes to all three as you best recommend"). Built, steps 1 to 3 (5 October
2026): the door, the guard's exception, the route and the person page's merge, with their tests (migration 00325). Written against `d6b9efb8f`
(main, 5 October 2026) and verified against the code and the schema snapshot at it; where this note and the code
disagree, the code wins. It answers the
4 October campaigns wiring review's P1 5 ("one human can be two people") and builds on its decision D5 (what a merge
does to consent), which Ruben delegated on 4 October.

## Context

- **How one human becomes two people.** An email from an address nobody holds makes a new person
  (`packages/db/src/repositories/email.ts`, `ingestInboundEmail`): the sender may be someone the workspace already
  knows by their phone. The two rows then answer consent apart: a STOP on WhatsApp leaves the email twin free to be
  written to.
- **No merge exists.** `contacts.merged_into_contact_id` has been on the table since 00002 and is read as "not
  merged" across the schema (`people_list`, `create_person`, the calendar sweep, the deal and note doors), and
  nothing writes it but `erase_contact`, which clears it.
- **What points at a person** (`supabase/schema.sql`):
  - By `contact_id`, with a foreign key: `broadcast_recipients` (primary key `broadcast_id, contact_id`), `calls`,
    `contact_identities`, `conversations`, `deals`, `leads`, `messages`, `person_moments` (primary key `contact_id`),
    `person_notes`, `reach_out_replies` (also `lead_contact_id`), `reach_out_sends`, `segment_members` (primary key
    `segment_id, contact_id`).
  - By `subject_id`, with none: `events`, `decisions`, `notifications`, `policies` (a person's own receptionist mode).
  - In a payload: a scheduled job names `contact_id`, `conversation_id` or `message_id` as text (`erase_contact`
    cancels them by those keys).
- **Three rules a merge runs into.**
  1. **One thread per person.** `conversations_tenant_id_contact_id_key` is unique on `(tenant_id, contact_id)`, and
     `ingest_inbound` leans on it (`on conflict (tenant_id, contact_id)`). Two people merged have two threads; one
     person may have one.
  2. **A message never changes thread.** `messages_guard` refuses an update that changes `conversation_id` ("messages
     content columns are immutable (P3)"). So the two threads cannot be folded by an update as the database stands.
  3. **One address, one person.** `contacts_tenant_phone_uq` and `contacts_tenant_email_uq` are unique per workspace,
     and `ingest_inbound` finds a person by `contact_identities` first, then by `phone_e164`.
- **Other keys that can collide:** `deals_open_uq` (one proposed or won deal per person and service),
  `escalations_one_open` (one open escalation per thread), `reply_turns` (one row per thread),
  `person_notes_reach_out_once`.
- **The model for the door.** `erase_contact` is the other irreversible act on a person: the caller is `auth.uid()`
  read inside the function, a stranger is told "not found", only an owner may, everything happens in one
  transaction, and a `decisions` row records it.

## Decision

1. **A merge is one SQL door**, `merge_people(p_keep, p_merge)`, `security definer`, called through `packages/db` by
   an owner-only route. One transaction: every row moves or none does.
2. **The owner chooses which record is kept.** The other is left as a marked row (`merged_into_contact_id` set, its
   number and address cleared), never deleted: rows that cannot move without colliding stay on it as history.
3. **The two threads become one, by moving the messages.** The kept person's thread takes the other's messages,
   calls, escalations and reach-out replies, and the emptied thread is deleted. The guard learns exactly one
   exception, read from the rows and never from a setting: **a message may change thread only into the thread of the
   person its own was merged into.** Nothing else about a message becomes changeable.
4. **Consent follows D5: the most careful answer wins on each question.** A STOP or do-not-contact on either wins. A
   no to offers wins, and so does an unsubscribe. A yes survives only where neither said no, and the channel lists
   join. A suppressed address stays suppressed, and the earliest `offers_asked_at` is kept. The ledger gets one entry
   per answer that changed, with the source `merge`.
5. **What the door refuses, in a sentence each** (version 1 is for the case the review found, a phone record and an
   email record):
   - both have a phone number and they differ, or both have an email address and they differ: they may be two people;
   - either is erased, being erased, or already merged; the two are the same record; they are in different workspaces;
   - both have an open deal for the same service: close or move one first.
6. **There is no undo.** The page asks for the typed confirmation "Delete this person" asks for, and says what will
   move.
7. **Nothing merges by itself.** No matching, no suggestions: an owner names two records. A "possible duplicate" hint
   is a later change.

## Shape

- **The door, in order:** check the caller and the two rows (locked in id order); refuse per 5; mark the merged row
  first (so the guard's exception is true before a message moves); move identities; fold or re-point the thread
  (the kept thread takes the later of each clock, stays paused if either was, and is open if either was; where both
  had an open escalation the merged one is resolved by the merging owner, the kept one stands); re-point `messages`,
  `calls`, `deals`, `leads`, `person_notes`, `reach_out_sends`, `reach_out_replies`, `policies`, `events`,
  `decisions`, `notifications` (their routes too) and the payloads of scheduled and running jobs; add list memberships
  the kept person lacks; where both set a receptionist mode for a class, the stricter stands; move broadcast rows
  where the kept person has none for that broadcast (the rest stay on the merged row); recompute `person_moments` for
  both rows; take the merged row's number or address where the kept one has none; apply 4; clear the merged row's
  answers (one person, counted once); write the `decisions` row (verb `merge`) and a `contact.merged` event with the
  counts. `erase_contact` erases the records merged into a person with them, so none returns as a person of its own.
- **The route:** `POST /api/v1/contacts/[id]/merge` with the record to merge in, `role: "owner"`, its own rate, a row
  in `route-policy.json`.
- **The page:** on a person, in the same menu as Delete: "Merge with another record…", a picker over People, then a
  confirmation that names both, says which is kept and what moves, and asks for the kept person's name typed.
- **Words:** in `packages/contracts/src/people/`, with the refusals; the timeline says "Merged with <name>" and the
  consent entries say "from the merge".
- **New closed-set members:** the decision verb `merge` (the `decisions_verb_check` constraint and
  `DECISION_VERBS`), the event kind `contact.merged`, the consent source `merge`.

## Steps

Each is its own pull request, shippable in either deploy order.

1. **The door and the guard's exception**, with its database tests and no caller. One migration.
2. **The route and the verb**, with the typed client regenerated.
3. **The page:** the menu entry, the picker, the confirmation, the words.

## Tests

- **The door, on a real database** (`tooling/scripts/tests/people/merge/`): the rows after a merge; each refusal in
  contracts' sentence; the consent table of D5, every pair of answers, held equal to `mergedAnswers` in contracts; a
  merged person's next inbound message (by the moved identity) lands in the kept thread; a second merge of the same
  pair is refused. One transaction is the function's own: a plpgsql door commits whole or not at all.
- **The guard:** a message still cannot change thread in any other case, including into the thread of a person its
  own was not merged into, and no other column became changeable.
- **The route and the page:** who may, the refusals carried back in words, the confirmation's count equal to the
  door's.

## Risks

- **A wrong merge cannot be taken back.** Two different humans merged share one thread and the more careful of
  their answers from then on. The refusals in 5, the typed confirmation and owner-only are what stand against it.
- **The guard's exception is a change to P3.** It is the narrowest one that folds two threads, and it is decided by
  rows a member cannot write (`merged_into_contact_id` is written by this door alone). The alternative is below.
- **Erasure after a merge.** Before this note `erase_contact` cleared `merged_into_contact_id` on the rows merged into
  the person, which would have left each as a person of its own with a name and a note. It now erases them with the
  person.
- **A reader that assumed a merged row has no rows.** Broadcast rows that stay on the merged record still name it:
  a run's report shows that person under the merged record's name. Each reader of `merged_into_contact_id is null`
  is read once in step 1.
- **Scheduled sends in flight.** A job that names the merged record or its thread is re-pointed in the same
  transaction, as `erase_contact` cancels them in its own.

## Open questions for the owner

1. **Fold the threads by moving messages (decision 3), or keep both threads?** Folding needs the one exception to
   "a message never changes thread". Keeping both would mean a person may have more than one thread, which changes
   `ingest_inbound`, the Inbox and every reader that takes "the person's thread": much larger, and a worse Inbox.
   Recommended: fold.
2. **Owner only (decision 1), or operators too?** Recommended: owner only, as Delete is.
3. **Refuse two records that each have a different phone number (decision 5)?** It keeps version 1 to the phone and
   email case and makes the commonest wrong merge impossible. Recommended: refuse, and widen later if owners ask.
