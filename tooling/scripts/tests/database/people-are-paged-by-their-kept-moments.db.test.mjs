/**
 * People are paged by their kept moments (decision 0021, step 2, 00276), on a real database.
 *
 * people_list chooses a page before it reads it: the page's people come from person_moments in the kept order (the
 * later of their last word and last call, then when they were added, then the id, falling), after an offset or a
 * cursor, and every other column is read for them alone. What this proves: a page reads its own people's rows however
 * many people the workspace holds; the cursor reads everyone once, in the order, and someone who writes between two
 * pages is read on the next pass and never twice in one; the offset still answers, the older call too, and it agrees
 * with the cursor; each row says its place in the order; and a member reads their own workspace's page and nobody
 * else's.
 *
 * Everything happens in a transaction on this machine's database that never commits. Read through the CLI, as the
 * other suites under database/ are; SUPABASE_CLI names the binary when `supabase` is not on PATH.
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
  const sql = `do $$ declare seen jsonb := '{}'; ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
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

/**
 * `n` people in workspace `ws`, added `days` days ago a minute apart, each with a thread and four messages (two of
 * theirs, two answers) that end `hours` hours after they were added. Written as one statement per table.
 */
const people = (ws, n, days, hours) => `
  with c as (
         insert into public.contacts (tenant_id, display_name, created_at)
         select ${ws}, 'Person ' || g, now() - make_interval(days => ${days}) + make_interval(mins => g)
           from generate_series(1, ${n}) g
         returning id, tenant_id, created_at),
       v as (insert into public.conversations (tenant_id, contact_id) select c.tenant_id, c.id from c
             returning id, tenant_id, contact_id)
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status,
                               created_at, channel_ts)
  select v.tenant_id, v.id, v.contact_id, 'whatsapp',
         case when k % 2 = 1 then 'inbound' else 'outbound' end, case when k % 2 = 1 then 'customer' else 'ai' end,
         'text', 'word ' || k, case when k % 2 = 1 then 'received' else 'sent' end,
         c.created_at + make_interval(hours => ${hours} * k / 4), c.created_at + make_interval(hours => ${hours} * k / 4)
    from v join c on c.id = v.contact_id, generate_series(1, 4) k;`;

/**
 * Every page of `ws`, `size` at a time, each from just past the last row of the one before: its ids, a jsonb array per
 * page, into `into`. The cursor is that row's place in the order, read from its kept moments.
 */
const CURSOR_PASS = (ws, size, into) => `
  ${into} := '[]';
  a_at := null; a_added := null; a_id := null;
  loop
    select coalesce(jsonb_agg(to_jsonb(l.id) order by l.in_touch_at desc, l.added_at desc, l.id desc), '[]'), count(*)
      into page, got
      from public.people_list(${ws}, null, null, ${size}, 0, a_at, a_added, a_id) l;
    exit when got = 0;
    ${into} := ${into} || jsonb_build_array(page);
    exit when got < ${size};
    select pm.in_touch_at, pm.added_at, pm.contact_id into a_at, a_added, a_id
      from public.person_moments pm where pm.contact_id = (page ->> (jsonb_array_length(page) - 1))::uuid;
  end loop;`;

/** The blocks this transaction has read from each table so far, from its heap and every one of its indexes. */
const READ = ["messages", "conversations", "calls", "person_moments", "contacts"];
const BLOCKS = `(select jsonb_object_agg(k.t, (
    coalesce(pg_stat_get_xact_blocks_fetched(('public.' || k.t)::regclass), 0)
    + coalesce((select sum(pg_stat_get_xact_blocks_fetched(x.indexrelid))
                  from pg_index x where x.indrelid = ('public.' || k.t)::regclass), 0))::bigint)
  from unnest(array[${READ.map((t) => `'${t}'`).join(", ")}]) k(t))`;

/** What the first page of 100 cost each table, in blocks, with fresh statistics and sequential scans off. */
const measured = (name) => `
  analyze public.contacts, public.messages, public.conversations, public.calls, public.person_moments;
  perform set_config('enable_seqscan', 'off', true);
  before := ${BLOCKS};
  perform count(*) from public.people_list(t, null, null, 100);
  cost := cost || jsonb_build_object('${name}',
    (select jsonb_object_agg(a.key, a.value::bigint - (before->>a.key)::bigint) from jsonb_each(${BLOCKS}) a));
  perform set_config('enable_seqscan', 'on', true);`;

