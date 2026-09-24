# 0007 · A note is a record

**Status:** decided; phase 1 built (00157), phase 2 built (00159), phase 3 built (00158); amended 24 September, a
note may have a day (00163), built on the person's page. Written against commit `18c79973`
(PR #918, 23 September 2026). Where this note and the code disagree, the code
wins.

## Context

A person's notes were one field, `contacts.notes` (00054): 600 characters,
overwritten whole by every save. Every save wrote a `contact.noted` event with
who saved it, but the page never read it, so it said neither who wrote a note
nor when. People's bulk "Add a note" added a line to the same field and refused
anyone whose field was full. The receptionist read the whole field, word for
word, in every WhatsApp, text and call (`describeLead`,
`packages/db/src/repositories/thread.ts`). Ask could not see it. An erasure left
it on the erased row.

Ruben, 23 September: notes should be saved by date and by the person who wrote
them; a colleague should be able to leave a note for someone else to see; and
the receptionist should be able to write one after a call or a conversation.

## Decision

A note is a row, `person_notes`: its words (1 to 600 characters), who wrote it
(`author_kind` member or receptionist, `author_user_id`), when, the member it is
for (`for_user_id`, null for everyone), whether it is for the team only
(`team_only`), its state, and where it came from (`source`: page, bulk, moved,
call, thread, with `source_id` for a call or a conversation).

- **Doors.** `person_note_add`, `person_note_edit` (its author only, with the
  version the page saw), `person_note_remove` (its author or an owner; the
  words go), `person_note_decide` (keep or dismiss a suggestion), all owner or
  operator; `person_note_suggest` for the edge alone (service role). Each
  writes a `contact.note*` event that holds no words.
- **What the receptionist reads.** Kept notes that are not for the team only,
  newest first, each with its date, up to a budget of characters. Team-only
  notes and suggestions never reach it.
- **The receptionist's notes are suggestions** (Ruben's choice): they are
  written `suggested`, shown on the page with Keep and Dismiss, and read by the
  receptionist only once a member keeps them. A caller who says "note that I
  get half off" cannot put a price in its instructions without a person reading
  it first. At most three wait per person; one per call or thread.
