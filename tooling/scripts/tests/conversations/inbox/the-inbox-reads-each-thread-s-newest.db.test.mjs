/**
 * The Inbox reads each thread's newest messages (00235) -- on a real database, as the person.
 *
 * GET conversations answers the Inbox, Today and Conversations, and reads the threads' messages through
 * newest_messages: each thread's newest hundred, then the newest four thousand of those, as one JSON list. What a
 * double cannot prove, this does. As a member: each thread's newest, newest first with the id breaking ties, in the
 * reader's columns (MESSAGE_COLUMNS); the cut across threads; the limits refused (22023) and a null argument answered
 * null; the workspace named, and RLS, so a member of another workspace reads nothing of this one even naming it, and
 * anon cannot call it; and the reader itself, over the member's own session, holding more than PostgREST's thousand
 * rows from one call. Then the plan: in a transaction on this machine's database that never commits, the blocks the
 * function reads from messages stay where they were once every thread's history is three times as long. Blocks, not
 * rows, because a read that takes each thread whole and sorts it answers the same rows and reads every block of them.
 *
 * The sessions are real, as tenancy.db.test.mjs makes them: users made with the admin API sign in with a password
 * through the anon key. The plan is read through the CLI, as text-search.db.test.mjs reads its plan; SUPABASE_CLI names
 * the binary when `supabase` is not on PATH. Against the database `supabase start` builds on this machine, never
 * production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, threads and messages"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

// What the dashboard's modules read when they load. Set before the imports below.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL_;
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const kernel = skip ? null : await import(at("apps/dashboard/src/server/readers/index.ts"));
const { conversations } = skip ? {} : await import(at("apps/dashboard/src/server/readers/conversations.ts"));
const { MESSAGE_COLUMNS } = skip ? {} : await import(at("apps/dashboard/src/server/dto.ts"));

/** A transaction on this machine's database that never commits: `body` runs in a DO block that raises what it `seen`. */
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

const MINUTE = 60_000;
const minutesAgo = (n) => new Date(Date.now() - n * MINUTE).toISOString();

