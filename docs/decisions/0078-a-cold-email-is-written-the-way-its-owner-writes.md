# 0078 · A cold email is written the way its owner writes

**Status:** Decided by Ruben on 30 October 2026 (v2, after a review of v1 against the product and the backend); built on
the lane `sequences/the-owners-voice`: migration 00493 (a memory line may be `learned`), the drafter reading the
business and the owner, the paste, the opening a fact where the listing holds one. Spec
`docs/superpowers/specs/2026-10-30-a-cold-email-in-the-owners-voice-design.md`, plan
`docs/superpowers/plans/2026-10-30-a-cold-email-in-the-owners-voice.md`. Written against main's `cf96ac20c` (#1946).
Step 2, a draft learns from what its owner changed: decided by Ruben on 30 October 2026 ("Write the spec", then
"review for refinements or fixes and then continue to build it end to end"), built on the lane
`sequences/a-draft-learns-from-its-edits` from main's `b56811f28` (#1948), with no migration. Spec
`docs/superpowers/specs/2026-10-30-a-draft-learns-from-its-edits-design.md`.

## Context

A sequence to leads is one set of words, drafted once by Ask, with an opening written per business by the check
(0056, 0077, #1941, #1946). Read at `cf96ac20c`:

- **The opening and the words are written apart.** The check writes one line from the listing's record, told to show
  the owner looked, and may not guess (#1941); the words follow and cannot refer to it. The first line lists facts; a
  model reaching for a bridge to the offer is held, again after its rewrite.
- **The drafter knows neither the business nor its owner.** `draftSequence` gives the model the business's name, goal,
  moments, lists, searches and messages: not its description, services or tone, not Ask's memory (0070), not one email
  the owner wrote. Every workspace's words come out in Ask's voice.

## Decision

1. **The owner's voice is Ask's memory.** A line about how they write is a memory line, read by every Ask turn and by
   the drafter, listed and forgotten in Settings › Memory. One learned from the owner's own email says so: the memory
   line's source gains `learned`. No second store, door or pane.
2. **The drafter reads what the business says about itself and how its owner writes:** its description, services and
   tone, every live memory line, and the first emails of its last two started sequences to leads as the owner left
   them, which carry the owner's edits forward without storing a diff.
3. **One optional paste.** A draft to leads with no learned voice offers it once; pasting keeps up to three lines and
   drafts again. A draft written with learned lines says them, with Memory beside them.
4. **The opening is a fact written by code where the listing holds one** (open 24 hours, the closing times, the
   rating), read once by the reader; the writer only where there is none, or the reader cannot back it.
5. **Three rules hold whatever the voice says:** nothing the record does not state; no link in a first email; the foot.

## Step 2: a draft learns from what its owner changed

The started first emails carried the owner's words, but never what they changed: Ask's draft was kept nowhere.

6. **What Ask drafted is kept in the make's decision.** A sequence to leads made from Ask's draft (New, and Leads' "A
   draft by Ask") keeps the owner's line and each step's email as Ask wrote it in its `make_sequence` decision
   (`as_drafted`), never in a step. A sequence by hand, and Ask's own cold-email card, whose words nobody edits before
   Approve, keep none.
7. **The drafter is shown each pair, labelled, and judges it.** The last three started first emails, each with what it
   was for (its search), how it did (its first email's written, wrote back and said no), what Ask drafted and what the
   owner sent, or that they sent it as drafted. The words are read as they stand, so an edit made after Start pairs too.
   No code picks by trade.
8. **Ask notices, the next morning, and asks.** The morning reads the cold emails the member made since yesterday
   whose first email is theirs (the sequences read's `edited`, their own makes only) and may propose one line about
   how they write, quoting their words. It is learned and always waits for their press (0070's gate, said for a read
   that hands the turn the member's own words). The morning asks this only on a day after the member edited one; any
   other morning asks as before and spends nothing on it. A card that waits is titled "Remember this?", never
   "Remembered".

## Amended 3 November 2026 · An owner's Rewrite turns the fact down

Decided by Ruben on 3 November 2026 ("Yes, build step 1", then "Yes, add both"), built on the lane
`reach-out/rewrite-the-opening-as-you-say` with the migration `an_opening_is_written_again_as_its_owner_says`.

9. **An owner's Rewrite gives way on rule 4.** Every Rewrite of a held email asks what should change, in the owner's
   words or none. Its opening skips the fact: the writer is told the opening that was turned down and the owner's
   words, fenced as the record's are, and the reader checks what it writes as it checks any other.
10. **It is written at once, each step said.** The press checks that email itself (`POST reach-out-sends/check`), not on
    the sequences' clock a minute later, and the place says each step as it is taken; at most twenty emails at once.
    What their website says is kept with the email, up to 800 characters, so writing it again reads no site.
11. **Undo puts the earlier opening back** with its check as it stood, until the email goes. Ask's card for a rewrite
    takes the owner's words too, and says its Undo.

## Consequences

- Migration 00493 widens one check and re-creates one door. Either deploy order after it.
- A paste is one model call. An opening with a fact is one call where it was two to four, and cannot be held for a
  guess.
- Step 2 adds no migration, table, sweep or page: the pair rides the ledger's row, the morning's card is Today's.
- Not in this version: Gmail's sent mail, a voice per member, a sentence joining each kind of fact to the words, facts
  ranked by their replies (worth building at about twenty replies in a workspace).
