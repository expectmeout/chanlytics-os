/**
 * A trial's leads count against its own allowance at every door (decision 0090, 00525), on a real Postgres with real
 * sessions.
 *
 * 00512 made lead_allowance the cap a workspace counts its leads against: lead_cap('trial_leads') while its billing
 * says trialing, else the month's. Here a workspace on a trial, its month's counter set at the edge of 50, goes through
 * each door that counts a lead:
 *
 *   1. lead_allowance says contracts' leadAllowanceFor, status by status, to the service role and to the owner.
 *   2. A search and a list reserve (lead_reserve): each refuses past the 50, in the trial's words, and reserves nothing.
 *   3. Keep, Put back and a bulk Keep (lead_member_move) count the 50th and refuse the 51st in lead_reserve's words for
 *      a trial; on a plan the same counter counts on toward the month's 500.
 *   4. Check again's commit after its round ended (lead_check_commit) counts within the 50 and leaves the rest in Needs
 *      review with its address known good; on a plan it counts on.
 *
 * Local stack only: it makes a workspace and a person.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  BILLING_STATUSES,
  LEAD_MONTHLY_ALLOWANCE,
  LEAD_TRIAL_ALLOWANCE,
  leadAllowanceFor,
  leadImportEstimateUsd,
} from "@chanlytics/contracts";
import { estimateForRound } from "../../../../apps/dashboard/src/server/leads/lead-answers.ts";
import { takeLock } from "../_file-lock.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the owner this suite signs in as needs it"
        : false;

const stamp = Date.now().toString(36);
const at = (who) => `${who}-${stamp}@fixture-trial-doors.example`;
let db;
let A;
let owner;
let month;
const users = [];
const platformDays = new Set();
const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

// lead_reserve's words for a trial whose leads are found (00512), which Keep and Put back now say too.
const TRIAL_FOUND = `Your free trial includes ${LEAD_TRIAL_ALLOWANCE} leads, and they are found. Start your plan from Billing to find more.`;

const plan = (count) => ({
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "personal trainers in Austin",
  terms: ["personal trainer", "strength coach"],
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 25_000,
    query: "Austin, TX, USA",
  },
  count,
  contact: "email",
  criteria: [],
  exclusions: [],
});

const billing = async (status) =>
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "stripe", status }), `billing ${status}`);

/** The month's allowance counter, set as a month that has counted `used` leads and reserves none. */
const counted = async (used) =>
  ok(
    await db
      .from("lead_counters")
      .upsert(
        { tenant_id: A, kind: "allowance", period: month, used, reserved: 0 },
        { onConflict: "tenant_id,kind,period" },
      ),
    `allowance ${used}`,
  );

const allowance = async () => {
  const row = ok(
    await db
      .from("lead_counters")
      .select("used, reserved")
      .eq("tenant_id", A)
      .eq("kind", "allowance")
      .eq("period", month)
      .single(),
    "allowance",
  );
  return { used: Number(row.used), reserved: Number(row.reserved) };
};

/** A search that ran and ended, made while the trial had room: what Keep and Check again act on afterwards. */
const endedSearch = async () => {
  await counted(0);
  const made = ok(
    await owner.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: plan(1),
      p_via: "people",
      p_estimate_usd: estimateForRound(plan(1), "probe"),
    }),
    "a search on the trial",
  );
  assert.ok(made.search_id && made.round_id, JSON.stringify(made));
  ok(await db.rpc("lead_round_end", { p_round_id: made.round_id, p_ending: "stopped" }), "ended");
  return made;
};

/** A lead of the search, in Needs review for the reasons given. */
const inReview = async (search, name, reasons, emailState) => {
  const lead = ok(
    await db
      .from("leads")
      .insert({ tenant_id: A, business_name: `${name} Gym`, email: at(name), email_state: emailState })
      .select("id")
      .single(),
    `lead ${name}`,
  ).id;
  ok(
    await db.from("lead_search_members").insert({
      search_id: search.search_id,
      lead_id: lead,
      round_id: search.round_id,
      tenant_id: A,
      class: "review",
      judgment: { reasons },
      reason: "",
    }),
    `member ${name}`,
  );
  return lead;
};

const memberOf = async (search, lead) =>
  ok(
    await db
      .from("lead_search_members")
      .select("class, counted, counted_month")
      .eq("search_id", search.search_id)
      .eq("lead_id", lead)
      .single(),
    "member",
  );

