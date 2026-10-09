/**
 * The finder's spending doors ask what the route asks (00363), on a real Postgres with real sessions.
 *
 * lead_search_create, lead_search_import, lead_search_more and lead_check_again are granted to `authenticated`, so a
 * member's own Supabase client reaches them without the dashboard's route and its requireSpend. Here:
 *
 *   1. billing_may_spend is contracts' maySpend and lead_spend_refusal's sentence whyCannotSpend's for finding leads,
 *      mode by mode and status by status; a workspace with no billing row may not, in requireSpend's words.
 *   2. Each of the four doors refuses a workspace that may not spend, from an owner's session and from a partner's
 *      seat on the business, before it reserves or schedules anything; a direct workspace and an active plan may.
 *   3. The estimate a door takes is held to lead_estimate_ceiling: the route's own (estimateForRound, and
 *      leadImportEstimateUsd for a list) never passes it, count by count, and a caller's own over it is refused.
 *
 * Local stack only: it makes a workspace and people.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  BILLING_MODES,
  BILLING_STATUSES,
  LEAD_LIST_MAX,
  SPEND_LEADS,
  leadImportEstimateUsd,
  maySpend,
  whyCannotSpend,
} from "@chanlytics/contracts";
import { estimateForRound } from "../../../../apps/dashboard/src/server/leads/lead-answers.ts";
import { showSecondFactor } from "../_second-factor.mjs";
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
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
const at = (who) => `${who}-${stamp}@fixture-spend.example`;
let db;
let A;
let owner;
let partner;
const users = [];
const platformDays = new Set();
const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

async function person(role) {
  const email = at(role);
  const password = `pw-${stamp}-${role}-Aa1!`;
  const made = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user");
  users.push(made.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.user.id, role }), "membership");
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }), "sign in");
  // A partner's seat opens the finder's doors only on a session that showed its second factor (0013).
  if (role === "partner") await showSecondFactor(c);
  return c;
}

const plan = (count, terms = ["personal trainer", "strength coach"], contact = "email") => ({
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "personal trainers in Austin",
  terms,
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 25_000,
    query: "Austin, TX, USA",
  },
  count,
  contact,
  criteria: [],
  exclusions: [],
});

const billing = async (mode, status) =>
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode, status }), `billing ${mode} ${status}`);

/** What the doors left behind: searches, rounds, jobs, and the month's reserved leads. */
const footprint = async () => {
  const count = async (table) =>
    (await db.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", A)).count;
  const counters = ok(await db.from("lead_counters").select("kind, reserved").eq("tenant_id", A), "counters");
  return {
    searches: await count("lead_searches"),
    rounds: await count("lead_rounds"),
    jobs: await count("jobs"),
    reserved: counters.map((c) => `${c.kind}:${Number(c.reserved)}`).sort(),
  };
};

// The platform's switch list is one array every lead suite reads and writes back: the lock for the whole file.
let releaseList;
before(async () => {
  if (skip) return;
  releaseList = await takeLock("lead-platform-list");
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `spend-${stamp}`, name: "Spend Co", timezone: "America/Chicago" })
      .select("id")
      .single(),
    "tenant",
  ).id;
  owner = await person("owner");
  partner = await person("partner");
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single(), "switch");
  ok(
    await db
      .from("lead_platform")
      .update({ tenants_on: [...(p.tenants_on ?? []), A] })
      .eq("id", true),
    "switch on",
  );
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
  "the predicate is contracts' maySpend and its words whyCannotSpend's, status by status; no billing row is no",
  {
    skip,
  },
  async () => {
    for (const mode of BILLING_MODES) {
      for (const status of BILLING_STATUSES) {
        await billing(mode, status);
        const may = ok(await db.rpc("billing_may_spend", { p_tenant_id: A }), "may");
        assert.equal(may, maySpend(mode, status), `${mode} ${status}`);
        const refusal = ok(await db.rpc("lead_spend_refusal", { p_tenant_id: A }), "refusal");
        const why = whyCannotSpend(mode, status, SPEND_LEADS);
        assert.deepEqual(refusal, why ? { error: "payment_required", sentence: why } : null, `${mode} ${status}`);
      }
    }
    ok(await db.from("billing_accounts").delete().eq("tenant_id", A), "no row");
    try {
      assert.equal(ok(await db.rpc("billing_may_spend", { p_tenant_id: A }), "may"), false, "no row is not permission");
      assert.deepEqual(ok(await db.rpc("lead_spend_refusal", { p_tenant_id: A }), "refusal"), {
        error: "payment_required",
        sentence: "This workspace has no billing record. Open Billing to set one up.",
      });
    } finally {
      await billing("stripe", "none");
    }
  },
);

