# 0127 · A fill-in says what it is

**Status:** Accepted by Ruben, 11 November 2026 ("Yes, plan stage 1", then "Yes, start stage 1"), and built as the first stage of the canvas _Their receptionist: heard in one press, theirs in a minute_ (its call P11). No migration, no new route. Written against main at `873a8c23eb`. Amends 0096 (a lead's email is edited where it is read) and 0079 (their receptionist, before they sign up).

## Context

A lead's card shows the email as it goes, with this lead's values in. Nothing told a value from the words around it, so nobody could see which words change from one business to the next. The one blank the card could never fill, the receptionist's link, showed as a yellow `[Their preview]` bracket that read as broken, even once the receptionist existed: the card never read it. An email that says "I went ahead and set it up" was approved with nothing to look at.

Ruben, 11 November: "perhaps clicking or something on the variables can switch between the actual info behind the variable and back to variable mode so users can see both and how it works".

## Decision

1. **A filled blank is a piece of its own** (`leadWordsPieces`: `value`, naming its blank). On the card it wears a dotted line and is a press: its bubble says what it is, where it came from and whether it changes (`fillInSaysOf`), with Change it for this one, which opens the box at that spot. A tap on it never begins the typing; a tap on the words around it still does.
2. **One switch over the email:** As they'll read it, or Show the blanks (`leadWordsBlanks`): the step's own words with each blank by its name. It flips the whole email, never one word, and a tap types nothing while the blanks show.
3. **The receptionist's blank is a mark, never a bracket.** It says what the send will do (`previewChipOf`, which follows `previewSlotOf`: made when this goes, being made, ready, or that the email is skipped), and its bubble is the Sequence line's own line and presses: Make it now, Open it, Copy link.
4. **One read for the sheet** (`sheet/preview-read.ts`): the mark and the Sequence line read one answer through one tab cache, and a press on either moves both. The card reads it only where its email names the link.
5. **One name:** Their receptionist, for the blank, the line, the mark and every sentence that named it. The blank's key, `their preview`, stays: a stored version knows a blank by its number.

## What it leaves

- Hear it, and what the receptionist knows, wait for the recording and the page's change (the canvas's second stage). Open it shows what it knows on its page meanwhile.
- The line written for them keeps its tint and its Rewrite, and has no bubble. The sign-off under the words is the sequence's, not a blank, unless the words name `{{your name}}`.
- A subject shows its blanks where the blanks are shown, and its values plain where it is read.
- On a phone the receptionist's facts open in the same bubble a fill-in opens, not a sheet of their own: one mechanism, and the lead sheet's swipes keep working under it.

## Tests

`tests/leads/workbench/lead-fill-ins.test.mjs` holds the rules (the pieces, the blanks, what a fill-in says, what the mark says). `tests/leads/workbench/lead-sheet-box.test.mjs` draws the card: a fill-in's press and bubble, a tap on it that types nothing, the switch, and the mark before and after its read. The kit's Popover itself is Base UI's, which the page tests stand in for: a browser proves it.
