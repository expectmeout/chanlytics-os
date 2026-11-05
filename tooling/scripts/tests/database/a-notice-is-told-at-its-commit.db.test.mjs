/**
 * A notice is told at its commit (00507; decision 0019 as the page-open PRD of 3 Nov 2026 amends it, L3).
 *
 * A tab drops a notice for a surface whose last read began after the notice's clock (`at`): it holds the change. When `at`
 * was the clock of the transaction's first statement, a read that began between that statement and the commit did not
 * hold the change, and its notice was dropped all the same, the page stale until its next notice or the 15-minute heal.
 * Here, on the local stack: a statement's notice is kept in the transaction's own rows and is not on the topic before the
 * commit; at the commit it goes, with the commit's clock, and its row is gone; a savepoint rolled back tells nothing of
 * its part; and a statement of 500 rows still keeps one row for each workspace.
 *
 * And a tab catches up on what it missed (00508, decision 0019 step 4): a member reads back their workspace's notices since
 * a moment, and only theirs, as the topic's own policy admits them (a partner's seat without its second factor reads
 * nothing, another workspace's member nothing, an anonymous caller is refused), at most 201 at a time.
 *
 * The transaction is rolled back at the end, as the feed's other suite does; SET CONSTRAINTS … IMMEDIATE runs what is
 * deferred, there and then, as the commit would.
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

/** Run `body` in a block that is rolled back, and answer what it put in `seen`. */
function rolledBack(body) {
  const r = spawnSync(
    CLI,
    [
      "db",
      "query",
      "--local",
      `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`,
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr].map((s) => (s ?? "").trim()).join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

const COMMIT = `
  execute 'set constraints public.workspace_notices_told_at_commit immediate';
  execute 'set constraints public.workspace_notices_told_at_commit deferred';`;

let world;
function seenOnce() {
  world ??= rolledBack(`
    declare
      a uuid; b uuid; ta text; tb text; mid timestamptz; n integer; tr record; before_probes timestamptz;
      member_a uuid := gen_random_uuid(); partner_a uuid := gen_random_uuid(); member_b uuid := gen_random_uuid();
      person uuid; person2 uuid; conv1 uuid; conv2 uuid;
    begin
      insert into public.tenants (slug, name) values ('commit-a-' || gen_random_uuid(), 'Commit A') returning id into a;
      insert into public.tenants (slug, name) values ('commit-b-' || gen_random_uuid(), 'Commit B') returning id into b;
      ta := 'workspace:' || a || ':changes';
      tb := 'workspace:' || b || ':changes';
      ${COMMIT}
      delete from realtime.messages where topic in (ta, tb);
      perform set_config('chanlytics.workspace_told', '', true);

      -- A person made in A: kept, not yet told.
      insert into public.contacts (tenant_id) values (a);
      select count(*) into n from realtime.messages where topic = ta;
      seen := seen || jsonb_build_object('on_the_topic_before_the_commit', n);
      select count(*) into n from public.workspace_notices_pending where topic = ta;
      seen := seen || jsonb_build_object('kept_before_the_commit', n);

      -- The transaction runs on; a read that begins now does not hold the person.
      perform pg_sleep(0.3);
      mid := clock_timestamp();

      -- In B, a person made inside a savepoint that is rolled back.
      begin
        insert into public.contacts (tenant_id) values (b);
        raise exception 'undone';
      exception when others then
        null;
      end;

      -- 500 people in one statement, in A and B.
      insert into public.contacts (tenant_id) select case when g % 2 = 0 then a else b end from generate_series(1, 500) g;
      select count(*) into n from public.workspace_notices_pending where topic in (ta, tb);
      seen := seen || jsonb_build_object('kept_rows', n);

      ${COMMIT}
      seen := seen || jsonb_build_object(
        'told_a', (select count(*) from realtime.messages m where m.topic = ta and m.payload ->> 'table' = 'contacts'),
        'told_b', (select count(*) from realtime.messages m where m.topic = tb and m.payload ->> 'table' = 'contacts'),
        'at_after_the_read_began', (select bool_and((m.payload ->> 'at')::timestamptz >= date_trunc('milliseconds', mid))
                                      from realtime.messages m where m.topic = ta),
        'kept_after_the_commit', (select count(*) from public.workspace_notices_pending where topic in (ta, tb)),
        'shape', (select m.payload - 'at' - 'id' from realtime.messages m where m.topic = ta limit 1));

      -- A thread's notice names its threads (00510), gathered across the transaction's statements.
      insert into public.contacts (tenant_id) values (a) returning id into person;
      insert into public.contacts (tenant_id) values (a) returning id into person2;
      insert into public.conversations (tenant_id, contact_id) values (a, person) returning id into conv1;
      insert into public.conversations (tenant_id, contact_id) values (a, person2) returning id into conv2;
      ${COMMIT}
      perform set_config('chanlytics.workspace_told', '', true);
      delete from realtime.messages where topic = ta;
      insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status)
        values (a, conv1, person, 'whatsapp', 'inbound', 'customer', 'text', 'Is Saturday open?', 'received');
      insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status)
        values (a, conv2, person2, 'whatsapp', 'inbound', 'customer', 'text', 'And Sunday?', 'received');
      ${COMMIT}
      perform set_config('chanlytics.workspace_told', '', true);
      seen := seen || jsonb_build_object(
        'message_notices', (select count(*) from realtime.messages m where m.topic = ta and m.payload ->> 'table' = 'messages'),
        'message_threads', (select coalesce(jsonb_agg(t order by t), '[]') from realtime.messages m,
                              jsonb_array_elements_text(m.payload -> 'threads') t
                             where m.topic = ta and m.payload ->> 'table' = 'messages'),
        'threads_asked', (select jsonb_agg(x order by x) from unnest(array[conv1::text, conv2::text]) x));

      -- The catch-up: notices since a moment, read back by whom the topic admits.
      insert into auth.users (id) values (member_a), (partner_a), (member_b);
      insert into public.memberships (user_id, tenant_id, role) values
        (member_a, a, 'operator'), (partner_a, a, 'partner'), (member_b, b, 'owner');
      ${COMMIT}
      before_probes := clock_timestamp();
      insert into public.segments (tenant_id, name) values (a, 'A list');
      ${COMMIT}
      for tr in
        select * from (values
          ('member_own', jsonb_build_object('sub', member_a, 'role', 'authenticated', 'aal', 'aal1'), a),
          ('member_other', jsonb_build_object('sub', member_b, 'role', 'authenticated', 'aal', 'aal1'), a),
          ('partner_first_factor', jsonb_build_object('sub', partner_a, 'role', 'authenticated', 'aal', 'aal1'), a),
          ('partner_second_factor', jsonb_build_object('sub', partner_a, 'role', 'authenticated', 'aal', 'aal2'), a)
        ) as p(who, claims, tenant)
      loop
        perform set_config('request.jwt.claims', tr.claims::text, true);
        perform set_config('request.jwt.claim.sub', tr.claims ->> 'sub', true);
        execute 'set local role authenticated';
        select count(*) into n from public.workspace_notices_since(tr.tenant, before_probes) w where w.payload ->> 'table' = 'segments';
        reset role;
        seen := seen || jsonb_build_object('caught_up_' || tr.who, n);
      end loop;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      execute 'set local role anon';
      begin
        perform public.workspace_notices_since(a, before_probes);
        seen := seen || jsonb_build_object('caught_up_anon', 'answered');
      exception when insufficient_privilege then
        seen := seen || jsonb_build_object('caught_up_anon', 'refused');
      end;
      reset role;

      -- More than one answer carries: 201, the last saying there were more.
      insert into realtime.messages (topic, extension, event, payload, private)
        select ta, 'broadcast', 'UPDATE', jsonb_build_object('table', 'deals', 'op', 'UPDATE', 'at', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), true
          from generate_series(1, 250);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', member_a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
      perform set_config('request.jwt.claim.sub', member_a::text, true);
      execute 'set local role authenticated';
      select count(*) into n from public.workspace_notices_since(a, before_probes);
      reset role;
      seen := seen || jsonb_build_object('caught_up_most', n);
    end;`);
  return world;
}

test("a statement's notice is kept, not told, until the commit", { skip }, () => {
  const seen = seenOnce();
  assert.equal(seen.on_the_topic_before_the_commit, 0, "nothing on the topic before the commit");
  assert.equal(seen.kept_before_the_commit, 1, "one row kept for the workspace's table and event");
});

test("at the commit it goes with the commit's clock, later than any read that began before it", { skip }, () => {
  const seen = seenOnce();
  assert.equal(seen.told_a, 1, "one notice for A's people, however many statements");
  assert.equal(seen.at_after_the_read_began, true, "REGRESSION: `at` was the first statement's, before the read began");
  assert.deepEqual(seen.shape, { table: "contacts", op: "INSERT" }, "the notice keeps its shape");
  assert.equal(seen.kept_after_the_commit, 0, "every kept row is gone once told");
});

test("a savepoint rolled back tells nothing of its part, and 500 rows keep one row a workspace", { skip }, () => {
  const seen = seenOnce();
  assert.equal(seen.kept_rows, 2, "A's from before, and B's from the 500: the rolled-back savepoint kept none");
  assert.equal(seen.told_b, 1, "B is told once, for the 500, never for the person the savepoint took back");
});

test("a member catches up on their workspace's notices since a moment, and only theirs (00508)", { skip }, () => {
  const seen = seenOnce();
  assert.equal(seen.caught_up_member_own, 1, "the list made after the moment, read back");
  assert.equal(seen.caught_up_member_other, 0, "another workspace's member reads nothing of it");
  assert.equal(
    seen.caught_up_partner_first_factor,
    0,
    "a partner's seat without its second factor reads nothing (00218)",
  );
  assert.equal(seen.caught_up_partner_second_factor, 1);
  assert.equal(seen.caught_up_anon, "refused", "an anonymous caller may not ask");
});

test("one catch-up answers at most 201: the 201st says there were more, and the tab reads everything", { skip }, () => {
  assert.equal(seenOnce().caught_up_most, 201);
});

test(
  "a message's notice names the threads its transaction touched, gathered across its statements (00510)",
  { skip },
  () => {
    const seen = seenOnce();
    assert.equal(seen.message_notices, 1, "one notice for the messages, however many statements");
    assert.deepEqual(seen.message_threads, seen.threads_asked, "both threads, from the two statements");
  },
);
