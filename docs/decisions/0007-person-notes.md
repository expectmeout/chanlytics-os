# 0007 · A note is a record

**Status:** decided; phase 1 built (00157), phase 3 built (00158). Written against commit `18c79973`
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
2. **The receptionist's suggestions**: after a call's analysis and when a thread
   closes, the edge asks for what is worth remembering about the person (a
   lasting fact, never a summary of the call, which History already shows) and
   suggests it through `person_note_suggest`.
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
