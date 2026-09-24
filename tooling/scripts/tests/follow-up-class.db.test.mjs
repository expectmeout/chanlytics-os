/**
 * A proposal may be followed up (00167, docs/decisions/0006-a-proposal-follow-up.md), against the replayed database.
 *
 * The trigger and its class are closed sets in the database as well as in contracts: a playbook of the follow-up is
 * accepted under its class, a trigger or a class nobody wrote is refused, and every new workspace gets its follow-ups
 * row as `ask` from the provisioner, so a run waits for a person until the owner says otherwise. money-lock.db.test.mjs
 * staying green is the proof the lock did not move.
 *
 * Runs against the local database the Database workflow builds from every migration. Never production:
 * `supabase start`, then `pnpm test:db` with its keys.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { POLICY_CLASSES } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes playbooks and policies"
      : false;

let db;
let tenantId;
let templateId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  // A new workspace: provision_tenant seeds the whole matrix as the tenants trigger calls it.
  const made = await db
    .from("tenants")
    .insert({ slug: `follow-up-${Date.now()}`, name: "Follow-up" })
    .select("id")
    .single();
  assert.equal(made.error, null, made.error?.message);
  tenantId = made.data.id;
  const tpl = await db
    .from("templates")
    .insert({
      tenant_id: tenantId,
      channel: "whatsapp",
      name: "proposal_follow_up",
      language: "en_US",
      meta_status: "approved",
    })
    .select("id")
    .single();
  assert.equal(tpl.error, null, tpl.error?.message);
  templateId = tpl.data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

test("a new workspace's follow-ups row is seeded as ask, beside every class contracts declares", { skip }, async () => {
  const { data, error } = await db
    .from("policies")
    .select("class, mode")
    .eq("tenant_id", tenantId)
    .is("subject_type", null);
  assert.equal(error, null, error?.message);
  const modes = Object.fromEntries(data.map((r) => [r.class, r.mode]));
  assert.deepEqual(Object.keys(modes).sort(), [...POLICY_CLASSES].sort(), "the matrix is contracts' classes, no more");
  assert.equal(modes.follow_up, "ask", "every run waits for a person until the owner says otherwise");
  // Its modes are the route's: auto, ask or never. The row moves; money's never does.
  const moved = await db
    .from("policies")
    .update({ mode: "auto" })
    .eq("tenant_id", tenantId)
    .eq("class", "follow_up")
    .is("subject_type", null)
    .select("mode");
  assert.equal(moved.error, null, moved.error?.message);
  assert.deepEqual(
    moved.data.map((r) => r.mode),
    ["auto"],
  );
  // The provisioner re-runs (the trigger, a backfill and onboarding may each call it): one row, the owner's mode kept.
  const rerun = await db.rpc("provision_tenant", { p_tenant_id: tenantId });
  assert.equal(rerun.error, null, rerun.error?.message);
  const rows = await db
    .from("policies")
    .select("mode")
    .eq("tenant_id", tenantId)
    .eq("class", "follow_up")
    .is("subject_type", null);
  assert.deepEqual(
    rows.data?.map((r) => r.mode),
    ["auto"],
  );
});

test(
  "the widened CHECKs take the follow-up's trigger and class, and still refuse what nobody wrote",
  { skip },
  async () => {
    const row = (over = {}) => ({
      tenant_id: tenantId,
      name: "Proposal follow-up",
      trigger: "proposal_waiting",
      template_id: templateId,
      template_name: "proposal_follow_up",
      template_language: "en_US",
      params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }],
      policy_class: "follow_up",
      ...over,
    });
    const made = await db.from("playbooks").insert(row()).select("trigger, policy_class").single();
    assert.equal(made.error, null, made.error?.message);
    assert.deepEqual([made.data.trigger, made.data.policy_class], ["proposal_waiting", "follow_up"]);
    const trigger = await db.from("playbooks").insert(row({ trigger: "proposal_forever" }));
    assert.match(trigger.error?.message ?? "", /playbooks_trigger_check/, "a trigger nobody wrote");
    const cls = await db.from("playbooks").insert(row({ policy_class: "money" }));
    assert.match(cls.error?.message ?? "", /playbooks_policy_class_check/, "a playbook never runs under money");
    const policy = await db.from("policies").insert({ tenant_id: tenantId, class: "nudges", mode: "ask" });
    assert.match(policy.error?.message ?? "", /policies_class_check/, "a class nobody wrote");
    // One follow-up per workspace: a second would owe every proposal a second nudge.
    const second = await db.from("playbooks").insert(row({ name: "Proposal follow-up, again" }));
    assert.equal(second.error?.code, "23505", second.error?.message);
    assert.match(second.error?.message ?? "", /playbooks_one_follow_up/, "the name the route says it in words by");
  },
);
