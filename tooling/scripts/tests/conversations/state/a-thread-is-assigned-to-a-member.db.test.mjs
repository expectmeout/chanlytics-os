/**
 * A thread is assigned only to a member of its workspace (00364 conversations_assignee_guard), on a real database
 * through PostgREST.
 *
 * conversations.assignee_user_id is who is responsible for a thread, and a member's session may write it: a take-over
 * and a reply name the member who made them. Its key is auth.users, which any account satisfies, so a member could
 * give a thread to someone outside the workspace, who would then hold it in nobody's queue. Proved here: a member
 * assigns a thread to themselves and to a colleague; an account of another workspace is refused, on a member's session,
 * on the service role, and on a new thread; and a member's departure still releases what they held. Skipped without a
 * local database; never production.
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
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and threads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}${r.error?.message ?? ""}`);
  return r.data;
};

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let A; // the workspace
let B; // another
const users = [];
const as = {};
let serial = 0;

async function session(label, tenantId, role) {
  const email = `assignee-${label}-${RUN}@example.com`;
  const password = `pw-${RUN}-${label}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role }), `${label}: `);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: made.data.user.id };
}

/** A person of A with a thread, the thread's id; `assignee` names who holds it from the start. */
async function thread(assignee = null) {
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: A, phone_e164: `+1512555${String(2000 + ++serial).slice(-4)}` })
      .select("id")
      .single(),
  ).id;
  return db
    .from("conversations")
    .insert({ tenant_id: A, contact_id: contact, assignee_user_id: assignee })
    .select("id")
    .single();
}

const assigneeOf = async (id) =>
  ok(await db.from("conversations").select("assignee_user_id").eq("id", id).single()).assignee_user_id;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (tag) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `assignee-${tag}-${RUN}`, name: `Assignee ${tag}` })
        .select("id")
        .single(),
    ).id;
  A = await workspace("a");
  B = await workspace("b");
  as.owner = await session("owner", A, "owner");
  as.operator = await session("operator", A, "operator");
  as.stranger = await session("stranger", B, "owner");
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "a member takes a thread and hands it to a colleague; an account of another workspace is refused, on a member's session and on the service role",
  { skip },
  async () => {
    const id = ok(await thread()).id;
    const assign = (who, user) =>
      (who === "service" ? db : as[who].client)
        .from("conversations")
        .update({ assignee_user_id: user })
        .eq("id", id)
        .select("assignee_user_id");
    assert.deepEqual(ok(await assign("operator", as.operator.id)), [{ assignee_user_id: as.operator.id }], "taken");
    assert.deepEqual(ok(await assign("operator", as.owner.id)), [{ assignee_user_id: as.owner.id }], "handed on");

    const outside = await assign("operator", as.stranger.id);
    assert.equal(outside.error?.code, "23503", "a member of another workspace is no assignee");
    assert.equal(await assigneeOf(id), as.owner.id, "the thread is where it was");
    const service = await assign("service", as.stranger.id);
    assert.equal(service.error?.code, "23503", "nor on the service role");

    assert.deepEqual(ok(await assign("operator", null)), [{ assignee_user_id: null }], "released");
  },
);

test("a new thread names a member as its assignee, or nobody", { skip }, async () => {
  const theirs = await thread(as.stranger.id);
  assert.equal(theirs.error?.code, "23503");
  const ours = ok(await thread(as.operator.id)).id;
  assert.equal(await assigneeOf(ours), as.operator.id);
  assert.equal(await assigneeOf(ok(await thread()).id), null);
});

test(
  "a member who leaves still releases what they held, and the thread can be given to someone still here",
  { skip },
  async () => {
    const leaver = await session("leaver", A, "operator");
    const id = ok(await thread(leaver.id)).id;
    ok(await db.from("memberships").delete().eq("tenant_id", A).eq("user_id", leaver.id));
    assert.equal(await assigneeOf(id), null, "the departure released it (00132)");
    const again = await db.from("conversations").update({ assignee_user_id: leaver.id }).eq("id", id).select("id");
    assert.equal(again.error?.code, "23503", "and it cannot be given back to them");
    ok(await as.owner.client.from("conversations").update({ assignee_user_id: as.owner.id }).eq("id", id));
    assert.equal(await assigneeOf(id), as.owner.id);
  },
);