// The platform's switch list is one array every lead suite reads and writes back: the lock for the whole file.
let releaseList;
before(async () => {
  if (skip) return;
  releaseList = await takeLock("lead-platform-list");
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `trial-doors-${stamp}`, name: "Trial Doors Co", timezone: "America/Chicago" })
      .select("id")
      .single(),
    "tenant",
  ).id;
  const email = at("owner");
  const password = `pw-${stamp}-owner-Aa1!`;
  const made = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user");
  users.push(made.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.user.id, role: "owner" }), "membership");
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await owner.auth.signInWithPassword({ email, password }), "sign in");
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single(), "switch");
  ok(
    await db
      .from("lead_platform")
      .update({ tenants_on: [...(p.tenants_on ?? []), A] })
      .eq("id", true),
    "switch on",
  );
  month = ok(await db.rpc("lead_month", { p_tenant_id: A }), "month");
  await billing("trialing");
});

after(async () => {
  try {
    if (skip) return;
    const p = await db.from("lead_platform").select("tenants_on").eq("id", true).single();
    if (p.data)
      await db
        .from("lead_platform")
        .update({ tenants_on: (p.data.tenants_on ?? []).filter((t) => t !== A) })
        .eq("id", true);
    if (A) {
      for (const r of (await db.from("lead_rounds").select("platform_day").eq("tenant_id", A)).data ?? [])
        platformDays.add(r.platform_day);
      await db.from("events").delete().eq("tenant_id", A);
      await db.from("tenants").delete().eq("id", A);
    }
    if (platformDays.size)
      await db
        .from("lead_counters")
        .delete()
        .is("tenant_id", null)
        .eq("kind", "day")
        .in("period", [...platformDays]);
    for (const id of users) await db.auth.admin.deleteUser(id).catch(() => undefined);
  } finally {
    await releaseList?.();
  }
});

test(
  "lead_allowance is contracts' leadAllowanceFor, status by status, to the service role and to the owner",
  { skip },
  async () => {
    assert.equal(Number(ok(await db.rpc("lead_cap", { p_name: "trial_leads" }), "cap")), LEAD_TRIAL_ALLOWANCE);
    try {
      for (const status of BILLING_STATUSES) {
        await billing(status);
        for (const [who, client] of [
          ["the service role", db],
          ["the owner", owner],
        ]) {
          const cap = Number(ok(await client.rpc("lead_allowance", { p_tenant_id: A }), `${who} ${status}`));
          assert.equal(cap, leadAllowanceFor(status), `${who}, ${status}`);
        }
      }
    } finally {
      await billing("trialing");
    }
  },
);

test("a search and a list stop at the trial's 50, in the trial's words, and reserve nothing", { skip }, async () => {
  const importing = (rows) =>
    owner.rpc("lead_search_import", {
      p_tenant_id: A,
      p_name: `Expo gyms ${stamp}`,
      p_asked: "",
      p_rows: Array.from({ length: rows }, (_, i) => ({ name: `Expo Gym ${i}`, email: at(`expo${rows}-${i}`) })),
      p_estimate_usd: leadImportEstimateUsd(rows),
    });

  await counted(LEAD_TRIAL_ALLOWANCE);
  const search = ok(
    await owner.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: plan(1),
      p_via: "people",
      p_estimate_usd: estimateForRound(plan(1), "probe"),
    }),
    "a search past the trial",
  );
  assert.deepEqual(search, { error: "month_leads_used", left: 0, sentence: TRIAL_FOUND });
  assert.deepEqual(ok(await importing(1), "a list past the trial"), {
    error: "month_leads_used",
    left: 0,
    sentence: `Your free trial includes ${LEAD_TRIAL_ALLOWANCE} leads, and they are used: a list counts each address that checks out. Start your plan from Billing to import more.`,
  });

  await counted(LEAD_TRIAL_ALLOWANCE - 2);
  assert.deepEqual(ok(await importing(3), "a list over what the trial has left"), {
    error: "month_leads_used",
    left: 2,
    sentence:
      "This list has 3 addresses to check and your free trial has 2 leads left; a list counts each address that checks out. Import at most 2 now, or start your plan from Billing to import them all.",
  });
  await counted(LEAD_TRIAL_ALLOWANCE - 1);
  assert.match(
    ok(await importing(2), "one left").sentence,
    /^This list has 2 addresses to check and your free trial has 1 lead left; /,
  );
  assert.deepEqual(await allowance(), { used: LEAD_TRIAL_ALLOWANCE - 1, reserved: 0 }, "nothing was reserved");

  // On a plan the list is refused at the month's 500, in the month's words.
  try {
    await billing("active");
    await counted(LEAD_MONTHLY_ALLOWANCE);
    assert.match(
      ok(await importing(1), "a list past the month").sentence,
      new RegExp(
        `^This month's ${LEAD_MONTHLY_ALLOWANCE} leads are used, and a list counts each address that checks out\\. Your leads renew on [A-Z][a-z]{2} 1\\.$`,
      ),
    );
  } finally {
    await billing("trialing");
  }
});

