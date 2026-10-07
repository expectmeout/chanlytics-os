/**
 * A thread is answered one turn at a time (00284), on a real Postgres. Two messages from one customer a moment apart
 * were each answered on their own, the first written without the second in view (the scorecard's category 15). Now a
 * message about to be answered claims its thread's reply turn, and the newest message holds it: an older one that
 * comes to claim after it is told no, and one that held it is told so by holds_reply_turn once a newer one has taken it,
 * which is what stops its words going out. Moving the turn withdraws the receptionist's drafts the older turn left
 * waiting (its veto window, its confidence hold), and nobody else's.
 *
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes messages and cancels drafts"
      : false;

let db;
let T;
let seq = 0;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `turns-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "turns" })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  T = data.id;
});

after(async () => {
  if (skip) return;
  if (T) await db.from("tenants").delete().eq("id", T);
});

/** A thread with its customer, ready for messages. */
async function thread() {
  seq += 1;
  const contact = await db
    .from("contacts")
    .insert({ tenant_id: T, phone_e164: `+1555018${String(seq).padStart(4, "0")}` })
    .select("id")
    .single();
  assert.equal(contact.error, null, contact.error?.message);
  const conversation = await db
    .from("conversations")
    .insert({ tenant_id: T, contact_id: contact.data.id })
    .select("id")
    .single();
  assert.equal(conversation.error, null, conversation.error?.message);
  return { conversation: conversation.data.id, contact: contact.data.id };
}

