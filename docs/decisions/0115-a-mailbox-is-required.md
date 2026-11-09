# 0115 · Cold email: a mailbox is required, and the page says one answer

**Status:** Accepted by Ruben, 9 November 2026 (the Cold email canvas, version 12, "i love it"; "Plan the build"; "Yes,
start Stage A"). Stage A built: the page, its words, the first-email rule and the mailbox requirement, with no database
change. Stages B to E are the plan's, `docs/superpowers/plans/2026-11-09-cold-email.md`.

## Context

Settings › How it reaches out (0113) mapped the code: ten rows, in the order of what writes the email, and nothing that
said whether an account was ready. An owner could be told an address was "always added" with none on file, and every
email held for it. Sending by hand was offered on New, on Ask's card and on the page, which Ruben ruled out: "users MUST
connect a mailbox as manually sending emails defeats the purpose of chanlytics".

## Decision

1. **The page is Cold email, in a group of its own, Outreach, after Autonomy.** Its route stays `admin/outreach` and its
   section `reach_out`: a bell, an Ask answer or a bookmark that names them still lands. Rows that became one sheet
   (`signed_by`, `signature`, `sign_phone`, `cold_tone`) open the sheet that holds them.
2. **One answer for where it stands** (contracts `coldEmailStandingOf`), in one priority: a held mailbox, a signed-out
   one, what is left before a first email, no mailbox, no address, a run waiting, the month used, no one new, every
   mailbox paused, ready, sending. The page draws it first, and Today draws its headline once a workspace has started
   cold email and it waits on the owner.
3. **A mailbox is required.** A new sequence to leads with no connected mailbox is refused, on New, on Ask's card and at
   the door, whichever the body says: the make marks one with none as sent by hand (00459). One already sent by hand goes
   on until the code goes (the plan's Stage E). A lead's own email sends from the mailbox, or says to connect one.
4. **Only Google Workspace connects.** Microsoft stays halted, and "Tell us" counts who asks for something else: one line
   of the log, nothing stored.
5. **After a sequence's first run, first emails follow Before each batch** (0077 amended): the first run waits for an OK,
   since its words are new, and after it each batch holds for a stop or asks, as follow-ups already did. Cold email never
   just goes.
6. **"Healthy" means every check passed** (contracts `coldEmailSendingOf`): the domain's records, bounces and complaints.
   The pace says days of sending, never a date, since the ramp counts the days a mailbox really sent.
7. **Each sheet says what a change reaches**, as it stands today: until a sequence remembers what wrote it (the plan's
   Stage C), running sequences keep their words, and the sheet says so.

## Consequences

- `REACH_OUT_REFUSALS` keep the word "reach-out": the database raises those sentences (00211), so they change with a
  migration, in Stage B.
- The by-hand road's code stays until Stage E: `owner_sends`, To send, the "Did you send it?" ask. Nothing new reaches it.
- Moving the page out from under Receptionist reverses 0113's placement, which its note said was one line to undo.
