/**
 * "Couldn't check" is checked again (decision 0131, migration 00618).
 *
 * An address whose mailbox check did not answer (`email_state = 'unknown'`) stood so for good: nothing tried again by
 * itself, and Check again (lead_check_again, 00506) took only a lead in Needs review, so a lead the search judged a fit
 * and kept (Brooklyn's three, 25 Oct 2026) could never be checked again by anyone, and no sequence could write to it.
 *
 *   1. Check again takes a kept lead as well as one in Needs review, while its search's round has finished; never an
 *      address that was checked, one left out, or one with no round to check under.
 *   2. The leads clock asks again by itself (lead_check_retry): each address a day after its last check, at most twice,
 *      only in a workspace whose searching is on and may spend, and it counts each try (leads.email_rechecks).
 *   3. The clock's door is the service role's alone.
 *
 * Local stack only: it makes a workspace, its members, a search, a round and leads with the service key, removes them.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { takeLock } from "../../_file-lock.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const DAY = 86_400_000;
const stamp = Date.now().toString(36);
let db;
let A;
let owner;
let releaseList;
let platformBefore = [];
const users = [];
const L = {};

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (ms) => new Date(Date.now() - ms).toISOString();

async function memberClient(role) {
  const email = `again-${role}-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal((await client.auth.signInWithPassword({ email, password })).error, null);
  return client;
}

/** A lead found by the search, as its round left it: its address's state, when it was checked, and its class. */
async function found(
  n,
  { cls = "qualified", state = "unknown", checked = ago(2 * DAY), rechecks = 0, round = L.round },
) {
  const lead = ok(
    await db
      .from("leads")
      .insert({
        tenant_id: A,
        place_id: `ChIJagain${stamp}${n}`,
        business_name: `Plumber ${n}`,
        city: "Brooklyn",
        region: "NY",
        website_host: `plumber${n}-${stamp}.example`,
        email: `hello@plumber${n}-${stamp}.example`,
        email_state: state,
        email_checked_at: checked,
        email_rechecks: rechecks,
        stage: "ready",
      })
      .select("id")
      .single(),
  ).id;
  ok(
    await db.from("lead_search_members").insert({
      search_id: L.search,
      lead_id: lead,
      round_id: round,
      tenant_id: A,
      judgment: { reasons: cls === "review" ? ["email:unknown"] : [], shares: [] },
      class: cls,
      fit: cls === "excluded" ? null : "strong",
      reason: "A fixture.",
      counted: cls === "qualified",
      counted_month: cls === "qualified" ? "2026-11" : null,
    }),
  );
  return lead;
}

const stateOf = async (id) => ok(await db.from("leads").select("email_state, email_rechecks").eq("id", id).single());
const checksAsked = async () =>
  ok(await db.from("jobs").select("payload").eq("tenant_id", A).eq("kind", "lead_check")).flatMap(
    (j) => j.payload.lead_ids ?? [],
  );
/** Back as a check that did not answer leaves it, a day and more ago; the jobs it made go. */
async function unanswered(ids) {
  ok(
    await db
      .from("leads")
      .update({ email_state: "unknown", email_checked_at: ago(2 * DAY) })
      .in("id", ids),
  );
  ok(await db.from("jobs").delete().eq("tenant_id", A).eq("kind", "lead_check"));
}
const retry = (client = db) => client.rpc("lead_check_retry", { p_limit: 100, p_tenant_id: A });

before(async () => {
  if (skip) return;
  releaseList = await takeLock("lead-platform-list");
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `again-${stamp}`, name: "Harbor Plumbing", timezone: "America/New_York" })
      .select("id")
      .single(),
  ).id;
  // A workspace that may spend (00364), with its searching switched on for the test.
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }));
  const platform = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
  platformBefore = platform.tenants_on ?? [];
  ok(
    await db
      .from("lead_platform")
      .update({ tenants_on: [...platformBefore, A] })
      .eq("id", true),
  );
  owner = await memberClient("owner");
  L.search = ok(
    await db
      .from("lead_searches")
      .insert({
        tenant_id: A,
        via: "people",
        card: "local_businesses",
        name: "Plumbers",
        asked: "",
        plan: { version: 1 },
      })
      .select("id")
      .single(),
  ).id;
  L.round = ok(
    await db
      .from("lead_rounds")
      .insert({
        tenant_id: A,
        search_id: L.search,
        seq: 1,
        purpose: "probe",
        plan: { version: 1 },
        plan_version: 1,
        target: 10,
        state: "queued",
        month: "2026-11",
        day: "2026-11-12",
        platform_day: "2026-11-12",
      })
      .select("id")
      .single(),
  ).id;
  // A round starts queued and ends through its door, as a real one does.
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: L.round, p_ending: "target_reached" })), true);
  L.kept = await found(1, {});
  L.review = await found(2, { cls: "review" });
  L.fresh = await found(3, { checked: ago(DAY / 4) });
  L.twice = await found(4, { rechecks: 2 });
  L.checked = await found(5, { state: "ok" });
  L.excluded = await found(6, { cls: "excluded" });
});

