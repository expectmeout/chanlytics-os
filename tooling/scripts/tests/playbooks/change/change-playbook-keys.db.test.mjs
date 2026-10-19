/**
 * 00416 on a real Postgres, as 00461 and 00462 left it: a campaign ends and changes its words; the trial is gone.
 *
 *   1. The column stands where 00440 moved the playbooks (decision 0060, sequence_steps): until is a date, null with no
 *      default, saying what it is, a member's session may write it, and the change_playbook and start_playbook doors are
 *      a member's. trial_until is gone (00462): a sequence's first batch's OK is its trial (decision 0064).
 *   2. The door takes until and params beside the six (and its sequence's mode, which a-sequence-is-approved-once
 *      proves): each is written where it differs from the row, answered as `was`, and recorded in the same transaction
 *      with the decision the caller names (its payload names each key changed, as it does for the six). until takes
 *      null, which clears it (an undo puts back what was there, and a campaign may stop ending); `params` is an array,
 *      never null, whose elements are core's to judge (the ParamSpecs the route builds, contracts parseParamSpecs), so
 *      what a campaign's params held is written back by an undo. A key outside the nine, trial_until now among them, is
 *      refused, and nothing is written.
 *   3. The start_playbook door writes the last day a new campaign names, as the day it is, and null where it names none.
 *
 * Local stack only: it makes workspaces, members and playbooks with the service key and removes them after, and reads
 * the catalog through ../../google/_db-stack.mjs, which first holds the stack under SUPABASE_WORKDIR to the one
 * SUPABASE_URL names and fails the suite where they differ. Every change is made as a signed-in member: the door is
 * security invoker, so the table's update policy and column grants judge it.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { query } from "../../google/_db-stack.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite runs a migration and writes playbooks and decisions"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

let db;
let tenantId;
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
      .insert({ slug: `change-keys-${Date.now()}`, name: "Harbor Studio" })
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
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A fresh operator of the workspace, signed in on a password. */
async function operator() {
  const email = `change-keys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenantId, user_id: made.data.user.id, role: "operator" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return { client, id: made.data.user.id };
}

/** A win-back by silence, running at ten, as the service role writes one for the suite. */
const winBack = async (over = {}) =>
  ok(
    await db
      .from("sequence_steps")
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
        ...over,
      })
      .select("id")
      .single(),
  ).id;

const row = async (id) => ok(await db.from("sequence_steps").select("state, params, until").eq("id", id).single());
const decisions = async (id) =>
  ok(
    await db
      .from("decisions")
      .select("verb, actor_user_id, payload, undo_of")
      .eq("tenant_id", tenantId)
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  );
/** The member's one call, the decision naming what it changes as the route names it. */
const change = (who, id, set, over = {}) =>
  who.client.rpc("change_playbook", {
    p_tenant_id: tenantId,
    p_playbook_id: id,
    p_set: set,
    p_decision: { name: "Win-back", ...set },
    ...over,
  });

/** The last day's column, and the trial's that is gone (00462), as the catalog says them, with the member's grants. */
const columns = () =>
  query(
    `select c.column_name, c.data_type, c.is_nullable, c.column_default,
            col_description('public.sequence_steps'::regclass, c.ordinal_position::int) as comment,
            has_column_privilege('authenticated', 'public.sequence_steps', c.column_name, 'INSERT') as may_insert,
            has_column_privilege('authenticated', 'public.sequence_steps', c.column_name, 'UPDATE') as may_update
       from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'sequence_steps' and c.column_name in ('until', 'trial_until')
      order by c.column_name`,
  );
/** A door as the catalog holds it: its whole definition, hashed, and who may call it. */
const door = (signature = "public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid)") =>
  query(
    `select md5(pg_get_functiondef(f)) as definition,
            has_function_privilege('authenticated', f, 'EXECUTE') as member,
            has_function_privilege('anon', f, 'EXECUTE') as anon
       from (select '${signature}'::regprocedure as f) d`,
  );
const START = "public.start_playbook(uuid, jsonb, jsonb, text, uuid)";

test(
  "00416's column stands on sequence_steps (0060): until is a date, null, with no default, saying what it is and written by a member's session; trial_until is gone (00462); and the doors are a member's",
  { skip },
  () => {
    const once = columns();
    assert.deepEqual(
      once.map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default, c.may_insert, c.may_update]),
      [["until", "date", "YES", null, true, true]],
    );
    assert.match(once[0].comment, /^The last day this campaign runs/);
    const [change] = door();
    assert.deepEqual([change.member, change.anon], [true, false]);
    const [start] = door(START);
    assert.deepEqual([start.member, start.anon], [true, false]);
  },
);

test(
  "change_playbook takes until: the day written, its line in the ledger naming it, what it held answered; beside a pause it is one write; null clears it",
  { skip },
  async () => {
    const id = await winBack();
    const who = await operator();
    const out = ok(await change(who, id, { until: "2026-11-30" }));
    assert.deepEqual([out.id, out.was, typeof out.decision_id], [id, { until: null }, "string"]);
    assert.equal((await row(id)).until, "2026-11-30");
    const [line] = await decisions(id);
    assert.deepEqual(
      [line.verb, line.actor_user_id, line.payload.until],
      ["change_playbook", who.id, "2026-11-30"],
      "the decision names the key it changed, as it does for the six",
    );
    // The same day again differs from nothing: no line.
    const same = ok(await change(who, id, { until: "2026-11-30" }));
    assert.deepEqual([same.was, same.decision_id], [{}, null]);
    // Beside a pause, one write and one line, the verb the state's.
    const paused = ok(await change(who, id, { state: "paused", until: "2026-12-31" }));
    assert.deepEqual(paused.was, { state: "running", until: "2026-11-30" });
    assert.deepEqual([(await row(id)).state, (await row(id)).until], ["paused", "2026-12-31"]);
    // A campaign that stops ending: null clears it, and what it held is answered for an undo to put back.
    const open = ok(await change(who, id, { until: null }));
    assert.deepEqual(open.was, { until: "2026-12-31" });
    assert.equal((await row(id)).until, null);
    assert.deepEqual(
      (await decisions(id)).map((d) => [d.verb, d.payload.until]),
      [
        ["change_playbook", "2026-11-30"],
        ["pause_playbook", "2026-12-31"],
        ["change_playbook", null],
      ],
    );
    // A day that is no day is refused by its cast, and nothing is written.
    const bad = await change(who, id, { until: "the end of November" });
    assert.equal(bad.error?.code, "22007", bad.error?.message);
    assert.equal((await row(id)).until, null);
    assert.equal((await decisions(id)).length, 3);
  },
);

test(
  "change_playbook takes params: the array written whole, its line naming it; a params that is no array is refused and nothing is written",
  { skip },
  async () => {
    const id = await winBack();
    const who = await operator();
    const out = ok(await change(who, id, { params: ["10% off colour"] }));
    assert.deepEqual(out.was, { params: [] });
    assert.deepEqual((await row(id)).params, ["10% off colour"]);
    const [line] = await decisions(id);
    assert.deepEqual([line.verb, line.payload.params], ["change_playbook", ["10% off colour"]]);
    const same = ok(await change(who, id, { params: ["10% off colour"] }));
    assert.deepEqual([same.was, same.decision_id], [{}, null]);
    // The door holds the shape a run reads, an array; what each element is, core judges before it is called.
    for (const params of [null, "10% off colour", { kind: "text", value: "10% off colour" }, 3]) {
      const refused = await change(who, id, { params });
      assert.equal(refused.error?.code, "22023", `${JSON.stringify(params)}: ${refused.error?.message}`);
    }
    assert.deepEqual((await row(id)).params, ["10% off colour"]);
    assert.equal((await decisions(id)).length, 1);
  },
);

test(
  "a campaign's params as the route stores them, slot specs, are changed and written back by an undo through the same door, the undo's line linked to the line it undoes",
  { skip },
  async () => {
    const held = [{ kind: "first_name" }, { kind: "text", value: "10% off" }];
    const next = [{ kind: "first_name" }, { kind: "text", value: "15% off a colour" }];
    const id = await winBack({ params: held });
    const who = await operator();
    const out = ok(await change(who, id, { params: next }));
    assert.deepEqual([out.was, typeof out.decision_id], [{ params: held }, "string"]);
    assert.deepEqual((await row(id)).params, next);
    // The undo: what it held, written back, naming the line it undoes.
    const undone = ok(await change(who, id, out.was, { p_undo_of: out.decision_id }));
    assert.deepEqual([undone.was, undone.undo_dropped], [{ params: next }, false]);
    assert.deepEqual((await row(id)).params, held);
    assert.deepEqual(
      (await decisions(id)).map((d) => [d.verb, d.payload.params, d.undo_of]),
      [
        ["change_playbook", next, null],
        ["change_playbook", held, out.decision_id],
      ],
    );
  },
);

test(
  "a key outside the nine is refused as before, beside a key it takes too, and nothing is written",
  { skip },
  async () => {
    const id = await winBack();
    const who = await operator();
    const before_ = await row(id);
    // The trial among them since 00462: a sequence's first batch's OK is its trial (decision 0064).
    for (const set of [
      { ends: "2026-11-30" },
      { until: "2026-11-30", template_id: templateId },
      { trial_until: null },
      { trial_until: "2026-10-17T15:00:00Z" },
    ]) {
      const refused = await change(who, id, set);
      assert.equal(refused.error?.code, "22023", `${Object.keys(set)}: ${refused.error?.message}`);
    }
    assert.deepEqual(await row(id), before_);
    assert.deepEqual(await decisions(id), []);
  },
);

test(
  "start_playbook writes the last day a new campaign names, as the day it is, its line the member's; one naming none has none; a day that is no day starts nothing",
  { skip },
  async () => {
    const who = await operator();
    /** A new win-back as the route names it (startNewPlaybook), with `over` laid on. */
    const start = (over) =>
      who.client.rpc("start_playbook", {
        p_tenant_id: tenantId,
        p_playbook: {
          name: "Win-back",
          trigger: "quiet_30",
          list_id: null,
          list_key: null,
          template_id: templateId,
          template_name: "winback_offer",
          template_language: "en_US",
          params: [],
          policy_class: "reengage",
          run_hour: 10,
          cap_per_run: 25,
          gap_days: 90,
          cadence_days: 30,
          channels: ["whatsapp"],
          ...over,
        },
        p_decision: { name: over.name ?? "Win-back" },
      });
    const ending = ok(await start({ name: "Ending", until: "2026-11-30" }));
    const made = await row(ending.id);
    assert.deepEqual([made.state, made.until], ["running", "2026-11-30"]);
    const [line] = await decisions(ending.id);
    assert.deepEqual([line.verb, line.actor_user_id], ["start_playbook", who.id]);
    const plain = ok(await start({ name: "Open-ended" }));
    assert.equal((await row(plain.id)).until, null);
    const bad = await start({ name: "Never started", until: "the end of November" });
    assert.equal(bad.error?.code, "22007", bad.error?.message);
    const named = ok(
      await db.from("sequence_steps").select("name").eq("tenant_id", tenantId).eq("name", "Never started"),
    );
    assert.deepEqual(named, []);
  },
);