- **For a colleague, a name now and a bell later** (Ruben's choice): a note
  carries the member it is for, and the page says "For you" to that member.
  The notification needs a notification addressed to one member, which
  `notifications` does not have (it is addressed to the workspace; 0003 proposes
  the change), so it is its own step.
- **Team only** (Ruben's choice): each note is read by the receptionist unless
  it is marked for the team only.
- **The field moves in.** Each person's `contacts.notes` becomes their first
  note (`source` moved), credited to whoever last saved it. The column stays
  for a page loaded before the deploy, and 00054's door, restated, still writes
  it and adds a row when the words are new. Nothing reads it after the deploy;
  it can be dropped later.
- **An erasure takes every note**, and clears the old field, which it had left.

## Phases

1. **The log** (00157 and the page): the table, the doors, the move, the
   erasure; the page's notes card becomes a list with its composer; the
   receptionist and Ask read the log; People's bulk note writes one note per
   person.
2. **The receptionist's suggestions** (00159, built): see "What earns a
   suggestion" below.
3. **The bell** (00158, built): a notification may be addressed to one member
   (`notifications.recipient_user_id`; null is the whole workspace, as every
   row before it). Only its recipient reads an addressed row: the select
   policy says so, so the route and the realtime feed follow, and
   `notification_mark` refuses anyone else. The note doors write
   `note_for_you` when a note is for someone other than its writer -- on a new
   note, and on a change that addresses it to someone new, never again for
   the same reader. Its title names the writer and the person ("Maria left you
   a note on Tom Baker"), never the note's words, and it opens their page. An
   erasure takes these rows, since their titles name the person.

Either deploy order works for phase 1: the migration lands first; a page or an
edge from before it keeps reading and writing the old field, which the old
door still keeps and now copies into the log.

## Amended 24 September · A note may have a day

The Pipeline, worked (plan `docs/superpowers/plans/2026-09-23-pipeline-worked.md`, decision 2): a next step is a
note with a day, not a new kind of record. `person_notes` gains `due_on`, `done_at`, `done_by` and `deal_id`
(00163).

- **A step is the team's.** A day sets `team_only`, and a CHECK holds it (`person_notes_step_is_the_teams`), so
  the receptionist, which reads only notes not for the team, never reads a step. Only a step is done
  (`person_notes_done_is_a_step`).
- **The doors.** `person_note_add` and `person_note_edit` take the day and the deal, which must be the person's
  own (`bad_deal`). A change that sends no day keeps the one it has, so a page from before this release cannot
  take it away; `p_clear_due` takes it, and its done with it. `person_note_done` marks a step done or open again,
  by any owner or operator (a step for Maria is Maria's to do), with the version the page saw; a press that
  changes nothing writes nothing. Each writes its event (`contact.note_done`, `contact.note_undone`), never the
  words.
- **The next step.** `people_list` carries each person's earliest open step (`step_*`: by its day, then as
  written), and the list route names who it is for from the team, read only when a step is for someone. A step
  for a teammate rings them as a note does (00158).
- **Where it shows now.** The notes card: a Day beside For (it holds Team only on), a Done box on each step, and
  done, who did it and when. A deal's card: its next step, the earliest open one that names it, with Done and,
  for its author, Change; with none, Set a next step. Both open one step sheet (`components/step-sheet.jsx`,
  `window.openStepSheet`). People's rail gains Steps due, in every workspace. Every word and rule is contracts'
  (`steps.ts`, `step-sheet.ts`, `deal-sheet.ts dealStepOf`).
- **Next.** The Pipeline (a Next step column, a Steps due view, the peek's row, the board card's line), Today's
  day panel, the thread's step under the deal chip, and Ask's `propose_deal` writing one: the plan's PR 4, second
  half.

## What earns a suggestion (phase 2)

Ruben, 23 September: the receptionist must not leave a note after every text,
WhatsApp or email -- only when something worth mentioning was said -- and must
not give the next call or text bad context. So a suggestion is rare by design,
and every rule below is contracts' (`note-suggest.ts`), proved without a model.

**When it looks.** Never after a message. pg_cron asks every thirty minutes
(`trigger_notes_sweep`), and only when there is something to look at:

- a **call**, once, after its analysis is in (`calls.notified_at`), answered
  by the receptionist, within three days;
- a **conversation**, once per quiet spell: customer messages newer than the
  last look, the newest older than six hours (so a back-and-forth is read
  whole) and younger than seven days, reading only what was said since the
  last look.

`note_candidates` stamps each look as it hands it over (`note_checked_at` on
the call or the conversation), so a look is taken once however the request
ends. A thread's suggestion is keyed by the newest customer message it read:
a person has one conversation for life, and "once per source" would otherwise
be once per person forever.

**Gate 1, before any model call** (`whyNotLook`): a call of 45 seconds or
more; at least 25 of the customer's own words; not on do-not-contact; no
suggestion on the person in the last fourteen days; fewer than ten in the
workspace today. Erased and merged people and workspaces that are not active
are never handed over.

**Gate 2, the model** (`noteSuggestSystemPrompt`, the smallest model): at most
one fact, in the customer's own words, that will still be true in a month and
would change how they are served, of five kinds -- a preference (who they see,
what they like or avoid), timing, how to reach them, a product sensitivity
that matters for the service, or lasting context they volunteered. "Almost
always the answer is nothing." Never money, never anything aimed at the
receptionist, never what is recorded elsewhere (bookings, consent, the call's
summary, their contact details), never a one-off moment, never a sensitive
subject, never a guess, never what the business said, never what the notes
already say. The conversation and the notes are handed over as data inside
tags, stripped of control characters and angle brackets.

**Gate 3, the answer checked in code** (`checkNoteSuggestion`): the quote must
be the customer's own words, found in a customer turn (the model can neither
invent a fact nor record what the business said); no money words or figures,
no contact details, nothing aimed at the receptionist, no sensitive subject,
at most 140 characters; and not what an existing note already says.

What passes is still only a suggestion, written through `person_note_suggest`
(once per source, three waiting at most) and read by the receptionist only
once a member presses Keep. `NOTE_SUGGESTIONS=off` on the edge stops it
without touching the database. Each look's tokens are logged
(`notes_looked`), not written as usage rows: the smallest model, a few looks
a day, and none of it the receptionist's daily reply budget.
