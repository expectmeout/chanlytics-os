/**
 * A person's moments are kept (00239, decision 0021 step 1) -- on a real Postgres.
 *
 * person_moments holds, for each person, when they were last in touch (People's order) and when they first got in
 * touch (who is new), moved by the triggers on contacts, messages and calls in the writing statement's own transaction.
 * The rule this holds: after every kind of write, the kept moments equal the moments worked out from the rows, for
 * every person -- person_moments_check(), which the fill script and step 2 also read, finds everyone whole. The writes: a
 * person added; a word; a queued reply, then sent, then its receipt, then failed; a call that connected and one that
 * did not; a call's summary; a history moved in; a message moved to another person; a thread removed; an erasure's
 * deletes; one statement for many people; and the fill, over rows lost and a row a trigger began. A receipt and a
 * call's summary write no row at all: the row's xmin is where it was.
 *
 * Every case runs inside one transaction through the CLI and never commits, so no other suite sees its workspace.
 * SUPABASE_CLI names the binary when `supabase` is not on PATH. Against the database `supabase start` builds on this
 * machine, never production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes people, messages and calls"
      : false;

/** A transaction on this machine's database that never commits: `body` runs in a DO block that raises what it `seen`. */
function rolledBack(body) {
  // What the block saw leaves as hex: nothing the CLI adds around a database error can escape hex or run on into it.
  const sql = `do $$ declare seen jsonb := '{}'; v_n int; v_x xid; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
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

const A = "00000000-0000-4000-8000-0000000d0a00";
const B = "00000000-0000-4000-8000-0000000d0b00";
/** A person, and their thread, in workspace A: made-up numbers (555-01xx). */
const person = (n) => ({
  id: `00000000-0000-4000-8000-0000000d0c${String(n).padStart(2, "0")}`,
  thread: `00000000-0000-4000-8000-0000000d0d${String(n).padStart(2, "0")}`,
  phone: `+1555010${String(n).padStart(4, "0")}`.slice(0, 12),
});
const P1 = person(1);
const P2 = person(2);

/** Two workspaces, the given people in A, each with a thread. */
const WORLD = (people) => `
  insert into public.tenants (id, slug, name) values ('${A}', 'moments-a-' || txid_current(), 'Moments A'),
                                                     ('${B}', 'moments-b-' || txid_current(), 'Moments B');
  ${people
    .map(
      (p, i) => `
  insert into public.contacts (id, tenant_id, phone_e164, created_at)
       values ('${p.id}', '${A}', '${p.phone}', '2026-09-01T09:00:00Z'::timestamptz + interval '${i} minutes');
  insert into public.conversations (id, tenant_id, contact_id) values ('${p.thread}', '${A}', '${p.id}');`,
    )
    .join("")}
`;
/** A message from or to `p`, as the doors write one. */
const say = (
  p,
  { dir = "inbound", sender = "customer", at = "null", status = "received", meta = "{}", id = null, type = "text" },
) => `
  insert into public.messages (${id ? "id, " : ""}tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, channel_ts, status, meta)
       values (${id ? `'${id}', ` : ""}'${A}', '${p.thread}', '${p.id}', 'sms', '${dir}', '${sender}', '${type}', 'moment', ${at === "null" ? "null" : `'${at}'`}, '${status}', '${meta}');`;
/** What `p`'s kept row says, under `key`. */
const look = (key, p) => `
  seen := seen || jsonb_build_object('${key}', (
    select jsonb_build_object('last_word_at', pm.last_word_at, 'first_word_at', pm.first_word_at,
                              'last_call_at', pm.last_call_at, 'first_call_at', pm.first_call_at,
                              'first_row_at', pm.first_row_at, 'moved_in', pm.moved_in,
                              'in_touch_at', pm.in_touch_at, 'new_at', pm.new_at)
      from public.person_moments pm where pm.contact_id = '${p.id}'));`;
/** Who person_moments_check() says is not whole in A (missing, or differing from their rows), under `key`. */
const whole = (key) => `
  seen := seen || jsonb_build_object('${key}', (
    select coalesce(jsonb_agg(jsonb_build_object('who', c.contact_id, 'what', c.what)), '[]')
      from public.person_moments_check('${A}') c where c.what <> 'whole'));`;
/** Whether `p`'s row was written since `mark` read it. */
const mark = (p) => `select pm.xmin into v_x from public.person_moments pm where pm.contact_id = '${p.id}';`;
const untouched = (key, p) => `
  seen := seen || jsonb_build_object('${key}', (select pm.xmin = v_x from public.person_moments pm where pm.contact_id = '${p.id}'));`;
const iso = (s) => new Date(s).toISOString();
const at = (v) => (v == null ? v : new Date(v).toISOString());

test(
  "a person's row is made with them; a word moves it, a queued reply does not until it is sent, a receipt writes nothing, and a failure moves it back",
  { skip },
  () => {
    const seen = rolledBack(`
      ${WORLD([P1])}
      ${look("added", P1)} ${whole("added_whole")}
      ${say(P1, { at: "2026-09-10T10:00:00Z" })}
      ${look("word", P1)} ${whole("word_whole")}
      ${say(P1, { dir: "outbound", sender: "ai", status: "queued", id: "00000000-0000-4000-8000-0000000d0e01" })}
      ${look("queued", P1)} ${whole("queued_whole")}
      update public.messages set status = 'sent' where id = '00000000-0000-4000-8000-0000000d0e01';
      ${look("sent", P1)} ${whole("sent_whole")}
      ${mark(P1)}
      update public.messages set status = 'delivered' where id = '00000000-0000-4000-8000-0000000d0e01';
      ${untouched("receipt_untouched", P1)}
      update public.messages set status = 'failed' where id = '00000000-0000-4000-8000-0000000d0e01';
      ${look("failed", P1)} ${whole("failed_whole")}
    `);
    assert.deepEqual(seen.added, {
      last_word_at: null,
      first_word_at: null,
      last_call_at: null,
      first_call_at: null,
      first_row_at: null,
      moved_in: false,
      in_touch_at: "-infinity",
      new_at: null,
    });
    assert.equal(at(seen.word.last_word_at), iso("2026-09-10T10:00:00Z"), "the word is the last word");
    assert.equal(at(seen.word.first_word_at), iso("2026-09-10T10:00:00Z"));
    assert.equal(at(seen.word.in_touch_at), iso("2026-09-10T10:00:00Z"));
    assert.equal(at(seen.word.new_at), iso("2026-09-10T10:00:00Z"), "new from their first word");
    assert.equal(at(seen.queued.last_word_at), iso("2026-09-10T10:00:00Z"), "a queued reply is not a word yet");
    assert.ok(new Date(seen.sent.last_word_at) > new Date("2026-09-10T10:00:00Z"), "sent, it is the last word");
    assert.equal(seen.receipt_untouched, true, "a receipt writes no row");
    assert.equal(at(seen.failed.last_word_at), iso("2026-09-10T10:00:00Z"), "failed, the word before it is last again");
    for (const k of ["added_whole", "word_whole", "queued_whole", "sent_whole", "failed_whole"])
      assert.deepEqual(seen[k], [], k);
  },
);

test("a call that connected counts, one that did not never does, and a call's summary writes nothing", { skip }, () => {
  const seen = rolledBack(`
    ${WORLD([P1])}
    insert into public.calls (id, tenant_id, retell_call_id, contact_id, status, started_at, created_at)
         values ('00000000-0000-4000-8000-0000000d0f01', '${A}', 'call_moments_1', '${P1.id}', 'ended', '2026-09-11T08:00:00Z', '2026-09-11T08:05:00Z'),
                ('00000000-0000-4000-8000-0000000d0f02', '${A}', 'call_moments_2', '${P1.id}', 'not_connected', '2026-09-12T08:00:00Z', '2026-09-12T08:00:10Z');
    ${look("calls", P1)} ${whole("calls_whole")}
    ${mark(P1)}
    update public.calls set summary = 'They asked about Saturday.' where id = '00000000-0000-4000-8000-0000000d0f01';
    ${untouched("summary_untouched", P1)}
    delete from public.calls where id = '00000000-0000-4000-8000-0000000d0f01';
    ${look("call_gone", P1)} ${whole("gone_whole")}
  `);
  assert.equal(at(seen.calls.last_call_at), iso("2026-09-11T08:00:00Z"), "the connected call, not the one after it");
  assert.equal(at(seen.calls.first_call_at), iso("2026-09-11T08:00:00Z"));
  assert.equal(at(seen.calls.first_row_at), iso("2026-09-11T08:05:00Z"));
  assert.equal(at(seen.calls.in_touch_at), iso("2026-09-11T08:00:00Z"));
  assert.equal(seen.summary_untouched, true, "a summary writes no row");
  assert.equal(seen.call_gone.last_call_at, null, "the call gone, nothing is left of it");
  assert.equal(seen.call_gone.in_touch_at, "-infinity");
  assert.deepEqual(seen.calls_whole, []);
  assert.deepEqual(seen.gone_whole, []);
});

test("a history moved in keeps its person from being new, and its words keep the provider's times", { skip }, () => {
  const seen = rolledBack(`
    ${WORLD([P1])}
    ${say(P1, { at: "2025-03-01T12:00:00Z", meta: '{"backfill":"true"}', status: "received" })}
    ${say(P1, { at: "null", meta: '{"backfill":"true"}', status: "received" })}
    ${look("moved_in", P1)} ${whole("moved_whole")}
  `);
  assert.equal(seen.moved_in.moved_in, true);
  assert.equal(seen.moved_in.new_at, null, "a history moved in is not someone new");
  assert.equal(at(seen.moved_in.last_word_at), iso("2025-03-01T12:00:00Z"), "a moved word without a time is no moment");
  assert.deepEqual(seen.moved_whole, []);
});

test(
  "a message moved to another person, a thread removed and an erasure's deletes leave everyone whole",
  { skip },
  () => {
    const seen = rolledBack(`
    ${WORLD([P1, P2])}
    ${say(P1, { at: "2026-09-10T10:00:00Z" })}
    ${say(P2, { at: "2026-09-12T10:00:00Z", id: "00000000-0000-4000-8000-0000000d0e02" })}
    insert into public.calls (tenant_id, retell_call_id, contact_id, status, started_at)
         values ('${A}', 'call_moments_3', '${P2.id}', 'ended', '2026-09-13T08:00:00Z');
    update public.messages set contact_id = '${P1.id}' where id = '00000000-0000-4000-8000-0000000d0e02';
    ${look("merged_1", P1)} ${look("merged_2", P2)} ${whole("merged_whole")}
    delete from public.conversations where id = '${P1.thread}';
    ${look("thread_gone", P1)} ${whole("thread_whole")}
    delete from public.calls where contact_id = '${P2.id}';
    delete from public.messages where contact_id = '${P2.id}';
    ${look("erased", P2)} ${whole("erased_whole")}
  `);
    assert.equal(at(seen.merged_1.last_word_at), iso("2026-09-12T10:00:00Z"), "the moved word is theirs now");
    assert.equal(at(seen.merged_1.first_word_at), iso("2026-09-10T10:00:00Z"));
    assert.equal(seen.merged_2.last_word_at, null, "and no longer the other person's");
    assert.equal(at(seen.merged_2.last_call_at), iso("2026-09-13T08:00:00Z"), "whose call stays theirs");
    assert.equal(
      at(seen.thread_gone.last_word_at),
      iso("2026-09-12T10:00:00Z"),
      "their own thread's word went with it; the moved one lives in the other thread",
    );
    assert.equal(at(seen.thread_gone.first_word_at), iso("2026-09-12T10:00:00Z"));
    assert.equal(seen.erased.last_call_at, null);
    assert.equal(seen.erased.in_touch_at, "-infinity");
    for (const k of ["merged_whole", "thread_whole", "erased_whole"]) assert.deepEqual(seen[k], [], k);
  },
);

test("one statement for many people moves each person's own moments, in either order", { skip }, () => {
  const people = Array.from({ length: 12 }, (_, i) => person(10 + i));
  const seen = rolledBack(`
    ${WORLD(people)}
    insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, body, channel_ts)
    select '${A}', c.id, c.contact_id, 'sms', 'inbound', 'customer', 'moment',
           '2026-09-20T00:00:00Z'::timestamptz + (g * interval '1 hour') + (row_number() over (order by c.contact_id) * interval '1 minute')
      from public.conversations c cross join generate_series(1, 3) g
     where c.tenant_id = '${A}';
    ${whole("bulk_whole")}
    -- the older word after the newer: the same row as the other way round
    ${say(people[0], { at: "2026-09-25T00:00:00Z" })}
    ${say(people[0], { at: "2026-09-15T00:00:00Z" })}
    ${look("order", people[0])}
    ${whole("order_whole")}
  `);
  assert.deepEqual(seen.bulk_whole, []);
  assert.equal(at(seen.order.last_word_at), iso("2026-09-25T00:00:00Z"));
  assert.equal(at(seen.order.first_word_at), iso("2026-09-15T00:00:00Z"));
  assert.deepEqual(seen.order_whole, []);
});

test(
  "the fill makes a workspace whole in batches, over rows lost and a row a trigger began, and refuses a batch it cannot take",
  { skip },
  () => {
    const people = Array.from({ length: 9 }, (_, i) => person(30 + i));
    const seen = rolledBack(`
    ${WORLD(people)}
    ${people.map((p, i) => say(p, { at: `2026-09-2${i % 9}T10:00:00Z` })).join("")}
    -- as for everyone who was a person before 00239: no row
    delete from public.person_moments where tenant_id = '${A}';
    -- and one a trigger began since, from their newest word alone
    ${say(people[4], { at: "2026-09-29T10:00:00Z" })}
    ${whole("before")}
    seen := seen || jsonb_build_object('batch_1', (select to_jsonb(f) from public.person_moments_fill('${A}', null, 4) f));
    seen := seen || jsonb_build_object('batch_2', (select to_jsonb(f) from public.person_moments_fill('${A}', (seen->'batch_1'->>'last_contact_id')::uuid, 4) f));
    seen := seen || jsonb_build_object('batch_3', (select to_jsonb(f) from public.person_moments_fill('${A}', (seen->'batch_2'->>'last_contact_id')::uuid, 4) f));
    seen := seen || jsonb_build_object('batch_4', (select to_jsonb(f) from public.person_moments_fill('${A}', (seen->'batch_3'->>'last_contact_id')::uuid, 4) f));
    ${whole("after")}
    begin
      perform public.person_moments_fill('${A}', null, 1001);
      seen := seen || '{"refused": false}';
    exception when invalid_parameter_value then
      seen := seen || '{"refused": true}';
    end;
  `);
    const what = (list) => list.map((x) => x.what).sort();
    assert.deepEqual(
      what(seen.before),
      ["differs", ...Array(8).fill("missing")],
      "one begun by a trigger, eight with no row",
    );
    assert.deepEqual(
      [seen.batch_1.filled, seen.batch_2.filled, seen.batch_3.filled, seen.batch_4.filled],
      [4, 4, 1, 0],
    );
    assert.equal(seen.batch_4.last_contact_id, null, "past the last person, nothing");
    assert.deepEqual(seen.after, [], "whole");
    assert.equal(seen.refused, true, "a batch is at most a thousand people");
  },
);
