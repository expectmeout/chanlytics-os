/**
 * A word a customer wrote or said is found -- on a real database, as the person.
 *
 * 00218 indexes messages.body and calls.transcript (to_tsvector('simple', ...)) and reads them through
 * search_messages, which runs as its caller, so RLS decides what it answers. What reading the SQL cannot prove, this
 * does: a member finds a word in a message and in a call's transcript, each as its kind, newest first, with the words
 * around it and no markup; a Spanish word is found as it was written; the day bound, the cap and blank words hold; a
 * quoted phrase, `or` and `-word` mean what websearch_to_tsquery says; a member of another workspace finds nothing of
 * this one even naming it; anon cannot call it; and the plan the function runs reads both indexes.
 *
 * The sessions are real, as tenancy.db.test.mjs makes them: users made with the admin API sign in with a password
 * through the anon key. The plan is read inside one transaction through the CLI that never commits, as
 * sweep-registry.db.test.mjs turns a clock; SUPABASE_CLI names the binary when `supabase` is not on PATH. Against the
 * database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, messages and calls"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

/**
 * A transaction on this machine's database that never commits. `body` runs inside a DO block that ends by raising
 * what it `seen`, so everything the block did goes with it. No other suite ever reads any of it.
 */
function rolledBack(body) {
  // What the block saw leaves as hex: however the CLI dresses a database error
  // -- a line of JSON here, plain text with more lines after it on CI's Linux --
  // nothing it adds can escape hex or run on into it.
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

const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

let db;
let A; // the workspace under test
let B; // another workspace
const users = [];
let member; // a viewer of A: the least a member may be, and RLS reads the same for every role
let stranger; // an owner of B
const ids = {};

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant) {
  const email = `text-search-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

async function seed(table, row) {
  const r = await db.from(table).insert(row).select("id").single();
  assert.equal(r.error, null, `seeding ${table}: ${r.error?.message}`);
  return r.data.id;
}

async function tenant(name) {
  return seed("tenants", { slug: `text-search-${name}-${Date.now()}`, name: `Text search ${name}` });
}

/** A message on A's first thread, as the customer or as the workspace, `days` ago. */
const said = (body, days, over = {}) => ({
  tenant_id: A,
  conversation_id: ids.conversation,
  contact_id: ids.contact,
  channel: "whatsapp",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  status: "received",
  created_at: ago(days),
  ...over,
});

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await tenant("a");
  B = await tenant("b");
  member = await memberClient("viewer", A);
  stranger = await memberClient("owner", B);

  ids.contact = await seed("contacts", { tenant_id: A, phone_e164: "+15550002101" });
  ids.conversation = await seed("conversations", { tenant_id: A, contact_id: ids.contact });
  const reply = said("Yes, the parking is behind the building, next to the bakery. It is free after six.", 1, {
    direction: "outbound",
    sender: "ai",
    status: "sent",
  });
  ids.replyAt = reply.created_at;
  ids.reply = await seed("messages", reply);
  ids.callAt = ago(1.5);
  ids.call = await seed("calls", {
    tenant_id: A,
    retell_call_id: `call_text_search_${Date.now()}`,
    contact_id: ids.contact,
    conversation_id: ids.conversation,
    direction: "inbound",
    started_at: ids.callAt,
    transcript:
      "Agent: Thanks for calling, how can I help? User: Hi, I am coming by car on Friday. Is there parking on the street near the salon? Agent: Yes, right outside.",
  });
  ids.valet = await seed("messages", said("Do you offer valet parking on Saturdays?", 2, { channel: "sms" }));
  ids.ask = await seed("messages", said("Hi! Is there parking near the salon? I will come by car.", 3));
  ids.summary = await seed(
    "messages",
    said("Call summary: the caller asked about parking and booked a cut for Friday.", 5, {
      channel: "voice",
      sender: "system",
      type: "call_summary",
    }),
  );
  ids.old = await seed("messages", said("Where is the parking, please?", 40));
  ids.bank = await seed("messages", said("The building behind ours is a bank, not the salon.", 4));
  ids.spanish = await seed("messages", said("Nos vemos mañana a las cinco, ¿está bien?", 0.25));
  // More hits than the cap: fifty-five notes of one word, a minute apart, a week ago.
  const crowd = Array.from({ length: 55 }, (_, i) =>
    said(`Lobby note ${i}: the lobby was busy`, 7, {
      created_at: new Date(Date.now() - 7 * DAY - i * 60_000).toISOString(),
    }),
  );
  const c = await db.from("messages").insert(crowd);
  assert.equal(c.error, null, c.error?.message);

  // B's own word, so the stranger's empty answer about A is the floor and not a call that cannot work.
  const bContact = await seed("contacts", { tenant_id: B, phone_e164: "+15550002102" });
  const bConversation = await seed("conversations", { tenant_id: B, contact_id: bContact });
  ids.theirs = await seed("messages", {
    ...said("Is there parking at the other place?", 1),
    tenant_id: B,
    conversation_id: bConversation,
    contact_id: bContact,
  });
});

after(async () => {
  if (skip) return;
  if (A) await db.from("tenants").delete().eq("id", A);
  if (B) await db.from("tenants").delete().eq("id", B);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** search_messages as this client, and the rows it answered. */
async function search(client, words, { tenant = A, since = ago(30), limit = 50 } = {}) {
  const r = await client.rpc("search_messages", { p_tenant: tenant, p_words: words, p_since: since, p_limit: limit });
  assert.equal(r.error, null, r.error?.message);
  return r.data;
}

const idsOf = (rows) => rows.map((r) => r.id);

test(
  "a member finds a word in a message and in a call's transcript, each as its kind, newest first",
  { skip },
  async () => {
    const rows = await search(member, "parking");
    assert.deepEqual(idsOf(rows), [ids.reply, ids.call, ids.valet, ids.ask, ids.summary]);
    assert.deepEqual(
      rows.map((r) => r.kind),
      ["message", "call", "message", "message", "message"],
      "a call_summary message is a message hit; a transcript hit is its call",
    );
    const [reply, call] = rows;
    assert.deepEqual(
      { ...reply, snippet: undefined },
      {
        kind: "message",
        id: ids.reply,
        conversation_id: ids.conversation,
        contact_id: ids.contact,
        channel: "whatsapp",
        direction: "outbound",
        at: reply.at,
        snippet: undefined,
      },
    );
    assert.deepEqual(
      { ...call, snippet: undefined, at: undefined },
      {
        kind: "call",
        id: ids.call,
        conversation_id: ids.conversation,
        contact_id: ids.contact,
        channel: null,
        direction: "inbound",
        at: undefined,
        snippet: undefined,
      },
      "a call has no channel of its own",
    );
    assert.equal(Date.parse(reply.at), Date.parse(ids.replyAt), "a message is when it was written");
    assert.equal(Date.parse(call.at), Date.parse(ids.callAt), "a call is when it started");
    for (const r of rows) {
      assert.match(r.snippet, /\bparking\b/i, `the words around the match hold the word: ${r.snippet}`);
      assert.doesNotMatch(r.snippet, /[<>]/, `no markup: ${r.snippet}`);
      assert.ok(r.snippet.split(/\s+/).length > 3, `more than the word itself: ${r.snippet}`);
    }
    assert.match(call.snippet, /by car on Friday\. Is there parking on the street/, "a transcript's words, as said");
  },
);

test("a Spanish word with an accent is found as it was written", { skip }, async () => {
  const rows = await search(member, "mañana");
  assert.deepEqual(idsOf(rows), [ids.spanish]);
  assert.match(rows[0].snippet, /mañana/);
  assert.deepEqual(await search(member, "MAÑANA").then(idsOf), [ids.spanish], "in any case");
  assert.deepEqual(await search(member, "manana"), [], "'simple' keeps the accent: the word as written, not a guess");
});

test("the day bound excludes an older hit, and a wider one takes it in", { skip }, async () => {
  assert.ok(!idsOf(await search(member, "parking")).includes(ids.old), "forty days ago is outside thirty");
  const wider = idsOf(await search(member, "parking", { since: ago(60) }));
  assert.equal(wider.at(-1), ids.old, "inside sixty, and the oldest");
});

test("the limit caps: the newest few, at least one, at most fifty", { skip }, async () => {
  assert.deepEqual(idsOf(await search(member, "parking", { limit: 2 })), [ids.reply, ids.call]);
  assert.deepEqual(idsOf(await search(member, "parking", { limit: 0 })), [ids.reply], "a limit under one is one");
  const crowd = await search(member, "lobby", { limit: 500 });
  assert.equal(crowd.length, 50, "fifty-five hits, fifty answered");
  assert.ok(
    crowd.every((r, i) => i === 0 || Date.parse(crowd[i - 1].at) >= Date.parse(r.at)),
    "newest first",
  );
});

test("blank words, or words that only exclude, answer nothing", { skip }, async () => {
  assert.deepEqual(await search(member, ""), []);
  assert.deepEqual(await search(member, "   "), []);
  assert.deepEqual(await search(member, "-parking"), [], "nothing to find, not everything without the word");
  assert.deepEqual(await search(member, "!!!"), [], "punctuation is no word");
});

test("a quoted phrase, `or` and -word mean what websearch_to_tsquery says", { skip }, async () => {
  assert.deepEqual(idsOf(await search(member, "parking -valet")), [ids.reply, ids.call, ids.ask, ids.summary]);
  assert.deepEqual(
    idsOf(await search(member, "behind the building")),
    [ids.reply, ids.bank],
    "the words, in any order",
  );
  assert.deepEqual(idsOf(await search(member, '"behind the building"')), [ids.reply], "the phrase, in its order");
  assert.deepEqual(idsOf(await search(member, "valet or mañana")), [ids.spanish, ids.valet]);
  assert.deepEqual(idsOf(await search(member, 'parking "on Saturdays')), [ids.valet], "an unclosed quote is safe");
});

test("a member of another workspace finds nothing of this one, even naming it", { skip }, async () => {
  assert.deepEqual(await search(stranger, "parking"), [], "RLS answers for the workspace they do not belong to");
  assert.deepEqual(await search(stranger, "parking", { tenant: B }).then(idsOf), [ids.theirs], "their own, they find");
  assert.deepEqual(await search(member, "parking", { tenant: B }), [], "and the other way round");
});

test("anon cannot call it", { skip }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await anon.rpc("search_messages", { p_tenant: A, p_words: "parking", p_since: ago(30), p_limit: 50 });
  assert.equal(r.data, null);
  assert.equal(r.error?.code, "42501", r.error?.message);
  // The function refuses, not the table under it: anon reads no table either, so a grant to anon would still end in
  // 42501, one step later, for `messages`.
  assert.match(r.error?.message ?? "", /permission denied for function search_messages/);
});

test("the function's own query reads both indexes for a rare word in a busy workspace", { skip }, () => {
  // The function is not inlined (its search_path is set), so no outer query's plan shows its tables. This plans the
  // function's own text, as the database holds it, with a workspace, a day bound, a rare word and the cap in place of
  // its parameters, sequential scans off. Two thousand messages and calls in that workspace, analyzed inside the block,
  // so the plan is chosen against tables that hold something: on empty ones the workspace's (tenant_id, created_at)
  // index wins by a hair. What this proves is that each predicate spells its index's expression, so the index is there
  // to be chosen. Planned without its words (Postgres 17 plans a SQL function's statements that way), the planner may
  // still walk the workspace's newest rows instead and stop at the cap: its call, by cost.
  const seen = rolledBack(`
    declare
      t uuid;
      k uuid;
      v uuid;
      src text;
      line text;
      plan text[] := '{}';
    begin
      insert into public.tenants (slug, name) values ('text-search-plan-' || gen_random_uuid(), 'Plan') returning id into t;
      insert into public.contacts (tenant_id, phone_e164) values (t, '+15550002199') returning id into k;
      insert into public.conversations (tenant_id, contact_id) values (t, k) returning id into v;
      insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, created_at)
        select t, v, k, 'whatsapp', 'inbound', 'customer', 'text', 'word' || i || ' and the rest of a message', 'received',
               now() - make_interval(mins => i)
          from generate_series(1, 2000) i;
      insert into public.calls (tenant_id, retell_call_id, transcript, started_at)
        select t, 'text_search_plan_' || i, 'Agent: hello. User: word' || i || ' please', now() - make_interval(mins => i)
          from generate_series(1, 2000) i;
      analyze public.messages;
      analyze public.calls;
      perform set_config('enable_seqscan', 'off', true);
      select replace(replace(replace(replace(p.prosrc,
               'p_tenant', quote_literal(t) || '::uuid'),
               'p_words', quote_literal('word17')),
               'p_since', quote_literal(now() - interval '30 days') || '::timestamptz'),
               'p_limit', '50')
        into src
        from pg_proc p
       where p.oid = 'public.search_messages(uuid, text, timestamptz, integer)'::regprocedure;
      for line in execute 'explain ' || src loop
        plan := plan || line;
      end loop;
      seen := jsonb_build_object('plan', to_jsonb(plan));
    end;
  `);
  const plan = seen.plan.join("\n");
  assert.match(plan, /Bitmap Index Scan on messages_body_words/, plan);
  assert.match(plan, /Bitmap Index Scan on calls_transcript_words/, plan);
  assert.match(plan, /Index Cond: \(to_tsvector\('simple'::regconfig, COALESCE\(body, ''::text\)\) @@/, plan);
  assert.match(plan, /Index Cond: \(to_tsvector\('simple'::regconfig, COALESCE\(transcript, ''::text\)\) @@/, plan);
  assert.doesNotMatch(plan, /Seq Scan on (messages|calls)/, plan);
});
