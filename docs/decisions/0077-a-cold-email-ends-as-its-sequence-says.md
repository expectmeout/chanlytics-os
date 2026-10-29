# 0077 · A cold email ends as its sequence says

**Status:** Decided by Ruben on 29 October 2026; built on its lane the same day, not merged: migration 00491
(`sequence_steps.signs_with`, `reach_out_save`, `sequence_create_leads`), `coldEndingOf` in the send, the owner's draft,
the preview and the test, and How it runs' mailboxes, Follow-ups and Ends with. The cold email canvas's board D and its
check against the code (D4, D7, D10, D11 of twelve, all approved that day); spec
`docs/superpowers/specs/2026-10-29-sending-and-the-ending-design.md`, plan
`docs/superpowers/plans/2026-10-29-sending-and-the-ending.md`, lane `sequences/how-a-cold-email-ends`. Written against
main's `b2ce4d6d4` (#1915).

## Context

A sequence to leads sends from the workspace's own mailboxes (0056). Read at `b2ce4d6d4`:

- **The ending is the mailbox's, and nobody sees it.** A send's text is the step's words, then the mailbox's signature,
  then the foot (`apps/edge/lib/reach-out/request.ts` over channels `buildEmailRequest`). The preview writes from a
  stand-in that signs with none (`apps/edge/lib/reach-out/preview.ts`, "No mailbox stands behind a preview"), and so
  does the test to yourself (contracts `leadStepTestMail`). A Gmail signature can carry a web address, which the cold
  rules forbid in a first email's words (contracts `reachOutRules`) and never read in a signature; it can carry another
  business's name, when the mailbox is that business's; and its words can come out run together (channels
  `gmailSignatureWords`).
- **Which mailboxes is not a choice.** The chain names `mailbox_ids` (00424; up to 10), and New's create door writes
  every mailbox connected at that moment (00465). How it runs offers "Your inbox · you send" or "Your N mailboxes",
  never a subset, and nothing says a mailbox's DNS is missing.
- **The pace has two defaults and shows the fastest.** New's create door writes 12 minutes; the contracts' first pace
  is 20 (`REACH_OUT_GAP_FIRST`); `leadPaceChoicesOf` keeps the first, fastest gap for each day count, so a saved 12
  matches no choice and the picker shows 5.
- **"Before each batch" offers a choice a first email never follows.** Every batch of first emails of a sequence fed by
  a list waits for an OK whatever the mode (core `run-reach-out.ts`: `step.fed_by === "list"`), and every sequence New
  makes is fed by a list (00459).

## Decision

1. **A sequence chooses its ending:** `sequence_steps.signs_with`, `name` or `mailbox`, on its root, `name` by default
   and for every sequence there is. With `name`, the send adds the Signed line under the words, unless their last line
   is `{{your name}}`, and no mailbox signature. With `mailbox`, the mailbox's signature, except on a first email when
   that signature carries a link: that email ends with the name. One rule, contracts `coldEndingOf`, for the send, the
   owner's draft (the sign-off only: their mail app signs), the preview and the test.
2. **The preview and the test show the ending the send makes,** from the first mailbox the sequence writes from.
3. **Mailboxes are a pick.** How it runs lists every mailbox of the workspace with a tick, its day, its state and its DNS,
   and saves `mailbox_ids`; one always stays ticked while the mailboxes send. A new sequence ticks the connected mailboxes
   whose SPF and DKIM are not missing, and every connected one when none is. A default, never a gate.
4. **One first pace, 20 minutes,** in the create door and the contracts; the day's choices keep the slowest gap for each
   count, and the saved gap is always one of them.
5. **How it runs says the batch rule as it is:** "Every batch of first emails waits for your OK"; its choice is for
   follow-ups ("Your OK first, then 30 minutes to stop" or "Each waits for your OK").
6. **A signature's lines are kept** when Gmail's HTML is read into words.

## Consequences

- Every live sequence's emails end with its Signed line from the deploy on, and no mailbox signature, until How it runs
  chooses the signature.
- The migration goes to production before the merge, since the edge reads the new column; after it, either app may
  deploy first.
- Lane 5 (the batch on Today) owns the run sheet's own email, which should end as the send does.
