/**
 * An owner makes the mailbox -- on a real database.
 *
 * 00129's two doors judge who is asking, mint the reply route's token from the
 * database's own randomness, and turn the table's refusals into sentences.
 * Who may call a definer function, what `auth.uid()` makes of a session, and
 * whether the rules contracts says before the insert are the rules the table
 * holds are what reading source cannot prove, so these run against Postgres in
 * the database workflow; skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { MAILBOX_RESERVED, whyNotAFromName, whyNotALocalPart } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip = !URL_ || !KEY || !ANON
  ? "no database, or no anon key to sign in with, in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes customers"
    : false;

let db;
const made = { tenants: [], users: [] };
const stamp = Date.now().toString(36);
const PASSWORD = "a-long-test-password-1";

async function workspace(slug) {
  const { data, error } = await db.from("tenants").insert({ slug: `${slug}-${stamp}`, name: slug }).select("id").single();
  if (error) throw new Error(error.message);
  made.tenants.push(data.id);
  return data.id;
}
/** A signed-in member of one workspace, as the dashboard's session client is. */
async function member(tenantId, role) {
  const email = `mailbox-${role}-${stamp}-${made.users.length}@example.test`;
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(error.message);
  made.users.push(data.user.id);
  const { error: mErr } = await db.from("memberships").insert({ tenant_id: tenantId, user_id: data.user.id, role });
  if (mErr) throw new Error(mErr.message);
  const as = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await as.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw new Error(sErr.message);
  return { as, userId: data.user.id };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of made.tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of made.users) await db.auth.admin.deleteUser(id);
});

test("an owner gives the workspace its address once: stored in one spelling, its reply route minted by the database, the event saying who and never what", { skip }, async () => {
  const t = await workspace("mailbox-door");
  const owner = await member(t, "owner");
  const local = `bestmovers-${stamp}`;
  const { data, error } = await owner.as.rpc("create_mailbox", { p_tenant_id: t, p_local_part: `  ${local.toUpperCase()} `, p_from_name: "  Best Movers " });
  assert.equal(error, null, error?.message);
  assert.deepEqual([data.local_part, data.from_name], [local, "Best Movers"]);
  assert.equal("reply_token" in data, false, "the door hands back no route");

  const { data: row } = await db.from("mailboxes").select("reply_token, reply_token_prev, reply_mode").eq("tenant_id", t).single();
  assert.match(row.reply_token, /^[a-z2-7]{24}$/);
  assert.deepEqual([row.reply_token_prev, row.reply_mode], [null, "draft"], "email starts with nothing sent by itself");

  const { error: again } = await owner.as.rpc("create_mailbox", { p_tenant_id: t, p_local_part: `second-${stamp}`, p_from_name: "Best Movers" });
  assert.deepEqual([again?.code, again?.message], ["23505", "This workspace already has an email address."]);

  const { data: events } = await db.from("events").select("kind, data").eq("tenant_id", t).eq("kind", "mailbox.created");
  assert.deepEqual(events.map((e) => e.data), [{ by: owner.userId }]);
  assert.ok(!JSON.stringify(events).includes(local), "an event names no address");
});

test("an address somebody has is refused in a sentence; an operator, a stranger and a signed-out caller are refused outright", { skip }, async () => {
  const [mine, theirs] = [await workspace("mailbox-mine"), await workspace("mailbox-theirs")];
  const owner = await member(mine, "owner");
  const operator = await member(mine, "operator");
  const rival = await member(theirs, "owner");
  const local = `shared-${stamp}`;
  assert.equal((await rival.as.rpc("create_mailbox", { p_tenant_id: theirs, p_local_part: local, p_from_name: "Theirs" })).error, null);

  const { error: taken } = await owner.as.rpc("create_mailbox", { p_tenant_id: mine, p_local_part: local, p_from_name: "Mine" });
  assert.deepEqual([taken?.code, taken?.message], ["23505", "That address is taken. Try another."]);
  const { error: notOwner } = await operator.as.rpc("create_mailbox", { p_tenant_id: mine, p_local_part: `op-${stamp}`, p_from_name: "Mine" });
  assert.deepEqual([notOwner?.code, notOwner?.message], ["42501", "Only an owner can set up email."]);
  const { error: stranger } = await rival.as.rpc("create_mailbox", { p_tenant_id: mine, p_local_part: `rival-${stamp}`, p_from_name: "Mine" });
  assert.equal(stranger?.code, "42501", "an owner somewhere else is nobody here");
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  assert.ok((await anon.rpc("create_mailbox", { p_tenant_id: mine, p_local_part: `anon-${stamp}`, p_from_name: "Mine" })).error, "and a signed-out caller cannot run it at all");
  assert.ok((await owner.as.rpc("mint_reply_token")).error, "the token's mint is the door's, not a session's");
  const { count } = await db.from("mailboxes").select("id", { count: "exact", head: true }).eq("tenant_id", mine);
  assert.equal(count, 0);
});