test(
  "Keep, Put back and a bulk Keep count the trial's 50th lead and refuse the 51st; a plan counts on",
  { skip },
  async () => {
    const search = await endedSearch();
    const k1 = await inReview(search, "keep1", ["fit:look"], "ok");
    const k2 = await inReview(search, "keep2", ["fit:look"], "ok");
    const k3 = await inReview(search, "keep3", ["fit:look"], "ok");
    const move = (verb, lead) => owner.rpc(verb, { p_search_id: search.search_id, p_lead_id: lead });

    await counted(LEAD_TRIAL_ALLOWANCE - 1);
    const kept = ok(await move("lead_member_keep", k1), "the 50th");
    assert.equal(kept.counted, true, JSON.stringify(kept));
    assert.deepEqual(await allowance(), { used: LEAD_TRIAL_ALLOWANCE, reserved: 0 });

    assert.deepEqual(ok(await move("lead_member_keep", k2), "the 51st"), {
      error: "month_leads_used",
      left: 0,
      sentence: TRIAL_FOUND,
    });
    ok(await move("lead_member_exclude", k3), "exclude is free");
    assert.deepEqual(ok(await move("lead_member_put_back", k3), "put back past the trial"), {
      error: "month_leads_used",
      left: 0,
      sentence: TRIAL_FOUND,
    });
    const bulk = ok(
      await owner.rpc("lead_bulk", { p_tenant_id: A, p_action: "keep", p_ids: [k2], p_search_id: search.search_id }),
      "a bulk keep past the trial",
    );
    assert.deepEqual([bulk.done, bulk.error, bulk.sentence], [0, "month_leads_used", TRIAL_FOUND]);
    assert.deepEqual(await allowance(), { used: LEAD_TRIAL_ALLOWANCE, reserved: 0 }, "the refusals counted nothing");
    assert.deepEqual(
      [(await memberOf(search, k2)).class, (await memberOf(search, k3)).class],
      ["review", "excluded"],
      "each stays where it was",
    );

    // A plan's month is 500: the same counter counts on past 50.
    try {
      await billing("active");
      assert.equal(ok(await move("lead_member_keep", k2), "keep on a plan").counted, true);
      assert.equal(ok(await move("lead_member_put_back", k3), "put back on a plan").counted, true);
      assert.deepEqual(await allowance(), { used: LEAD_TRIAL_ALLOWANCE + 2, reserved: 0 });
    } finally {
      await billing("trialing");
    }
  },
);

test(
  "Check again's commit after its round ended counts within the trial's 50 and leaves the rest in review",
  { skip },
  async () => {
    const search = await endedSearch();
    const c1 = await inReview(search, "check1", ["email:unknown"], "checking");
    const c2 = await inReview(search, "check2", ["email:unknown"], "checking");
    const commit = async (results) =>
      ok(
        await db.rpc("lead_check_commit", {
          p_round_id: search.round_id,
          p_run_id: null,
          p_results: results,
          p_usage_usd: 0,
          p_last: false,
        }),
        "commit",
      );
    const classes = async () => [await memberOf(search, c1), await memberOf(search, c2)].map((m) => m.class).sort();

    // The trial is full: both addresses check out, and both stay in Needs review for Keep to count later.
    await counted(LEAD_TRIAL_ALLOWANCE);
    const now = new Date().toISOString();
    const full = await commit([
      { lead_id: c1, email_state: "ok", checked_at: now },
      { lead_id: c2, email_state: "ok", checked_at: now },
    ]);
    assert.deepEqual([full.ok, full.qualified, full.counted, full.ended], [true, 0, 0, false]);
    assert.deepEqual(await classes(), ["review", "review"]);
    const states = ok(await db.from("leads").select("email_state").in("id", [c1, c2]), "states");
    assert.deepEqual(
      states.map((l) => l.email_state),
      ["ok", "ok"],
      "the addresses are known good",
    );
    assert.deepEqual(await allowance(), { used: LEAD_TRIAL_ALLOWANCE, reserved: 0 });

    // One lead of the trial left: one of the two counts, the other waits.
    await counted(LEAD_TRIAL_ALLOWANCE - 1);
    const one = await commit([]);
    assert.deepEqual([one.qualified, one.counted], [1, 1]);
    assert.deepEqual(await classes(), ["qualified", "review"]);
    assert.deepEqual(await allowance(), { used: LEAD_TRIAL_ALLOWANCE, reserved: 0 });
    const countedOne = (await Promise.all([memberOf(search, c1), memberOf(search, c2)])).find(
      (m) => m.class === "qualified",
    );
    assert.deepEqual([countedOne.counted, countedOne.counted_month], [true, month]);

    // On a plan the month's 500 has room, and the other counts.
    try {
      await billing("active");
      const rest = await commit([]);
      assert.deepEqual([rest.qualified, rest.counted], [1, 1]);
      assert.deepEqual(await classes(), ["qualified", "qualified"]);
      assert.deepEqual(await allowance(), { used: LEAD_TRIAL_ALLOWANCE + 1, reserved: 0 });
    } finally {
      await billing("trialing");
    }
  },
);
