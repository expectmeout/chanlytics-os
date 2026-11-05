# 0096 · A lead's email is edited where it is read

**Status:** decided by Ruben on 4 November 2026 ("yes build it end to end", on the full scope written for him that day).
Built on the lane
`leads/a-lead-s-email-is-edited-where-it-is-read` from main's `7c5d69e499`, not merged: migration 00545 (not applied), the
door, the sender and the check, the box on the sheet. Where this note and the code disagree, the code wins.

**Decision:** tap the email on a lead's sheet and type. What is typed is this lead's at this step, kept in a table of its
own, and the sender and the check treat it as the words of that email. Everyone else keeps the step's. Nothing leaves
because of a tap: saving moves no state.

## Context

The sheet offered Rewrite the opening, while an email waited for an OK, and nothing else. Today's draft is typed where it
stands, and a one-off email had labelled boxes. "Change it for everyone" had no way in from the sheet.

### Facts that decide the shape

1. **A send is one attempt, not the email.** Take out then Put back, and a canceled run, each make a new send row
   (`sequence_return`, `sequence_sends_one_first`). None exists before a lead is added, or for a step not planned yet. So
   the words are the lead's at the step: `sequence_lead_words`, keyed `(step_id, lead_id)`.
2. **The words keep their slots.** `coldEndingOf` reads `{{your name}}` in the raw words, so plain text signs twice;
   `previewSent` needs `{{their preview}}`, or its thirty days never start.
3. **The sender and the check compare a mark.** `checkedWordsOf(words, signedBy, hasBookingLink)` is stamped by the check
   and compared by the sender, and a send whose mark differs goes back to be checked (R5). The door stamps the new words'
   mark on a checked send, made the way those two make it, or every save would mean a second check.
4. **The check writes a line within two hours of sending,** unless its batch waits for an OK (`sequence_unchecked`). So an
   email due tomorrow may have no line yet.
5. **A touch that starts in a text box is refused by the sheet's gestures** (`swipeOwnDrag`), and the email is most of the
   card. So it is read text at rest, and the box is drawn on the tap (`drawnNow`, or iOS raises no keyboard).

## What it does

### The box

- At rest the email reads as it goes. A tap (never a drag, nor words being selected) or Edit draws the box with the same
  words, at the same size, in the same place, the caret where it fell. On a touch screen the email reads at
  `--field-text-touch`, since a text box there is 16px and the first tap would jump.
- What is not known yet is a mark in brackets. `[A line about them, written before it goes]` left alone maps back to
  `{{opening}}` and the check writes it; replaced or deleted, the words are the member's. A gap (`[Their city]`) must be
  filled before it saves.
- On saving, a value the words named goes back to its slot where that changes no character (`fill(unfill(text)) === text`),
  so a sign still names its slot and a name put right still reaches the email. The fallback "there" is never turned back.
  Typed back to what the step says for them, it is the step's again: no copy that would stop following it.
- Saved when left: Done, a press elsewhere, the sheet closed, the next lead, Esc or Ctrl/Cmd+Enter. Never mid-sentence, since
  a half sentence could be claimed by the clock. Kept in the tab until the door has it (`useUnsavedWork`). A switch to
  another app is no leaving.
- The rules are a step's (`validateReachOutWords`, `firstEmailLinkProblem`, the gaps), said under the box before the door is
  asked. The door's refusal is said there too, over what was typed. Leaving words that cannot go, the dock asks: Keep
  editing or Put them back.
- The dock's place holds Done, Use the sequence's words, and under its caret Change it for everyone and Send me a test,
  which saves first.
- A toast says Saved for the lead with Undo (ten minutes), which puts back what stood.

### The door (00545)

`sequence_lead_words_set`: an acting member, an email step, a lead of the workspace not erased. It locks the latest send at
the step. Claimed, queued, sent or handed: "That email has gone." Drafted: it is the owner's to send, and they change it in
their mail app. On a planned or held send it moves `check_gen`, so a check under way writes nothing onto them, frees its
lease and stamps the mark if it was checked. Where the words name a line, and a checked send has none, it goes back to be
checked.

Members read the table; only the door writes it. `lead_blank`, `lead_person_forget` and `lead_person_leg` delete the rows,
since they may name the lead and its people.

### The send path

- `sender.ts`: this lead's words, else the step's, into `Made.words`, which a mailbox send and an owner's draft both read. A
  read that fails throws, and the send stays claimed: it never goes with the step's words because this did not land.
- `check.ts`: the same pick. With no `{{opening}}` no model is asked and no attempt is spent. What holds a send for its
  business still holds. The stored line is left alone, for the step's words coming back. A read that fails checks nothing
  that tick.
- `test-mail.ts`: Send me a test uses these words.

### What stays as it was

A held email stays held, for its owner's answer: Include, worded Send anyway, lets it go with these words. A waiting email
still waits. Rewrite is refused where the words hold no line ("You wrote this email. Use the sequence's words first."), and
Rewrite all leaves those rows out, since what the check refused of an opening is gone. A hold about the business stands.
Ask reads where a lead stands, and may not write these: a member types them, reading them as they go.

### The rest of the product says so

The sheet's card, Sequence line, step titles and gaps read the words through `leadCardEmailOf` and `leadCardStepsOf`. The
Leads tab's waiting and held rows, the run screen and the held rows say "Your words". The run's sample skips an edited lead.
Preview as a real lead shows them. The step sheet says how many leads keep their own, or "for everyone" would be untrue.
Activity has a line for `reach_out.lead_words_changed`, which carries no words.

### Read apart from the emails

`GET leads/:id/words` is a read of its own. Folding the words into `GET leads/:id/emails` would have changed that route's
answer from a list to an object, and a tab open across the deploy reads `.map` of it. A sheet holds its first draw until
both are in. Where the words could not be read, the email says these are the sequence's, and nothing can be typed over what
it cannot see.

### False lines this fixed

- Up next drew a placeholder over a written line: `withOpenings` read waiting and held only.
- "You read it before it goes" was untrue once a sequence's words were approved. It is now "A line about them, written
  before it goes", and where the listing can say the line, the card shows that, as Send me a test does.
- A step that went drew the same placeholder. It shows what went (`GET leads/:id/sent/:send`), read when it is opened.
- Rewrite the opening was missing on Up next, though its door allows it.
- "Change the words in the sequence", on a lead with a gap, now says it can be typed here too.

## Consequences

- One migration: a table, a door, and three doors re-created. **Apply 00545 before the merge.** Both apps read the table
  (the sender and the check through the service role, the dashboard on the session), and every read of it throws where it
  is missing, so a build ahead of the migration would hold sends rather than send the wrong words.
- An edit saved in the minute the two hosts differ, on an email claimed in that same minute, could go with the earlier
  words. Sends are paced hours apart, and that was accepted rather than splitting the change.
- Two members at once: the last save wins, and Activity shows both.
- A sequence's signature changing sends these back to the check, as it does the step's, and keeps the words.
- Moved to another sequence, the words sleep with their step, and come back if the lead returns.

## Later, not needed for this to be right

Change it with Ask in the box; Ask noticing what was typed and asking to remember it (decision 0078, step 2); "Use these
words for everyone"; the box on an email its owner sends; the reply rates of edited emails against the step's.
