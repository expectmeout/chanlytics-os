# 0098 · A line is written when its email is planned

**Status:** decided by Ruben on 5 November 2026 ("Yes, build it", on the analysis given that day). Built on the lane
`leads/a-line-is-written-when-its-email-is-planned` from main's `69ca5c1e75`, not merged: migration 00546 (not applied),
the check's order and its guards, the line on the lead's sheet. Where this note and the code disagree, the code wins.

**Decision:** the check writes an email's line as soon as the email is planned, or put back to be checked, whatever its day.
The line then shows on the lead's sheet in the colour of what is written for each person, and a tap edits it there.

## Context

A lead's sheet, on an email due tomorrow, said "A line about them, written before it goes" where Ruben wanted the line
itself: "perhaps the dynamic line written has to be written and ready at an earlier step". (5 Nov 2026, against main's
`69ca5c1e75`.)

- A line lives on a send (`sequence_sends.opening`), written by the check's clock every minute (`apps/edge/lib/reach-out/check.ts`).
- The clock took a send in a run waiting for an OK whatever its day, and one in a run that goes ahead only within two hours
  of its time (R2 of the Part 4 plan): `CHECK_AHEAD_MS`, `sequence_unchecked`'s `p_ahead_minutes`, and a literal in
  `trigger_reach_out_check_sweep`.
- A run is placed over up to seven days (`TIMETABLE_HORIZON_DAYS`), so most of an approved run's emails had no line to read,
  and none to change. `reach_out_recheck` blanks a written line when a step's words or the name it signs with change, and
  that put an approved email back behind the same wait.

The two hours came from when the check was the last thing before a send. They are not a rule about the line: a run waiting
for its owner has always had its lines written days ahead, and the sender still compares the words' mark at the claim (R5).

## Decision

1. **No send waits for its day.** `sequence_unchecked` takes every planned send, and so does the trigger's `exists`.
2. **What is due soon goes first.** Waiting for its owner, or due within `p_ahead_minutes`, comes first in its workspace's turn,
   and the function says so (`due_soon`), so an email days off never keeps one due today waiting.
3. **No model's bad hour holds an email days off.** An hour of failures holding a send as `check_unavailable` (R4) is for what
   is due soon. One that is not backs off, then is asked hourly, and its hour starts only once it is due soon
   (`failedCheck`). Otherwise an outage would put next week's emails in front of their owner as held.
4. **The day's attempts are kept for what is due soon.** Emails not due soon may spend `REACH_OUT_CHECKS_AHEAD_PER_DAY` (300) of
   the day's `REACH_OUT_CHECKS_PER_DAY` (400). A week of a large workspace's emails planned at once, or words saved twice over
   a full batch, would otherwise spend the day before an email due today was written, and that email could not go. A press is
   a person waiting, and takes from the whole day.
5. **The line wears `--slot`.** On the sheet at rest it reads in the coral of what is written for each person (`.lw-opening`). The
   box stays plain text, since a text box cannot colour part of its words.
6. **The sheet says what is true of a line not written.** "Being written…" only while the check is at it
   (`placeLineWriting`: unread, its sequence on, not put off), and the page reads their place again until it lands. Put off, or
   in a sequence that is not on, it keeps "A line about them, written before it goes", which stays true.
7. **Write it now goes.** It stood in for the wait this removes. A press could not hurry an email put off or a paused
   sequence's, and beside "Being written…" it only offered to jump a queue that takes minutes.

## Shape

- `supabase/migrations/00546_a_line_is_written_when_its_email_is_planned.sql`: `sequence_unchecked` re-created with `due_soon`,
  `trigger_reach_out_check_sweep` re-created. Either deploy order: an edge from before it reads no `due_soon` and writes the
  lines early; an edge after it over the function before it reads a missing `due_soon` as due soon.
- `apps/edge/lib/reach-out/check.ts`: the two guards. `packages/db`: `UncheckedSend.due_soon`, and `check_after` on a row that
  shows its line (`withOpenings`).
- `apps/dashboard/src/surfaces/leads/sheet`: `stepMailOf`, `railMailOf`, `PieceOf`, and the wait in `LeadSheet`.

## Tests

- `tooling/scripts/tests/reach-out/reach-out-check.test.mjs`: the backoff, the hour that waits, the attempts kept, a press.
- `tooling/scripts/tests/reach-out/reach-out-checked.db.test.mjs`: every send taken, due soon first, `due_soon` said.
- `tooling/scripts/tests/lead-workbench/lead-sheet-box.test.mjs`: the line at rest in each state, and `placeLineWriting`.

## Risks

- **Words changed often over a full batch spend attempts.** Each save puts every planned email back, and each is written again
  within minutes, where it used to wait for its day. Point 4 bounds what that can cost an email due today.
- **A line can be up to seven days old when it goes.** A run waiting for its owner has always had this. The line is written
  from the lead's record, and what the sender checks at the claim it still checks.
- **More goes to the model for emails that never go,** a lead taken out or one who replied first. Haiku, a line each.

## Not done

- A lead with no send has nowhere to keep a line: on a list waiting for its batch, a later step before its day, or "If you add
  them". They keep the mark. A press that writes one there and keeps it as the lead's own words is left for Ruben's word.
- Preview as a real lead reads the lines of emails waiting or held, not those up next (`withOpenings`' default groups).
