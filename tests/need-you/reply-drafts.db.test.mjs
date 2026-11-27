/**
 * Ask's drafts written ahead (decision 0071, 00475, 00538) -- on a real database. What only Postgres can answer: the
 * door keeps one draft a thread and kind, the newest words over the last, and only over a row for the same message (a
 * slow run answers null rather than write over a newer message's claim); it is the service role's, as AI writes them,
 * and the member's door it replaced is gone (00723); it writes only on a thread of the workspace it names; and the drafts
 * are read under RLS by the workspace's members alone, never written straight into the table.
 *
 * Skipped without a local database.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let operator; // acts in A
let viewer; // reads A, sends nothing
let stranger; // owns B
let thread; // A's thread waiting on a person
let said; // what they wrote last on it
let said2; // what they wrote after it
let other; // B's thread
const users = [];

async function memberClient(role, tenant) {
  const email = `drafts-${role}-${stamp}-${Math.random().toString(36).slice(2, 7)}@example.com`;
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

/** A workspace with one person and their thread. */
async function workspace(tag) {
  const t = await db
    .from("tenants")
    .insert({ slug: `drafts-${tag}-${stamp}`, name: `drafts ${tag}` })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  const k = await db
    .from("contacts")
    .insert({ tenant_id: t.data.id, phone_e164: `+1305555${String(Date.now()).slice(-4)}` })
    .select("id")
    .single();
  assert.equal(k.error, null, k.error?.message);
  const c = await db
    .from("conversations")
    .insert({ tenant_id: t.data.id, contact_id: k.data.id, state: "needs_human" })
    .select("id")
    .single();
  assert.equal(c.error, null, c.error?.message);
  return { tenant: t.data.id, contact: k.data.id, conversation: c.data.id };
}

async function message(w, body) {
  const m = await db
    .from("messages")
    .insert({
      tenant_id: w.tenant,
      conversation_id: w.conversation,
      contact_id: w.contact,
      channel: "sms",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body,
      status: "received",
    })
    .select("id")
    .single();
  assert.equal(m.error, null, m.error?.message);
  return m.data.id;
}

const words = (text) => ({ text, subject: "", brief: null, asks: [] });
/** A draft written as AI writes one: through conversation_draft_write, the service role's (00538). */
const write = (client, args) =>
  client.rpc("conversation_draft_write", {
    p_tenant_id: A,
    p_conversation_id: thread,
    p_kind: "reply",
    p_for_message_id: said,
    p_state: "ready",
    p_words: words("Friday works."),
    p_source: "hold",
    p_rules: 1,
    ...args,
  });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const a = await workspace("a");
  const b = await workspace("b");
  A = a.tenant;
  B = b.tenant;
  thread = a.conversation;
  other = b.conversation;
  said = await message(a, "Can I move Friday?");
  said2 = await message(a, "Or Saturday, if Friday is full.");
  operator = await memberClient("operator", A);
  viewer = await memberClient("viewer", A);
  stranger = await memberClient("owner", B);
});

after(async () => {
  if (skip) return;
  for (const id of [A, B]) if (id) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the door keeps one draft a thread and kind: the newest words over the last, for the same message",
  { skip },
  async () => {
    const first = await write(db, {});
    assert.equal(first.error, null, first.error?.message);
    assert.equal(first.data.for_message_id, said);
    assert.deepEqual(first.data.words, words("Friday works."));
    const again = await write(db, { p_words: words("Friday at ten works.") });
    assert.equal(again.error, null, again.error?.message);
    // A slow run for another message finds the row the newer claim holds, and answers null rather than write over it.
    const slow = await write(db, { p_words: words("Saturday works too."), p_for_message_id: said2 });
    assert.equal(slow.error, null, slow.error?.message);
    assert.equal(slow.data, null);
    const rows = await operator.from("conversation_drafts").select("kind, for_message_id, words").eq("tenant_id", A);
    assert.equal(rows.error, null, rows.error?.message);
    assert.deepEqual(rows.data, [{ kind: "reply", for_message_id: said, words: words("Friday at ten works.") }]);
    const brief = await write(db, {
      p_kind: "brief",
      p_words: { text: "", subject: "", brief: { opening: "Hi", points: [], avoid: [], ask: "" }, asks: [] },
    });
    assert.equal(brief.error, null, brief.error?.message);
    const kinds = await operator.from("conversation_drafts").select("kind").eq("tenant_id", A).order("kind");
    assert.deepEqual(
      kinds.data.map((r) => r.kind),
      ["brief", "reply"],
      "a reply and a brief side by side",
    );
  },
);

test(
  "a member writes no draft: the door is the service role's, and the member's old door is gone",
  { skip },
  async () => {
    const member = await write(operator, { p_words: words("A member's words.") });
    assert.ok(member.error, "a member may not call conversation_draft_write");
    const old = await operator.rpc("conversation_draft_keep", {
      p_tenant_id: A,
      p_conversation_id: thread,
      p_kind: "reply",
      p_words: words("The old door's words."),
      p_for_message_id: said,
    });
    assert.ok(old.error, "conversation_draft_keep is dropped (00723)");
    const left = await db.from("conversation_drafts").select("words").eq("tenant_id", A).eq("kind", "reply").single();
    assert.equal(left.error, null, left.error?.message);
    assert.equal(left.data.words.text, "Friday at ten works.");
  },
);

test("a draft is written on a thread of the workspace it names, and is one draft's size", { skip }, async () => {
  const across = await write(db, { p_conversation_id: other, p_for_message_id: null });
  assert.equal(across.error, null, across.error?.message);
  assert.equal(across.data, null, "B's thread is not A's: nothing is written");
  const theirs = await db.from("conversation_drafts").select("id").eq("conversation_id", other);
  assert.deepEqual(theirs.data, []);
  const huge = await write(db, { p_words: words("x".repeat(20_000)) });
  assert.equal(huge.error?.code, "22023", "a draft's words, not a document");
  const notObject = await write(db, { p_words: ["Friday works."] });
  assert.equal(notObject.error?.code, "22023");
});

test("the drafts are read by the workspace's members alone, and written only through the door", { skip }, async () => {
  const seen = await viewer.from("conversation_drafts").select("kind").eq("tenant_id", A);
  assert.equal(seen.error, null, seen.error?.message);
  assert.ok(seen.data.length > 0, "a viewer reads them, as the rows show them");
  const strangers = await stranger.from("conversation_drafts").select("kind").eq("tenant_id", A);
  assert.deepEqual(strangers.data, [], "another workspace's member reads none");
  const straight = await operator
    .from("conversation_drafts")
    .insert({ tenant_id: A, conversation_id: thread, kind: "reply", words: words("Straight in.") });
  assert.ok(straight.error, "a member writes no row straight into the table");
  const gone = await db.from("conversations").delete().eq("id", thread);
  assert.equal(gone.error, null, gone.error?.message);
  const after = await db.from("conversation_drafts").select("kind").eq("conversation_id", thread);
  assert.deepEqual(after.data, [], "a thread's drafts go with it");
});
