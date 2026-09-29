# 0021 · People are paged by a moment the database keeps

**Status:** Accepted by Ruben, 28 Sep 2026; decided, not built. The open questions stay open for the steps they touch.
Written against commit `887e79cc` (main, 28 September 2026, after
#1210 merged), and every file and line below was read at it. The numbers are from a model on Postgres 16 (Context says
what it holds) with #1226's `people_list` (00250) and #1247's indexes (00253) applied, since both are open and both
change what People costs; production runs 17, which plans a SQL function and walks an index as 16 does. It is the
design the plan `docs/plans/2026-09-27-frontend-performance-scale.md` asks for under 36 · Scalability ("Rollups.
Per-workspace daily rollups behind `metrics_summary` and `people_list`, with keyset paging", `:89`). It keeps the keyset
paging and decides against daily rollups; Context says why. 0018 (#1205), 0019 (#1244) and 0020 (#1206) are taken, so
this is 0021. Step 1 is built, as a draft that waits for this note (#1306).

## Context

### Every page of People is every person

- `people_list` (00170 `:204-462`) orders its rows by the later of each person's last spoken word (`lm`, `:367-373`)
  and last connected call (`lk`, `:397-407`), then by when they were added, then by id (`:459`). Those two moments are
  two of its eleven lateral reads (`:340-442`). It pages by offset (`:460-461`), a thousand rows a call at most. The
  order is the laterals', so to answer any page the function computes every live person's row, sorts them all and
  returns a thousand.
- Whatever needs everyone reads every page:
  - the browser's `everyPerson` (`apps/dashboard/src/legacy-bridge/surface-data.ts:1101-1115`), up to 50 pages, for
    People (`:1156`) and for Broadcasts' audiences (`:1297`);
  - `everyoneIn` (`packages/db/src/repositories/people.ts:74`), the one pager of the server's readers, the exports
    and the edge's playbook sweep (`apps/edge/lib/playbooks.ts:66`).

  So reading everyone costs its pages times the workspace: for 20,000 people, twenty calls of 20,000 rows each.

- People reads everyone again on each change it listens for: an insert, update or delete on `messages`,
  `conversations` or `escalations`, or on `deals`, `person_notes`, `segments` or `segment_members`
  (`surface-data.ts:1133-1138`, `surface-realtime.ts:14`, `:37-43`), 400 ms after the last one (`surface-runner.ts:56`,
  `:278`). The runner refreshes every surface that asked for the table, on screen or not (`surface-runner.ts:367-373`).
  So every open tab of the workspace reads all of People again for each message, each receipt on it and each stamp on
  its thread.
- Offset over an order that moves: someone who writes while the pages are read moves to the top, and every later row
  shifts one along. `everyPerson` appends each page as it comes (`:1109-1111`), so the boundary shows one person twice
  and misses another until the next read. Show more drops a repeat (`:1043-1044`); the full read does not.

### What #1226 and #1247 leave

The model: one workspace beside twenty of 1,000 people each. Every person has a WhatsApp identity (a fifth an SMS one
too) and a thread of eight messages; a fifth have a call, two in five two escalations, a fifth a deal, a tenth an open
step, and three in ten a door's `contact.added` event. The tables carry production's indexes and #1247's four, and
`people_list` is #1226's. `events` is one table here. In monthly partitions, as production keeps it, the first page of
10,050 people as #1226 leaves it took 0.75 s, and every page read page first 1.0 s. "Page first" is the shape this note
decides, run on the same rows.

| The workspace | As #1226 and #1247 leave it: the first page | every page       | Page first: the first page | every page |
| ------------- | ------------------------------------------- | ---------------- | -------------------------- | ---------- |
| 2,050 people  | 157 ms                                      | 366 ms (3 calls) | 78 ms                      | 141 ms     |
| 10,050        | 641 ms                                      | 8.9 s (11)       | 74 ms                      | 0.78 s     |
| 20,050        | 1.1 s                                       | 33.6 s (21)      | 82 ms                      | 1.6 s      |

Both shapes returned the same people with the same columns at every size, and the kept moment equalled the one the row
shows for every person. After #1226 and #1247, each of a person's reads is an index look-up, so one call costs in
proportion to the workspace. What remains is that every page is every person, and that People reads every page on each
change.

### `metrics_summary` reads all of history for two answers

- **New people.** `fresh_contacts` (00037 `:213-230`) visits every live person the workspace has ever had, three
  look-ups each, on each read of Today. Its first moment is not People's:
  - Today takes the earliest of their messages' provider times and their connected calls' starts.
  - People's New this week (`packages/contracts/src/people/lists.ts:109-115`, through `firstContactOf`,
    `packages/contracts/src/people/people.ts:639-647`) takes `people_list`'s first contact: the first spoken word or
    connected call, else the first row written, and never a person with a history moved in.
  - Today's figure opens that list (`packages/contracts/src/today/today-figures.ts:297`, `:302`), so the two can
    disagree about who is new. A person with neither moment was new in every window; #1249 (00254) stops
    that, and keeps Today's rule otherwise.
- **The last word.** `last_inbound_at` (`:266`) is the latest provider time among every customer message the workspace
  has kept. No index holds it, so the read goes through them all. `last_outbound_at` (`:268`) is the latest
  `created_at`, which the planner answers by walking `messages_tenant_created` back from the newest.
- The rest reads the window through `messages_tenant_created` and grows with the window's work, which is the work.

### Why not daily rollups

- A row per workspace per day, its counts kept on write, would answer Reports' days and Today's figures. Reports
  already reads each source once over its period and groups it by the day (00251, #1226), and Today reads its day by
  index: both grow with the work in their window, not with the workspace's history.
- Each count would have two implementations: the trigger that keeps the closed days, and the read that still counts
  the day that is open. One predicate per rule forbids that.
- What grows with history is per person: each person's first and last moments, which People orders by and Today
  counts new people by. Those are what this note keeps.

## Decision

1. **The database keeps each person's moments.** `person_moments` holds one row per person. The statements that move a
   moment write it in their own transaction:
   - when they were last in touch, which is the list's order;
   - when they first got in touch, and whether a history was moved in, which say who is new.

   One function says what a message's moment is and whether it was spoken. The triggers and `people_list` both read
   through it.

2. **A page is chosen before it is computed.** `people_list` takes the page's people from `person_moments` by an index
   in the list's order, after a cursor, and computes the eleven reads for those people alone. Every caller that reads
   everyone follows the cursor. Offset stays answered, so a tab from before the change still pages.
3. **Today counts new people by the kept first contact,** the rule People's list uses, read from one column. It reads
   the last word through an index.
4. **A refresh reads the people a change names.** People keeps its list and reads again only the people a change
   touched, placing them by the kept order. It reads every page on load, on a return to the tab, and for a change that
   names no one.

## Shape

### The kept moments

```sql
create table public.person_moments (
  contact_id    uuid primary key references public.contacts (id) on delete cascade,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  added_at      timestamptz not null,   -- the person's created_at, the order's second key; it never changes
  last_word_at  timestamptz,            -- their last spoken message (people_list's lm.at)
  last_call_at  timestamptz,            -- their last connected call's start (lk.last_at)
  first_word_at timestamptz,            -- their first spoken message (ma.first_at)
  first_call_at timestamptz,            -- their first connected call's start (lk.first_at)
  first_row_at  timestamptz,            -- their first message or connected call written (earliest_row_at)
  moved_in      boolean not null default false,  -- a history moved in (has_backfill)
  in_touch_at   timestamptz generated always as
                  (coalesce(greatest(last_word_at, last_call_at), '-infinity')) stored,
  new_at        timestamptz generated always as
                  (case when not moved_in then coalesce(least(first_word_at, first_call_at), first_row_at) end) stored
);
create index person_moments_order on public.person_moments (tenant_id, in_touch_at desc, added_at desc, contact_id desc);
create index person_moments_new on public.person_moments (tenant_id, new_at) where new_at is not null;
```

- **Who reads it:** RLS as the other tenant tables give it: a member reads the workspace's rows. Nobody writes it but
  the triggers, which run as its owner.
- **`-infinity`** puts the people nobody has heard from last, as `nulls last` does today, and lets the order compare as
  one row.
- **The triggers.** An insert on `contacts` makes the person's row, with no moments. On `messages` and on `calls`, one
  statement trigger for each of insert, update and delete (a transition table takes one event per trigger) reads the
  rows the statement changed:
  - a new spoken message or a new connected call moves the moments by `greatest` and `least`, so two statements for
    one person, in either order, leave the same row;
  - a message that stops being spoken (a sent reply that fails), a message that moves to another person (a merge), a
    deleted row (an erasure), or a call that changes its person, its start or whether it connected has the people
    it touched recomputed from their rows;
  - a receipt (delivered, read) or a call's summary changes nothing the moments read, and is passed over.
- **One statement of a message's moment.** `public.message_moment(meta, channel_ts, created_at, type, status)` says
  when a message happened, whether it was spoken, and whether it came with a history moved in, as `people_list`'s
  `ev` says it today (00170 `:271-286`). `ev` reads through it, and so do the triggers.
  - It takes the message's columns, not its row: a function of a table's row is a column PostgREST serves, and the
    generated types would give every `messages` row a required field.
  - One call answers all three: each call of a function with a pinned `search_path` costs as much as the rest of a
    trigger's write.
- **The fill.** Creating a trigger on `messages` holds a lock that stops every write to it until the migration commits,
  so the migration only creates the table, the functions and the triggers, under the three-second `lock_timeout` guard
  of 00140 and 00142. The fill runs after it, in batches of a few hundred people, each its own transaction, from a
  production script (dry-run by default). A batch merges with anything a trigger wrote meanwhile by `greatest` and
  `least`, so a message that arrives during the fill is never lost. `people_list` does not read the table until
  `person_moments_check` finds every workspace whole.
- **What it costs a write:** measured with step 1's triggers on Postgres 16, a one-row message insert takes 0.166 ms
  where it took 0.098, and a receipt 0.156 ms where it took 0.087: about 0.07 ms each. Each write was its own
  transaction, commits not waiting on the disk, the median of five runs of 2,000. The first model, a cheaper trigger
  than one that keeps every rule, added 0.024 ms.

### A page first

```sql
people_list(p_tenant_id, p_contact_id, p_query, p_limit, p_offset,
            p_after_at timestamptz default null, p_after_added timestamptz default null, p_after_id uuid default null)
-- the columns it returns now, and in_touch_at and added_at: the row's place in the order
with page as (
  select c.*, pm.in_touch_at, pm.added_at
    from person_moments pm join contacts c on c.id = pm.contact_id
   where pm.tenant_id = p_tenant_id and … the person alive, the search, the one person …
     and (p_after_id is null or (pm.in_touch_at, pm.added_at, pm.contact_id) < (p_after_at, p_after_added, p_after_id))
   order by pm.in_touch_at desc, pm.added_at desc, pm.contact_id desc
   limit least(greatest(coalesce(p_limit, 1000), 1), 1000) offset greatest(coalesce(p_offset, 0), 0)
)
select … the eleven reads, for the page's people …
  order by in_touch_at desc, added_at desc, id desc
```

- **The page's people come from the index,** and the eleven reads run for them alone. Modelled above: about 80 ms for
  a page at any size, and every page together grows with the people.
- **The last tiebreak turns around:** the id falling, where it rises today, so a row comparison can walk the index.
  People alike in their last contact and the moment they were added come back in the other order, and the order is
  still whole.
- **Offset stays answered:** the index skips the rows before it, so a tab from before the change pages as it did.
- **The route:** `GET contacts?after=<cursor>` answers `page.next`, the last row's place, beside `has_more`.
  `everyoneIn`, `everyPerson`, Show more (`peopleMore`, `surface-data.ts:1040-1048`) and the edge's `allPeople` follow
  it.

### Today

- **New people:** `new_contacts` counts `person_moments` joined to the live people, where `new_at` falls in the window,
  through `person_moments_new`.
- **One rule for new:** `people_list` returns `new_at`, and People's list reads it (`firstContactOf`'s `evidence` and
  the day it counts from). The figure and the list it opens are then one rule. That moves a few people:
  - one whose first spoken message had no provider time;
  - one whose earliest provider time is on a message never spoken, such as a failed send.

  The pull request says whose count moves and by how much, on the model and on a copy of production's counts.

- **The last word:** a partial index on `(tenant_id, coalesce(channel_ts, created_at) desc)`, for the customer's
  messages outside a moved-in history, answers `last_inbound_at` with one look.

### A refresh by person

- **The change names its people.** Postgres Changes carries the row today, and the row's `contact_id` names its person.
  An escalation names its thread, and a person has one thread in a workspace (`unique (tenant_id, contact_id)`, 00002
  `:77`).
- **With 0019,** if it is accepted, its payload names the people a statement touched: at most 100 ids, never a row, for
  the tables that carry one. More than that, or none, and People reads every page.
- **The read:** People asks `GET contacts?ids=…` (`people_list` with `p_contact_ids`, at most 100) and lays the rows
  over its list in the kept order. A person the read no longer returns (erased, merged) leaves it.
- **Every page** on load, on a return to the tab (`surface-runner.ts:164-179`), and for a change that names no one.

## Steps

Each is its own pull request, in this order, and each ships alone.

1. **The kept moments** (a migration and a production script): the table, the message function and the triggers,
   then the fill in batches. Nothing reads the table yet, and `people_list` is not touched, so this does not wait on
   #1226's copy of it. Either deploy order: nothing deploys. Built, as a draft: #1306.
2. **A page first** (a migration): `people_list`, copied from its latest migration (#1226's 00250 once it lands), takes
   the page from the index, answers the cursor and reads its messages through the function. Offset is still
   answered. Nothing deploys.
3. **The callers follow the cursor** (`packages/db`, the dashboard, the edge). It needs step 2 applied before it
   merges. Then either app may deploy first: each asks a database that answers the cursor.
4. **Today counts new people by the kept first contact** (a migration, and contracts): `metrics_summary`, copied from
   its latest migration (#1249's 00254 once it lands), and People's list read `new_at`, and `last_inbound_at` has
   its index. It changes a number Today shows, and says whose.
5. **A refresh by person** (the dashboard). It needs step 3. Under 0019, it needs 0019's payload to name the people.

## Tests

- **The kept moments equal the rows.** A database test makes every kind of write, and after each one holds
  `person_moments` equal to the moments recomputed from the rows, for every person. The writes: a word, a queued reply
  sent, a sent reply failed, a history moved in, a call that connected and one that did not, two people merged, one
  erased.
- **A page reads its own people.** As #1247's test does: the first page of a workspace of 1,000, then of the same
  workspace grown to 3,000, reads the same blocks of `messages` and the other tables.
- **The cursor reads everyone once.** Every page by cursor returns each live person once, in the order, including when
  someone writes between two pages: they are read on the next pass, and never twice in one.
- **One rule for new.** Today's `new_contacts` over a window equals the number of `people_list` rows whose `new_at`
  falls in it, and contracts' New this week reads `new_at`.
- **Old callers.** An offset read answers as before, and a cursor read and an offset read return the same people.

## Risks

- **Write cost.** Every spoken message and every change to a call writes one narrow row per person it touches, in the
  same transaction: about 0.07 ms a message or a receipt, measured (Shape). A broadcast of 5,000 moves 5,000 rows
  when its sends go out; the receipts after that move none.
- **Two writes for one person.** Two transactions writing one person's messages take the person's row in turn, each
  until its commit, which is the length of one message's write.
- **Drift.** A path that changes messages or calls without firing their triggers (`truncate`, or a restore under
  `session_replication_role = replica`) leaves moments stale. `person_moments_check` recomputes a workspace's moments,
  a batch of people at a time, and says who has no row and whose differs. The tests run it, and a restore runs it
  after.
- **The fill on production** reads every person's messages once, through `messages_contact_created`, in batches: minutes
  in all. A message for someone in the batch being filled waits for that batch, a fraction of a second.
- **The order's ties turn around** (the id falling). No page repeats or skips anyone.

## Open questions

1. **Is a booking a first contact?** Today's words promised "a message, a call, or a booking", and neither Today nor
   People ever counted one; #1249 (00254) says so. If it is, it is a moment of the calendar's door, kept
   here like the others.
2. **Should our own messages move a person up People?** Today they do: a broadcast puts every recipient at the top.
   The kept moment keeps the order as it is, and could as easily keep only their own last word.
3. **0019's payload.** Step 5 asks it to name the people a change touched. They are ids, not rows.
