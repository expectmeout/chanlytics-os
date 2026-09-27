/**
 * A person deletes their own account (00190), on a real Postgres with real sessions: the only owner of a workspace
 * with other members is refused by name; a person who is the only member leaves a workspace with nobody in it, kept;
 * a member who is not the only owner goes, and their phones and marks go with them; the auth user is gone after.
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
      ? "refusing a database that is not on this machine"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

let admin;
const made = { users: [], tenants: [] };
const PASSWORD = "delete-me-test-password-1";

async function person(tag) {
  const email = `deletion-${tag}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  made.users.push(data.user.id);
  return { id: data.user.id, email };
}
async function workspace(tag) {
  const { data, error } = await admin
    .from("tenants")
    .insert({ name: `Deletion ${tag}`, slug: `deletion-${tag}-${Date.now()}` })
    .select("id")
    .single();
  if (error) throw error;
  made.tenants.push(data.id);
  return data.id;
}
async function member(userId, tenantId, role) {
  const { error } = await admin.from("memberships").insert({ user_id: userId, tenant_id: tenantId, role });
  if (error) throw error;
}
async function sessionOf(email) {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}
const userExists = async (id) => !(await admin.auth.admin.getUserById(id)).error;

before(async () => {
  if (skip) return;
  admin = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await admin.from("tenants").delete().eq("id", id);
  for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

test("the only owner of a workspace with other members is refused by name", { skip }, async () => {
  const owner = await person("sole");
  const staff = await person("staff");
  const t = await workspace("sole");
  await member(owner.id, t, "owner");
  await member(staff.id, t, "operator");
  const s = await sessionOf(owner.email);
  const { error } = await s.rpc("delete_my_account");
  assert.ok(error, "refused");
  assert.match(error.message, /sole_owner/);
  assert.ok(await userExists(owner.id), "and the account stays");
});

test(
  "the only member leaves a workspace with nobody in it, kept; their phone and marks go; the user is gone",
  { skip },
  async () => {
    const only = await person("only");
    const t = await workspace("only");
    await member(only.id, t, "owner");
    await admin.from("push_devices").insert({ user_id: only.id, token: `tok-${only.id}`, platform: "ios" });
    const s = await sessionOf(only.email);
    const { data, error } = await s.rpc("delete_my_account");
    assert.equal(error, null, error?.message);
    assert.deepEqual(data, { deleted: true, workspaces_left_empty: 1 });
    assert.ok(!(await userExists(only.id)), "the auth user is gone");
    const { data: tenant } = await admin.from("tenants").select("id").eq("id", t).maybeSingle();
    assert.ok(tenant, "the workspace's data stays for the platform to erase");
    const { data: phones } = await admin.from("push_devices").select("id").eq("user_id", only.id);
    assert.deepEqual(phones, []);
    const { data: members } = await admin.from("memberships").select("id").eq("tenant_id", t);
    assert.deepEqual(members, []);
  },
);

test("a person with history goes, and the history stays without them (00208)", { skip }, async () => {
  const a = await person("keeps");
  const b = await person("history");
  const t = await workspace("history");
  await member(a.id, t, "owner");
  await member(b.id, t, "owner");
  const contact = (
    await admin
      .from("contacts")
      .insert({ tenant_id: t, email: `robin-${Date.now()}@example.com` })
      .select("id")
      .single()
  ).data;
  const conv = (
    await admin
      .from("conversations")
      .insert({ tenant_id: t, contact_id: contact.id, assignee_user_id: b.id, control_by: b.id })
      .select("id")
      .single()
  ).data;
  const seeded = {
    message: admin.from("messages").insert({
      tenant_id: t,
      conversation_id: conv.id,
      channel: "sms",
      direction: "outbound",
      sender: "human",
      sent_by: b.id,
      body: "On my way.",
      status: "sent",
    }),
    escalation: admin.from("escalations").insert({
      tenant_id: t,
      conversation_id: conv.id,
      reason: "manual",
      state: "resolved",
      resolved_by_user_id: b.id,
    }),
    decision: admin.from("decisions").insert({
      tenant_id: t,
      subject_type: "conversation",
      subject_id: conv.id,
      verb: "take_over",
      actor_type: "user",
      actor_user_id: b.id,
    }),
    invitation: admin
      .from("invitations")
      .insert({ tenant_id: t, email: `casey-${Date.now()}@example.com`, role: "operator", invited_by: b.id }),
  };
  for (const [what, p] of Object.entries(seeded)) {
    const { error } = await p;
    assert.equal(error, null, `${what}: ${error?.message}`);
  }
  const s = await sessionOf(b.email);
  const { data, error } = await s.rpc("delete_my_account");
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, { deleted: true, workspaces_left_empty: 0 });
  assert.ok(!(await userExists(b.id)), "the auth user is gone");
  const left = {
    message: (await admin.from("messages").select("sent_by, sender").eq("conversation_id", conv.id).single()).data,
    escalation: (
      await admin.from("escalations").select("resolved_by_user_id, state").eq("conversation_id", conv.id).single()
    ).data,
    decision: (await admin.from("decisions").select("actor_user_id, actor_type").eq("subject_id", conv.id).single())
      .data,
    invitation: (await admin.from("invitations").select("invited_by, role").eq("tenant_id", t).single()).data,
    thread: (await admin.from("conversations").select("assignee_user_id, control_by").eq("id", conv.id).single()).data,
  };
  assert.deepEqual(left.message, { sent_by: null, sender: "human" });
  assert.deepEqual(left.escalation, { resolved_by_user_id: null, state: "resolved" });
  assert.deepEqual(left.decision, { actor_user_id: null, actor_type: "user" });
  assert.deepEqual(left.invitation, { invited_by: null, role: "operator" });
  assert.deepEqual(left.thread, { assignee_user_id: null, control_by: null });
});

test("a partner whose record holds a workspace they brought is refused by name (00208)", { skip }, async () => {
  const p = await person("partner");
  const t = await workspace("brought");
  await member(p.id, t, "owner");
  const partner = (
    await admin
      .from("partners")
      .insert({ user_id: p.id, code: `pt-${Date.now().toString(36)}` })
      .select("id")
      .single()
  ).data;
  assert.ok(partner, "a partner record");
  const { error: brought } = await admin
    .from("partner_tenants")
    .insert({ tenant_id: t, partner_id: partner.id, code_used: "pt" });
  assert.equal(brought, null, brought?.message);
  const s = await sessionOf(p.email);
  const { error } = await s.rpc("delete_my_account");
  assert.ok(error, "refused");
  assert.match(error.message, /partner_records/);
  assert.ok(await userExists(p.id), "and the account stays");
});

test("a member who is not the only owner simply goes", { skip }, async () => {
  const a = await person("a");
  const b = await person("b");
  const t = await workspace("two");
  await member(a.id, t, "owner");
  await member(b.id, t, "owner");
  const s = await sessionOf(b.email);
  const { data, error } = await s.rpc("delete_my_account");
  assert.equal(error, null, error?.message);
  assert.deepEqual(data, { deleted: true, workspaces_left_empty: 0 });
  const { data: members } = await admin.from("memberships").select("user_id").eq("tenant_id", t);
  assert.deepEqual(
    members.map((m) => m.user_id),
    [a.id],
  );
});
