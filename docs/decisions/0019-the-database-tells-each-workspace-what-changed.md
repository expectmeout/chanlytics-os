# 0019 · The database tells each workspace what changed

**Status:** Accepted by Ruben, 28 Sep 2026, with the answers its open questions give. Built: steps 1 and 2 (00265,
#1333) and step 3 (00266, applied a day after step 2 deployed), where they differ from this note as Built says; step
4, a replay on a rejoin, only if wanted.
Written against commit `0c8225d5` (main, 28 September 2026, after
#1242 merged), and every file and line below was read at it. What Realtime does is quoted from Supabase's own guides
(Postgres Changes, Broadcast, Subscribing to Database Changes, Realtime Authorization, Realtime Concepts, Benchmarks),
read the same day, and the SQL in Shape was run on PGlite (Postgres 18) with stand-ins for the `realtime` and `auth`
functions. It is the design the plan `docs/plans/2026-09-27-frontend-performance-scale.md` asks for under 36 ·
Scalability, and it decides against the plan's wording ("A channel per surface instead of one subscription carrying 24
tables to every tab", `:81`); Context says why. #1205 and #1206 each hold 0018, so this takes 0019.

## Context

### One subscription per tab, twenty-two tables on it

The dashboard is Realtime's only subscriber (the phone app has none), and it subscribes in one place.

- Once a tab's boot is in, the runner joins the live feed for the workspace the tab shows
  (`apps/dashboard/src/legacy-bridge/surface-runner.ts:367-376`), through `joinLiveFeed` (`LegacyApp.tsx:188`).
- `subscribeMessagesInserts` (`packages/db/src/realtime.ts:58`) opens one channel (`:76`) and binds Postgres Changes
  for each of the 22 tables in `WATCHED` (`:24-51`), each filtered to `tenant_id=eq.<workspace>` (`:84`).
- The runner hands each change to the surfaces that asked for its table (`wantsRefresh`, `surface-realtime.ts:37`),
  and each reads again after a debounce: 400 ms unless it names its own (`surface-runner.ts:56`). Thirteen surfaces
  listen. Two judge a change by its row, and only by a call's `status`: Today (`surface-data.ts:469`) and Setup
  (`setup.ts:153-155`).
- A rejoin reads every one of them again, because "postgres_changes has no backfill" (`surface-runner.ts:290-292`).
- The database publishes 25 tables, from 00002 (`:247`) to 00222 (`:102`): the 22, `decisions` and `mailboxes`,
  which nothing watches, and `reach_out_replies`, which Reach out Part 5's PR 7 will watch (00222 `:95`).

### What a change costs today

Supabase's guide to Postgres Changes says what that subscription costs ("Database instance and realtime
performance"):

> For the `Postgres Changes` feature, every change event must be checked to see if the subscribed user has access. For
> instance, if you have 100 users subscribed to a table where you make a single insert, it will then trigger 100
> "reads": one for each user. … Database changes are processed on a single thread to maintain the change order. That
> means compute upgrades don't have a large effect on the performance of Postgres change subscriptions.

It names the way out: "use Realtime server-side only and then re-stream the changes to your clients using a Realtime
Broadcast". The guide to database changes calls Broadcast "the recommended method for scalability and security", and
Postgres Changes a method that "does not scale as well". Here that means:

- **Each change is weighed against the whole platform's tabs.** Every open tab of every workspace holds a subscription
  to each watched table; Realtime keeps them in `realtime.subscription`, one row for each. A change is weighed against
  the subscriptions to its table, the filter picks out its workspace's tabs, and each of those costs a read of the
  table's policy as that member: in our database, on the one thread. So the work for one change grows with the tabs
  open across the platform, and the number of changes grows with the workspaces. A larger database helps little.
  Nothing here measures it; Realtime's reports (Postgres Changes Events, Connected Clients) show the load.
- **A message is two changes, and a call is one a turn.** A message sent stamps its thread
  (`packages/db/src/repositories/ingest.ts:217`): an insert on `messages` and an update on `conversations`. A live
  call rewrites its `calls` row on each transcript turn (`apps/edge/api/retell-webhook.ts:227`). Only Live repaints
  for a turn (`surface-data.ts:1891`), but each is weighed like any change.
- **A delete cannot be placed.** "You can't filter Delete events when tracking Postgres Changes" (Limitations), and
  with RLS on, a delete's old record holds only its primary key (Receiving `old` records). The filter is on
  `tenant_id`, which a delete does not carry, so no tab can be matched to it as its workspace's: whether Realtime then
  sends it to no tab or to every tab, it cannot send it to that workspace's tabs alone. One that does arrive reaches
  the runner as an empty row: realtime-js fills `new` only for an insert or an update
  (`RealtimeChannel._getPayloadRecords`, 2.116.0), and `realtime.ts:90` reads `new` first. Nine of the tables the
  surfaces hear in full lose rows to the product: a list and its people (`packages/db/src/repositories/lists.ts:229`,
  `:283`), a note (`person_note_remove`, `person_note_decide`, 00157 `:218`, `:263`), a sending domain
  (`sending-domains.ts:306`), a line released (`apps/edge/lib/lines/line-release.ts:103`), the Google profile and
  listing (`apps/edge/lib/google/google.ts:622`, `:904`; `apps/edge/api/admin/google.ts:288`), and a thread's calls
  and the thread itself when a person is erased (00151 `:185`, `:200`). `WATCHED`'s own comments promise the
  removals (`realtime.ts:31`, `:48`).

### Why not a channel per surface

The plan's remedy splits the one subscription by surface. It answers the wrong half:

- **A tab does not receive every table.** The filter and each table's policy hold it to its workspace's rows, and the
  runner already sends each change only to the surfaces that asked for its table (`surface-realtime.ts:4-10` says
  when and why).
- **What costs is the weighing, and it grows with subscriptions.** Thirteen channels would carry the same bindings, and
  a table several surfaces want would be bound once for each: `messages` seven times. Every change would be weighed
  against more subscriptions, and a tab would join thirteen times instead of once.
- **Deletes would stay unplaced.**

## Decision

1. **The database says what changed, to the workspace it changed in.** A statement trigger on each watched table
   sends one notice per workspace per statement, through `realtime.send`, to the private topic
   `workspace:<tenant_id>:changes`. The notice names the table and the operation. Where a surface judges a change by a
   column, it carries that column's values: `calls.status`, the one today. It never carries a row. A trigger sees the
   whole old row, whatever the table's replica identity, so a delete is told to its workspace like any change.
2. **A member may listen to their workspaces' topics, and nobody may speak on them.** One select policy on
   `realtime.messages`, for `authenticated`, admits the topic of each workspace the caller is a member of, read from
   `memberships` as every table's read policy is. That read hides a partner's seat on a session without a second
   factor (00218 `:47-51`), so such a session cannot listen. There is no insert policy, so no client may send on a
   workspace's topic.
3. **A tab listens on its workspace's topic.** `packages/db/src/realtime.ts` joins `workspace:<id>:changes` with
   `private: true` and hands each notice to the runner as it hands a change today: the table, the event, and a row
   that carries `status` where the notice does. No surface changes.
4. **Postgres Changes goes.** Once the tabs listen on the topic, the tables leave `supabase_realtime`, and Realtime
   stops weighing changes for us: it starts its Postgres Changes pools only for a project that uses them (Concepts,
   "Database connections").
5. **The watch list has one home on each side, held equal.** `WATCHED` stays the dashboard's list and the migration's
   loop the database's, and a database test holds each to the other, as the publication test does today. A table
   joins the live feed with its trigger, in one change.

## Shape

What a change costs, before and after:

|                 | Postgres Changes, today                                                                             | Broadcast from the database                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| For each change | weighed against its table's subscriptions, and a policy read for each tab it reaches, on one thread | one row in `realtime.messages` per statement per workspace, in the writer's transaction |
| Who may hear it | the table's policy, asked change by change                                                          | one policy, asked once per join and kept for the connection                             |
| A delete        | cannot be placed                                                                                    | told to its workspace                                                                   |
| After a drop    | every surface reads again                                                                           | the same, or a replay (step 4)                                                          |

Supabase benchmarks this path at 10,000 inserts a second to 80,000 connected users, 100 to a channel, with a median
latency of 46 ms and 132 ms at the 95th percentile (Benchmarks, "Broadcast: Using the database").

The trigger function, one for every watched table:

```sql
create or replace function public.tell_the_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_strip_nulls(jsonb_build_object('table', tg_table_name, 'op', tg_op, 'statuses', w.statuses)),
    tg_op,
    'workspace:' || w.tenant_id::text || ':changes',
    true)
    from (select c.tenant_id,
                 case when tg_nargs > 0 then jsonb_agg(distinct to_jsonb(c) ->> tg_argv[0]) end as statuses
            from changed c
           group by c.tenant_id) w;
  return null;
end $$;
```

Its triggers are made by a loop over the watched tables, each dropped first so the file re-runs: three for a table a
surface hears in full, and one, on insert, for `messages`, `notifications` and `google_reviews`, as `WATCHED` listens
to them. A transition table names one event, and Postgres refuses one on a trigger of two ("transition tables cannot be
specified for triggers with more than one event"), so each event has its own trigger. Every table carries
`tenant_id`, as the filter on each of today's bindings already requires. For `calls`:

```sql
create trigger calls_tell_update after update on public.calls
  referencing new table as changed
  for each statement execute function public.tell_the_workspace('status');
-- and calls_tell_insert (new table), calls_tell_delete (old table)
```

The policy reads `memberships` through its unique `(user_id, tenant_id)` (00001 `:31`):

```sql
create policy workspace_changes_member_read on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) in (
      select 'workspace:' || m.tenant_id::text || ':changes'
        from public.memberships m
       where m.user_id = (select auth.uid()))
  );
```

The client, in place of the 22 bindings:

```ts
client
  .channel(`workspace:${tenantId}:changes`, { config: { private: true } })
  .on("broadcast", { event: "*" }, ({ event, payload }) => {
    for (const status of payload.statuses ?? [undefined])
      onChange({ tenant_id: tenantId, ...(status === undefined ? {} : { status }) }, payload.table, event);
  })
  .subscribe(onStatus);
```

The topic is the authorization, so it cannot carry the runner's suffix as today's does (`surface-runner.ts:203`), and
realtime-js hands back the channel it already has for a topic (`RealtimeClient.channel`, 2.116.0). So `realtime.ts`
keeps one channel per topic and counts who listens on it, and the last to leave removes it: two runners in one tab
share a channel, and the first to leave does not close the other's. The session token is still pushed before the join
(`realtime.ts:70-74`), and a tab with no workspace joins nothing.

Run on PGlite, the function and the policy did what Decision says: 500 calls inserted across two workspaces made one
notice on each workspace's topic; an update that ended one call and left 249 ongoing made one notice carrying both
statuses; a delete of 250 went to the deleted rows' workspace; a member read their own workspace's topic and not
another's; a partner read it only with a second factor; nobody could insert.

## Steps

**1 · The notices (a migration).** The function, the triggers and the policy. Nothing listens yet, so each notice is
a row Realtime drops with its day's partition. _Both orders:_ SQL alone; the dashboard still hears Postgres Changes.

**2 · The tab listens (the dashboard).** `realtime.ts` joins the topic and binds nothing else; `WATCHED` stays the list
the tests hold. Step 1 must be applied in production before this merges, and its pull request says so. Were it not,
the join would be refused, the shell would say live updates are down (`feedWatch`, `surface-realtime.ts:66`), and
each surface would still read again when its member comes back to the tab (`surface-runner.ts:47-52`). Rolled back by
reverting the dashboard: until step 3, the publication still carries every table. _Both orders:_ the edge is
untouched.

**3 · Postgres Changes goes (a migration, a day after step 2).** Every table leaves `supabase_realtime`, guarded so the
file re-runs. A tab opened before step 2 and still open hears nothing more, and reads again when its member comes back
to it. Then "Allow public access" is turned off in Realtime's settings, since nothing joins a public channel any more.
_Both orders:_ SQL alone.

**4 · Only if wanted: a replay on a rejoin.** A private channel can replay what the database broadcast while a tab was
away, up to 25 notices since a moment (Broadcast, "Broadcast replay"; supabase-js 2.74 or later, and the repository
has `^2.116.0`). A rejoin would read again only the surfaces the replayed notices name, and every surface only when 25
come back. A note of its own if taken.

A table that joins the live feed while this is under way follows the step it lands after: before step 1, it joins the
publication as today and step 1's loop names it; from step 1 on, it gets its trigger in the same change. Reach out
Part 5's PR 7, which watches `reach_out_replies`, is the one planned.

## Tests

- **The notices** (`realtime/workspace-changes.db.test.mjs`, against the replayed stack, in a transaction that never
  commits):
  - an insert, an update and a delete on each watched table, for the events it is watched for, each put one notice on
    the topic of the row's workspace, with the table and the operation and nothing of the row;
  - one statement over 500 rows of two workspaces puts one notice on each;
  - a call's notice carries its status, and a statement that ends one call and leaves another ongoing carries both;
  - a delete is told to the deleted row's workspace;
  - the tables and events with a trigger are `WATCHED`'s, read from `pg_trigger`, not from a list in the test.
- **The policy**, probed as Realtime probes a join (a notice written, read back as the caller, rolled back): a member
  reads their workspace's topic and not another's; a viewer reads it; a partner reads it only on a session that
  showed a second factor; nobody may insert.
- **The client** (`shell/surfaces/realtime-scope.test.mjs`, rewritten over its fake client): the tab joins
  `workspace:<id>:changes` privately after pushing its token; a notice reaches the runner as its table, event and row,
  and a call's two statuses as two changes; two runners on one client share a channel, and the first to leave does not
  close the second's; a tab with no workspace joins nothing.
- **The publication** (`database/realtime-publication.db.test.mjs`, from step 3): no watched table is published.
- **In production,** Realtime's reports say what each path costs: Postgres Changes Events and Connected Clients before
  step 2; Broadcast from Database Replication Lag and (Read) Private Channel Subscription RLS Execution Time after it.

## Risks

- **Every notice is a write.** One row in `realtime.messages` per workspace per statement on a watched table, in the
  writer's transaction. Realtime partitions the table by day and drops what is three days old (Concepts). A live call
  writes one a turn, as it makes a change a turn today.
- **A notice never fails its write.** `realtime.send` "captures errors to prevent the trigger from breaking"
  (Concepts), and a write that rolls back tells nothing: its notice rolls back with it.
- **The policy is asked once per join.** Realtime keeps its answer for the connection (Realtime Authorization,
  "Updating RLS policies"), where Postgres Changes asked on each change. A member taken off a workspace keeps hearing
  which of its tables change, never the rows, which their reads no longer return, until their token is refreshed or
  the tab reloads.
- **The bell hears everyone's notes.** `notifications` is the one watched table read more narrowly than by membership:
  a note addressed to one member is theirs alone (00158 `:26-32`). On one topic per workspace every tab hears that the
  bell changed, reads its own again and finds only its own. A topic per member is the answer if those reads ever
  show.
- **Public access.** A private notice reaches only private channels ("A public broadcast only reaches public channels
  and a private broadcast only reaches private channels"), so leaving public access on until step 3 exposes nothing.
  Turning it off before step 3 would stop today's path, which joins a public channel.
- **The replayed stack.** Step 1 is the first migration to name the `realtime` schema. Production has
  `realtime.messages`, which Realtime's own migrations make in every project it serves, and it serves this one today.
  Whether `supabase start` has made it before our migrations run is what step 1's first run of the database workflow
  shows. If it has not, the policy is created only where the table exists, and the workflow runs that statement once
  more after the stack is up.

## Open questions

1. **One notice per statement, or per row?** Nothing reads more than a change's table, its event and a call's status,
   so this note says per statement: 2,000 people put on a list at once are one notice, not 2,000. A surface that
   wants the row reads it.
2. **Addressed notes on the workspace's topic?** This note says yes (Risks). A topic per member would add a second
   channel to every tab.
3. **Public access off after step 3?** Nothing will need a public channel; this note says off.

## Built (29 September 2026): steps 1 and 2

Built in one pull request against `1388f2cc`: the migration `supabase/migrations/00265_the_database_tells_each_workspace_what_changed.sql`
and the tab's side in `packages/db/src/realtime.ts`. Where it differs from Shape:

- **The names follow `docs/naming.md`.** The function is `workspace_tell_changes()`, not `tell_the_workspace()`, and
  its triggers are `workspace_tell_insert`, `workspace_tell_update` and `workspace_tell_delete` on each table, as 00259
  names one trigger per event.
- **Once per transaction, not once per statement.** The lead finder writes a row a statement in a loop:
  `lead_collect_commit`, `lead_check_commit`, `lead_round_rejudge` and `lead_search_import` (up to 500 rows) among
  others. Every notice of a transaction becomes visible at its commit, together, so a second notice of a workspace's
  table and event tells a tab nothing the first did not, and each costs a subtransaction (`realtime.send` catches its
  own error) and a row. The function remembers what its transaction told in `chanlytics.workspace_told`, as
  `chanlytics.link_lead` is kept (00184), and tells each workspace's table and event once; a call's notice again when
  its statuses differ. A savepoint rolled back takes its notices and that memory back with it.
- **The policy admits a notice only on the topic asked for** (`topic = realtime.topic()`). Realtime's probe at a join
  passes either way; without it, a caller able to read `realtime.messages` directly could read another workspace's
  notices by naming a topic of their own.
- **The replayed stack has the `realtime` schema before our migrations run.** `supabase start` runs Realtime's own
  migrations while it initialises the schema: on a local replay with CLI 2.116.0 and Realtime v2.129.3,
  `realtime.messages`, `realtime.send` and `realtime.topic` are older than 00001's tables, with partitions from the day
  before to three days ahead. So the policy is created as written, with no guard, and the workflow runs nothing more.
- **The client.** `subscribeWorkspaceChanges` replaces `subscribeMessagesInserts`, whose name said messages for 23
  tables. `WATCHED` names each table's events (`watchedEvents()`), and the runner no longer names a topic. As Shape
  says, one channel per topic is kept on each client and counted; a join also waits for the topic's last channel to
  finish leaving, since realtime-js hands that channel back and it never joins again.
- **The tests** are `tooling/scripts/tests/database/each-workspace-is-told-what-changed.db.test.mjs` (the tables and
  events read from `pg_trigger` against `WATCHED`; every trigger fired by a statement that changes no row; real rows on
  threads, messages, calls, lists and notes; the policy probed as Tests says) and
  `tooling/scripts/tests/shell/surfaces/realtime-scope.test.mjs`, over a fake client that behaves as realtime-js does.
- **Measured** on the local replay (Postgres 17): a transaction that inserts one message takes about 1.35 ms with its
  notice and 1.13 ms without (pgbench, three runs of 3,000); a hundred statements in one transaction tell once; a live
  call's turn costs about 0.4 ms more. Against the local Realtime, a member's tab joined its workspace's topic, a
  stranger's join was refused, and every change reached the member's tab as its table, its event and a call's
  statuses, within half a second.

### Step 3 (29 September 2026)

`supabase/migrations/00266_the_tables_leave_postgres_changes.sql` takes every public table out of
`supabase_realtime`: the 23 the live feed hears and `decisions` and `mailboxes`, which nothing heard. It walks the
publication rather than a list, so it re-runs, and it leaves Realtime's own publication of `realtime.messages`, which
carries the notices, alone. `tooling/scripts/tests/database/realtime-publication.db.test.mjs` now holds that nothing
is published: a table the live feed hears gets its trigger, never a place in the publication. On the local replay,
with 00266 applied, a member's tab still heard every change within half a second and a stranger's join was still
refused. It is applied a day after step 2 deploys, and then "Allow public access" is turned off.
