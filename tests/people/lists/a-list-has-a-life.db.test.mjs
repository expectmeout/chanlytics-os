/**
 * A list has a life (00169, docs/decisions/0009-one-idea-of-a-list.md phase 3), against the replayed database.
 *
 * A list something depends on is archived, not deleted: a member may archive and restore one (the column grant that is
 * the fence, 00121, never named archived_at), and a list a playbook names is not deleted out from under it -- while a
 * workspace deleted whole still goes, its playbooks and lists together. Names are unique among live lists regardless
 * of case. And every change to a list is the ledger's: the decisions CHECKs take its verbs and its subject.
 *
 * Runs against the local database the Database workflow builds from every migration. Never production:
 * `supabase start`, then `pnpm test:db` with its keys.
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
      ? "refusing a database that is not on this machine: this suite writes lists and playbooks"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the operator this suite signs in as needs it"
        : false;

let db;
const tenants = [];
const users = [];

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const workspace = async (name) => {
  const id = ok(
    await db
      .from("tenants")
      .insert({ slug: `list-life-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name })
      .select("id")
      .single(),
  ).id;
  tenants.push(id);
  return id;
};
const makeList = async (tenantId, name) =>
  ok(await db.from("segments").insert({ tenant_id: tenantId, name }).select("id").single()).id;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("an operator archives a list and brings it back: archived_at is theirs to change", { skip }, async () => {
  const tenantId = await workspace("Archive");
  const listId = await makeList(tenantId, "Regulars");
  const email = `list-life-${Date.now()}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "operator" }));
  const operator = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await operator.auth.signInWithPassword({ email, password }));

  // The route's write, as the session sends it (segments/[id]/route.ts): a forbidden column raises, and RLS may hide a
  // row without raising, so the row is read back.
  const at = new Date().toISOString();
  const archived = await operator.from("segments").update({ archived_at: at }).eq("id", listId).select("archived_at");
  assert.equal(archived.error, null, `the archive was refused: ${archived.error?.message}`);
  assert.equal(archived.data.length, 1, "the row was changed, not hidden");
  assert.equal(new Date(archived.data[0].archived_at).toISOString(), at);
  const back = await operator.from("segments").update({ archived_at: null }).eq("id", listId).select("archived_at");
  assert.equal(back.error, null, back.error?.message);
  assert.deepEqual(back.data, [{ archived_at: null }]);
});

test(
  "names are one each among live lists, whatever their case; an archived one keeps its name aside",
  { skip },
  async () => {
    const tenantId = await workspace("Names");
    const vip = await makeList(tenantId, "VIP");
    const twin = await db.from("segments").insert({ tenant_id: tenantId, name: "vip" });
    assert.equal(twin.error?.code, "23505", "REGRESSION: 'VIP' and 'vip' were two lists");
    ok(await db.from("segments").update({ archived_at: new Date().toISOString() }).eq("id", vip));
    const fresh = await makeList(tenantId, "vip");
    assert.ok(fresh, "an archived list's name is free for a live one");
    const restore = await db.from("segments").update({ archived_at: null }).eq("id", vip);
    assert.equal(restore.error?.code, "23505", "a restore under a live list's name is refused, for the route to say");
    // Another workspace's list of the same name is its own.
    const elsewhere = await workspace("Names elsewhere");
    assert.ok(await makeList(elsewhere, "VIP"));
  },
);

test(
  "a list a playbook names is not deleted out from under it; a workspace deleted whole still goes",
  { skip },
  async () => {
    const tenantId = await workspace("Kept");
    const listId = await makeList(tenantId, "Regulars");
    const templateId = ok(
      await db
        .from("templates")
        .insert({
          tenant_id: tenantId,
          channel: "whatsapp",
          name: "winback_offer",
          language: "en_US",
          meta_status: "approved",
        })
        .select("id")
        .single(),
    ).id;
    ok(
      await db.from("sequence_steps").insert({
        tenant_id: tenantId,
        name: "Win-back",
        trigger: "saved_list",
        list_id: listId,
        template_id: templateId,
        template_name: "winback_offer",
        template_language: "en_US",
        params: [],
        policy_class: "campaign",
        state: "paused",
        run_hour: 10,
        cap_per_run: 25,
        gap_days: 90,
        cadence_days: 30,
      }),
    );
    const gone = await db.from("segments").delete().eq("id", listId);
    assert.equal(gone.error?.code, "23503", "REGRESSION: the playbook's list was deleted and the playbook kept a null");
    const whole = await db.from("tenants").delete().eq("id", tenantId);
    assert.equal(whole.error, null, `a workspace deleted whole: ${whole.error?.message}`);
    const left = await db.from("segments").select("id").eq("id", listId);
    assert.deepEqual(left.data, []);
  },
);

test(
  "every change to a list is the ledger's: the decisions CHECKs take its verbs and its subject",
  { skip },
  async () => {
    const tenantId = await workspace("Ledger");
    const listId = await makeList(tenantId, "Regulars");
    const verbs = [
      "make_list",
      "rename_list",
      "change_list_rule",
      "add_to_list",
      "drop_from_list",
      "archive_list",
      "restore_list",
      "delete_list",
    ];
    for (const verb of verbs) {
      const r = await db.from("decisions").insert({
        tenant_id: tenantId,
        subject_type: "list",
        subject_id: listId,
        verb,
        // A system actor needs no signed-in user (00004's actor CHECK); the verb and subject are what is proved.
        actor_type: "system",
        payload: { name: "Regulars" },
      });
      assert.equal(r.error, null, `${verb}: ${r.error?.message}`);
    }
  },
);

/** A member of `tenantId` in `role`, signed in on their own session, as the routes reach the database. */
const member = async (tenantId, role) => {
  const email = `list-life-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role }));
  const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await session.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, session };
};
const person = async (tenantId, phone) =>
  ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: phone }).select("id").single()).id;

test(
  "a list is the workspace's: members read it, an acting member makes one in their own name and renames it, and nothing else of it",
  { skip },
  async () => {
    // Pinned as 00044's text in people/lists/saved-lists.test.mjs until 26 Nov 2026.
    const tenantId = await workspace("Own lists");
    const operator = await member(tenantId, "operator");
    const viewer = await member(tenantId, "viewer");
    const mine = await operator.session
      .from("segments")
      .insert({ tenant_id: tenantId, name: "Regulars", created_by: operator.id })
      .select("id")
      .single();
    assert.equal(mine.error, null, `an operator makes a list in their own name: ${mine.error?.message}`);
    const theirs = await operator.session
      .from("segments")
      .insert({ tenant_id: tenantId, name: "Someone else's", created_by: viewer.id });
    assert.equal(theirs.error?.code, "42501", "never in another member's");
    const byViewer = await viewer.session
      .from("segments")
      .insert({ tenant_id: tenantId, name: "Mine", created_by: viewer.id });
    assert.equal(byViewer.error?.code, "42501", "a viewer makes none");
    assert.deepEqual(
      ok(await viewer.session.from("segments").select("id, name").eq("tenant_id", tenantId)),
      [{ id: mine.data.id, name: "Regulars" }],
      "every member reads the workspace's lists",
    );
    const renamed = await operator.session
      .from("segments")
      .update({ name: "Best" })
      .eq("id", mine.data.id)
      .select("name");
    assert.deepEqual([renamed.error, renamed.data], [null, [{ name: "Best" }]], "a rename");
    const moved = await operator.session.from("segments").update({ created_by: viewer.id }).eq("id", mine.data.id);
    assert.equal(moved.error?.code, "42501", "and nothing else about it: who made it is kept");
  },
);

test(
  "a list holds the workspace's own people, never another's, never one erased; an erased person leaves every list",
  { skip },
  async () => {
    // Pinned as 00044's text in people/lists/saved-lists.test.mjs until 26 Nov 2026.
    const tenantId = await workspace("Members");
    const elsewhere = await workspace("Members elsewhere");
    const operator = await member(tenantId, "operator");
    const listId = await makeList(tenantId, "Regulars");
    const ours = await person(tenantId, "+13055550161");
    const stranger = await person(elsewhere, "+13055550162");
    const add = (contact_id) =>
      operator.session
        .from("segment_members")
        .insert({ segment_id: listId, contact_id, tenant_id: tenantId, added_by: operator.id });
    assert.equal((await add(ours)).error, null, "the workspace's own person");
    assert.equal((await add(stranger)).error?.code, "42501", "another workspace's is refused");
    const leaving = await person(tenantId, "+13055550163");
    ok(await db.from("segment_members").insert({ segment_id: listId, contact_id: leaving, tenant_id: tenantId }));
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", leaving));
    assert.deepEqual(
      ok(await db.from("segment_members").select("contact_id").eq("segment_id", listId)).map((r) => r.contact_id),
      [ours],
      "an erased person leaves every list",
    );
    assert.equal((await add(leaving)).error?.code, "42501", "and is never put back on one");
  },
);
