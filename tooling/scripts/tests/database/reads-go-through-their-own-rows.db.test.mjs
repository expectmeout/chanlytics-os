/**
 * People and replies are read through their own rows (00250), on a real database.
 *
 * people_list and first_replies each kept a CTE that a later read looked in once per row: a person's three reads in
 * the workspace's messages, a question's two in every reply ever sent. Materialised, as Postgres makes a CTE read more
 * than once, each look scanned the whole of it, so People cost its people times its messages and Today and Reports
 * the period's questions times all the replies. Not materialised, each look goes to an index for its own row. What
 * this proves is the plan's shape, not a stopwatch: inside one transaction, with sequential scans off so the planner
 * shows what it could use, the read looks messages up at least once a row, through whichever index the planner picks
 * (as written it read them once, to fill the CTE), and still answers what it answered.
 *
 * The door that added each person is the same: read once for the workspace and joined in a loop that went through
 * every such event for each person, it is now looked up for each person, so events are read at least once a person
 * (as written, once a partition).
 *
 * Everything happens in a transaction on this machine's database that never commits: the workspace, its people,
 * their threads and messages, and the setting go with it. Read through the CLI, as sweep-registry.db.test.mjs turns a
 * clock; SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite reads the local stack through the CLI"
    : false;

/** A transaction that never commits: `body` runs in a DO block that ends by raising what it `seen`, as hex. */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", "--local", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/** Index scans so far in this transaction on every index of every partition of events. */
const EVENT_SCANS = `(select coalesce(sum(pg_stat_get_xact_numscans(x.indexrelid)), 0)
    from pg_inherits i join pg_index x on x.indrelid = i.inhrelid where i.inhparent = 'public.events'::regclass)`;
/**
 * Rows fetched so far in this transaction from every partition of events: by a bitmap scan (counted on the table) or
 * by an index scan (counted on the index), as pg_stat_all_tables adds them into idx_tup_fetch.
 */
const EVENT_ROWS = `(select coalesce(sum(pg_stat_get_xact_tuples_fetched(i.inhrelid)
      + (select coalesce(sum(pg_stat_get_xact_tuples_fetched(x.indexrelid)), 0) from pg_index x where x.indrelid = i.inhrelid)), 0)
    from pg_inherits i where i.inhparent = 'public.events'::regclass)`;

