/**
 * A playbook changed in place and its line in the ledger are one write (the change_playbook door; the moment spec §4.9
 * A5, decision D26), against the replayed database: on the member's own rights, the row locked, only the columns named set,
 * the decision -- start_playbook, pause_playbook or change_playbook -- written as theirs in the same transaction, and what
 * each set column held answered as `was`. A viewer, a partner on a password alone, a member of another workspace and a
 * playbook of another workspace are told it is not there (P0002), and nothing is written. The suites run as the service
 * role, which passes RLS, so every call here is made as a signed-in member.
 *
 * Runs against a local stack built from every migration. Never production: `supabase start`, then `pnpm test:db` with
 * its keys.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { showSecondFactor } from "../../_second-factor.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes playbooks and decisions"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

let db;
let tenantId;
let elsewhere;
let templateId;
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
      .insert({ slug: `change-${Date.now()}`, name: "Change" })
      .select("id")
      .single(),
  ).id;
  elsewhere = ok(
    await db
      .from("tenants")
      .insert({ slug: `change-else-${Date.now()}`, name: "Elsewhere" })
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
});

after(async () => {
  if (skip) return;
  for (const t of [tenantId, elsewhere]) if (t) await db.from("tenants").delete().eq("id", t);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A fresh user with this role in this workspace, signed in on a password, with what signs them in again. */
async function signedIn(role, tenant) {
  const email = `change-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return { client, id: made.data.user.id, email, password };
}

/** A second session of the same person, on their password alone. */
async function passwordAlone(who) {
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email: who.email, password: who.password }));
  return { client, id: who.id };
}

/** A win-back by silence, running at ten, as the service role writes one for the suite. */
const winBack = async () =>
  ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: tenantId,
        name: "Win-back",
        trigger: "quiet_30",
        template_id: templateId,
        template_name: "winback_offer",
        template_language: "en_US",
        params: [],
        policy_class: "reengage",
        state: "running",
        run_hour: 10,
        cap_per_run: 25,
        gap_days: 90,
        cadence_days: 30,
      })
      .select("id")
      .single(),
  ).id;

const row = async (id) =>
  ok(
    await db
      .from("playbooks")
      .select("name, state, run_hour, cap_per_run, gap_days, cadence_days")
      .eq("id", id)
      .single(),
  );
const decisions = async (id) =>
  ok(
    await db
      .from("decisions")
      .select("verb, actor_user_id, payload")
      .eq("tenant_id", tenantId)
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  );
const change = (who, id, set, over = {}) =>
  who.client.rpc("change_playbook", {
    p_tenant_id: tenantId,
    p_playbook_id: id,
    p_set: set,
    p_decision: { name: "Win-back", ...set },
    ...over,
  });

test(
  "change_playbook: an operator's change writes only what it names and its line in the ledger, as theirs, and answers what each field held",
  { skip },
  async () => {
    const id = await winBack();
    const operator = await signedIn("operator", tenantId);
    const out = ok(await change(operator, id, { name: "Past clients", run_hour: 9 }, { p_via: "ask" }));
    assert.deepEqual(
      [out.id, out.was, typeof out.decision_id, out.undo_dropped],
      [id, { name: "Win-back", run_hour: 10 }, "string", false],
    );
    assert.deepEqual(await row(id), {
      name: "Past clients",
      state: "running",
      run_hour: 9,
      cap_per_run: 25,
      gap_days: 90,
      cadence_days: 30,
    });
    const [line] = await decisions(id);
    assert.deepEqual(
      [line.verb, line.actor_user_id, line.payload.run_hour, line.payload.via],
      ["change_playbook", operator.id, 9, "ask"],
    );
    // A pause is pause_playbook, a resume start_playbook: the verbs the drawer's switch always wrote.
    ok(await change(operator, id, { state: "paused" }));
    ok(await change(operator, id, { state: "running" }));
    assert.deepEqual(
      (await decisions(id)).map((d) => d.verb),
      ["change_playbook", "pause_playbook", "start_playbook"],
    );
  },
);

test(
  "change_playbook refuses a column outside the six and a change of nothing, and writes neither the row nor a line",
  { skip },
  async () => {
    const id = await winBack();
    const operator = await signedIn("operator", tenantId);
    const before_ = await row(id);
    const strange = await change(operator, id, { template_id: templateId });
    assert.equal(strange.error?.code, "22023", strange.error?.message);
    const empty = await change(operator, id, {});
    assert.equal(empty.error?.code, "22023", empty.error?.message);
    assert.deepEqual(await row(id), before_);
    assert.deepEqual(await decisions(id), []);
  },
);

test(
  "a viewer, a member of another workspace, and a playbook named under another workspace are told it is not there (P0002), and nothing is written",
  { skip },
  async () => {
    const id = await winBack();
    const viewer = await signedIn("viewer", tenantId);
    const stranger = await signedIn("owner", elsewhere);
    const operator = await signedIn("operator", tenantId);
    for (const [who, over] of [
      [viewer, {}],
      [stranger, {}],
      [stranger, { p_tenant_id: elsewhere }],
      [operator, { p_tenant_id: elsewhere }],
    ]) {
      const r = await change(who, id, { state: "paused" }, over);
      assert.equal(r.error?.code, "P0002", r.error?.message);
    }
    assert.equal((await row(id)).state, "running");
    assert.deepEqual(await decisions(id), []);
  },
);

test(
  "a partner's seat changes a campaign on a session that showed its second factor, and is told it is not there on its password alone",
  { skip },
  async () => {
    const id = await winBack();
    const partner = await signedIn("partner", tenantId);
    const password = await passwordAlone(partner);
    await showSecondFactor(partner.client);
    const refused = await change(password, id, { state: "paused" });
    assert.equal(refused.error?.code, "P0002", refused.error?.message);
    assert.equal((await row(id)).state, "running");
    assert.deepEqual(await decisions(id), []);
    const out = ok(await change(partner, id, { cap_per_run: 40 }));
    assert.deepEqual(out.was, { cap_per_run: 25 });
    assert.equal((await row(id)).cap_per_run, 40);
    assert.deepEqual(
      (await decisions(id)).map((d) => [d.verb, d.actor_user_id]),
      [["change_playbook", partner.id]],
    );
  },
);