test(
  "every spending door refuses a workspace that may not spend, from the owner's session and a partner's seat, and writes nothing",
  {
    skip,
  },
  async () => {
    // An ended search to ask for more of, made while the plan was active.
    await billing("stripe", "active");
    const made = ok(
      await owner.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(5),
        p_via: "people",
        p_estimate_usd: estimateForRound(plan(5), "probe"),
      }),
      "an active plan finds",
    );
    assert.ok(made.search_id && made.round_id, JSON.stringify(made));
    ok(await db.rpc("lead_round_end", { p_round_id: made.round_id, p_ending: "stopped" }), "ended");

    const doors = (who) => ({
      create: () =>
        who.rpc("lead_search_create", {
          p_tenant_id: A,
          p_plan: plan(5),
          p_via: "people",
          p_estimate_usd: estimateForRound(plan(5), "probe"),
        }),
      import: () =>
        who.rpc("lead_search_import", {
          p_tenant_id: A,
          p_name: `Expo ${stamp}`,
          p_asked: "",
          p_rows: [{ name: "Spend Gym", email: at("gym1") }],
          p_estimate_usd: leadImportEstimateUsd(1),
        }),
      more: () =>
        who.rpc("lead_search_more", {
          p_search_id: made.search_id,
          p_purpose: "renew",
          p_plan: plan(5),
          p_estimate_usd: estimateForRound(plan(5), "renew"),
        }),
      checkAgain: () => who.rpc("lead_check_again", { p_tenant_id: A, p_lead_ids: [crypto.randomUUID()] }),
    });

    for (const [who, client, mode, status] of [
      ["the owner", owner, "stripe", "trialing"],
      ["the owner", owner, "stripe", "none"],
      ["the partner", partner, "stripe", "past_due"],
      ["the partner", partner, "stripe", "canceled"],
      ["the owner", owner, "stripe", "unpaid"],
    ]) {
      await billing(mode, status);
      const before_ = await footprint();
      for (const [door, call] of Object.entries(doors(client))) {
        const r = ok(await call(), `${who} ${door} ${status}`);
        assert.deepEqual(
          r,
          { error: "payment_required", sentence: whyCannotSpend(mode, status, SPEND_LEADS) },
          `${who}, ${door}, ${status}`,
        );
      }
      assert.deepEqual(await footprint(), before_, `${status}: nothing reserved, made or scheduled`);
    }

    // A workspace invoiced by hand is never asked for a card, and an active plan spends: each door goes past the gate.
    for (const [mode, status] of [
      ["direct", "none"],
      ["stripe", "active"],
    ]) {
      await billing(mode, status);
      const d = doors(partner);
      const created = ok(await d.create(), `create ${mode}`);
      assert.ok(created.round_id, JSON.stringify(created));
      ok(await db.rpc("lead_round_end", { p_round_id: created.round_id, p_ending: "stopped" }), "ended");
      const imported = ok(await d.import(), `import ${mode}`);
      assert.ok(imported.round_id || imported.error === "nothing", JSON.stringify(imported));
      const more = ok(await d.more(), `more ${mode}`);
      assert.ok(more.round_id, JSON.stringify(more));
      ok(await db.rpc("lead_round_end", { p_round_id: more.round_id, p_ending: "stopped" }), "ended");
      assert.deepEqual(ok(await d.checkAgain(), `check again ${mode}`), { scheduled: 0, skipped: 1 });
    }
  },
);