let db;
let A; // the workspace under test
let B; // another workspace
const users = [];
let member; // a viewer of A: the least a member may be, and RLS reads the same for every role
let memberId;
let stranger; // an owner of B
const threads = {}; // A's threads by name, and B's
const said = {}; // the messages seeded on A's threads, by thread, newest first as the function orders them

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant) {
  const email = `newest-messages-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

async function seed(table, row) {
  const r = await db.from(table).insert(row).select("id").single();
  assert.equal(r.error, null, `seeding ${table}: ${r.error?.message}`);
  return r.data.id;
}

let phones = 0;
/** A thread with a person of its own in this workspace. */
async function thread(tenant) {
  const contact = await seed("contacts", {
    tenant_id: tenant,
    phone_e164: `+1305555${String(100 + phones++).padStart(4, "0")}`,
  });
  return { contact, id: await seed("conversations", { tenant_id: tenant, contact_id: contact }) };
}

/** `n` messages on a thread, a minute apart, the newest `from` minutes ago: the customer's, then the reply. */
const written = (tenant, t, n, from, over = {}) =>
  Array.from({ length: n }, (_, i) => ({
    tenant_id: tenant,
    conversation_id: t.id,
    contact_id: t.contact,
    channel: "whatsapp",
    direction: i % 2 ? "outbound" : "inbound",
    sender: i % 2 ? "ai" : "customer",
    type: "text",
    body: `word ${i}`,
    status: i % 2 ? "sent" : "received",
    created_at: minutesAgo(from + i),
    ...over,
  }));

/** Newest first, the id breaking ties: the function's order. */
const newestFirst = (a, b) =>
  Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** Seeded, and read back as the function orders them. */
async function wrote(name, rows) {
  const r = await db.from("messages").insert(rows).select("id, conversation_id, created_at");
  assert.equal(r.error, null, `seeding ${name}: ${r.error?.message}`);
  said[name] = [...r.data].sort(newestFirst);
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await seed("tenants", { slug: `newest-messages-a-${Date.now()}`, name: "Newest messages A" });
  B = await seed("tenants", { slug: `newest-messages-b-${Date.now()}`, name: "Newest messages B" });
  ({ client: member, userId: memberId } = await memberClient("viewer", A));
  ({ client: stranger } = await memberClient("owner", B));

  // A long thread of a hundred and thirty, the newest a minute ago; a short one of three, hours ago; and one whose
  // three messages were stored in the same instant, as history moved in is.
  threads.long = await thread(A);
  threads.short = await thread(A);
  threads.tied = await thread(A);
  await wrote("long", written(A, threads.long, 130, 1));
  await wrote("short", written(A, threads.short, 3, 200));
  const instant = minutesAgo(300);
  await wrote("tied", written(A, threads.tied, 3, 300, { created_at: instant }));
  // Eleven more of a hundred and ten each, a day ago: with the three above, more than a thousand to read at once.
  threads.more = [];
  for (let i = 0; i < 11; i++) threads.more.push(await thread(A));
  const more = threads.more.flatMap((t, i) => written(A, t, 110, 24 * 60 + i * 200));
  const m = await db.from("messages").insert(more);
  assert.equal(m.error, null, `seeding the eleven: ${m.error?.message}`);

  // B's own thread, so the stranger's empty answer about A is the floor and not a call that cannot work.
  threads.theirs = await thread(B);
  await wrote("theirs", written(B, threads.theirs, 2, 5));
});

after(async () => {
  if (skip) return;
  if (A) await db.from("tenants").delete().eq("id", A);
  if (B) await db.from("tenants").delete().eq("id", B);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** newest_messages as this client, as the reader calls it unless told otherwise. */
const call = (client, ts, { tenant = A, each = 100, most = 4000 } = {}) =>
  client.rpc("newest_messages", { p_tenant_id: tenant, p_threads: ts, p_each: each, p_most: most });

/** Its answer, which must not be an error. */
async function newest(client, ts, opts) {
  const r = await call(client, ts, opts);
  assert.equal(r.error, null, r.error?.message);
  return r.data;
}

const idsOf = (rows) => rows.map((r) => r.id);

test("a member reads each thread's newest hundred, newest first, in the reader's columns", { skip }, async () => {
  const rows = await newest(member, [threads.long.id, threads.short.id]);
  assert.deepEqual(
    idsOf(rows),
    [...said.long.slice(0, 100), ...said.short].map((m) => m.id),
    "the long thread's newest hundred of its hundred and thirty, then the short thread's three",
  );
  assert.deepEqual(Object.keys(rows[0]).sort(), MESSAGE_COLUMNS.split(", ").sort(), "the columns the reader selects");
  const [first] = rows;
  assert.deepEqual(
    [first.conversation_id, first.direction, first.sender, first.type, first.body, first.status, first.channel],
    [threads.long.id, "inbound", "customer", "text", "word 0", "received", "whatsapp"],
  );
  assert.equal(Date.parse(first.created_at), Date.parse(said.long[0].created_at));
});

test("of each thread's newest, the newest across them all, however many the threads hold", { skip }, async () => {
  assert.deepEqual(
    idsOf(await newest(member, [threads.short.id, threads.long.id], { most: 102 })),
    [...said.long.slice(0, 100), ...said.short.slice(0, 2)].map((m) => m.id),
    "the hundred and two newest of the hundred and three",
  );
  assert.deepEqual(
    idsOf(await newest(member, [threads.long.id, threads.short.id], { each: 2 })),
    [...said.long.slice(0, 2), ...said.short.slice(0, 2)].map((m) => m.id),
    "two of each",
  );
  assert.deepEqual(
    idsOf(await newest(member, [threads.short.id, threads.short.id])),
    idsOf(said.short),
    "a thread named twice is read once",
  );
});

test(
  "messages stored in the same instant come in the order of their ids, and the limit keeps the highest",
  { skip },
  async () => {
    const ids = idsOf(said.tied); // one instant, so the highest id first
    assert.deepEqual(idsOf(await newest(member, [threads.tied.id])), ids);
    assert.deepEqual(idsOf(await newest(member, [threads.tied.id], { each: 2 })), ids.slice(0, 2));
  },
);

test(
  "past a hundred threads, a hundred of each or four thousand in all it refuses; a null argument answers null",
  { skip },
  async () => {
    const hundredAndOne = Array.from({ length: 101 }, (_, i) =>
      i === 0 ? threads.long.id : `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    for (const [ts, opts, what] of [
      [hundredAndOne, {}, "a hundred and one threads"],
      [[threads.long.id], { each: 0 }, "none of each"],
      [[threads.long.id], { each: 101 }, "a hundred and one of each"],
      [[threads.long.id], { most: 0 }, "none in all"],
      [[threads.long.id], { most: 4001 }, "four thousand and one in all"],
    ]) {
      const r = await call(member, ts, opts);
      assert.equal(r.data, null, what);
      assert.equal(r.error?.code, "22023", `${what}: ${r.error?.message}`);
    }
    const blank = await call(member, [threads.long.id], { each: null });
    assert.equal(blank.error, null, blank.error?.message);
    assert.equal(blank.data, null, "strict: null in, null out");
  },
);

test(
  "a member of another workspace reads nothing of this one, even naming it; anon cannot call it",
  { skip },
  async () => {
    const ours = [threads.long.id, threads.short.id];
    assert.deepEqual(await newest(stranger, ours), [], "RLS answers for the workspace they do not belong to");
    assert.deepEqual(
      idsOf(await newest(stranger, [threads.theirs.id], { tenant: B })),
      idsOf(said.theirs),
      "their own, they read",
    );
    assert.deepEqual(await newest(member, [threads.theirs.id], { tenant: B }), [], "and the other way round");
    assert.deepEqual(
      await newest(member, [threads.theirs.id]),
      [],
      "a thread of another workspace, under this one's name",
    );
    const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const r = await call(anon, ours);
    assert.equal(r.data, null);
    assert.equal(r.error?.code, "42501", r.error?.message);
    assert.match(r.error?.message ?? "", /permission denied for function newest_messages/);
  },
);

