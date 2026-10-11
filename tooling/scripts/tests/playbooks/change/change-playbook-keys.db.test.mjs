/**
 * 00395 on a real Postgres: a campaign ends, runs on trial, and changes its words.
 *
 *   1. The migration runs again, twice, and changes nothing: playbooks.until is a date and playbooks.trial_until a
 *      timestamptz, both null with no default, each saying what it is, a member's session may write both, and the
 *      change_playbook door is the same function with the same grants.
 *   2. The door takes the three keys beside the six: `until`, `trial_until` and `params` are each written where they
 *      differ from the row, answered as `was`, and recorded in the same transaction with the decision the caller names
 *      (its payload names each key changed, as it does for the six). The two dates take null, which clears them (an
 *      undo puts back what was there, and a campaign may stop ending or leave its trial); `params` is an array of
 *      strings, never null. A key outside the nine is refused as before, and nothing is written.
 *
 * Local stack only: it makes workspaces, members and playbooks with the service key and removes them after, and runs
 * the migration through ../../google/_db-stack.mjs, which first holds the stack under SUPABASE_WORKDIR to the one
 * SUPABASE_URL names and fails the suite where they differ. Every change is made as a signed-in member: the door is
 * security invoker, so the table's update policy and column grants judge it.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { migrationNamed, query, runMigration } from "../../google/_db-stack.mjs";

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

const MIGRATION = "a_campaign_ends_and_runs_on_trial";

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
  // A database the replay built holds the columns and the door already; one that has not reached 00395 gets them here.
  runMigration(migrationNamed(MIGRATION));
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
  ok(await db.from("playbooks").select("state, params, until, trial_until").eq("id", id).single());
const decisions = async (id) =>
  ok(
    await db
      .from("decisions")
      .select("verb, actor_user_id, payload")
      .eq("tenant_id", tenantId)
      .eq("subject_id", id)
      .order("created_at", { ascending: true }),
  );
/** The member's one call, the decision naming what it changes as the route names it. */
const change = (who, id, set) =>
  who.client.rpc("change_playbook", {
    p_tenant_id: tenantId,
    p_playbook_id: id,
    p_set: set,
    p_decision: { name: "Win-back", ...set },
  });
/** An instant as a number, however it was spelled. */
const at = (iso) => (iso == null ? null : Date.parse(iso));

/** The two columns as the catalog says them, with their comments and the member's grants. */
const columns = () =>
  query(
    `select c.column_name, c.data_type, c.is_nullable, c.column_default,
            col_description('public.playbooks'::regclass, c.ordinal_position::int) as comment,
            has_column_privilege('authenticated', 'public.playbooks', c.column_name, 'INSERT') as may_insert,
            has_column_privilege('authenticated', 'public.playbooks', c.column_name, 'UPDATE') as may_update
       from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'playbooks' and c.column_name in ('until', 'trial_until')
      order by c.column_name`,
  );
/** The door as the catalog holds it: its whole definition, hashed, and who may call it. */
const door = () =>
  query(
    `select md5(pg_get_functiondef(f)) as definition,
            has_function_privilege('authenticated', f, 'EXECUTE') as member,
            has_function_privilege('anon', f, 'EXECUTE') as anon
       from (select 'public.change_playbook(uuid, uuid, jsonb, jsonb, text, uuid)'::regprocedure as f) d`,
  );

test(
  "00395 runs again, twice, and changes nothing: until is a date and trial_until a timestamptz, null, with no default, each saying what it is and written by a member's session, and the door is the same",
  { skip },
  () => {
    const once = columns();
    assert.deepEqual(
      once.map((c) => [c.column_name, c.data_type, c.is_nullable, c.column_default, c.may_insert, c.may_update]),
      [
        ["trial_until", "timestamp with time zone", "YES", null, true, true],
        ["until", "date", "YES", null, true, true],
      ],
    );
    assert.match(once[0].comment, /^Until when this campaign runs on trial/);
    assert.match(once[1].comment, /^The last day this campaign runs/);
    const doorOnce = door();
    assert.deepEqual([doorOnce[0].member, doorOnce[0].anon], [true, false]);
    runMigration(migrationNamed(MIGRATION));
    runMigration(migrationNamed(MIGRATION));
    assert.deepEqual(columns(), once);
    assert.deepEqual(door(), doorOnce);
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
  "change_playbook takes trial_until: the instant written, however it is spelled, its line naming it; null ends the trial",
  { skip },
  async () => {
    const id = await winBack();
    const who = await operator();
    const week = "2026-10-17T15:00:00.000Z";
    const out = ok(await change(who, id, { trial_until: week }));
    assert.deepEqual(out.was, { trial_until: null });
    assert.equal(at((await row(id)).trial_until), at(week));
    const [line] = await decisions(id);
    assert.deepEqual([line.verb, line.payload.trial_until], ["change_playbook", week]);
    // The same instant spelled on another clock differs from nothing: no line.
    const same = ok(await change(who, id, { trial_until: "2026-10-17T11:00:00-04:00" }));
    assert.deepEqual([same.was, same.decision_id], [{}, null]);
    // Out of its trial early: null ends it, and what it held is answered.
    const ended = ok(await change(who, id, { trial_until: null }));
    assert.deepEqual(Object.keys(ended.was), ["trial_until"]);
    assert.equal(at(ended.was.trial_until), at(week));
    assert.equal((await row(id)).trial_until, null);
    assert.deepEqual(
      (await decisions(id)).map((d) => d.verb),
      ["change_playbook", "change_playbook"],
    );
  },
);

test(
  "change_playbook takes params: the message's slot text written whole, its line naming it; anything but an array of strings is refused and nothing is written",
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
    for (const params of [null, "10% off colour", [1], [["10% off"]], { offer: "10% off" }]) {
      const refused = await change(who, id, { params });
      assert.equal(refused.error?.code, "22023", `${JSON.stringify(params)}: ${refused.error?.message}`);
    }
    assert.deepEqual((await row(id)).params, ["10% off colour"]);
    assert.equal((await decisions(id)).length, 1);
  },
);

test(
  "a key outside the nine is refused as before, beside a key it takes too, and nothing is written",
  { skip },
  async () => {
    const id = await winBack();
    const who = await operator();
    const before_ = await row(id);
    for (const set of [{ ends: "2026-11-30" }, { until: "2026-11-30", template_id: templateId }]) {
      const refused = await change(who, id, set);
      assert.equal(refused.error?.code, "22023", `${Object.keys(set)}: ${refused.error?.message}`);
    }
    assert.deepEqual(await row(id), before_);
    assert.deepEqual(await decisions(id), []);
  },
);