test(
  "the route's own estimate never passes the ceiling, count by count; a caller's own over it is refused",
  {
    skip,
  },
  async () => {
    const ceilings = new Map();
    const ceiling = async (kind, count, terms) => {
      const key = `${kind}:${count}:${terms}`;
      if (!ceilings.has(key))
        ceilings.set(
          key,
          Number(ok(await db.rpc("lead_estimate_ceiling", { p_kind: kind, p_count: count, p_terms: terms }), key)),
        );
      return ceilings.get(key);
    };
    const TERMS = ["personal trainer", "strength coach", "kettlebell class", "pilates studio", "boxing gym"];
    const counts = [
      1, 2, 3, 10, 12, 13, 24, 25, 26, 50, 60, 99, 100, 200, 250, 300, 301, 499, 500, 501, 750, 999, 1000,
    ];
    for (const count of counts) {
      for (let n = 1; n <= TERMS.length; n++) {
        const top = await ceiling("search", count, n);
        for (const contact of ["phone", "email"]) {
          const p = plan(count, TERMS.slice(0, n), contact);
          for (const [purpose, counted] of [
            ["probe", 0],
            ["renew", 0],
            ["topup", 0],
            ["topup", Math.floor(count / 2)],
            ["topup", count + 5],
          ]) {
            const est = estimateForRound(p, purpose, counted);
            assert.ok(est <= top, `${count} leads, ${n} terms, ${contact}, ${purpose} (${counted}): ${est} > ${top}`);
          }
        }
      }
    }
    for (const rows of [1, 2, 50, 100, 250, 432, 433, 499, LEAD_LIST_MAX]) {
      const top = await ceiling("list", rows, null);
      assert.ok(leadImportEstimateUsd(rows) <= top, `a list of ${rows}: ${leadImportEstimateUsd(rows)} > ${top}`);
    }
    assert.equal(await ceiling("search", 1, 5), 5.29, "the dearest a search of one may be: well under the month's $25");
    const typo = await db.rpc("lead_estimate_ceiling", { p_kind: "serach", p_count: 1, p_terms: 1 });
    assert.equal(typo.error?.code, "22023", "a kind nobody named raises; a null would let every comparison by");

    // A caller's own number over it is refused before anything is reserved; at it, it is taken.
    await billing("stripe", "active");
    const top = await ceiling("search", 5, 2);
    const over = await owner.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: plan(5),
      p_via: "people",
      p_estimate_usd: top + 0.01,
    });
    assert.equal(over.error?.code, "22023", JSON.stringify(over));
    assert.equal(over.error?.message, `estimate: 0 to ${top.toFixed(2)} usd for this plan`);
    const atTop = ok(
      await owner.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(5), p_via: "people", p_estimate_usd: top }),
      "at the ceiling",
    );
    assert.ok(atTop.round_id, JSON.stringify(atTop));
    ok(await db.rpc("lead_round_end", { p_round_id: atTop.round_id, p_ending: "stopped" }), "ended");
    const list = await owner.rpc("lead_search_import", {
      p_tenant_id: A,
      p_name: `Over ${stamp}`,
      p_asked: "",
      p_rows: [{ name: "Over Gym", email: at("over1") }],
      p_estimate_usd: (await ceiling("list", 1, null)) + 0.01,
    });
    assert.equal(list.error?.code, "22023", JSON.stringify(list));
    const more = await owner.rpc("lead_search_more", {
      p_search_id: atTop.search_id,
      p_purpose: "renew",
      p_plan: plan(5),
      p_estimate_usd: top + 0.01,
    });
    assert.equal(more.error?.code, "22023", JSON.stringify(more));
  },
);