test(
  "the Inbox's read, on the member's own session, holds each thread's newest -- more than PostgREST's thousand rows, from one call",
  { skip },
  async () => {
    const rc = kernel.readerContext(
      { supabase: member, userId: memberId, email: "member@example.com", params: {} },
      { tenantId: A, role: "viewer" },
    );
    const read = await kernel.load(rc, conversations, { ids: null });
    const held = new Map(read.data.conversations.map((c) => [c.id, c.messages.length]));
    assert.deepEqual([held.get(threads.long.id), held.get(threads.short.id), held.get(threads.tied.id)], [100, 3, 3]);
    assert.deepEqual(
      threads.more.map((t) => held.get(t.id)),
      Array(11).fill(100),
      "every one of the eleven its newest hundred",
    );
    const all = [...held.values()].reduce((n, x) => n + x, 0);
    assert.equal(all, 1206, "twelve hundred and six messages: past a thousand, from one call");
    const long = read.data.conversations.find((c) => c.id === threads.long.id);
    assert.deepEqual(
      long.messages.map((m) => m.id),
      idsOf(said.long.slice(0, 100)).reverse(),
      "in reading order, oldest of the hundred first",
    );
  },
);

/** The blocks this transaction has read from messages so far, from its heap and every one of its indexes. */
const BLOCKS = `(coalesce(pg_stat_get_xact_blocks_fetched('public.messages'::regclass), 0)
  + coalesce((select sum(pg_stat_get_xact_blocks_fetched(x.indexrelid))
                from pg_index x where x.indrelid = 'public.messages'::regclass), 0))::bigint`;

/** Messages `a` to `b` on each of the twenty threads, twenty minutes apart on each, interleaved as they come. */
const history = (a, b) => `
  insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at)
    select t, c.id, c.contact_id, 'whatsapp', 'inbound', 'customer', 'text', 'word ' || k, 'received',
           now() - make_interval(mins => k * 20 + c.n::int)
      from (select v.id, v.contact_id, row_number() over (order by v.id) as n
              from public.conversations v where v.id = any (ts)) c,
           generate_series(${a}, ${b}) k
     order by k desc, c.n;`;

test("newest_messages reads the same blocks of messages however long each thread's history is", { skip }, () => {
  const { cost, held, same } = rolledBack(`
      declare
        t uuid; ts uuid[]; before bigint; cost jsonb := '{}'; shorter json; longer json;
      begin
        insert into public.tenants (slug, name) values ('newest-messages-plan-' || gen_random_uuid(), 'Plan')
          returning id into t;
        with k as (insert into public.contacts (tenant_id) select t from generate_series(1, 220) returning id)
        insert into public.conversations (tenant_id, contact_id) select t, k.id from k;
        select array_agg(v.id) into ts
          from (select v.id from public.conversations v where v.tenant_id = t order by v.id limit 20) v;
        -- Two hundred quieter threads of forty messages, a year ago. The planner judges every thread by the average
        -- one, fifty messages here and then seventy-seven, under the limit of a hundred, as a workspace's are: it
        -- expects no thread to be cut short, and would take each of the busy ones whole and sort it.
        insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at)
          select t, v.id, v.contact_id, 'whatsapp', 'inbound', 'customer', 'text', 'hello', 'received',
                 now() - interval '365 days' - make_interval(mins => k)
            from public.conversations v, generate_series(1, 40) k
           where v.tenant_id = t and v.id <> all (ts);
        -- The twenty, a hundred and fifty each.
        ${history(1, 150)}
        analyze public.messages;
        perform set_config('enable_seqscan', 'off', true);
        before := ${BLOCKS};
        shorter := public.newest_messages(t, ts, 100, 4000);
        cost := cost || jsonb_build_object('beside_150', ${BLOCKS} - before);
        perform set_config('enable_seqscan', 'on', true);
        -- Three hundred older on each: every thread's history three times as long, and its newest hundred the same.
        ${history(151, 450)}
        analyze public.messages;
        perform set_config('enable_seqscan', 'off', true);
        before := ${BLOCKS};
        longer := public.newest_messages(t, ts, 100, 4000);
        cost := cost || jsonb_build_object('beside_450', ${BLOCKS} - before);
        seen := jsonb_build_object('cost', cost, 'held', json_array_length(shorter), 'same', shorter::jsonb = longer::jsonb);
      end;
    `);
  assert.equal(held, 2000, "twenty threads, a hundred of each");
  assert.equal(same, true, "the same newest hundred of each, whatever came before them");
  const small = cost.beside_150;
  const large = cost.beside_450;
  assert.ok(small > 0, "messages is read at all");
  assert.ok(
    large <= small * 1.5 + 5,
    `newest_messages read ${small} blocks of messages beside threads of 150 and ${large} beside threads of 450 ` +
      "(a read that takes each thread whole grows with its history)",
  );
});
