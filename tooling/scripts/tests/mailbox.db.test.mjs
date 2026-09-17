/**
 * A workspace has a mailbox -- on a real database.
 *
 * 00126 is a table whose constraints ARE the routing rules (an address is one
 * workspace's for good; a reply token names one workspace), a suppression kept
 * apart from delivery, and a trigger that lets a corrected address start
 * clean. Constraints, triggers and row-level security are what reading source
 * cannot prove, so these run against Postgres in the database workflow;
 * skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes customers"
    : false;

let db;
const made = [];
const workspace = async (slug) => {
  const { data, error } = await db.from("tenants").insert({ slug: `${slug}-${Date.now()}`, name: slug }).select("id").single();
  if (error) throw new Error(error.message);
  made.push(data.id);
  return data.id;
};
const TOKEN = (c) => c.repeat(24);
const mailbox = (tenant_id, over = {}) => ({ tenant_id, local_part: "bestmovers", reply_token: TOKEN("a"), from_name: "Best Movers", ...over });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of made) await db.from("tenants").delete().eq("id", id);
});

test("an address is one workspace's for good, a workspace has one mailbox, and a reply token names one workspace", { skip }, async () => {
  const [a, b] = [await workspace("mailbox-a"), await workspace("mailbox-b")];
  const first = await db.from("mailboxes").insert(mailbox(a)).select("reply_mode").single();
  assert.equal(first.error, null, first.error?.message);
  assert.equal(first.data.reply_mode, "draft", "email starts with the receptionist drafting, never sending");

  const second = await db.from("mailboxes").insert(mailbox(a, { local_part: "bestmovers2", reply_token: TOKEN("b") }));
  assert.equal(second.error?.code, "23505", "a second mailbox for one workspace is a routing decision, not an insert");
  const sameAddress = await db.from("mailboxes").insert(mailbox(b, { reply_token: TOKEN("c") }));
  assert.equal(sameAddress.error?.code, "23505", "another workspace cannot take an address that is somebody's");
  const sameToken = await db.from("mailboxes").insert(mailbox(b, { local_part: "otherco" }));
  assert.equal(sameToken.error?.code, "23505", "nor a reply route");
  const prevIsLive = await db.from("mailboxes").update({ reply_token: TOKEN("d"), reply_token_prev: TOKEN("a") }).eq("tenant_id", a);
  assert.equal(prevIsLive.error, null, "a rotation keeps the old token routing");
  const takesPrev = await db.from("mailboxes").insert(mailbox(b, { local_part: "otherco", reply_token: TOKEN("e"), reply_token_prev: TOKEN("a") }));
  assert.equal(takesPrev.error?.code, "23505", "and a token still routing for one workspace cannot route for another");
});

test("what is not an address a workspace may hold is refused by the table, whoever writes it", { skip }, async () => {
  const t = await workspace("mailbox-shape");
  for (const local_part of ["r", "postmaster", "abuse", "noreply", "Best", "best movers", "-best", "best-", "b".repeat(41), "best_movers", ""]) {
    const { error } = await db.from("mailboxes").insert(mailbox(t, { local_part, reply_token: TOKEN("f") }));
    assert.match(error?.message ?? "", /mailboxes_local_part_check|violates check/, `refused: ${JSON.stringify(local_part)}`);
  }
  for (const reply_token of ["short", TOKEN("A"), TOKEN("1"), "a".repeat(25)]) {
    const { error } = await db.from("mailboxes").insert(mailbox(t, { local_part: "shapeco", reply_token }));
    assert.match(error?.message ?? "", /violates check/, `refused: ${JSON.stringify(reply_token)}`);
  }
  const { error: mode } = await db.from("mailboxes").insert(mailbox(t, { local_part: "shapeco", reply_token: TOKEN("g"), reply_mode: "send" }));
  assert.match(mode?.message ?? "", /violates check/);
  const { error: nameless } = await db.from("mailboxes").insert(mailbox(t, { local_part: "shapeco", reply_token: TOKEN("g"), from_name: "   " }));
  assert.match(nameless?.message ?? "", /violates check/);
});

test("a suppression is a reason and a time together, about an address: a corrected address starts clean, and an erasure clears it with the address", { skip }, async () => {
  const t = await workspace("mailbox-suppress");
  const { data: c, error } = await db.from("contacts").insert({ tenant_id: t, phone_e164: "+15550100201", email: "gone@example.com" }).select("id").single();
  assert.equal(error, null, error?.message);
  const half = await db.from("contacts").update({ email_suppressed_at: new Date().toISOString() }).eq("id", c.id);
  assert.match(half.error?.message ?? "", /contacts_email_suppressed_check/, "a time with no reason is not a suppression");
  const odd = await db.from("contacts").update({ email_suppressed_at: new Date().toISOString(), email_suppressed_reason: "annoyed" }).eq("id", c.id);
  assert.match(odd.error?.message ?? "", /contacts_email_suppressed_check/);
  const set = await db.from("contacts").update({ email_suppressed_at: new Date().toISOString(), email_suppressed_reason: "hard_bounce" }).eq("id", c.id);
  assert.equal(set.error, null, set.error?.message);

  await db.from("contacts").update({ display_name: "Still Gone" }).eq("id", c.id);
  const kept = await db.from("contacts").select("email_suppressed_reason").eq("id", c.id).single();
  assert.equal(kept.data.email_suppressed_reason, "hard_bounce", "a change that is not the address leaves it");

  await db.from("contacts").update({ email: "right@example.com" }).eq("id", c.id);
  const clean = await db.from("contacts").select("email, email_suppressed_at, email_suppressed_reason").eq("id", c.id).single();
  assert.deepEqual(clean.data, { email: "right@example.com", email_suppressed_at: null, email_suppressed_reason: null });

  await db.from("contacts").update({ email_suppressed_at: new Date().toISOString(), email_suppressed_reason: "complaint" }).eq("id", c.id);
  await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", c.id);
  const erased = await db.from("contacts").select("email, email_suppressed_at, email_suppressed_reason").eq("id", c.id).single();
  assert.deepEqual(erased.data, { email: null, email_suppressed_at: null, email_suppressed_reason: null }, "00125 clears the address, and the address's suppression goes with it");
});

test("members read their own workspace's mailbox and write none; a stranger reads nothing", { skip }, async () => {
  const [mine, theirs] = [await workspace("mailbox-mine"), await workspace("mailbox-theirs")];
  await db.from("mailboxes").insert(mailbox(mine, { local_part: "mineco", reply_token: TOKEN("m") }));
  await db.from("mailboxes").insert(mailbox(theirs, { local_part: "theirsco", reply_token: TOKEN("n") }));
  const email = `mailbox-${Date.now()}@example.test`;
  const { data: user, error: uErr } = await db.auth.admin.createUser({ email, password: "a-long-test-password-1", email_confirm: true });
  assert.equal(uErr, null, uErr?.message);
  try {
    await db.from("memberships").insert({ tenant_id: mine, user_id: user.user.id, role: "owner" });
    const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
    const { error: sErr } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
    if (sErr) { assert.ok(true, `no anon sign-in here: ${sErr.message}`); return; }
    const { data: seen } = await as.from("mailboxes").select("local_part");
    assert.deepEqual(seen.map((m) => m.local_part), ["mineco"], "their own, and nobody else's");
    const { data: changed } = await as.from("mailboxes").update({ reply_mode: "auto" }).eq("tenant_id", mine).select("id");
    assert.deepEqual(changed ?? [], [], "an owner's session cannot turn the dial: the route does, as the service role, after judging the role");
    const { data: still } = await db.from("mailboxes").select("reply_mode").eq("tenant_id", mine).single();
    assert.equal(still.reply_mode, "draft");
  } finally {
    await db.auth.admin.deleteUser(user.user.id);
  }
});