test("a page reads its own people's rows, however many people the workspace holds", { skip }, () => {
  const { cost, first } = rolledBack(`
    t uuid; before jsonb; cost jsonb := '{}'; first jsonb; again jsonb;
    begin
      insert into public.tenants (slug, name) values ('paged-' || gen_random_uuid(), 'Paged') returning id into t;
      -- Three hundred people in touch this week; the first page is the latest hundred of them.
      ${people("t", 300, 7, 24)}
      select jsonb_agg(l.id order by l.in_touch_at desc) into first from public.people_list(t, null, null, 100) l;
      ${measured("of_300")}
      -- Six hundred more, in touch a year ago: the workspace is three times the size, and its first page is the same.
      ${people("t", 600, 400, 24)}
      select jsonb_agg(l.id order by l.in_touch_at desc) into again from public.people_list(t, null, null, 100) l;
      ${measured("of_900")}
      seen := jsonb_build_object('cost', cost, 'first', first = again);`);
  assert.equal(first, true, "the first page is the latest hundred at both sizes");
  for (const table of READ) {
    assert.ok(cost.of_300[table] > 0 || table === "calls", `${table} is read at all (${cost.of_300[table]} blocks)`);
    assert.ok(
      cost.of_900[table] <= cost.of_300[table] * 1.5 + 5,
      `${table}: the first page read ${cost.of_300[table]} blocks of a workspace of 300 and ${cost.of_900[table]} of 900 ` +
        "(a page that reads every person's rows grows with the workspace)",
    );
  }
});

test(
  "the cursor reads everyone once, in the order, and someone who writes between two pages is read on the next pass",
  { skip },
  () => {
    const s = rolledBack(`
      t uuid; o uuid; a_at timestamptz; a_added timestamptz; a_id uuid; page jsonb; got int;
      pass jsonb; next_pass jsonb; by_offset jsonb := '[]'; live jsonb; early uuid; late uuid; erased uuid; merged uuid;
      quiet jsonb; places jsonb; older jsonb;
      begin
        insert into public.tenants (slug, name) values ('paged-' || gen_random_uuid(), 'Paged') returning id into t;
        insert into public.tenants (slug, name) values ('paged-next-door-' || gen_random_uuid(), 'Next door') returning id into o;
        ${people("t", 120, 30, 48)}
        ${people("o", 40, 30, 48)}
        -- Three who have never written or phoned, one erased and one merged into someone else.
        insert into public.contacts (tenant_id, display_name, created_at)
          select t, 'Quiet ' || g, now() - make_interval(days => 10 + g) from generate_series(1, 3) g;
        select c.id into erased from public.contacts c where c.tenant_id = t and c.display_name = 'Person 7';
        select c.id into merged from public.contacts c where c.tenant_id = t and c.display_name = 'Person 8';
        update public.contacts set erased_at = now() where id = erased;
        update public.contacts set merged_into_contact_id = (select id from public.contacts where tenant_id = t
          and display_name = 'Person 9') where id = merged;
        select jsonb_agg(c.id order by c.id) into live from public.contacts c
         where c.tenant_id = t and c.erased_at is null and c.merged_into_contact_id is null;
        select jsonb_agg(c.id order by c.created_at desc) into quiet from public.contacts c
         where c.tenant_id = t and c.display_name like 'Quiet %';

        -- One pass by the offset and one by the cursor, fifty at a time, with nothing moving.
        for got in 0..3 loop
          by_offset := by_offset || coalesce((select jsonb_agg(to_jsonb(l.id) order by l.in_touch_at desc, l.added_at desc, l.id desc)
                                                from public.people_list(t, null, null, 50, got * 50) l), '[]');
        end loop;
        ${CURSOR_PASS("t", 50, "pass")}
        -- The older call, its five arguments by position, is answered as before.
        select jsonb_agg(to_jsonb(l.id) order by l.in_touch_at desc, l.added_at desc, l.id desc) into older
          from public.people_list(t, null, null, 50, 50) l;
        seen := seen || jsonb_build_object('live', live, 'quiet', quiet, 'by_offset', by_offset, 'still', pass);

        -- The same pass, with two people writing after its first page: one already read, one not yet reached.
        a_at := null; a_added := null; a_id := null; pass := '[]';
        select coalesce(jsonb_agg(to_jsonb(l.id) order by l.in_touch_at desc, l.added_at desc, l.id desc), '[]'), count(*)
          into page, got from public.people_list(t, null, null, 50) l;
        pass := pass || jsonb_build_array(page);
        early := (page ->> 10)::uuid;
        select l.id into late from public.people_list(t, null, null, 50, 100) l order by l.in_touch_at desc, l.added_at desc, l.id desc offset 5 limit 1;
        select pm.in_touch_at, pm.added_at, pm.contact_id into a_at, a_added, a_id
          from public.person_moments pm where pm.contact_id = (page ->> 49)::uuid;
        insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, channel_ts)
          select v.tenant_id, v.id, v.contact_id, 'whatsapp', 'inbound', 'customer', 'text', 'still there?', 'received', now()
            from public.conversations v where v.contact_id in (early, late);
        loop
          select coalesce(jsonb_agg(to_jsonb(l.id) order by l.in_touch_at desc, l.added_at desc, l.id desc), '[]'), count(*)
            into page, got from public.people_list(t, null, null, 50, 0, a_at, a_added, a_id) l;
          exit when got = 0;
          pass := pass || jsonb_build_array(page);
          select pm.in_touch_at, pm.added_at, pm.contact_id into a_at, a_added, a_id
            from public.person_moments pm where pm.contact_id = (page ->> (jsonb_array_length(page) - 1))::uuid;
          exit when got < 50;
        end loop;
        select jsonb_agg(to_jsonb(l.id) order by l.in_touch_at desc, l.added_at desc, l.id desc) into next_pass
          from public.people_list(t, null, null, 2) l;

        -- Each row's place: its kept moment is its columns', and when it was added is its person's.
        select jsonb_build_object(
                 'wrong_moment', count(*) filter (where l.in_touch_at is distinct from
                                    coalesce(greatest(l.last_message_at, l.last_call_at), '-infinity'::timestamptz)),
                 'wrong_added', count(*) filter (where l.added_at is distinct from c.created_at),
                 'never', count(*) filter (where l.in_touch_at = '-infinity'::timestamptz))
          into places
          from public.people_list(t) l join public.contacts c on c.id = l.id;
        seen := seen || jsonb_build_object('moved', pass, 'early', early, 'late', late, 'next_pass', next_pass,
                                           'places', places, 'older', older, 'erased', erased, 'merged', merged);`);
    const flat = (pages) => pages.flat();

    // Nothing moving: the offset and the cursor read the same people in the same order, each live person once.
    assert.deepEqual(
      s.still.map((p) => p.length),
      [50, 50, 21],
      "fifty, fifty, and the rest: 118 in touch, less one erased and one merged, and 3 who never were",
    );
    assert.deepEqual(flat(s.by_offset), flat(s.still), "the offset and the cursor agree");
    assert.deepEqual([...flat(s.still)].sort(), s.live, "every live person, once");
    assert.ok(!flat(s.still).includes(s.erased) && !flat(s.still).includes(s.merged), "nobody erased or merged");
    assert.deepEqual(flat(s.still).slice(-3), s.quiet, "who never wrote or phoned comes last, the newest added first");
    assert.deepEqual(s.older, flat(s.still).slice(50, 100), "the older call, by position, is the second page");

    // Two people write after the first page: nobody is read twice, the one not yet reached waits for the next pass.
    const moved = flat(s.moved);
    assert.equal(new Set(moved).size, moved.length, "nobody twice in one pass");
    assert.ok(moved.includes(s.early), "the one already read was read once");
    assert.ok(!moved.includes(s.late), "the one not yet reached moved above the cursor");
    assert.deepEqual(
      [...moved, s.late].sort(),
      s.live,
      "everyone else was read, and the mover is the only one missing",
    );
    assert.deepEqual([...s.next_pass].sort(), [s.early, s.late].sort(), "the next pass opens with the two who wrote");

    assert.deepEqual(s.places, { wrong_moment: 0, wrong_added: 0, never: 3 }, "each row says its place in the order");
  },
);

