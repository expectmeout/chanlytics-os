# 0078 · A cold email is written the way its owner writes

**Status:** Decided by Ruben on 30 October 2026 (v2, after a review of v1 against the product and the backend); built on
the lane `sequences/the-owners-voice`: migration 00493 (a memory line may be `learned`), the drafter reading the
business and the owner, the paste, the opening a fact where the listing holds one. Spec
`docs/superpowers/specs/2026-10-30-a-cold-email-in-the-owners-voice-design.md`, plan
`docs/superpowers/plans/2026-10-30-a-cold-email-in-the-owners-voice.md`. Written against main's `cf96ac20c` (#1946).

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

## Consequences

- Migration 00493 widens one check and re-creates one door. Either deploy order after it.
- A paste is one model call. An opening with a fact is one call where it was two to four, and cannot be held for a
  guess.
- Not in this version: a line learned from each edit or at Start, Gmail's sent mail, a voice per member, a sentence
  joining each kind of fact to the words, facts ranked by their replies.
