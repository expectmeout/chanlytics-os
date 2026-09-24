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
      await db.from("playbooks").insert({
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