test("a member reads their own workspace's page through the kept moments, and nobody else's", { skip }, () => {
  const s = rolledBack(`
    t uuid; o uuid; member uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); mine int; theirs int;
    begin
      insert into public.tenants (slug, name) values ('paged-' || gen_random_uuid(), 'Paged') returning id into t;
      insert into public.tenants (slug, name) values ('paged-next-door-' || gen_random_uuid(), 'Next door') returning id into o;
      ${people("t", 12, 5, 12)}
      ${people("o", 7, 5, 12)}
      insert into auth.users (id) values (member), (stranger);
      insert into public.memberships (user_id, tenant_id, role) values (member, t, 'operator'), (stranger, o, 'owner');
      perform set_config('request.jwt.claims', jsonb_build_object('sub', member, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', member::text, true);
      set local role authenticated;
      select count(*) into mine from public.people_list(t);
      reset role;
      perform set_config('request.jwt.claims', jsonb_build_object('sub', stranger, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', stranger::text, true);
      set local role authenticated;
      select count(*) into theirs from public.people_list(t);
      reset role;
      seen := jsonb_build_object('mine', mine, 'theirs', theirs);`);
  assert.deepEqual(s, { mine: 12, theirs: 0 }, "the member reads their twelve; a member of another workspace, none");
});