after(async () => {
  try {
    if (skip || !db) return;
    await db.from("lead_platform").update({ tenants_on: platformBefore }).eq("id", true);
    await db.from("events").delete().eq("tenant_id", A);
    await db.from("tenants").delete().eq("id", A);
    for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
  } finally {
    await releaseList?.();
  }
});

test(
  "Check again takes a kept lead as well as one in Needs review, and never an address checked or left out",
  { skip },
  async () => {
    const asked = ok(
      await owner.rpc("lead_check_again", { p_tenant_id: A, p_lead_ids: [L.kept, L.review, L.checked, L.excluded] }),
    );
    assert.deepEqual(asked, { scheduled: 2, skipped: 2 });
    assert.equal((await stateOf(L.kept)).email_state, "checking", "a kept lead is asked: Brooklyn's three were");
    assert.equal((await stateOf(L.review)).email_state, "checking");
    assert.equal((await stateOf(L.checked)).email_state, "ok", "an address that was checked is not asked");
    assert.equal((await stateOf(L.excluded)).email_state, "unknown", "a lead left out is not asked");
    assert.deepEqual((await checksAsked()).sort(), [L.kept, L.review].sort(), "one job, under the round");
    assert.equal((await stateOf(L.kept)).email_rechecks, 0, "a press is the owner's, never one of the clock's tries");
    await unanswered([L.kept, L.review]);
  },
);

test("the clock asks again a day after the last check, at most twice, and counts each try", { skip }, async () => {
  assert.deepEqual(ok(await retry()), { asked: 2, held: 0 });
  assert.deepEqual((await checksAsked()).sort(), [L.kept, L.review].sort(), "not one checked within the day");
  for (const id of [L.kept, L.review])
    assert.deepEqual(await stateOf(id), { email_state: "checking", email_rechecks: 1 });
  for (const id of [L.fresh, L.twice, L.checked, L.excluded])
    assert.notEqual((await stateOf(id)).email_state, "checking", "not due, tried twice, checked or left out");
  assert.deepEqual(ok(await retry()), { asked: 0, held: 0 }, "an address being checked is not asked twice");

  await unanswered([L.kept, L.review]);
  assert.deepEqual(ok(await retry()), { asked: 2, held: 0 }, "a second try, a day after the first did not answer");
  assert.equal((await stateOf(L.kept)).email_rechecks, 2);
  await unanswered([L.kept, L.review]);
  assert.deepEqual(ok(await retry()), { asked: 0, held: 0 }, "never a third time by itself");
  assert.equal((await stateOf(L.kept)).email_state, "unknown", "it stays Couldn't check, for Check again");
  assert.deepEqual(ok(await owner.rpc("lead_check_again", { p_tenant_id: A, p_lead_ids: [L.kept] })), {
    scheduled: 1,
    skipped: 0,
  });
  await unanswered([L.kept]);
});

test("the clock asks nothing of a workspace whose searching is off, and counts no try", { skip }, async () => {
  ok(await db.from("leads").update({ email_rechecks: 0 }).eq("id", L.kept));
  ok(await db.from("lead_platform").update({ tenants_on: platformBefore }).eq("id", true));
  try {
    assert.deepEqual(ok(await retry()), { asked: 0, held: 0 });
    assert.deepEqual(await stateOf(L.kept), { email_state: "unknown", email_rechecks: 0 });
  } finally {
    ok(
      await db
        .from("lead_platform")
        .update({ tenants_on: [...platformBefore, A] })
        .eq("id", true),
    );
  }
});

test("the clock's door is the service role's alone", { skip }, async () => {
  const refused = await retry(owner);
  assert.ok(refused.error, "a member may not call it");
  assert.equal(refused.error.code, "42501", refused.error.message);
});
