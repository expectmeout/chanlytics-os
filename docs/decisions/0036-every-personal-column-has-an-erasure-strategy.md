# 0036 · Every personal column has an erasure strategy

**Status:** Decided on 6 October 2026 (Ruben, as recommended: a person's numbers and addresses are scrubbed in place in
other people's notes, nothing of anyone else's is deleted, names are left); step 1 built with the note (the registry
and its ratchet, and the notes' scrub, 00341); step 2's test built on 7 October 2026
(`people/erasure/erasure-completeness.db.test.mjs`: the needles seeded into every registered column, the real route run
as the owner, every column searched after; its number on the back office is not yet written); step 3 built on
10 October 2026 (00391): 187 of the 195 classified; its three open questions answered the same day (Ruben: "go with the best recommendations") and built (00392), so 2 stay counted, the message's words, on purpose. Proposed the same day: the registry 0031's invariant 10 names ("every
table has a tenant, a floor and an erasure strategy") and leaves to a note of its own. Written against commit
`163f367` (main, 6 October 2026) with Phase 1's pull request (#1447) on it, and built on `266fff9a`. Where this note
and the code disagree, the code wins.

## Context

An erasure (`DELETE /api/v1/contacts/:id`) runs its legs in order: the block, the copies keyed on the number, Storage,
the rows in one transaction (`erase_contact`), the triggers its tombstone fires, then the best-effort legs
(`apps/dashboard/src/server/people/erase-contact.ts`). The triggers are legs too, and the first draft of this note left
them out: on `contacts.erased_at` the person's own notes and the `note_for_you` about them go (00158), an event that
named them is cut to who and where from (00131), their answers about offers are cleared (00101), and so are the
address (00125), the proposal's link, a deal's note and evidence, a lead's details (`lead_blank`) and their lists. What
each leg reaches is written in its own code: the tables `erase_contact` deletes from, the payload fields the jobs scrub
overwrites, the needles the Ask scrub and the intake ledger's scrub look for. Nothing said which columns a person's
number, address or words can reach, so a new column that held them was erased only if its author remembered. The
intake ledger (00336) is the latest example: its scrub was wired by hand, and a review found the first draft's matching
too narrow.

Two of the scrubs delete the rows they find: the intake ledger's (00336) and the Ask scrub (00238). That is right for a
copy that is the person's, and wrong for a note about someone else that happens to carry their number, which is that
someone's record. And a message cannot be changed at all: a trigger keeps it as it was sent (00326).

The tenancy proof (`tooling/scripts/tests/database/tenancy.db.test.mjs`) already holds every table to a workspace and a
floor; the third part of invariant 10 had no holder.

## Decision

A registry in `packages/db` (`packages/db/src/erasure-registry.ts`) names, for every column of every workspace table
that can hold a person's words, one strategy:

- **with the person**: the row goes when the erasure deletes the person's rows, by the named leg;
- **scrubbed**: overwritten or deleted by named legs, by the person's id or by needle;
- **as a digest**: kept only as a hash an erasure cannot reverse (the block's digests, 00263);
- **by age**: removed by a retention clock within its stated days (contracts `RETENTION_DAYS`), and named on the
  privacy page;
- **with the workspace**: the workspace's own record that can name someone it does not serve (its owner, a member, its
  payer, the representative its carrier filing names, the address it is alerted at): an erasure is of a person the
  workspace serves and does not reach it, and it leaves with the workspace, within the 30 days the privacy page states
  (added with step 3, 10 October 2026);
- **not personal**: holds nothing of a person, said once.

The legs are a closed set beside it (`ERASURE_LEGS`), the trigger legs among them. Which columns can hold words is the
schema's: text, json and their arrays, in a table that names `tenant_id`, its partitions read through it; a column the
schema holds to a closed set (contracts `SCHEMA_SETS`) holds none and is not listed. A ratchet reads the schema the
migrations build and counts each such column the registry does not name, per column, and the count may only fall, so
the registry fills table by table and a new personal column arrives with its strategy.

In other people's notes a person's numbers and addresses are scrubbed in place (`person_notes_scrub`, 00341): each
spelling the erasure finds copies by (`erasureKeys`, the Ask and delivery scrubs' needles) is overwritten with
`[erased]`, the note is kept, its names are left, and its version moves on. Nothing of anyone else's is deleted, and a
name is no key: matching one would take words that are not the person's. The erasure runs it before the rows go (fail
closed) and after (best effort), as it runs the intake ledger's scrub.

A message's words are counted, not named: messages are immutable by trigger (00326), so a person's number or name in
someone else's thread stays, and stays counted, until an exception to that trigger is costed.

## Steps

1. **The registry and its ratchet**, seeded with what the legs reach today: `erase_contact`'s tables, the tombstone's
   columns, the trigger legs, the jobs scrub's fields, the Ask scrub's, the intake ledger's and the notes'. Built, with
   the notes' scrub: 195 of the 312 columns that can hold words were unnamed on 6 October 2026
   (`baselines/erasure-strategies.json`).
2. **Erasure completeness, on a real Postgres:** a person's number and address seeded into every column the registry
   says can hold them, an erasure run, and every such column searched for the needles afterwards. The seeding covers
   the trigger legs (00158 notes, 00131 events, 00101 consent, and the address, proposal, deal, lead and list
   triggers), not only `erase_contact`'s tables. The number on the back office: needles left after an erasure, target
   zero. The test is built (`people/erasure/erasure-completeness.db.test.mjs`, 7 October 2026): it reads the registry,
   so a column named later is seeded or the test says which it could not; a column whose CHECK admits no needle is
   seeded in its own shape and held empty after. The number is not yet written.
3. **The rest classified**, table by table, until the baseline is empty. `ai_usage`'s questions and answers are the
   first to decide: they can name a person and only their 400 days remove them. Built on 10 October 2026: each of the
   195 read against its writers, 187 named. `ai_usage`'s are labels from the question's own options (the CHECK holds
   them to shadow rows of 80 characters), and named by age, which is true whatever a later writer puts there. Three held
   words no leg or clock reached, and 00391 reaches them: the words a run kept for each person (a visit's time, service
   and calendar key, a proposal's link) are cleared when the person is erased (`broadcast_recipients_on_erase`, a new
   leg), and `lead_blank` blanks a reach-out's opening, angle and note, and a preference's example, with the lead they
   were written from. A finished job's error is cleared with its payload (`scrubErasedJobs`): a provider's refusal can
   quote the number. A reply to a reach-out goes with the replier's message, by cascade. Eight stay counted: the two
   message columns, and the two below.

## Tests

- The registry test (`people/erasure/erasure-registry.test.mjs`) fails an entry for a column the schema no longer has,
  a leg the erasure does not run, an age the privacy page does not state, and a leg no column names.
- The ratchet "personal columns with no erasure strategy" (`repo/code-health-ratchets.test.mjs`) fails a new column with
  no strategy.
- The notes' scrub on a real Postgres (`people/erasure/erasure-notes-scrub.db.test.mjs`) and in the erasure's order
  (`people/erasure/erasure-door.test.mjs`).
- Step 2's completeness test, which proves each strategy by running the erasure.

## Consequences

- Adding a column that can hold a person's words means saying how it is erased, in the same change.
- The privacy page's retention paragraph and the registry's "by age" entries agree: the registry names contracts'
  `RETENTION_DAYS` keys, as the purge tests do.

## Open questions

- Answered (10 October 2026, built in 00392): **the mirror follows Google.** A profile's read that lists every
  review drops the ones it no longer lists the same day (`planProfileSync`'s `prune`, never on a capped read or a page
  that came back without its list), and `purge_google_reviews` removes any review not seen for 90 days
  (`RETENTION_DAYS.google_reviews`, stated on the privacy page), the backstop for what a read never reaches. The five
  columns are by age. The mirror keeps a reviewer's name while Google shows it: it is Google's public page, read for the
  business's own replies and reports.
- Answered (10 October 2026): **a lead batch's judgment is kept 180 days,** as `purge_leads` already removed it, now
  stated (`RETENTION_DAYS.lead_judgments`) and by age in the registry.
- Answered (10 October 2026, built in 00392): **a closed invitation goes after 30 days** with its address
  (`purge_invitations`, `RETENTION_DAYS.invitations_closed`), from the decisions that recorded it too; an open or
  expired one stays, for the Team card to send again. The sign-in account an invitation makes for a new address (Supabase Auth, `inviteUserByEmail`) is not the purge's: one never confirmed and holding no seat is a sweep still owed. **A handover's address is cleared once accepted**
  (`handover_accept`); a declined or expired one keeps it, for the partner to send again. Both stay with the workspace
  in the registry, since the open ones do.
- Answered: a person's words in a workspace's own notes are scrubbed in place, numbers and addresses only, and nothing
  of anyone else's is deleted (Ruben, 6 October 2026). In messages they are counted until an exception to 00326 is
  costed.
