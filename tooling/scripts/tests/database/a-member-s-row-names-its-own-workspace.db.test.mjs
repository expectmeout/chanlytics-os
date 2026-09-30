/**
 * A row a member writes names only its own workspace's rows (00270), on a real Postgres with a real session. A foreign
 * key asks only that the named row exist, and ignores RLS, so each member insert policy asks it too: a member of one
 * workspace who knows another's ids (a former employee) is refused a message on the other's thread or person, a
 * broadcast of the other's template, a recipient naming the other's message, a moment on the other's list or template,
 * and a reply policy for the other's person, while the same rows naming their own workspace's are theirs to write as before. And the lead
 * finder's two helpers that name a workspace answer no signed-in person, only the finder's doors and the service role.
 * Runs against the database `supabase start` builds, never production.
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
const PASSWORD = "own-rows-test-password-1";
const RUN = Date.now().toString(36);
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
/** The row policy's refusal: an insert or update WITH CHECK fails as 42501. */
const refused = (r, why) => {
  assert.ok(r.error, `REGRESSION: written: ${why}`);
  assert.equal(r.error.code, "42501", `the row policy's refusal, not another error: ${why}: ${r.error.message}`);
};

before(async () => {
  if (skip) return;
  admin = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await admin.from("tenants").delete().eq("id", id);
  for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

async function workspace(tag) {
  const t = ok(
    await admin
      .from("tenants")
      .insert({ name: `Own rows ${tag}`, slug: `own-rows-${tag}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  const n = String(made.tenants.length).padStart(2, "0");
  const contact = ok(
    await admin
      .from("contacts")
      .insert({ tenant_id: t, phone_e164: `+155555501${n}` })
      .select("id")
      .single(),
    "contact",
  ).id;
  const conversation = ok(
    await admin.from("conversations").insert({ tenant_id: t, contact_id: contact }).select("id").single(),
    "conversation",
  ).id;
  const template = ok(
    await admin
      .from("templates")
      .insert({ tenant_id: t, channel: "whatsapp", name: "visit_reminder", language: "en_US", meta_status: "approved" })
      .select("id")
      .single(),
    "template",
  ).id;
  const list = ok(
    await admin.from("segments").insert({ tenant_id: t, name: "Regulars" }).select("id").single(),
    "list",
  ).id;
  const message = ok(
    await admin
      .from("messages")
      .insert({
        tenant_id: t,
        conversation_id: conversation,
        contact_id: contact,
        channel: "whatsapp",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "Hi",
      })
      .select("id")
      .single(),
    "message",
  ).id;
  return { t, contact, conversation, template, list, message };
}

async function ownerOf(w, tag) {
  const email = `own-rows-${tag}-${RUN}@example.com`;
  const u = ok(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }), "user").user;
  made.users.push(u.id);
  ok(await admin.from("memberships").insert({ user_id: u.id, tenant_id: w.t, role: "owner" }), "membership");
  const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await session.auth.signInWithPassword({ email, password: PASSWORD }), "sign in");
  return { id: u.id, session };
}

let mine;
let theirs;
let me;

before(async () => {
  if (skip) return;
  mine = await workspace("mine");
  theirs = await workspace("theirs");
  me = await ownerOf(mine, "owner");
});

test(
  "a member queues a reply on their own thread, and never on another workspace's thread or person",
  { skip },
  async () => {
    const reply = (over) =>
      me.session
        .from("messages")
        .insert({
          tenant_id: mine.t,
          conversation_id: mine.conversation,
          contact_id: mine.contact,
          channel: "whatsapp",
          direction: "outbound",
          sender: "human",
          sent_by: me.id,
          status: "queued",
          type: "text",
          body: "See you at 3",
          ...over,
        })
        .select("id");

    ok(await reply({}), "a reply on their own thread is still theirs to queue");
    ok(await reply({ contact_id: null }), "and one naming no person");
    refused(await reply({ conversation_id: theirs.conversation }), "another workspace's thread");
    refused(await reply({ contact_id: theirs.contact }), "another workspace's person");
    refused(
      await reply({ conversation_id: theirs.conversation, contact_id: theirs.contact }),
      "another workspace's thread and person",
    );
    const onTheirs = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", theirs.conversation)
      .eq("tenant_id", mine.t);
    assert.equal(onTheirs.count, 0, "nothing of mine sits on their thread");
  },
);

test("a broadcast and its recipients name their own workspace's template, playbook and message", { skip }, async () => {
  const run = (over) =>
    me.session
      .from("broadcasts")
      .insert({
        tenant_id: mine.t,
        name: "Reminder",
        template_name: "visit_reminder",
        template_language: "en_US",
        created_by: me.id,
        scheduled_for: new Date().toISOString(),
        ...over,
      })
      .select("id");
  const own = ok(await run({ template_id: mine.template }), "a broadcast of their own template");
  refused(await run({ template_id: theirs.template }), "a broadcast of another workspace's template");

  const recipient = (over) =>
    me.session
      .from("broadcast_recipients")
      .insert({ tenant_id: mine.t, broadcast_id: own[0].id, contact_id: mine.contact, ...over });
  // A recipient's message is the edge's to write when it sends (00283 grants a session no such column), so a session
  // names none: another workspace's is refused, and so is its own; the policy stands under the grant.
  refused(await recipient({ message_id: theirs.message }), "a recipient naming another workspace's message");
  refused(await recipient({ message_id: mine.message }), "a recipient naming any message: the column is the edge's");
  ok(await recipient({}), "a recipient with no message yet");
});

test("a moment is on their own workspace's list and template, made or moved", { skip }, async () => {
  const moment = (over) =>
    me.session
      .from("playbooks")
      .insert({
        tenant_id: mine.t,
        name: `Moment ${Math.random().toString(36).slice(2, 7)}`,
        trigger: "saved_list",
        template_name: "visit_reminder",
        template_language: "en_US",
        params: [],
        policy_class: "campaign",
        state: "paused",
        run_hour: 10,
        cap_per_run: 25,
        gap_days: 90,
        created_by: me.id,
        ...over,
      })
      .select("id");
  const own = ok(await moment({ list_id: mine.list, template_id: mine.template }), "a moment on their own list");
  refused(await moment({ list_id: theirs.list, template_id: mine.template }), "a moment on another workspace's list");
  refused(await moment({ list_id: mine.list, template_id: theirs.template }), "another workspace's template");

  const move = (patch) => me.session.from("playbooks").update(patch).eq("id", own[0].id).select("id");
  refused(await move({ list_id: theirs.list }), "moved onto another workspace's list");
  refused(await move({ template_id: theirs.template }), "moved onto another workspace's template");
  const moved = ok(await move({ name: "Renamed" }), "their own edit");
  assert.equal(moved.length, 1, "the row was changed, not hidden");
});

test("a person's reply policy names their own workspace's person", { skip }, async () => {
  const policy = (subject_id) =>
    me.session
      .from("policies")
      .insert({ tenant_id: mine.t, class: "reply", mode: "auto", subject_type: "contact", subject_id })
      .select("id");
  refused(await policy(theirs.contact), "a reply policy for another workspace's person");
  ok(await policy(mine.contact), "a reply policy for their own person");
});

test(
  "the lead finder's month and switch answer no signed-in person, and the service role as before",
  { skip },
  async () => {
    for (const [fn, args] of [
      ["lead_month", { p_tenant_id: theirs.t }],
      ["lead_searches_on", { p_tenant_id: theirs.t }],
      ["lead_month", { p_tenant_id: mine.t }],
    ]) {
      const r = await me.session.rpc(fn, args);
      assert.ok(r.error, `REGRESSION: ${fn} answered a session: ${JSON.stringify(r.data)}`);
      assert.equal(r.error.code, "42501", `${fn}: execute is not granted: ${r.error.message}`);
    }
    assert.match(ok(await admin.rpc("lead_month", { p_tenant_id: mine.t }), "month"), /^\d{4}-\d{2}$/);
    assert.equal(typeof ok(await admin.rpc("lead_searches_on", { p_tenant_id: mine.t }), "switch"), "boolean");
  },
);
