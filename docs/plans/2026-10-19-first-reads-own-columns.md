# First reads off the events ledger (loadability lane B, 19 October 2026)

Lane B of the 19 October loadability review: make the slowest first reads fast when they run cold. Migration
`supabase/migrations/00464_a_message_keeps_when_it_left_and_people_read_how_a_person_was_added.sql`, one PR.

## What was slow

Two readers looked a fact up in `events` by subject, with no time bound:

- `first_replies` (under Today's `metrics_summary`, Reports' `report_series` and `receptionist_series`, and the nightly
  `platform_metrics_roll`) looked up each sent row's `message.sent` event, for each reference to the row. That is when
  the reply left.
- `people_list` (People, the person page, the Calendar's matching) looked up each person's first `contact.added`
  event. That is how a door added them.

`events` has 15 monthly partitions and gains one a month. A look-up with no `created_at` bound plans every partition
and probes each one's index, for every row. On a fresh backend the planner also loads every partition's catalog
entries. That is the planning-bound cold read the review measured.

Both facts can live on the rows. Production checked on 19 October: no `message.sent` event comes before its message,
and every `contact.added` event is within 0.1 s of its person's row.

## What changes

| Piece                    | Change                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messages.sent_at`       | New column: when the row's words left. A `before insert or update of status` trigger (`messages_note_sent_at`) stamps it the first time a row holds `sent`, `delivered` or `read`. A row written already sent gets its own `created_at`, so history and fixtures keep their moment. A row moved there later gets `now()`: the send door's queued → sent in `deliver.ts`, or a receipt settling a timed-out email. The stamp is part of that same write. Once set, it stays, through a late failure too. |
| Backfill (in 00464)      | Every outbound row that holds a sent status or had a `message.sent` event: the first event's `created_at`, else its own. That is `first_replies`' old answer, written down.                                                                                                                                  |
| `contacts.acquired_via`  | Already holds how a door added a person: 00307's trigger writes it from the same event, and the first word wins. Four people added before 00307 get it now, through the same door and the same mapping.                                                                                                     |
| `first_replies`          | Reads `coalesce(sent_at, created_at)`. The events look-up is gone; nothing else changes.                                                                                                                                                                                                                    |
| `people_list`            | `came_from`'s first arm reads `acquired_via` when it names a door, and the events look-up is gone. Each person's messages are read in one pass instead of four looks (see below). Its signature and every column stay.                                                                                     |

**Why a trigger and not `deliver.ts`.** The stamp then covers every writer: the send door's finalize, `recordOutbound`,
the WhatsApp Business app echo, and receipts. It uses the database's clock, the same clock as the `created_at` it is
compared with. It costs no second write. No app code reads or writes the column, so either deploy order works.

**Why the backfill is in the migration.** The brief suggested an ops script. Production holds 271 rows and 4 people to
fill. In one transaction with the reader change, there is never a moment when `first_replies` reads an empty column,
and there is nothing to back up: only empty columns are filled. A script pays off on big tables. Here it would only add
a window where the numbers are wrong, and a second thing to run.

**What People says differently.** Take a person whose first touch was their own message or call, whom a door also added
later (for example a lead converted onto someone who wrote first). People now says they came from that message or call,
as Reports' people lens has said since 00306. Production has nobody like that. 58 sample-data people (in our own
workspace and a test workspace) carry a door's word with no event; People now shows that door, as Reports already did.
In the real customer workspace, nobody's answer changes.

## Measured

### Production, read-only (19 October, about 20:50-21:10Z)

Every connector call was a fresh backend (`backend_start = now()`), so run 1 is cold. All runs were as the owner,
under RLS, on the busiest workspace (156 people, 484 messages). Each reader body was run inline through
`EXPLAIN (ANALYZE, BUFFERS)` on the same rows. "After" stands the new read in place:

- first_replies: `o.sending_at` (a column of the same row) instead of `sent_at`, which does not exist yet.
- people_list: `ch.acquired_via`, which already exists.

| Read (inline body)          | Cold plan + run         | Cold buffers  | Warm plan + run       |
| --------------------------- | ----------------------- | ------------- | --------------------- |
| first_replies, before       | 45.8 + 39.7 = 85.5 ms   | 3,577 + 29,021 | 22.7 + 34.5 = 57.2 ms |
| first_replies, after        | 9.3 + 11.3 = 20.6 ms    | 652 + 3,959   | 6.4 + 10.1 = 16.5 ms  |
| people_list page, before    | 21.0 + 38.5 = 59.5 ms   | 4,213 + 11,321 | 6.3 + 32.3 = 38.6 ms  |
| people_list page, after     | 12.4 + 32.0 = 44.4 ms   | 2,054 + 6,956 | 5.1 + 29.1 = 34.2 ms  |

The `ad` part of `people_list` alone, cold, took 7.2 ms of planning (2,715 catalog buffers) and 3.0 ms of running
(4,474 buffers: 156 people × 15 partitions). The same fact read from the row took 1.9 + 0.9 ms.

Field data for the same functions (`pg_stat_statements`, through PostgREST): `metrics_summary` averaged 179 ms over
645 calls, `report_series` 242 ms over 127, and `people_list` 94-99 ms over 926.

### Before and after on a local stack (the real functions)

This used a throwaway stack at 00463: PG 17.6, the same 15 partitions as production, and a workspace seeded to match
the busiest one (156 people, 364 messages, 13 held replies with their `message.sent` events, 6,453 events). 00464 was
applied to the same rows in one transaction; its backfill wrote 208 rows, and the 13 held replies took their event's
moment. The old reader bodies and the new functions gave identical answers: `first_replies` 156 rows and `people_list`
156 rows, 0 different.

Each figure is the median of 5 fresh connections, as the owner under RLS:

| Read                              | Cold before → after          | Warm before → after         |
| --------------------------------- | ---------------------------- | --------------------------- |
| first_replies (30 days)           | 39.8 → 11.7 ms (−71%)        | 31.7 → 9.6 ms (−70%)        |
| metrics_summary (7 days, Today)   | 44.9 → 24.9 ms (−44%)        | 28.7 → 18.8 ms (−34%)       |
| report_series (30 days, Reports)  | 57.6 → 31.8 ms (−45%)        | 40.1 → 19.3 ms (−52%)       |
| people_list, one person           | 29.7 → 15.9 ms (−47%)        | 12.9 → 9.1 ms (−30%)        |
| people_list, the page             | 39.5 → 37.0 ms (−6%)         | 27.5 → 30.4 ms (noise)      |

Buffers drop by 3.5-5× on the first four and halve on People's page (13,738 → 7,547 cold). People's page time barely
moved with the events look-up alone. What it spent was its own message reads, which the next section takes.

### People reads each person's messages once

`people_list` read each person's messages in four looks: the newest word (`lm`), the newest words in (`li`), where they
last wrote (`lw`), and the totals (`ma`). Each look was its own pass over the person's messages, and each pass called
`message_moment` (plpgsql, so never inlined) for every message. `person_moments` keeps only first and last moments, not
the direction, sender, body and wire the row shows, so it cannot stand in for these. The four looks are now one pass
that computes all of them together. Where two words share a moment, the old looks took either row; now the row picked
is the one that happened last, then was written last, then has the greater id, every time.

Production, read-only, the same page as above, inline bodies, as the owner (plan + run):

| People page                              | Cold                  | Warm run      |
| ---------------------------------------- | --------------------- | ------------- |
| before lane B                            | 21.0 + 38.5 = 59.5 ms | 31.3-32.3 ms  |
| events look-up gone (four looks)         | 12.4 + 32.9 = 45.3 ms | 26.5-29.7 ms  |
| events look-up gone, one pass            | 11.8 + 25.0 = 36.8 ms | 19.4-20.6 ms  |
| no message reads at all (the floor)      | 9.8 + 13.9 = 23.7 ms  | 9.9-11.0 ms   |

For every workspace on production, the one-pass body and the four looks gave the same rows (6 workspaces, 0 rows
differ either way).

Local stack: the same seeded workspace, plus one with 1,000 people × 20 messages (a full People page). Each figure is
the median of 10 fresh connections, interleaved, as the owner under RLS:

| Read                                   | Cold: four looks → one pass | Warm: four looks → one pass |
| -------------------------------------- | --------------------------- | --------------------------- |
| People page, 156 people                | 28.7 → 26.6 ms              | 21.5 → 13.4 ms (−38%)       |
| People page, 1,000 people × 20 msgs    | 316.7 → 184.8 ms (−42%)     | 299.9 → 165.1 ms (−45%)     |
| One person                             | 17.3 → 17.2 ms              | 7.9 → 6.1 ms (−23%)         |

Both versions gave identical answers here too: both pages whole, and every person alone.

## Backfill, dry run on production (read-only, 19 October)

| What 00464 writes                                   | Rows |
| --------------------------------------------------- | ---- |
| `messages.sent_at` from its `message.sent` event    | 21 (16 delivered, 5 later failed) |
| `messages.sent_at` from its own `created_at`        | 250 (171 delivered, 72 read, 7 sent) |
| `contacts.acquired_via` from their `contact.added`  | 4 (2 calendar, 2 manual) |

## Applying it

- The PR, then Ruben's word for 00464. Production writes go through the CLI from a linked worktree: a dry run must list
  00464 alone, then `db push --linked --yes`, then read it back (head, no odd version, the column, the trigger, both
  functions, `count(*)` of sent-status rows with no `sent_at` = 0).
- Either order works against the deploys: no app reads or writes the column.
- The number is taken at push (`docs/migration-claims.md` in the projects folder: "Waiting for a number"). 00464 was
  next free on 19 October; renumber it if another lane takes it first.
- Locks: row locks on the four people first, then ACCESS EXCLUSIVE on `messages` for the column. `lock_timeout` is
  500 ms, so this file gives up before a customer's insert would. If it times out, nothing was applied; re-run it when
  the line is quiet.

## Tests

- Changed: `reads-go-through-their-own-rows` (both readers read no partition of `events`; People looks each person's
  messages up exactly once; two words at one moment show the one written last), `people-came-from` (the
  first door written wins; a door said on the row; their own words first stay theirs), `first-replies-person-wait` and
  `metrics.integration` (a held reply's moment is its row's `sent_at`).
- Extended: `a-message-moves-from-queued-to-read-through-its-guard` checks `sent_at` through the real writers: queued is
  null; the door's finalize stamps it before its `message.sent` event; an answer sent at once gets its `created_at`;
  it is kept through receipts and a late failure; refusals and lost answers stay null; history and fixtures keep their
  moment.
- Run on the replayed stack: those 6 files plus the 39 other db suites that read these functions or write `messages`
  (311 tests, all passing), privileges, the migration and ledger tests, the generated-file checks, typecheck, lint on
  the touched files, the code-health ratchets and the debt register. With the one pass added, a second replay from zero
  ran the 21 suites that read `people_list` or that this lane touched (180 tests, all passing), plus the generated-file
  and docs checks.

## Not done

- **A message's moment stored on its row.** After the one pass, People still calls `message_moment` once per message.
  On production's busiest workspace that is ~2.4 ms of the page. At 20,000 messages it is most of what is left. Stored
  generated columns (`at`, `spoken`, `moved_in`) would remove the calls. But a stored value goes stale if the moment
  rule changes and no migration rewrites the column, and the kept moments (`person_moments`) still call the function
  live. Worth it once a workspace's People page shows it in field data; not before.
- **`plpgsql` or a cached plan for the SQL readers.** The brief left this for after the columns. On this data a cold
  plan is now 5-12 ms of each read, against 21-46 ms before.
- **Making `sent_at` immutable in `messages_guard`.** Only the trigger writes it, and only when it is null. Adding it
  to the guard means re-creating a hot function for no reader's benefit.
