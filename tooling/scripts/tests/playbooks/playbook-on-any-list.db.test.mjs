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

/** A real session for a fresh user with this role in this workspace, and who they are. */
async function signedIn(role, tenant) {
  const email = `start-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return { client, id: made.data.user.id };
}

// 00357: the member's one call for a new playbook, on the member's own rights.
test(
  "start_playbook: a playbook and its line in the ledger are one write, judged by the table's own policy; what it refuses leaves neither",
  { skip },
  async () => {
    const elsewhere = ok(
      await db
        .from("tenants")
        .insert({ slug: `any-list-else-${Date.now()}`, name: "Elsewhere" })
        .select("id")
        .single(),
    ).id;
    try {
      const theirTemplate = ok(
        await db
          .from("templates")
          .insert({
            tenant_id: elsewhere,
            channel: "whatsapp",
            name: "winback_offer",
            language: "en_US",
            meta_status: "approved",
          })
          .select("id")
          .single(),
      ).id;
      const operator = await signedIn("operator", tenantId);
      const viewer = await signedIn("viewer", tenantId);
      const stranger = await signedIn("owner", elsewhere);
      const named = (over) => ({
        name: "Quiet a month",
        trigger: "quiet_30",
        template_id: templateId,
        template_name: "winback_offer",
        template_language: "en_US",
        params: [{ kind: "name" }],
        policy_class: "reengage",
        run_hour: 11,
        cap_per_run: 40,
        gap_days: 60,
        cadence_days: 30,
        channels: ["whatsapp", "email"],
        ...over,
      });
      const start = (who, playbook_, over = {}) =>
        who.client.rpc("start_playbook", {
          p_tenant_id: tenantId,
          p_playbook: playbook_,
          p_decision: { name: playbook_.name, trigger: playbook_.trigger },
          ...over,
        });
      const count = async (table, verb) => {
        const q = db.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
        const r = await (verb ? q.eq("verb", verb) : q);
        assert.equal(r.error, null, r.error?.message);
        return r.count;
      };
      const standing = async () => [await count("playbooks"), await count("decisions", "start_playbook")];
      const before_ = await standing();

      // An operator's: the row, running, theirs, a moment, with what they named; and its line, said from Ask. What a
      // caller says of the workspace, who made it, its state and its kind is not theirs to say.
      const made = ok(
        await start(
          operator,
          named({ tenant_id: elsewhere, created_by: viewer.id, state: "paused", kind: "reach_out" }),
          { p_via: "ask" },
        ),
      );
      assert.deepEqual([typeof made.id, typeof made.decision_id, made.undo_dropped], ["string", "string", false]);
      const row = ok(
        await db
          .from("playbooks")
          .select(
            "tenant_id, name, trigger, template_id, params, policy_class, state, kind, run_hour, cap_per_run, gap_days, cadence_days, channels, created_by, list_id, list_key",
          )
          .eq("id", made.id)
          .single(),
      );
      assert.deepEqual(row, {
        tenant_id: tenantId,
        name: "Quiet a month",
        trigger: "quiet_30",
        template_id: templateId,
        params: [{ kind: "name" }],
        policy_class: "reengage",
        state: "running",
        kind: "moment",
        run_hour: 11,
        cap_per_run: 40,
        gap_days: 60,
        cadence_days: 30,
        channels: ["whatsapp", "email"],
        created_by: operator.id,
        list_id: null,
        list_key: null,
      });
      const line = ok(
        await db
          .from("decisions")
          .select("tenant_id, subject_type, subject_id, verb, actor_type, actor_user_id, payload, undo_of")
          .eq("id", made.decision_id)
          .single(),
      );
      assert.deepEqual(line, {
        tenant_id: tenantId,
        subject_type: "playbook",
        subject_id: made.id,
        verb: "start_playbook",
        actor_type: "user",
        actor_user_id: operator.id,
        payload: { name: "Quiet a month", trigger: "quiet_30", via: "ask" },
        undo_of: null,
      });
      // On one of the workspace's own lists, with an undo link nobody holds: started, and the link dropped and said.
      const listed = ok(
        await start(
          operator,
          named({ name: "Regulars", trigger: "saved_list", policy_class: "campaign", list_id: listA }),
          {
            p_undo_of: "00000000-0000-4000-8000-000000000357",
          },
        ),
      );
      assert.equal(listed.undo_dropped, true);
      assert.deepEqual(await standing(), [before_[0] + 2, before_[1] + 2]);

      // Refused, each by the rule that refused the route's own insert, and neither a row nor a line is left.
      const refusals = [
        ["a viewer reads only", await start(viewer, named({})), "42501"],
        ["another workspace's member", await start(stranger, named({})), "42501"],
        ["another workspace's message", await start(operator, named({ template_id: theirTemplate })), "42501"],
        ["a cap the table refuses", await start(operator, named({ cap_per_run: 0 })), "23514"],
        [
          "a reach-out's moment, which is never a member's to insert",
          await start(operator, named({ trigger: "lead_first" })),
          "23514",
        ],
        ["a playbook named in part", await start(operator, named({ policy_class: null })), "23502"],
      ];
      for (const [why, r, code] of refusals) assert.equal(r.error?.code, code, `${why}: ${r.error?.message}`);
      const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
      const out = await anon.rpc("start_playbook", { p_tenant_id: tenantId, p_playbook: named({}) });
      assert.ok(out.error, "a caller nobody signed in as is refused");
      assert.deepEqual(await standing(), [before_[0] + 2, before_[1] + 2], "nothing refused left a row or a line");

      // member_decision by itself: a line as the caller's own, in a workspace they act in, and nobody else's.
      const own = ok(
        await operator.client.rpc("member_decision", {
          p_tenant_id: tenantId,
          p_subject_type: "playbook",
          p_subject_id: made.id,
          p_verb: "pause_playbook",
          p_payload: { name: "Quiet a month" },
        }),
      );
      const ownLine = ok(
        await db.from("decisions").select("actor_user_id, verb, payload").eq("id", own.decision_id).single(),
      );
      assert.deepEqual(ownLine, {
        actor_user_id: operator.id,
        verb: "pause_playbook",
        payload: { name: "Quiet a month" },
      });
      for (const [why, who] of [
        ["a viewer", viewer],
        ["another workspace's member", stranger],
      ]) {
        const r = await who.client.rpc("member_decision", {
          p_tenant_id: tenantId,
          p_subject_type: "playbook",
          p_subject_id: made.id,
          p_verb: "pause_playbook",
        });
        assert.equal(r.error?.code, "P0002", `${why}: ${r.error?.message}`);
      }
    } finally {
      await db.from("tenants").delete().eq("id", elsewhere);
    }
  },
);
