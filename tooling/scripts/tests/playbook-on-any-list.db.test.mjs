/**
 * A playbook may run on any list (00168, docs/decisions/0009-one-idea-of-a-list.md phase 2b), against the replayed
 * database.
 *
 * A saved_list playbook names one of People's lists by its id (list_key) or one of the workspace's own (list_id), never
 * both, and a key is an id's shape. And a member may move a playbook to another list: the column grant that is the fence
 * (00121) never named list_id, so the edit was refused as "permission denied for column list_id" in production.
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
      ? "refusing a database that is not on this machine: this suite writes playbooks and lists"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the operator this suite signs in as needs it"
        : false;

let db;
let tenantId;
let templateId;
let listA;
let listB;
const users = [];

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `any-list-${Date.now()}`, name: "Any list" })
      .select("id")
      .single(),
  ).id;
  templateId = ok(
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
  listA = ok(await db.from("segments").insert({ tenant_id: tenantId, name: "Regulars" }).select("id").single()).id;
  listB = ok(await db.from("segments").insert({ tenant_id: tenantId, name: "Walk-ins" }).select("id").single()).id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

const playbook = (over) => ({
  tenant_id: tenantId,
  name: `On a list ${Math.random().toString(36).slice(2, 7)}`,
  trigger: "saved_list",
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
  ...over,
});

test(
  "a playbook on a list names one of People's by its id, or one of the workspace's own, never both",
  { skip },
  async () => {
    const onPeoples = await db
      .from("playbooks")
      .insert(playbook({ list_key: "lapsed" }))
      .select("list_key")
      .single();
    assert.equal(onPeoples.error, null, onPeoples.error?.message);
    assert.equal(onPeoples.data.list_key, "lapsed");
    const both = await db.from("playbooks").insert(playbook({ list_key: "lapsed", list_id: listA }));
    assert.equal(both.error?.code, "23514", "one list, never two");
    assert.match(both.error?.message ?? "", /playbooks_one_list/);
    const shaped = await db.from("playbooks").insert(playbook({ list_key: "Drop Table" }));
    assert.equal(shaped.error?.code, "23514", "a key is a list's id, nothing else");
    assert.match(shaped.error?.message ?? "", /playbooks_list_key_shape/);
  },
);

test("an operator moves a playbook to another list: list_id and list_key are theirs to change", { skip }, async () => {
  const email = `any-list-${Date.now()}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "operator" }));
  const operator = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await operator.auth.signInWithPassword({ email, password }));

  const id = ok(
    await db
      .from("playbooks")
      .insert(playbook({ list_id: listA }))
      .select("id")
      .single(),
  ).id;
  // The page's edit, as the session sends it (playbooks/[id]/route.ts): a forbidden column raises, and RLS may hide a
  // row without raising, so the row is read back.
  const moved = await operator.from("playbooks").update({ list_id: listB, list_key: null }).eq("id", id).select("id");
  assert.equal(moved.error, null, `REGRESSION: the edit was refused: ${moved.error?.message}`);
  assert.equal(moved.data.length, 1, "the row was changed, not hidden");
  const onPeoples = await operator
    .from("playbooks")
    .update({ list_id: null, list_key: "quiet" })
    .eq("id", id)
    .select("list_key");
  assert.equal(onPeoples.error, null, onPeoples.error?.message);
  assert.deepEqual(onPeoples.data, [{ list_key: "quiet" }]);
});