test("the rules said before the insert are the rules the table holds: what contracts refuses the door refuses, and what it accepts the door accepts", { skip }, async () => {
  const refusedByBoth = ["r", "best movers", "best.movers", "best_movers", "-best", "best-", "x".repeat(41), "", ...MAILBOX_RESERVED];
  const t = await workspace("mailbox-rules");
  const owner = await member(t, "owner");
  for (const local of refusedByBoth) {
    assert.notEqual(whyNotALocalPart(local), null, `contracts refuses ${JSON.stringify(local)}`);
    const { error } = await owner.as.rpc("create_mailbox", { p_tenant_id: t, p_local_part: local, p_from_name: "Best Movers" });
    assert.deepEqual([error?.code, error?.message], ["22023", "That cannot be used as an address or a name."], `the table refuses ${JSON.stringify(local)}`);
  }
  for (const name of ["   ", "x".repeat(81)]) {
    assert.notEqual(whyNotAFromName(name), null);
    assert.equal((await owner.as.rpc("create_mailbox", { p_tenant_id: t, p_local_part: `rules-${stamp}`, p_from_name: name })).error?.code, "22023");
  }
  const longest = `${"y".repeat(40)}${stamp}`.slice(-40);
  assert.equal(whyNotALocalPart(longest), null);
  assert.equal((await owner.as.rpc("create_mailbox", { p_tenant_id: t, p_local_part: longest, p_from_name: "x".repeat(80) })).error, null, "forty characters and eighty are both held");
});

test("the name beside the address is the owner's to change; the address is nobody's, and another workspace's mailbox does not exist", { skip }, async () => {
  const [mine, theirs] = [await workspace("mailbox-rename"), await workspace("mailbox-rename-far")];
  const owner = await member(mine, "owner");
  const operator = await member(mine, "operator");
  const rival = await member(theirs, "owner");
  const { data: made_ } = await owner.as.rpc("create_mailbox", { p_tenant_id: mine, p_local_part: `rename-${stamp}`, p_from_name: "Best Movers" });

  const { data, error } = await owner.as.rpc("rename_mailbox", { p_mailbox_id: made_.id, p_from_name: "  Best Movers NYC " });
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, { id: made_.id, from_name: "Best Movers NYC" });
  assert.equal((await owner.as.rpc("rename_mailbox", { p_mailbox_id: made_.id, p_from_name: "  " })).error?.code, "22023");
  assert.equal((await operator.as.rpc("rename_mailbox", { p_mailbox_id: made_.id, p_from_name: "Ops" })).error?.code, "42501");
  assert.equal((await rival.as.rpc("rename_mailbox", { p_mailbox_id: made_.id, p_from_name: "Theirs now" })).error?.code, "42501");
  const { data: changed } = await owner.as.from("mailboxes").update({ local_part: `other-${stamp}`, reply_mode: "auto" }).eq("id", made_.id).select("id");
  assert.deepEqual(changed ?? [], [], "a session edits no column of a mailbox: the doors are the only way in");
  const { data: row } = await db.from("mailboxes").select("local_part, from_name, reply_mode").eq("id", made_.id).single();
  assert.deepEqual(row, { local_part: `rename-${stamp}`, from_name: "Best Movers NYC", reply_mode: "draft" });
  const { data: events } = await db.from("events").select("data").eq("tenant_id", mine).eq("kind", "mailbox.renamed");
  assert.deepEqual(events.map((e) => e.data), [{ by: owner.userId }]);
});