test(
  "the People list looks each person's messages and door up for them, not in a copy of every message or a loop through every door, and still answers everyone, newest first",
  { skip },
  () => {
    const seen = rolledBack(`
    declare
      t uuid; cid uuid; conv uuid; newest uuid; before bigint; before_events bigint; before_event_rows bigint;
      people int; first uuid; by_calendar int; by_wire int;
    begin
      insert into public.tenants (slug, name) values ('people-reads-' || gen_random_uuid(), 'People reads') returning id into t;
      -- Thirty people, each with a thread and three words from them; the thirtieth wrote last. Every third was added
      -- by the calendar before they wrote.
      for i in 1..30 loop
        insert into public.contacts (tenant_id) values (t) returning id into cid;
        insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;
        insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at)
          select t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'hello ' || g, 'received',
                 now() - make_interval(mins => (30 - i) * 10 + g)
            from generate_series(1, 3) g;
        if i % 3 = 0 then
          insert into public.events (tenant_id, kind, subject_type, subject_id, data)
            values (t, 'contact.added', 'contact', cid, '{"source": "calendar"}');
        end if;
        newest := cid;
      end loop;
      perform set_config('enable_seqscan', 'off', true);
      before := (select sum(pg_stat_get_xact_numscans(x.indexrelid)) from pg_index x where x.indrelid = 'public.messages'::regclass);
      before_events := ${EVENT_SCANS};
      before_event_rows := ${EVENT_ROWS};
      select count(*)::int, (array_agg(l.id order by l.ordinality))[1],
             count(*) filter (where l.came_from = 'calendar')::int, count(*) filter (where l.came_from = 'whatsapp')::int
        into people, first, by_calendar, by_wire
        from public.people_list(t) with ordinality as l;
      seen := jsonb_build_object(
        'people', people,
        'scans', (select sum(pg_stat_get_xact_numscans(x.indexrelid)) from pg_index x where x.indrelid = 'public.messages'::regclass) - before,
        'event_scans', ${EVENT_SCANS} - before_events,
        'event_rows', ${EVENT_ROWS} - before_event_rows,
        'partitions', (select count(*) from pg_inherits where inhparent = 'public.events'::regclass),
        'by_calendar', by_calendar,
        'by_wire', by_wire,
        'first_is_newest', first = newest);
    end;
  `);
    assert.equal(seen.people, 30, "everyone");
    assert.ok(
      seen.scans >= seen.people,
      `each person's reads look up their own messages: ${seen.scans} index reads for ${seen.people} people`,
    );
    assert.deepEqual(
      { calendar: seen.by_calendar, whatsapp: seen.by_wire },
      { calendar: 10, whatsapp: 20 },
      "a person the calendar added came from the calendar; the rest from the wire of their first word",
    );
    assert.ok(
      seen.partitions < seen.people,
      `events has ${seen.partitions} partitions, so one pass over it could look like a read a person; seed more people`,
    );
    assert.ok(
      seen.event_scans >= seen.people,
      `each person's door is looked up for them: ${seen.event_scans} index reads of events for ${seen.people} people`,
    );
    assert.ok(
      seen.event_rows <= seen.by_calendar,
      `each look-up reads that person's door alone: ${seen.event_rows} rows of events for ${seen.by_calendar} doors ` +
        "(a loop through every door reads them all again for each person)",
    );
    assert.equal(seen.first_is_newest, true, "the person who wrote last comes first");
  },
);

test(
  "first replies look each question's replies up for it, not in a copy of every reply, and still say who answered and how fast",
  { skip },
  () => {
    const seen = rolledBack(`
    declare
      t uuid; cid uuid; conv uuid; before bigint; asked int; by_ai int; seconds numeric;
    begin
      insert into public.tenants (slug, name) values ('first-replies-' || gen_random_uuid(), 'First replies') returning id into t;
      -- Twelve threads, each with a question two hours ago that the receptionist answered thirty seconds later, and a
      -- reply from months before that no question in the period can claim.
      for i in 1..12 loop
        insert into public.contacts (tenant_id) values (t) returning id into cid;
        insert into public.conversations (tenant_id, contact_id) values (t, cid) returning id into conv;
        insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at) values
          (t, conv, cid, 'whatsapp', 'outbound', 'ai', 'text', 'an old reply', 'sent', now() - interval '90 days'),
          (t, conv, cid, 'whatsapp', 'inbound', 'customer', 'text', 'a question', 'received', now() - interval '2 hours'),
          (t, conv, cid, 'whatsapp', 'outbound', 'ai', 'text', 'an answer', 'sent', now() - interval '2 hours' + interval '30 seconds');
      end loop;
      perform set_config('enable_seqscan', 'off', true);
      before := (select sum(pg_stat_get_xact_numscans(x.indexrelid)) from pg_index x where x.indrelid = 'public.messages'::regclass);
      select count(*)::int, count(*) filter (where r.who = 'ai')::int, max(r.ai_seconds)
        into asked, by_ai, seconds
        from public.first_replies(t, now() - interval '1 day') r;
      seen := jsonb_build_object(
        'asked', asked,
        'by_ai', by_ai,
        'seconds', seconds,
        'scans', (select sum(pg_stat_get_xact_numscans(x.indexrelid)) from pg_index x where x.indrelid = 'public.messages'::regclass) - before);
    end;
  `);
    assert.deepEqual(
      { asked: seen.asked, by_ai: seen.by_ai, seconds: Number(seen.seconds) },
      { asked: 12, by_ai: 12, seconds: 30 },
    );
    assert.ok(
      seen.scans >= seen.asked,
      `each question's replies are looked up for it: ${seen.scans} index reads for ${seen.asked} questions`,
    );
  },
);