let at = Date.parse("2026-09-29T12:00:00Z");
/** One message of the thread, its recorded time set so the order is the test's; its id back. */
async function message(th, over = {}) {
  at += 1000;
  const { data, error } = await db
    .from("messages")
    .insert({
      tenant_id: T,
      conversation_id: th.conversation,
      contact_id: th.contact,
      channel: "whatsapp",
      direction: "inbound",
      sender: "customer",
      body: "hello",
      status: "received",
      created_at: new Date(at).toISOString(),
      ...over,
    })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

const claim = (th, m) => db.rpc("claim_reply_turn", { p_tenant: T, p_conversation: th.conversation, p_message: m });
const holds = (th, m) => db.rpc("holds_reply_turn", { p_conversation: th.conversation, p_message: m });
const statusOf = async (id) => (await db.from("messages").select("status, error").eq("id", id).single()).data;

test("the first message of a thread takes its turn, and asking again is the same answer", async (t) => {
  if (skip) return t.skip(skip);
  const th = await thread();
  const m1 = await message(th);
  assert.equal(
    (await holds(th, m1)).data,
    true,
    "a thread with no claim is anybody's: a claim that was never made drops no reply",
  );
  assert.deepEqual(await claim(th, m1).then((r) => [r.error, r.data]), [null, true]);
  assert.equal((await claim(th, m1)).data, true, "claimed again by the same message: still its turn");
  assert.equal((await holds(th, m1)).data, true);
});

test("the newest message takes the turn from an older one, and an older one that claims late is told no", async (t) => {
  if (skip) return t.skip(skip);
  const th = await thread();
  const older = await message(th);
  const newer = await message(th);

  assert.equal((await claim(th, older)).data, true);
  assert.equal((await claim(th, newer)).data, true, "the newer message answers both");
  assert.equal((await holds(th, older)).data, false, "so the older one, asked again before it sends, has lost it");
  assert.equal((await holds(th, newer)).data, true);

  assert.equal((await claim(th, older)).data, false, "an older message that comes to claim after the newer holds it");
  assert.equal((await holds(th, newer)).data, true, "and does not take it back");
});

test("holds_reply_turn is the claim's own rule: only a NEWER message that has taken the turn makes it false", async (t) => {
  if (skip) return t.skip(skip);
  const th = await thread();
  const older = await message(th);
  const newer = await message(th);
  // The claim failed open for the newer message (the edge could not reach the database): the row names the older one.
  assert.equal((await claim(th, older)).data, true);
  assert.equal(
    (await holds(th, newer)).data,
    true,
    "the older message's row is no reason to drop the newer one's reply",
  );
  assert.equal((await holds(th, older)).data, true, "and the older one, whose turn nobody has taken, still holds it");
  // A message the database does not know is nobody's to drop.
  assert.equal(
    (await holds(th, "00000000-0000-4000-8000-000000000000")).data,
    true,
    "asking about a message it cannot find fails open",
  );
  // Now the newer message does take it.
  assert.equal((await claim(th, newer)).data, true);
  assert.equal((await holds(th, older)).data, false);
  assert.equal((await holds(th, newer)).data, true);
  // And when the message that held it is gone (erased), the turn is nobody's again.
  const gone = await db.from("messages").delete().eq("id", newer);
  assert.equal(gone.error, null, gone.error?.message);
  assert.equal((await holds(th, older)).data, true);
});

test("moving the turn withdraws the receptionist's drafts the older turn left waiting, and nothing else", async (t) => {
  if (skip) return t.skip(skip);
  const th = await thread();
  const older = await message(th);
  const draft = (source, over = {}) =>
    message(th, {
      direction: "outbound",
      sender: "ai",
      status: "queued",
      body: "We open at 9.",
      meta: { source },
      ...over,
    });
  const veto = await draft("veto_window");
  const unsure = await draft("low_confidence");
  const steered = await draft("steered");
  const person = await draft("veto_window", { sender: "human" });
  const sent = await draft("veto_window", { status: "sent" });
  const newer = await message(th);

  assert.equal((await claim(th, older)).data, true);
  assert.equal((await claim(th, newer)).data, true);

  for (const id of [veto, unsure]) {
    const row = await statusOf(id);
    assert.equal(row.status, "canceled", "a draft waiting to go is not sent after the newer reply");
    assert.deepEqual(row.error, { reason: "superseded_by_newer_message", by: newer });
  }
  for (const [what, id] of [
    ["an owner's steered reply", steered],
    ["a person's queued message", person],
    ["a reply already sent", sent],
  ]) {
    assert.notEqual((await statusOf(id)).status, "canceled", `${what} is not the receptionist's waiting draft`);
  }
});

test("two claims at once end with exactly one message holding the turn, and it is the newest", async (t) => {
  if (skip) return t.skip(skip);
  for (let round = 0; round < 8; round += 1) {
    const th = await thread();
    const older = await message(th);
    const newer = await message(th);
    const [a, b] = await Promise.all([claim(th, older), claim(th, newer)]);
    assert.equal(a.error, null, a.error?.message);
    assert.equal(b.error, null, b.error?.message);
    assert.equal(b.data, true, `round ${round}: the newest is never refused`);
    assert.equal((await holds(th, newer)).data, true);
    assert.equal((await holds(th, older)).data, false, `round ${round}: and the older one does not hold it too`);
  }
});

test("a message that is not in the thread of the workspace named cannot claim it", async (t) => {
  if (skip) return t.skip(skip);
  const th = await thread();
  const other = await thread();
  const stranger = await message(other);
  const r = await claim(th, stranger);
  assert.match(r.error?.message ?? "", /is not in thread/);
  const foreign = await db.rpc("claim_reply_turn", {
    p_tenant: "00000000-0000-4000-8000-000000000000",
    p_conversation: other.conversation,
    p_message: stranger,
  });
  assert.match(foreign.error?.message ?? "", /is not in thread/, "nor one named under another workspace");
});

test("the turn is the service role's alone: no session, signed in or not, may take or read one", async (t) => {
  if (skip) return t.skip(skip);
  if (!ANON) return t.skip("no SUPABASE_ANON_KEY in env");
  const th = await thread();
  const m = await message(th);
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const c = await anon.rpc("claim_reply_turn", { p_tenant: T, p_conversation: th.conversation, p_message: m });
  const h = await anon.rpc("holds_reply_turn", { p_conversation: th.conversation, p_message: m });
  assert.ok(c.error && h.error, "both doors refuse a caller that is not the service role");
  const rows = await anon.from("reply_turns").select("*");
  assert.ok(rows.error || (rows.data ?? []).length === 0, "and the table shows nothing to a session");
  const held = await db.from("reply_turns").select("message_id").eq("conversation_id", th.conversation);
  assert.deepEqual(held.data, [], "the refused claim took nothing");
});
