/**
 * The database tells each workspace what changed (decision 0019, 00265), on a real database.
 *
 * A statement on a watched table puts one notice per workspace it changed on that workspace's private topic,
 * `workspace:<id>:changes`, through realtime.send: the table and the operation, and the statuses a call's or a
 * message update's statement left, never the row.
 * The tables and events with a trigger are the ones packages/db realtime.ts lists (WATCHED), read from pg_trigger. And
 * Realtime lets a member listen to their workspaces' topics and nobody speak on them, which is probed here as Realtime
 * probes a join: a notice written, read back as the caller.
 *
 * Everything happens in a transaction on this machine's database that never commits. Read through the CLI, as
 * sweep-registry.db.test.mjs turns a clock; SUPABASE_CLI names the binary when `supabase` is not on PATH.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const skip = !URL_
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite reads the local stack through the CLI"
    : false;

function cli(args) {
  const r = spawnSync(CLI, ["db", "query", "--local", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  return r;
}

/** One statement, and the rows it returned. */
function query(sql) {
  const r = cli(["--output-format", "json", sql]);
  if (r.status !== 0)
    throw new Error(`supabase db query exited ${r.status}: ${`${r.stderr}\n${r.stdout}`.slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

/** A transaction that never commits: `body` runs in a DO block that ends by raising what it `seen`, as hex. */
function rolledBack(body) {
  const r = cli([
    `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`,
  ]);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

/**
 * What the statements since the last step told the two workspaces, kept under `step`, then cleared for the next. The
 * next step starts with nothing told, as a transaction of its own would (the trigger tells each workspace's table and
 * event once a transaction).
 */
const told = (step) => `
  steps := steps || jsonb_build_object('${step}', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', case m.topic when ta then 'a' else 'b' end, 'event', m.event, 'notice', m.payload - 'id',
             'private', m.private, 'extension', m.extension)
           order by m.topic = tb, m.payload ->> 'table', m.event, m.payload ->> 'statuses'), '[]')
      from realtime.messages m where m.topic in (ta, tb)));
  delete from realtime.messages where topic in (ta, tb);
  perform set_config('chanlytics.workspace_told', '', true);`;

/** An inbound message on the thread in workspace a. */
const messageIn = (body) => `
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status)
    values (a, conv, ca, 'whatsapp', 'inbound', 'customer', 'text', '${body}', 'received');`;

/** An outbound message from the receptionist, in the workspace variable `tenant` on the thread `thread` with `contact`. */
const messageOut = (tenant, thread, contact, body, status) => `
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status)
    values (${tenant}, ${thread}, ${contact}, 'whatsapp', 'outbound', 'ai', 'text', '${body}', '${status}');`;

/** As Realtime probes a join: the caller's claims and the topic set, then the notice read back as them. */
const asCaller = (claims, topic) => `
  perform set_config('request.jwt.claims', ${claims}::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(${claims} ->> 'sub', ''), true);
  perform set_config('realtime.topic', ${topic}, true);
  execute 'set local role ' || (${claims} ->> 'role');`;

const member = (uid, aal = "aal1") => `jsonb_build_object('sub', ${uid}, 'role', 'authenticated', 'aal', '${aal}')`;

let seen;
/** Written, told and probed once for every test. */
function world() {
  seen ??= rolledBack(`
    declare
      a uuid; b uuid; ta text; tb text; ca uuid; cb uuid; conv uuid; conv_b uuid; seg_a uuid; seg_b uuid;
      member_a uuid := gen_random_uuid(); viewer_a uuid := gen_random_uuid(); partner_a uuid := gen_random_uuid();
      member_b uuid := gen_random_uuid(); probe_a uuid; probe_b uuid; n integer; spoke boolean; tr record;
      steps jsonb := '{}'; reads jsonb := '{}'; misfired jsonb := '[]';
    begin
      insert into public.tenants (slug, name) values ('told-a-' || gen_random_uuid(), 'Told A') returning id into a;
      insert into public.tenants (slug, name) values ('told-b-' || gen_random_uuid(), 'Told B') returning id into b;
      ta := 'workspace:' || a || ':changes';
      tb := 'workspace:' || b || ':changes';
      insert into public.contacts (tenant_id) values (a) returning id into ca;
      insert into public.contacts (tenant_id) values (b) returning id into cb;
      delete from realtime.messages where topic in (ta, tb);

      insert into public.conversations (tenant_id, contact_id) values (a, ca) returning id into conv;
      ${told("thread_started")}

      ${messageIn("Is Saturday open?")}
      ${told("message_in")}

      update public.messages set status = 'read' where conversation_id = conv;
      delete from public.messages where conversation_id = conv;
      ${told("message_read_and_removed")}

      -- A send's life in workspace a, and a send in b left where it was: the ticks, a failure, and a word on it later.
      insert into public.conversations (tenant_id, contact_id) values (b, cb) returning id into conv_b;
      ${messageOut("a", "conv", "ca", "We open at nine", "queued")}
      ${messageOut("b", "conv_b", "cb", "We open at ten", "queued")}
      ${told("sends_queued")}

      update public.messages set status = 'sent' where tenant_id = a;
      ${told("one_send_left")}

      update public.messages set status = 'delivered' where tenant_id in (a, b);
      ${told("a_receipt_for_each_workspace")}

      ${messageOut("a", "conv", "ca", "Your slot is gone", "failed")}
      ${told("a_send_failed")}
      update public.messages set error = jsonb_build_object('detail', 'not on whatsapp') where tenant_id = a and status = 'failed';
      ${told("the_failure_explained_later")}

      update public.messages set meta = meta || '{"stamped": true}' where tenant_id = a;
      ${told("two_statuses_in_one_statement")}

      ${messageIn("A stamp will follow")}
      ${told("message_in_before_its_stamp")}
      update public.messages set meta = meta || '{"processed_at": "2026-10-05T10:00:00Z"}' where direction = 'inbound' and tenant_id = a;
      ${told("an_arrival_stamped")}

      -- One transaction: a receipt and the same status again is told once, a failure's own word apart.
      update public.messages set status = 'read' where tenant_id = a and status = 'delivered';
      update public.messages set meta = meta || '{"again": true}' where tenant_id = a and status = 'read';
      update public.messages set meta = meta || '{"again": true}' where tenant_id = a and status = 'failed';
      ${told("receipts_in_one_transaction")}

      delete from public.messages where tenant_id in (a, b);
      ${told("messages_removed")}

      insert into public.calls (tenant_id, retell_call_id, status) values
        (a, 'told-1', 'ongoing'), (a, 'told-2', 'ongoing'), (b, 'told-3', 'registered');
      ${told("calls_started")}

      update public.calls set status = case when retell_call_id = 'told-1' then 'ended' else status end where tenant_id = a;
      ${told("one_call_ended")}

      delete from public.calls where tenant_id in (a, b);
      ${told("calls_removed")}

      insert into public.segments (tenant_id, name) values (a, 'Regulars') returning id into seg_a;
      insert into public.segments (tenant_id, name) values (b, 'Regulars') returning id into seg_b;
      insert into public.contacts (tenant_id) select t.w from generate_series(1, 249) cross join (values (a), (b)) as t(w);
      ${told("lists_made")}

      insert into public.segment_members (segment_id, contact_id, tenant_id)
        select case c.tenant_id when a then seg_a else seg_b end, c.id, c.tenant_id
          from public.contacts c where c.tenant_id in (a, b);
      steps := steps || jsonb_build_object('listed_count', (select count(*) from public.segment_members where segment_id in (seg_a, seg_b)));
      ${told("five_hundred_listed")}

      delete from public.segment_members where segment_id in (seg_a, seg_b);
      ${told("five_hundred_unlisted")}

      insert into public.person_notes (tenant_id, contact_id, body) values (b, cb, 'Prefers mornings');
      ${told("note_made")}
      delete from public.person_notes where tenant_id = b;
      ${told("note_removed")}

      -- One transaction: a loop of statements, as the lead finder's commits are, tells each workspace once.
      for n in 1..100 loop
        ${messageIn("one of a hundred")}
      end loop;
      insert into public.calls (tenant_id, retell_call_id, status) values (a, 'told-4', 'ongoing');
      update public.calls set status = 'ongoing' where retell_call_id = 'told-4';
      update public.calls set status = 'ongoing' where retell_call_id = 'told-4';
      update public.calls set status = 'ended' where retell_call_id = 'told-4';
      ${told("one_transaction")}

      begin
        ${messageIn("never sent")}
        raise exception 'rolled back';
      exception when raise_exception then
        null;
      end;
      ${told("rolled_back")}

      begin
        ${messageIn("never sent either")}
        raise exception 'rolled back';
      exception when raise_exception then
        null;
      end;
      ${messageIn("sent after the savepoint went back")}
      ${told("told_after_a_rollback")}

      -- Every trigger, fired by a statement that changes no row: each table's runs, and tells nobody.
      for tr in
        select c.relname as tbl, t.tgname, case when t.tgtype & 4 > 0 then 'insert' when t.tgtype & 8 > 0 then 'delete' else 'update' end as ev
          from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where t.tgname like 'workspace_tell_%' and not t.tgisinternal
      loop
        begin
          execute case tr.ev
            when 'insert' then format('insert into public.%I (tenant_id) select tenant_id from public.%I where false', tr.tbl, tr.tbl)
            when 'update' then format('update public.%I set tenant_id = tenant_id where false', tr.tbl)
            else format('delete from public.%I where false', tr.tbl) end;
        exception when others then
          misfired := misfired || jsonb_build_array(tr.tbl || '.' || tr.tgname || ': ' || sqlerrm);
        end;
      end loop;
      steps := steps || jsonb_build_object('misfired', misfired);
      ${told("nothing_changed")}

      insert into auth.users (id) values (member_a), (viewer_a), (partner_a), (member_b);
      insert into public.memberships (user_id, tenant_id, role) values
        (member_a, a, 'operator'), (viewer_a, a, 'viewer'), (partner_a, a, 'partner'), (member_b, b, 'owner');
      insert into realtime.messages (topic, extension, event, payload, private)
        values (ta, 'broadcast', 'probe', '{}', true) returning id into probe_a;
      insert into realtime.messages (topic, extension, event, payload, private)
        values (tb, 'broadcast', 'probe', '{}', true) returning id into probe_b;
      for tr in
        select * from (values
          ('member_own', ${member("member_a")}, ta, probe_a),
          ('member_other', ${member("member_a")}, tb, probe_b),
          ('member_other_own', ${member("member_b")}, tb, probe_b),
          ('member_other_asks_for_a_as_b', ${member("member_b")}, tb, probe_a),
          ('viewer_own', ${member("viewer_a")}, ta, probe_a),
          ('partner_first_factor', ${member("partner_a")}, ta, probe_a),
          ('partner_second_factor', ${member("partner_a", "aal2")}, ta, probe_a),
          ('anon', jsonb_build_object('role', 'anon'), ta, probe_a)
        ) as p(who, claims, topic, probe)
      loop
        ${asCaller("tr.claims", "tr.topic")}
        select count(*) into n from realtime.messages m where m.id = tr.probe;
        reset role;
        reads := reads || jsonb_build_object(tr.who, n = 1);
      end loop;

      ${asCaller(member("member_a"), "ta")}
      begin
        insert into realtime.messages (topic, extension, event, payload, private)
          values (ta, 'broadcast', 'UPDATE', '{"table": "deals"}', true);
        spoke := true;
      exception when insufficient_privilege then
        spoke := false;
      end;
      reset role;
      reads := reads || jsonb_build_object('member_speaks', spoke);

      seen := jsonb_build_object('steps', steps, 'reads', reads);
    end;
  `);
  return seen;
}

/**
 * The column a trigger's notice is judged by, as pg_trigger keeps its argument: a call's every event, and a message's
 * update alone (an arrival names no status, and its notice is the one every tab heard before the update was told).
 */
const judgedBy = (tbl, event) => (tbl === "calls" || (tbl === "messages" && event === "UPDATE") ? "status\\000" : "");

const notice = (to, event, table, statuses) => ({
  to,
  event,
  notice: { op: event, table, ...(statuses ? { statuses } : {}) },
  private: true,
  extension: "broadcast",
});

test(
  "the tables and events with a trigger are the ones the live feed lists, each a statement's, after it",
  { skip },
  async () => {
    const { watchedEvents } = await import(pathToFileURL(path.join(ROOT, "packages/db/src/realtime.ts")).href);
    const rows = query(`
    select c.relname as tbl,
           array_agg(case when t.tgtype & 4 > 0 then 'INSERT' when t.tgtype & 16 > 0 then 'UPDATE' else 'DELETE' end
                     order by case when t.tgtype & 4 > 0 then 1 when t.tgtype & 16 > 0 then 2 else 3 end) as events,
           bool_and(t.tgtype & 1 = 0 and t.tgtype & 2 = 0 and t.tgtype & 64 = 0) as after_each_statement,
           bool_and(coalesce(t.tgnewtable, t.tgoldtable) = 'changed') as reads_what_changed,
           jsonb_object_agg(case when t.tgtype & 4 > 0 then 'INSERT' when t.tgtype & 16 > 0 then 'UPDATE' else 'DELETE' end,
                            encode(t.tgargs, 'escape')) as args
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and t.tgname like 'workspace_tell_%' and not t.tgisinternal
       and t.tgfoid = 'public.workspace_tell_changes()'::regprocedure
     group by c.relname order by c.relname`);
    const inDatabase = rows.map((r) => ({ table: r.tbl, events: r.events }));
    const listed = [...watchedEvents()].sort((x, y) => x.table.localeCompare(y.table));
    assert.deepEqual(inDatabase, listed, "a table joins the live feed with its trigger, in one change");
    for (const r of rows) {
      assert.equal(r.after_each_statement, true, `${r.tbl}: after each statement, not each row`);
      assert.equal(r.reads_what_changed, true, `${r.tbl}: reads the rows its statement changed`);
      assert.deepEqual(
        r.args,
        Object.fromEntries(r.events.map((e) => [e, judgedBy(r.tbl, e)])),
        `${r.tbl}: the column its changes are judged by, for each event`,
      );
    }
  },
);

test("every trigger runs on its table, and a statement that changes nothing tells nobody", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(steps.misfired, []);
  assert.deepEqual(steps.nothing_changed, []);
});

test(
  "a thread started and a message in are told to their workspace alone, as the table and the event",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.thread_started, [notice("a", "INSERT", "conversations")]);
    assert.deepEqual(
      steps.message_in.filter((n) => n.notice.table === "messages"),
      [notice("a", "INSERT", "messages")],
    );
    assert.deepEqual(
      steps.message_in.filter((n) => n.to === "b"),
      [],
      "the other workspace hears nothing",
    );
  },
);

test("a message is told when it arrives and when its status moves, not when it is removed", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(
    steps.message_read_and_removed.filter((n) => n.notice.table === "messages"),
    [notice("a", "UPDATE", "messages", ["read"])],
    "the update that read it is told, with the status it left; its delete is not",
  );
});

const ofMessages = (told) => told.filter((n) => n.notice.table === "messages");

test("a send's status moving is told to its workspace alone, with the status it left (00325)", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(ofMessages(steps.sends_queued), [
    notice("a", "INSERT", "messages"),
    notice("b", "INSERT", "messages"),
  ]);
  assert.deepEqual(steps.one_send_left, [notice("a", "UPDATE", "messages", ["sent"])]);
  assert.deepEqual(
    steps.one_send_left.filter((n) => n.to === "b"),
    [],
    "the other workspace's queued send moved nowhere, and hears nothing",
  );
  assert.deepEqual(ofMessages(steps.a_receipt_for_each_workspace), [
    notice("a", "UPDATE", "messages", ["delivered"]),
    notice("b", "UPDATE", "messages", ["delivered"]),
  ]);
});

test("a failure is told with its status, and a word written to it later says failed again", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(ofMessages(steps.a_send_failed), [notice("a", "INSERT", "messages")]);
  assert.deepEqual(ofMessages(steps.the_failure_explained_later), [notice("a", "UPDATE", "messages", ["failed"])]);
  assert.deepEqual(
    ofMessages(steps.two_statuses_in_one_statement),
    [notice("a", "UPDATE", "messages", ["delivered", "failed"])],
    "one statement over a delivered send and a failed one: one notice, both statuses",
  );
});

test("an arrival's meta stamped after the fact is told as received, which no tick follows", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(ofMessages(steps.message_in_before_its_stamp), [notice("a", "INSERT", "messages")]);
  assert.deepEqual(ofMessages(steps.an_arrival_stamped), [notice("a", "UPDATE", "messages", ["received"])]);
});

test(
  "a transaction tells a message's status once, and each other status a statement leaves; a delete tells nothing",
  {
    skip,
  },
  () => {
    const { steps } = world();
    assert.deepEqual(ofMessages(steps.receipts_in_one_transaction), [
      notice("a", "UPDATE", "messages", ["failed"]),
      notice("a", "UPDATE", "messages", ["read"]),
    ]);
    assert.deepEqual(ofMessages(steps.messages_removed), []);
  },
);

test(
  "a call's notice carries its statuses: one statement ending one call and leaving another on carries both",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.calls_started, [
      notice("a", "INSERT", "calls", ["ongoing"]),
      notice("b", "INSERT", "calls", ["registered"]),
    ]);
    assert.deepEqual(steps.one_call_ended, [notice("a", "UPDATE", "calls", ["ended", "ongoing"])]);
  },
);

test("a delete is told to the workspace it happened in", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(steps.calls_removed, [
    notice("a", "DELETE", "calls", ["ended", "ongoing"]),
    notice("b", "DELETE", "calls", ["registered"]),
  ]);
  assert.deepEqual(steps.note_removed, [notice("b", "DELETE", "person_notes")]);
});

test("one statement over 500 rows of two workspaces puts one notice on each", { skip }, () => {
  const { steps } = world();
  assert.equal(steps.listed_count, 500);
  assert.deepEqual(steps.five_hundred_listed, [
    notice("a", "INSERT", "segment_members"),
    notice("b", "INSERT", "segment_members"),
  ]);
  assert.deepEqual(steps.five_hundred_unlisted, [
    notice("a", "DELETE", "segment_members"),
    notice("b", "DELETE", "segment_members"),
  ]);
  assert.deepEqual(steps.lists_made, [notice("a", "INSERT", "segments"), notice("b", "INSERT", "segments")]);
});

test("a write that rolls back tells nothing, and takes back the memory of having told", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(steps.rolled_back, []);
  assert.deepEqual(steps.told_after_a_rollback, [notice("a", "INSERT", "messages")]);
});

test(
  "a transaction tells each workspace's table and event once, and a call's statuses each time they differ",
  { skip },
  () => {
    const { steps } = world();
    assert.deepEqual(steps.note_made, [notice("b", "INSERT", "person_notes")]);
    assert.deepEqual(steps.one_transaction, [
      notice("a", "INSERT", "calls", ["ongoing"]),
      notice("a", "UPDATE", "calls", ["ended"]),
      notice("a", "UPDATE", "calls", ["ongoing"]),
      notice("a", "INSERT", "messages"),
    ]);
  },
);

test(
  "a member listens to their workspace's topic and no other's; a viewer does; a partner only with the second factor",
  { skip },
  () => {
    const { reads } = world();
    assert.deepEqual(reads.member_own, true);
    assert.deepEqual(reads.member_other, false, "another workspace's topic is not theirs");
    assert.deepEqual(reads.member_other_own, true);
    assert.deepEqual(
      reads.member_other_asks_for_a_as_b,
      false,
      "the topic asked is the one admitted, never another's notice",
    );
    assert.deepEqual(reads.viewer_own, true);
    assert.deepEqual(
      reads.partner_first_factor,
      false,
      "a partner's seat without its second factor hears nothing (00218)",
    );
    assert.deepEqual(reads.partner_second_factor, true);
    assert.deepEqual(reads.anon, false);
  },
);

test("nobody may speak on a workspace's topic, not even its member", { skip }, () => {
  const { reads } = world();
  assert.equal(reads.member_speaks, false);
});
