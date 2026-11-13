/**
 * "Couldn't check" is checked again (decision 0131, migrations 00618 and 00623).
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
 *   4. What 00623 mended, read on production the day after: an address on a name kept for examples is never asked, one
 *      never checked is due, one left 'checking' by a check that died is given back, and a workspace with no room is
 *      asked nothing and loses no try (it used to stand at the head of every workspace's line).
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

/**
 * A lead found by the search, as its round left it: its address's state, when it was checked, and its class. Its address
 * is on a made-up name that is no example's: one on a name kept for examples (RFC 2606) is never asked (00623), which
 * `email` is for.
 */
async function found(
  n,
  {
    cls = "qualified",
    state = "unknown",
    checked = ago(2 * DAY),
    rechecks = 0,
    round = L.round,
    search = L.search,
    email = `hello@plumber${n}-${stamp}.madeup-fixture.com`,
  },
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
        email,
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
      search_id: search,
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
/** What the clock's door answers when it asked `asked`, with none held for room and none given back. */
const asked = (n) => ({ asked: n, held: 0, freed: 0 });
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
    const taken = ok(
      await owner.rpc("lead_check_again", { p_tenant_id: A, p_lead_ids: [L.kept, L.review, L.checked, L.excluded] }),
    );
    assert.deepEqual(taken, { scheduled: 2, skipped: 2 });
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
  assert.deepEqual(ok(await retry()), asked(2));
  assert.deepEqual((await checksAsked()).sort(), [L.kept, L.review].sort(), "not one checked within the day");
  for (const id of [L.kept, L.review])
    assert.deepEqual(await stateOf(id), { email_state: "checking", email_rechecks: 1 });
  for (const id of [L.fresh, L.twice, L.checked, L.excluded])
    assert.notEqual((await stateOf(id)).email_state, "checking", "not due, tried twice, checked or left out");
  assert.deepEqual(ok(await retry()), asked(0), "an address being checked is not asked twice");

  await unanswered([L.kept, L.review]);
  assert.deepEqual(ok(await retry()), asked(2), "a second try, a day after the first did not answer");
  assert.equal((await stateOf(L.kept)).email_rechecks, 2);
  await unanswered([L.kept, L.review]);
  assert.deepEqual(ok(await retry()), asked(0), "never a third time by itself");
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
    assert.deepEqual(ok(await retry()), asked(0));
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

/** Every address of the workspace a call left 'checking' is back as a check that did not answer; its jobs go. */
async function settle() {
  ok(
    await db
      .from("leads")
      .update({ email_state: "unknown", email_checked_at: ago(2 * DAY) })
      .eq("tenant_id", A)
      .eq("email_state", "checking"),
  );
  ok(await db.from("jobs").delete().eq("tenant_id", A).eq("kind", "lead_check"));
}

test(
  "an address on a name kept for examples is never asked: its tries are spent unasked (00623)",
  { skip },
  async () => {
    const sample = await found(7, { email: `hello@plumber7-${stamp}.example` });
    const under = await found(8, { email: `hello@mail-${stamp}.example.com` });
    const near = await found(9, { email: `hello@notexample-${stamp}.madeup-fixture.com` });
    ok(await retry());
    assert.deepEqual(await stateOf(sample), { email_state: "unknown", email_rechecks: 2 }, "no mailbox to ask");
    assert.deepEqual(await stateOf(under), { email_state: "unknown", email_rechecks: 2 }, "nor under example.com");
    assert.deepEqual(
      await stateOf(near),
      { email_state: "checking", email_rechecks: 1 },
      "a name that only looks like one is asked",
    );
    const named = await checksAsked();
    assert.ok(!named.includes(sample) && !named.includes(under), "no check is paid for either");
    // A press is its owner's: Check again still takes one.
    assert.equal(ok(await owner.rpc("lead_check_again", { p_tenant_id: A, p_lead_ids: [sample] })).scheduled, 1);
    await settle();
  },
);

test("an address never checked is due: a new one chosen with no room is asked (00623)", { skip }, async () => {
  const never = await found(10, { checked: null });
  ok(await retry());
  assert.deepEqual(await stateOf(never), { email_state: "checking", email_rechecks: 1 });
  await settle();
});

test(
  "an address left checking by a check that died is given back; one with its job on its way, or its search still running, is left (00623)",
  { skip },
  async () => {
    const dead = await found(11, { state: "checking" });
    const live = await found(12, { state: "checking" });
    // A search of its own, with a round still going: a second round of the ended search would need a signed-in person.
    const other = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          via: "people",
          card: "local_businesses",
          name: "Roofers",
          asked: "",
          plan: { version: 1 },
        })
        .select("id")
        .single(),
    ).id;
    const open = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: other,
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
    const searching = await found(13, { state: "checking", round: open, search: other });
    try {
      ok(
        await db.from("jobs").insert({
          tenant_id: A,
          kind: "lead_check",
          due_at: new Date(Date.now() + DAY).toISOString(),
          payload: { round_id: L.round, batch: 0, again: `live-${stamp}`, lead_ids: [live] },
        }),
      );
      assert.equal(ok(await retry()).freed, 1, "the one nothing will ever answer for");
      assert.deepEqual(
        await stateOf(dead),
        { email_state: "unknown", email_rechecks: 0 },
        "given back to Couldn't check, and a check that died is no try of the clock's",
      );
      assert.equal((await stateOf(live)).email_state, "checking", "its check is on its way");
      assert.equal((await stateOf(searching)).email_state, "checking", "its search still runs, and checks its own");
      assert.equal(ok(await retry()).freed, 0, "given back once");
    } finally {
      ok(await db.rpc("lead_round_end", { p_round_id: open, p_ending: "target_reached" }));
      await settle();
    }
  },
);

test(
  "a workspace with no room in its searching is asked nothing, loses no try, and says how many wait (00623)",
  { skip },
  async () => {
    ok(
      await db
        .from("leads")
        .update({ email_state: "unknown", email_checked_at: ago(2 * DAY), email_rechecks: 0 })
        .eq("id", L.kept),
    );
    // Its month's searching, used up: lead_spend_room refuses the check, as it refuses a search.
    const month = ok(await db.rpc("lead_month", { p_tenant_id: A }));
    const used = { tenant_id: A, kind: "budget", period: month };
    ok(await db.from("lead_counters").upsert({ ...used, used: 99999 }, { onConflict: "tenant_id,kind,period" }));
    try {
      const answer = ok(await retry());
      assert.equal(answer.asked, 0);
      assert.ok(answer.held >= 1, "it says how many wait for room");
      assert.deepEqual(
        await stateOf(L.kept),
        { email_state: "unknown", email_rechecks: 0 },
        "a day with no room costs none of an address's two tries",
      );
      assert.deepEqual(await checksAsked(), [], "and nothing is queued");
    } finally {
      ok(await db.from("lead_counters").upsert({ ...used, used: 0 }, { onConflict: "tenant_id,kind,period" }));
    }
    // With room again the same address is asked: the wait cost it nothing.
    ok(await retry());
    assert.deepEqual(await stateOf(L.kept), { email_state: "checking", email_rechecks: 1 });
    await settle();
  },
);

test("the clock's door is the service role's alone", { skip }, async () => {
  const refused = await retry(owner);
  assert.ok(refused.error, "a member may not call it");
  assert.equal(refused.error.code, "42501", refused.error.message);
});
