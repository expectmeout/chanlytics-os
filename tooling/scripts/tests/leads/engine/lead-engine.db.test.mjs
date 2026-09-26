/**
 * The lead finder's engine (00140), proved on a real Postgres with real
 * sessions: the doors reserve, count, refuse and undo as PRD v3 §0 says; the
 * service RPCs commit one page in one transaction under a lease and an
 * offset; a member reads their own workspace and nothing else.
 *
 * Runs the way activations.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production. The sessions are
 * real: users are made with the admin API and sign in with a password through
 * the anon key, so a door judges auth.uid() as the dashboard's client would.
 * A failed sign-in fails the test (review E11).
 *
 * The fixtures are fictional: every domain under .example, every phone in
 * 555-0100..0199, every place id ChIJfixture.... That database is shared
 * with every other worktree on this machine, so this suite leaves no row
 * behind: its workspaces, its users, its events, the platform's day counter
 * and its own rounds all go before it ends.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ROLE_PERMS, leadMonth, leadSuppressionHash } from "@chanlytics/contracts";
import { at } from "../../_cron-doors-world.mjs";
import { sha256, webhookToken } from "../../_lead-world.mjs";
import { fakeApify, fakeJudge, checkerItem, probeItems } from "../../_lead-fixtures.mjs";
import { startRound, collect, check, OUT_OF_AREA_REASON } from "../../../../../packages/core/src/leads/runner.ts";
import { runIdFor } from "../../../../../packages/core/src/leads/ids.ts";
import { scheduleJobOnce } from "../../../../../packages/jobs/src/schedule.ts";
import { leadDb } from "../../../../../apps/edge/lib/leads/lead-db.ts";

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

let db;
let A; // the workspace under test, in America/Chicago
let B; // another workspace
let owner; // an owner of A
let operator; // an operator of A
let stranger; // an owner of B
const users = [];
const TZ = "America/Chicago";

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant) {
  const email = `lead-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

/** 200 personal trainers in Austin, TX with a website, email checked, leaving out chain gyms; the count as given. */
const plan = (count, version = 1) => ({
  version,
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
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});

/** One place of a page, as the collect commits it: the lead's columns and the member's judgment. */
const place = (n, cls, { phone = null, reasons = [], shares = [], duplicateOf = null } = {}) => ({
  place: {
    place_id: `ChIJfixture${String(n).padStart(4, "0")}`,
    business_name: `Fixture ${n}`,
    category: "Personal trainer",
    street: `${n} Fixture St`,
    city: "Austin",
    region: "TX",
    postal_code: "78704",
    country: "US",
    lat: 30.25,
    lng: -97.75,
    website_host: `fixture${n}.example`,
    phone_e164: phone ?? `+1512555${String(100 + n).padStart(4, "0")}`,
    phone_sources: 2,
    email: `hello@fixture${n}.example`,
    email_state: cls === "qualified" ? "ok" : "catch_all",
    rating: 4.5,
    reviews: 12,
  },
  member: {
    judgment: { reasons },
    class: cls,
    excluded_by: cls === "excluded" ? "chain" : null,
    fit: cls === "excluded" ? null : "strong",
    reason: "A fixture.",
    distance_m: 1200,
  },
  duplicate_of_place_id: duplicateOf,
  shares,
});

/** A discover run of a round, claimed, started and leased by `worker`. */
async function runOf(roundId, term, worker) {
  const run = ok(
    await db
      .from("lead_runs")
      .insert({
        tenant_id: A,
        round_id: roundId,
        purpose: "discover",
        term,
        actor: "card-a",
        build: "1",
        webhook_token_hash: `hash-${term}-${Date.now()}`,
      })
      .select("id")
      .single(),
  );
  assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: worker })), true, "the claim");
  assert.equal(
    ok(
      await db.rpc("lead_run_record_start", {
        p_run_id: run.id,
        p_owner: worker,
        p_apify_run_id: `apr-${run.id}`,
        p_dataset_id: `ds-${run.id}`,
        p_cap_usd: 0.5,
      }),
    ),
    true,
    "the start",
  );
  const gen = ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: worker, p_seconds: 60 }));
  return { id: run.id, gen };
}

const commit = (run, worker, gen, from, to, page) =>
  db.rpc("lead_collect_commit", {
    p_run_id: run,
    p_owner: worker,
    p_gen: gen,
    p_from_offset: from,
    p_to_offset: to,
    p_page: page,
  });
/** A counter row's two numbers. PostgREST sends numeric(10,4) as a JSON number, so they arrive as numbers. */
const counter = async (kind, period) => {
  const row = ok(
    await db
      .from("lead_counters")
      .select("used, reserved")
      .eq("tenant_id", A)
      .eq("kind", kind)
      .eq("period", period)
      .single(),
  );
  return { used: Number(row.used), reserved: Number(row.reserved) };
};
const member = async (searchId, leadId) =>
  ok(await db.from("lead_search_members").select("*").eq("search_id", searchId).eq("lead_id", leadId).single());
const leadByPlace = async (placeId) =>
  ok(await db.from("leads").select("*").eq("tenant_id", A).eq("place_id", placeId).single());

/**
 * The Maps fixtures under place ids and numbers no case of this file has
 * used. A1's cases above leave this very workspace holding ChIJfixture0001 to
 * 0301 on 555-0101 to 0120, and a place the workspace already holds is never
 * a lead a second time (core identityOf), nor is an erased number ever
 * inserted (lead_collect_commit's suppressions) -- so each A2 case below
 * discovers its own stretch of the fixtures, and only its own. The titles are
 * left alone: they are what the labelled fake judge answers from.
 */
const pad4 = (n) => String(n).padStart(4, "0");
const unseen = (item, n) => ({
  ...item,
  placeId: `ChIJfixture${pad4(n)}`,
  phoneUnformatted: `+1512555${pad4(n)}`,
  phone: `(512) 555-${pad4(n)}`,
  phones: [`(512) 555-${pad4(n)}`],
});
const a2Items = (base) =>
  probeItems()
    .slice(0, 13)
    .map((item, i) => unseen(item, base + i));
/** lead_runs.apify_run_id is unique across the table, so every world of this file carries on from the last one's count. */
let a2Started = 0;

/**
 * A2's runtime world over THIS database: the real adapter (apps/edge/lib/leads/lead-db.ts), the
 * provider and the judge faked (_lead-fixtures.mjs), scheduleJobOnce for the next job, and
 * the webhook token derived as the edge derives it, under the test secret _lead-world.mjs holds.
 */
const pages = {};
function a2World(base) {
  const apify = fakeApify();
  apify.state.started = a2Started;
  const judge = fakeJudge();
  const realStart = apify.startRun;
  apify.startRun = async (actor, input, opts) => {
    const out = await realStart(actor, input, opts);
    a2Started = apify.state.started;
    apify.state.datasets[out.datasetId] = actor.includes("email-verifier")
      ? (input.emails ?? []).map((e) => checkerItem(e, "valid"))
      : a2Items(base);
    return out;
  };
  const wires = { apify, judge, webhookBase: "https://edge.example", webhookToken };
  const ports = (owner) => ({
    db: leadDb(db),
    apify,
    judge,
    now: () => new Date(),
    webhookBase: wires.webhookBase,
    webhookToken: wires.webhookToken,
    fetchText: async (url) => pages[url] ?? null,
    schedule: async (kind, payload, secs) => {
      await scheduleJobOnce(db, { tenantId: A, kind, dueAt: new Date(Date.now() + secs * 1000), payload });
    },
    deadline: Date.now() + 45_000,
    owner,
  });
  return {
    apify,
    judge,
    wires,
    db: leadDb(db),
    ports,
    finishRuns: () => {
      for (const r of Object.values(apify.state.runs))
        if (r.status === "RUNNING") apify.finish(r.id, "SUCCEEDED", 0.05);
    },
  };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `lead-engine-${Date.now()}`, name: "Lead engine", timezone: TZ })
      .select("id")
      .single(),
  ).id;
  B = ok(
    await db
      .from("tenants")
      .insert({ slug: `lead-engine-other-${Date.now()}`, name: "Other" })
      .select("id")
      .single(),
  ).id;
  owner = await memberClient("owner", A);
  operator = await memberClient("operator", A);
  stranger = await memberClient("owner", B);
  // The switch stays off; this workspace is listed, as the nightly's is in release A (30).
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
  ok(
    await db
      .from("lead_platform")
      .update({ tenants_on: [...(p.tenants_on ?? []), A] })
      .eq("id", true),
  );
});

// The local stack is shared with every other worktree, so this suite leaves
// nothing behind. Everything carrying a tenant_id cascades from the
// workspace; events have no foreign key to it, and the platform's day
// counter has no workspace at all, so those two go by hand.
after(async () => {
  if (skip) return;
  const p = await db.from("lead_platform").select("tenants_on").eq("id", true).single();
  if (p.data)
    await db
      .from("lead_platform")
      .update({ tenants_on: (p.data.tenants_on ?? []).filter((t) => t !== A) })
      .eq("id", true);
  for (const id of [A, B].filter(Boolean)) {
    for (const r of (await db.from("lead_rounds").select("platform_day").eq("tenant_id", id)).data ?? [])
      platformDays.add(r.platform_day);
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  // The platform's day counter carries no workspace, so it does not cascade
  // -- and it is the platform's, shared with every suite: take back exactly
  // the day rows this suite's own rounds reserved in, and nothing else.
  if (platformDays.size)
    await db
      .from("lead_counters")
      .delete()
      .is("tenant_id", null)
      .eq("kind", "day")
      .in("period", [...platformDays]);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

const ids = {}; // what the tests hand each other, in order
const platformDays = new Set(); // the UTC day rows this suite's rounds reserved in: they carry no workspace, so they never cascade

// The plan card is the only thing that reads the month's two ceilings, and it
// reads them as the member, through the dashboard's own client. lead_counters
// is revoked from authenticated and has no policy (00140), so the card's read
// of the table raised every time and Ask answered "that could not be checked":
// no owner could ever be shown a plan, and nothing was ever searched.
test("the month's ceilings are read through a door, because the table is nobody's to read", { skip }, async () => {
  const period = leadMonth(TZ, new Date());
  ok(await db.from("lead_counters").insert({ tenant_id: A, kind: "allowance", period, used: 40, reserved: 10 }));
  ok(await db.from("lead_counters").insert({ tenant_id: A, kind: "budget", period, used: 3, reserved: 1 }));

  // What the card used to do, and why it could not.
  const direct = await owner.client.from("lead_counters").select("used, reserved").eq("tenant_id", A);
  assert.ok(direct.error || (direct.data ?? []).length === 0, "the table itself is closed to a member");

  // What it does now: one read, both ceilings, this workspace's own.
  const mine = ok(await owner.client.rpc("lead_month_used", { p_tenant_id: A, p_period: period }));
  assert.deepEqual(mine, { allowance: { used: 40, reserved: 10 }, budget: { used: 3, reserved: 1 } });

  // A month nothing has spent in is zeros, never a missing row the card must guess at.
  assert.deepEqual(ok(await owner.client.rpc("lead_month_used", { p_tenant_id: A, p_period: "1999-01" })), {
    allowance: { used: 0, reserved: 0 },
    budget: { used: 0, reserved: 0 },
  });

  // Finding is the owner's alone, so reading what finding has left is too.
  const byOperator = await operator.client.rpc("lead_month_used", { p_tenant_id: A, p_period: period });
  assert.ok(byOperator.error, "an operator cannot read the month's ceilings");
  const byStranger = await stranger.client.rpc("lead_month_used", { p_tenant_id: A, p_period: period });
  assert.ok(byStranger.error, "and neither can an owner of another workspace");

  ok(await db.from("lead_counters").delete().eq("tenant_id", A).eq("period", period));
  ok(await db.from("lead_counters").delete().eq("tenant_id", A).eq("period", "1999-01"));
});

test(
  "has_permission is ROLE_PERMS in SQL: every role and permission agree, and find is the owner's alone",
  { skip },
  async () => {
    const who = { owner: owner.userId, operator: operator.userId };
    for (const [role, perms] of Object.entries(ROLE_PERMS)) {
      if (role === "viewer") continue; // no viewer is seeded here; tenancy.db.test.mjs signs one in
      for (const [perm, may] of Object.entries(perms)) {
        assert.equal(
          ok(await db.rpc("has_permission", { p_user: who[role], p_tenant_id: A, p_permission: perm })),
          may,
          `${role}.${perm}`,
        );
      }
    }
    assert.equal(
      ok(await db.rpc("has_permission", { p_user: stranger.userId, p_tenant_id: A, p_permission: "find" })),
      false,
      "a member of another workspace has nothing here",
    );
    // It takes an arbitrary user id, so a signed-in member could read anyone's
    // role with it: it is the service role's, and the doors call it as definer.
    const asOwner = await owner.client.rpc("has_permission", {
      p_user: owner.userId,
      p_tenant_id: A,
      p_permission: "find",
    });
    assert.equal(asOwner.data, null, "an owner's own session reads nothing from has_permission");
    assert.equal(asOwner.error?.code, "42501", `has_permission is service_role only: ${JSON.stringify(asOwner.error)}`);
    assert.equal(
      ok(await db.rpc("lead_month", { p_tenant_id: A, p_at: "2026-10-01T03:30:00Z" })),
      "2026-09",
      "still September in Chicago",
    );
    assert.equal(
      ok(
        await db.rpc("lead_suppression_hash", {
          p_tenant_id: "11111111-1111-4111-8111-111111111111",
          p_value: "+15125550100",
        }),
      ).length,
      64,
    );
  },
);

test("the suppression hash in SQL is contracts' keyed digest, byte for byte", { skip }, async () => {
  // lead_suppression_hash is the service role's; the digest is compared through a door that uses it: none reads it back, so compare the function itself.
  const t = "11111111-1111-4111-8111-111111111111";
  const fromSql = ok(await db.rpc("lead_suppression_hash", { p_tenant_id: t, p_value: "+15125550100" }));
  assert.equal(fromSql, await leadSuppressionHash(t, "+15125550100"));
});

test(
  "create reserves the count and the estimate in one transaction, writes the probe round, its start job and the event; the switch and the card refuse first",
  { skip },
  async () => {
    ok(await db.from("lead_platform").update({ tenants_on: [] }).eq("id", true));
    let r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(5),
        p_via: "people",
        p_estimate_usd: 0.05,
      }),
    );
    assert.equal(r.error, "paused", JSON.stringify(r));
    const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
    ok(
      await db
        .from("lead_platform")
        .update({ tenants_on: [...(p.tenants_on ?? []), A] })
        .eq("id", true),
    );
    r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: { ...plan(5), card: "etsy_shops" },
        p_via: "people",
        p_estimate_usd: 0.05,
      }),
    );
    assert.equal(r.error, "no_card", "an unapproved card never runs for an owner");
    const demand = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.no_card"));
    assert.equal(demand.length, 1, "the ask is logged as demand");
    assert.equal(demand[0].data.card, "etsy_shops");

    r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(5),
        p_via: "people",
        p_estimate_usd: 0.05,
      }),
    );
    assert.ok(r.search_id && r.round_id, JSON.stringify(r));
    ids.search1 = r.search_id;
    ids.round1 = r.round_id;
    const round = ok(await db.from("lead_rounds").select("*").eq("id", r.round_id).single());
    const month = leadMonth(TZ, new Date());
    assert.deepEqual(
      [
        round.state,
        round.seq,
        round.purpose,
        round.target,
        round.allowance_reserved,
        Number(round.cost_reserved_usd),
        round.plan_version,
        round.month,
      ],
      ["queued", 1, "probe", 5, 5, 0.05, 1, month],
    );
    assert.deepEqual(await counter("allowance", month), { used: 0, reserved: 5 });
    assert.deepEqual(await counter("budget", month), { used: 0, reserved: 0.05 });
    assert.deepEqual(await counter("day", round.day), { used: 0, reserved: 0.05 });
    // What the door wrote, not what the ledger did with it: jobs are claimed by
    // whatever heartbeat is running, and another database suite's claim may be
    // holding this one by the time it is read.
    const job = ok(
      await db
        .from("jobs")
        .select("tenant_id, payload")
        .eq("kind", "lead_round_start")
        .eq("payload->>round_id", r.round_id),
    );
    assert.deepEqual(
      job,
      [{ tenant_id: A, payload: { round_id: r.round_id } }],
      "the start job is written with the round, once",
    );
    const ev = ok(
      await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.round").eq("subject_id", r.round_id),
    );
    assert.equal(ev[0].data.state, "queued");

    const denied = await operator.client.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: plan(5),
      p_via: "people",
      p_estimate_usd: 0.05,
    });
    assert.match(
      denied.error?.message ?? "",
      /Only an owner can find businesses for you/,
      "an operator may not start a search",
    );
    const other = await stranger.client.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: plan(5),
      p_via: "people",
      p_estimate_usd: 0.05,
    });
    assert.match(other.error?.message ?? "", /Only an owner/, "nor an owner of another workspace");
  },
);

test(
  "the allowance refuses in a sentence: the month's 500 are reserved once, and the 501st is refused with what is left",
  { skip },
  async () => {
    let r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(496),
        p_via: "ask",
        p_estimate_usd: 0.5,
      }),
    );
    assert.equal(r.error, "month_leads_used");
    assert.equal(r.left, 495);
    assert.match(
      r.sentence,
      /^You have 495 leads left this month\. Find 495 now, or all 496 when your leads renew on [A-Z][a-z]{2} 1\?$/,
    );
    r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(495),
        p_via: "ask",
        p_estimate_usd: 0.5,
      }),
    );
    assert.ok(r.search_id, "the rest of the month is taken");
    ids.search2 = r.search_id;
    ids.round2 = r.round_id;
    r = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(1),
        p_via: "people",
        p_estimate_usd: 0.01,
      }),
    );
    assert.equal(r.error, "month_leads_used");
    assert.equal(r.left, 0);
    assert.match(r.sentence, /^You have found this month's 500 leads\. Your leads renew on [A-Z][a-z]{2} 1\.$/);
  },
);

test(
  "the run is claimed once, leased by owner and generation, and a page commits by compare-and-set: five asked, twenty qualified, five counted, paid once",
  { skip },
  async () => {
    const run = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: ids.round1,
          purpose: "discover",
          term: "personal trainer",
          actor: "card-a",
          build: "1",
          webhook_token_hash: "hash1",
        })
        .select("id")
        .single(),
    );
    ids.run1 = run.id;
    assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "w1" })), true, "the first claim wins");
    assert.equal(
      ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "w2" })),
      false,
      "the second finds it taken",
    );
    assert.equal(
      ok(
        await db.rpc("lead_run_record_start", {
          p_run_id: run.id,
          p_owner: "w2",
          p_apify_run_id: "apr1",
          p_dataset_id: "ds1",
          p_cap_usd: 0.5,
        }),
      ),
      false,
      "only the claimer records",
    );
    assert.equal(
      ok(
        await db.rpc("lead_run_record_start", {
          p_run_id: run.id,
          p_owner: "w1",
          p_apify_run_id: "apr1",
          p_dataset_id: "ds1",
          p_cap_usd: 0.5,
        }),
      ),
      true,
    );
    assert.equal(
      ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w1", p_seconds: 60 })),
      0,
      "the first lease is generation 0",
    );
    assert.equal(
      ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w2", p_seconds: 60 })),
      null,
      "held by another",
    );

    const page = {
      judgment: {
        op_id: "ec31567347b5b6e5a548512052a70322c51e2c167b1b1675457ef91e00349f73",
        request_hash: "rh",
        answer: { places: [] },
        model: "the-judge",
        tokens: 1200,
        batch: 1,
      },
      places: Array.from({ length: 20 }, (_, i) => place(i + 1, "qualified")),
      usage_usd: 0.02,
      items_seen: 20,
      run_state: null,
      next: { kind: "lead_collect", seq: "p20", run_after_seconds: 15 },
      round: { state: "probing" },
    };
    assert.deepEqual(ok(await commit(run.id, "w1", 1, 0, 20, page)), { ok: false, why: "lease" }, "a wrong generation");
    assert.deepEqual(ok(await commit(run.id, "w2", 0, 0, 20, page)), { ok: false, why: "lease" }, "a wrong owner");
    assert.deepEqual(ok(await commit(run.id, "w1", 0, 5, 20, page)), { ok: false, why: "offset" }, "a wrong offset");
    const r = ok(await commit(run.id, "w1", 0, 0, 20, page));
    assert.deepEqual(r, { ok: true, counted: 5, qualified: 20, review: 0, excluded: 0, round_state: "probing" });
    const round = ok(await db.from("lead_rounds").select("*").eq("id", ids.round1).single());
    assert.deepEqual(
      [round.allowance_used, Number(round.cost_usd), round.judge_tokens, round.judge_model, round.state],
      [5, 0.02, 1200, "the-judge", "probing"],
    );
    const month = leadMonth(TZ, new Date());
    assert.deepEqual(
      await counter("allowance", month),
      { used: 5, reserved: 495 },
      "five used; the other search's 495 still reserved",
    );
    assert.deepEqual(await counter("budget", month), { used: 0.02, reserved: 0.53 });
    const { count: leads } = await db.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", A);
    assert.equal(leads, 20);
    const { count: counted } = await db
      .from("lead_search_members")
      .select("id", { count: "exact", head: true })
      .eq("search_id", ids.search1)
      .eq("counted", true);
    assert.equal(counted, 5, "five asked, twenty qualified, five counted");
    const { count: nextJobs } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_collect")
      .eq("payload->>run_id", run.id)
      .eq("payload->>seq", "p20");
    assert.equal(nextJobs, 1, "the next collect is written");

    assert.deepEqual(
      ok(await commit(run.id, "w1", 0, 0, 20, page)),
      { ok: false, why: "offset" },
      "a replayed page is refused, so nothing doubles",
    );
    const again = ok(
      await commit(run.id, "w1", 0, 20, 23, {
        judgment: [
          {
            op_id: "ec31567347b5b6e5a548512052a70322c51e2c167b1b1675457ef91e00349f73",
            tokens: 1200,
            model: "the-judge",
            answer: {},
          },
        ],
        places: [20, 21, 22].map((n) => place(n, "qualified")),
        usage_usd: 0.03,
        items_seen: 23,
        next: { kind: "lead_collect", seq: "p20", run_after_seconds: 15 },
      }),
    );
    assert.deepEqual([again.qualified, again.counted], [2, 0], "two new places; the reservation is spent");
    assert.equal(
      ok(await db.from("lead_rounds").select("judge_tokens, cost_usd").eq("id", ids.round1).single()).judge_tokens,
      1200,
      "the judgment was kept and paid once",
    );
    const { count: stillOne } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_collect")
      .eq("payload->>run_id", run.id)
      .eq("payload->>seq", "p20");
    assert.equal(stillOne, 1, "the next collect is written once however often it is asked for");
    assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w2", p_gen: 0 })), false);
    assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w1", p_gen: 1 })), false);
    assert.equal(
      ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w1", p_gen: 0 })),
      true,
      "released by the holder with the generation",
    );
  },
);

test(
  "a start whose answer was lost is unknown until the sweep finds it in the provider's list, and reconciles only from unknown",
  { skip },
  async () => {
    const lost = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: ids.round1,
          purpose: "discover",
          term: "lost",
          actor: "card-a",
          build: "1",
          webhook_token_hash: `lost-${Date.now()}`,
        })
        .select("id")
        .single(),
    );
    assert.equal(
      ok(await db.rpc("lead_run_mark_unknown", { p_run_id: lost.id, p_owner: "w9" })),
      false,
      "nothing is unknown before it is claimed",
    );
    assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: lost.id, p_owner: "w9" })), true);
    assert.equal(
      ok(await db.rpc("lead_run_mark_unknown", { p_run_id: lost.id, p_owner: "w8" })),
      false,
      "and only the claimer says so",
    );
    assert.equal(ok(await db.rpc("lead_run_mark_unknown", { p_run_id: lost.id, p_owner: "w9" })), true);
    assert.equal(
      ok(await db.from("lead_runs").select("state").eq("id", lost.id).single()).state,
      "unknown",
      "never blindly started again",
    );
    const apr = `apr-lost-${Date.now()}`;
    assert.equal(
      ok(
        await db.rpc("lead_run_reconcile", {
          p_run_id: lost.id,
          p_apify_run_id: apr,
          p_dataset_id: "ds-lost",
          p_state: "succeeded",
        }),
      ),
      true,
      "the sweep found it, with the state the provider gave",
    );
    const back = ok(
      await db.from("lead_runs").select("state, apify_run_id, dataset_id, finished_at").eq("id", lost.id).single(),
    );
    assert.deepEqual(
      [back.state, back.apify_run_id, back.dataset_id, back.finished_at !== null],
      ["succeeded", apr, "ds-lost", true],
    );
    assert.equal(
      ok(
        await db.rpc("lead_run_reconcile", {
          p_run_id: lost.id,
          p_apify_run_id: apr,
          p_dataset_id: "ds-lost",
          p_state: "running",
        }),
      ),
      false,
      "and only from unknown",
    );
    const bad = await db.rpc("lead_run_reconcile", {
      p_run_id: lost.id,
      p_apify_run_id: apr,
      p_dataset_id: "ds-lost",
      p_state: "queued",
    });
    assert.match(bad.error?.message ?? "", /running or finished/, "a state the provider never gives is a caller's bug");
  },
);

test(
  "the shared-phone triple: three places with one number, one already in the workspace; the other two are delivered and marked, and no person is made",
  { skip },
  async () => {
    const person = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: A, phone_e164: "+15125550177", display_name: "Corner Deli" })
        .select("id")
        .single(),
    );
    const run = await runOf(ids.round2, "deli", "w1");
    let r = ok(
      await commit(run.id, "w1", run.gen, 0, 1, {
        places: [place(101, "qualified", { phone: "+15125550177" })],
        round: { state: "probing" },
      }),
    );
    assert.equal(r.counted, 1);
    const held = (await leadByPlace("ChIJfixture0101")).id;
    const { count: before } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", A);
    const shares = [
      { kind: "phone", lead_id: held },
      { kind: "phone", contact_id: person.id },
    ];
    r = ok(
      await commit(run.id, "w1", run.gen, 1, 3, {
        places: [
          place(102, "qualified", { phone: "+15125550177", shares }),
          place(103, "qualified", { phone: "+15125550177", shares }),
        ],
      }),
    );
    assert.deepEqual([r.counted, r.qualified], [2, 2], "the other two are delivered");
    const { count: withNumber } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A)
      .eq("phone_e164", "+15125550177");
    assert.equal(withNumber, 3, "three places, three leads, one number: never merged");
    for (const pid of ["ChIJfixture0102", "ChIJfixture0103"]) {
      const m = await member(ids.search2, (await leadByPlace(pid)).id);
      // The values are the page's; what is pinned is where the engine put them
      // and what else it wrote: the page's shares land on the MEMBERSHIP's
      // judgment beside the judge's reasons, and nothing else is added.
      assert.deepEqual(
        m.judgment,
        { reasons: [], shares },
        "the judgment is the judge's reasons and the page's shares, and nothing more",
      );
    }
    const { count: after_ } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", A);
    assert.equal(after_, before, "no person was made");
    ids.run2 = run.id;
    ids.gen2 = run.gen;
  },
);

test(
  "a duplicate listing folds into the lead already held; an erased or customer place is never inserted (erasure mid-run)",
  { skip },
  async () => {
    const held = (await leadByPlace("ChIJfixture0101")).id;
    ok(
      await db.from("lead_suppressions").insert([
        { tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, "ChIJfixture0105"), what: "erased" },
        { tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, "ChIJfixture0106"), what: "customer" },
      ]),
    );
    const r = ok(
      await commit(ids.run2, "w1", ids.gen2, 3, 6, {
        places: [
          place(104, "qualified", { duplicateOf: "ChIJfixture0101" }),
          place(105, "qualified"),
          place(106, "qualified"),
        ],
      }),
    );
    assert.equal(r.qualified, 0, "the duplicate is the lead already held (a member once), the hidden two are skipped");
    assert.equal(
      ok(await db.from("lead_places").select("lead_id").eq("tenant_id", A).eq("place_id", "ChIJfixture0104").single())
        .lead_id,
      held,
    );
    const { count } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A)
      .in("place_id", ["ChIJfixture0104", "ChIJfixture0105", "ChIJfixture0106"]);
    assert.equal(count, 0);
  },
);

test("ending a round releases what it reserved and did not use", { skip }, async () => {
  const month = leadMonth(TZ, new Date());
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: ids.round2, p_ending: "stopped" })), true);
  assert.equal(
    ok(await db.rpc("lead_round_end", { p_round_id: ids.round2, p_ending: "stopped" })),
    false,
    "and only once",
  );
  assert.deepEqual(
    await counter("allowance", month),
    { used: 8, reserved: 0 },
    "eight counted so far; the 495 reservation is released",
  );
  const ev = ok(
    await db
      .from("events")
      .select("data")
      .eq("tenant_id", A)
      .eq("kind", "lead.round")
      .eq("subject_id", ids.round2)
      .order("created_at", { ascending: false })
      .limit(1),
  );
  assert.deepEqual([ev[0].data.state, ev[0].data.ending], ["ended", "stopped"]);
});

test(
  "keep, exclude and put back write their operation rows; undo refuses a changed version and credits the month it counted in; a hidden or out-of-area place is never put back",
  { skip },
  async () => {
    const month = leadMonth(TZ, new Date());
    assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: ids.run1, p_owner: "w3", p_seconds: 60 })), 0);
    const r0 = ok(
      await commit(ids.run1, "w3", 0, 23, 28, {
        places: [
          place(201, "review", { reasons: ["email:catch_all"] }),
          place(202, "review", { reasons: ["unknown:chain"] }),
          place(203, "excluded"),
          place(204, "excluded", { reasons: ["fail:chain", "out_of_area"] }),
          place(205, "excluded"),
        ],
      }),
    );
    assert.deepEqual([r0.review, r0.excluded], [2, 3]);
    const a = (await leadByPlace("ChIJfixture0201")).id;
    const b = (await leadByPlace("ChIJfixture0202")).id;
    const c = (await leadByPlace("ChIJfixture0203")).id;
    const d = (await leadByPlace("ChIJfixture0204")).id;

    const denied = await operator.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a });
    assert.match(
      denied.error?.message ?? "",
      /Search not found/,
      "an operator may not keep: the door does not even say the search exists",
    );
    let r = ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a }));
    assert.ok(r.op_id && r.version === 2 && r.counted === true, JSON.stringify(r));
    let m = await member(ids.search1, a);
    assert.deepEqual(
      [m.class, m.counted, m.counted_month, m.kept_by, m.version],
      ["qualified", true, month, owner.userId, 2],
    );
    assert.deepEqual(await counter("allowance", month), { used: 9, reserved: 0 }, "keep counts");
    const op = ok(await db.from("lead_operations").select("*").eq("id", r.op_id).single());
    assert.deepEqual(
      [op.kind, op.before.class, op.after.class, op.version, op.by],
      ["keep", "review", "qualified", 2, owner.userId],
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a })).error,
      "state",
      "kept twice is refused",
    );

    assert.equal(
      ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 1 })).error,
      "changed",
      "undo with the version the client did not see",
    );

    // "The lead goes back to the allowance of the month it counted in" (S11) is
    // only a claim while that month is this one. Move the keep back a month --
    // the member's row and the operation's record of it -- and seed that
    // month's counter, so the credit has somewhere else to land.
    const last = leadMonth(TZ, new Date(Date.now() - 45 * 86_400_000));
    assert.notEqual(last, month, "a month that is not this one");
    ok(
      await db
        .from("lead_search_members")
        .update({ counted_month: last })
        .eq("search_id", ids.search1)
        .eq("lead_id", a),
    );
    ok(
      await db
        .from("lead_operations")
        .update({ after: { ...op.after, counted_month: last } })
        .eq("id", op.id),
    );
    ok(await db.from("lead_counters").insert({ tenant_id: A, kind: "allowance", period: last, used: 3 }));

    r = ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 2 }));
    assert.deepEqual(r, { ok: true, version: 3 });
    m = await member(ids.search1, a);
    assert.deepEqual([m.class, m.counted, m.counted_month, m.version], ["review", false, null, 3], "back in review");
    assert.deepEqual(
      await counter("allowance", last),
      { used: 2, reserved: 0 },
      "undo credits the month it counted in",
    );
    assert.deepEqual(await counter("allowance", month), { used: 9, reserved: 0 }, "and never this one");
    assert.equal(
      ok(await owner.client.rpc("lead_undo", { p_op_id: op.id, p_version: 2 })).error,
      "undone",
      "undone once",
    );

    r = ok(await owner.client.rpc("lead_member_exclude", { p_search_id: ids.search1, p_lead_id: b }));
    assert.equal(r.version, 2);
    m = await member(ids.search1, b);
    assert.deepEqual([m.class, m.excluded_by, m.counted], ["excluded", "owner", false], "excluded by the owner, free");
    r = ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: b }));
    assert.deepEqual([r.version, r.counted], [3, true], "put back counts");
    m = await member(ids.search1, b);
    assert.deepEqual([m.class, m.counted, m.excluded_by], ["qualified", true, null]);
    assert.equal(ok(await db.from("lead_operations").select("kind").eq("id", r.op_id).single()).kind, "put_back");

    ok(
      await db.from("lead_suppressions").insert({
        tenant_id: A,
        kind: "place",
        hash: await leadSuppressionHash(A, "ChIJfixture0203"),
        what: "customer",
      }),
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: c })).error,
      "hidden",
      "a customer is hidden",
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: d })).error,
      "out_of_area",
      "out of area stays out",
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_exclude", { p_search_id: ids.search1, p_lead_id: c })).error,
      "state",
      "exclude wants a member in review",
    );
    // Neither Put back nor Keep revives a hidden or an out-of-area place (§0.1).
    // Put back is refused by name above; Keep never reaches either, because the
    // only members it takes are in review or qualified and not yet counted, and
    // both of these were left out.
    assert.equal(
      ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: c })).error,
      "state",
      "a customer's place is never kept either",
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: d })).error,
      "state",
      "nor an out-of-area one",
    );
    assert.equal(
      ok(
        await owner.client.rpc("lead_member_keep", {
          p_search_id: ids.search1,
          p_lead_id: "00000000-0000-4000-8000-000000000000",
        }),
      ).error,
      "not_found",
    );
  },
);

test(
  "the check qualifies a member the email standard alone held back; the last batch ends the round with the pending ending; a late page on an ended round is refused",
  { skip },
  async () => {
    const a = (await leadByPlace("ChIJfixture0201")).id;
    let r = ok(
      await commit(ids.run1, "w3", 0, 28, 29, {
        places: [place(206, "review", { reasons: ["email:unknown"] })],
        run_state: "succeeded",
        next: { kind: "lead_check", batch: 1, run_after_seconds: 0 },
        round: { state: "checking", ending_pending: "few_new_matches" },
      }),
    );
    assert.equal(r.round_state, "checking");
    assert.equal(ok(await db.from("lead_runs").select("state").eq("id", ids.run1).single()).state, "succeeded");
    const { count: checks } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_check")
      .eq("payload->>round_id", ids.round1);
    assert.equal(checks, 1, "the check job");
    const e = (await leadByPlace("ChIJfixture0206")).id;
    // A check settles against its own run: lead_check_commit takes the check
    // run's id, and p_usage_usd is that RUN'S TOTAL SO FAR, not this batch's
    // delta, so a check job tried again charges once.
    const month = leadMonth(TZ, new Date());
    const checkRun = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: ids.round1,
          purpose: "check",
          actor: "mailbox",
          build: "1",
          webhook_token_hash: `check-${Date.now()}`,
        })
        .select("id")
        .single(),
    );
    const budgetBefore = await counter("budget", month);
    const results = [
      { lead_id: a, email_state: "ok", checked_at: new Date().toISOString() },
      { lead_id: e, email_state: "invalid", checked_at: new Date().toISOString() },
    ];
    r = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: ids.round1,
        p_run_id: checkRun.id,
        p_results: results,
        p_usage_usd: 0.001,
        p_last: false,
      }),
    );
    // Five were asked for and five counted on the first page: the round's
    // reservation is spent, so the member qualifies and nothing counts.
    assert.deepEqual([r.qualified, r.counted, r.ended], [1, 0, false]);
    let m = await member(ids.search1, a);
    assert.deepEqual(
      [m.class, m.counted, m.version],
      ["qualified", false, 4],
      "the email was its only reason; qualified now, and past the round's room it counts for nothing",
    );
    m = await member(ids.search1, e);
    assert.equal(m.class, "review", "a bounce stays in review, marked invalid on the lead");
    assert.equal((await leadByPlace("ChIJfixture0206")).email_state, "invalid");

    // Qualified and not counted is the state Keep is for, and the zero-room
    // check is the only thing that makes it: the owner takes the one the round
    // had no room for, and the month's allowance moves now.
    const allowanceWas = await counter("allowance", month);
    const kept = ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a }));
    assert.deepEqual(
      [kept.version, kept.counted],
      [5, true],
      "keep takes a qualified member the round could not count",
    );
    const km = await member(ids.search1, a);
    assert.deepEqual([km.class, km.counted, km.counted_month], ["qualified", true, month]);
    assert.deepEqual(
      await counter("allowance", month),
      { used: allowanceWas.used + 1, reserved: allowanceWas.reserved },
      "and it counts now",
    );

    const budgetAfter = await counter("budget", month);
    assert.equal((budgetAfter.used - budgetBefore.used).toFixed(4), "0.0010", "the batch is charged");
    r = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: ids.round1,
        p_run_id: checkRun.id,
        p_results: results,
        p_usage_usd: 0.001,
        p_last: false,
      }),
    );
    assert.deepEqual([r.qualified, r.counted], [0, 0], "nothing qualifies twice");
    assert.deepEqual(
      await counter("budget", month),
      budgetAfter,
      "and the same total moves the budget once, however often the job is tried",
    );
    assert.equal(
      Number(ok(await db.from("lead_rounds").select("cost_usd").eq("id", ids.round1).single()).cost_usd),
      0.031,
      "0.02 and 0.01 of discovery, 0.001 of checking",
    );

    // No run, no charge: a caller that names none settles nothing.
    assert.equal(
      ok(
        await db.rpc("lead_check_commit", {
          p_round_id: ids.round1,
          p_run_id: null,
          p_results: [],
          p_usage_usd: 0.9,
          p_last: false,
        }),
      ).ok,
      true,
    );
    assert.deepEqual(await counter("budget", month), budgetAfter, "a usage with no check run settles nothing");

    r = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: ids.round1,
        p_run_id: checkRun.id,
        p_results: [],
        p_usage_usd: 0.001,
        p_last: true,
      }),
    );
    assert.equal(r.ended, true, "the last batch ends the round");
    const round = ok(await db.from("lead_rounds").select("state, ending, cost_usd").eq("id", ids.round1).single());
    assert.deepEqual([round.state, round.ending, Number(round.cost_usd)], ["ended", "few_new_matches", 0.031]);
    // What release A2 reads a round's spend from: the latest round's cost_usd,
    // on the view a member holds.
    const view = ok(
      await owner.client
        .from("lead_searches_view")
        .select("round_id, cost_usd, state, ending")
        .eq("id", ids.search1)
        .single(),
    );
    assert.deepEqual(
      [view.round_id, Number(view.cost_usd), view.state, view.ending],
      [ids.round1, 0.031, "ended", "few_new_matches"],
      "the view carries the latest round's cost_usd",
    );
    assert.deepEqual(ok(await commit(ids.run1, "w3", 0, 29, 30, { places: [] })), { ok: false, why: "ended" });
    const late = await db.from("lead_rounds").update({ state: "running" }).eq("id", ids.round1);
    assert.match(late.error?.message ?? "", /final once ended/, "an ended round is final, to the service role too");
  },
);

test(
  "the same answer on a round that still has room counts, and the month's allowance moves with it",
  { skip },
  async () => {
    const month = leadMonth(TZ, new Date());
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(3),
        p_via: "people",
        p_estimate_usd: 0.01,
      }),
    );
    assert.ok(made.search_id && made.round_id, JSON.stringify(made));
    ids.searchRoom = made.search_id;
    ids.roundRoom = made.round_id;
    const run = await runOf(made.round_id, "strength coach", "w5");
    ok(
      await commit(run.id, "w5", run.gen, 0, 1, {
        places: [place(301, "review", { reasons: ["email:unknown"] })],
        round: { state: "probing" },
      }),
    );
    const held = (await leadByPlace("ChIJfixture0301")).id;
    const before = await counter("allowance", month);
    const checkRun = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: made.round_id,
          purpose: "check",
          actor: "mailbox",
          build: "1",
          webhook_token_hash: `check-room-${Date.now()}`,
        })
        .select("id")
        .single(),
    );
    const r = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: made.round_id,
        p_run_id: checkRun.id,
        p_results: [{ lead_id: held, email_state: "ok", checked_at: new Date().toISOString() }],
        p_usage_usd: 0.002,
        p_last: false,
      }),
    );
    assert.deepEqual(
      [r.qualified, r.counted, r.ended],
      [1, 1, false],
      "three asked for and none counted yet: the room is there",
    );
    const m = await member(made.search_id, held);
    assert.deepEqual([m.class, m.counted, m.counted_month, m.version], ["qualified", true, month, 2]);
    assert.deepEqual(
      await counter("allowance", month),
      { used: before.used + 1, reserved: before.reserved - 1 },
      "the month's allowance moves: reserved becomes used",
    );
    assert.equal(
      ok(await db.from("lead_rounds").select("allowance_used").eq("id", made.round_id).single()).allowance_used,
      1,
    );
    assert.equal(
      ok(await db.rpc("lead_round_end", { p_round_id: made.round_id, p_ending: "searched_everything" })),
      true,
    );
    assert.deepEqual(
      await counter("allowance", month),
      { used: before.used + 1, reserved: before.reserved - 3 },
      "and the two it never counted come back",
    );
  },
);

test(
  "a top-up reserves the count minus what counted; the question waits on the owner and keep, include and stop answer it; Stop moves the generation so a late worker cannot publish",
  { skip },
  async () => {
    let r = ok(
      await owner.client.rpc("lead_search_more", {
        p_search_id: ids.search1,
        p_purpose: "topup",
        p_plan: plan(5),
        p_estimate_usd: 0.05,
      }),
    );
    assert.equal(r.error, "nothing_to_add", JSON.stringify(r));
    assert.equal(r.counted, 7, "five on the first page, one put back, one kept after the check");
    r = ok(
      await owner.client.rpc("lead_search_more", {
        p_search_id: ids.search1,
        p_purpose: "topup",
        p_plan: plan(12, 2),
        p_estimate_usd: 0.05,
      }),
    );
    assert.deepEqual([r.seq, r.target], [2, 5], "the count minus what counted");
    ids.round3 = r.round_id;
    assert.equal(
      ok(await db.from("lead_searches").select("plan").eq("id", ids.search1).single()).plan.version,
      2,
      "the amended plan is the search's",
    );
    assert.equal(
      ok(
        await owner.client.rpc("lead_search_more", {
          p_search_id: ids.search1,
          p_purpose: "renew",
          p_plan: plan(12, 2),
          p_estimate_usd: 0.05,
        }),
      ).error,
      "live",
      "one live round",
    );

    const run = await runOf(ids.round3, "personal trainer", "w4");
    ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [], round: { state: "probing" } }));
    r = ok(
      await commit(run.id, "w4", run.gen, 0, 0, {
        places: [],
        round: {
          state: "waiting_on_owner",
          question: { sentence: "Half of the first 25 are chain gyms. Is that what you meant?", criterionKey: "chain" },
        },
      }),
    );
    assert.equal(r.round_state, "waiting_on_owner");
    const wrong = await owner.client.rpc("lead_round_answer", {
      p_round_id: ids.round3,
      p_answer: "include",
      p_plan: plan(12, 2),
    });
    assert.match(wrong.error?.message ?? "", /the amended plan is version 3/, "include carries the next version");
    r = ok(
      await owner.client.rpc("lead_round_answer", {
        p_round_id: ids.round3,
        p_answer: "include",
        p_plan: { ...plan(12, 3), exclusions: [] },
      }),
    );
    assert.equal(r.state, "running");
    const round = ok(
      await db
        .from("lead_rounds")
        .select("plan_version, answered, target, waiting_since, plan")
        .eq("id", ids.round3)
        .single(),
    );
    assert.deepEqual(
      [round.plan_version, round.answered, round.target, round.waiting_since, round.plan.exclusions],
      [3, "include", 12, null, []],
    );
    const { count: resumes } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_round_start")
      .eq("payload->>round_id", ids.round3)
      .eq("payload->>resume", "true");
    assert.equal(resumes, 1, "the resume job");
    assert.equal(
      ok(await owner.client.rpc("lead_round_answer", { p_round_id: ids.round3, p_answer: "keep" })).error,
      "state",
      "not waiting any more",
    );

    r = ok(await operator.client.rpc("lead_round_stop", { p_search_id: ids.search1 }));
    assert.deepEqual(r, { rounds: 1, runs: 1 }, "an operator may stop");
    const stopped = ok(await db.from("lead_runs").select("lease_gen").eq("id", run.id).single());
    assert.equal(stopped.lease_gen, 1, "the generation moved");
    assert.equal(
      ok(await db.from("lead_rounds").select("ending_pending, state").eq("id", ids.round3).single()).ending_pending,
      "stopped",
    );
    const { count: stops } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "lead_collect")
      .eq("payload->>run_id", run.id)
      .eq("payload->>seq", "stop");
    assert.equal(stops, 1);
    assert.deepEqual(
      ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [] })),
      { ok: false, why: "lease" },
      "the old worker's generation is refused",
    );
    assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w4", p_seconds: 60 })), 1);
    r = ok(await commit(run.id, "w4", 1, 0, 0, { places: [], run_state: "aborted", round: { ending: "stopped" } }));
    assert.equal(r.round_state, "ended", "the abort ends the round stopped");
    assert.equal(ok(await db.from("lead_rounds").select("ending").eq("id", ids.round3).single()).ending, "stopped");
  },
);

test(
  "rename is the operator's; remove is the owner's and blanks what is not being worked; undo brings the search back without the leads exported since",
  { skip },
  async () => {
    let r = ok(
      await operator.client.rpc("lead_search_rename", { p_search_id: ids.search1, p_name: "  Trainers,  Austin " }),
    );
    assert.equal(r.name, "Trainers, Austin");
    const denied = await operator.client.rpc("lead_search_remove", { p_search_id: ids.search1 });
    assert.match(denied.error?.message ?? "", /Search not found/, "an operator may not remove");
    const every = ok(await db.from("lead_search_members").select("lead_id").eq("search_id", ids.search1))
      .map((x) => x.lead_id)
      .sort();
    assert.equal(
      every.length,
      28,
      "twenty on the first page, two more, five judged, one checked: every place this search judged",
    );
    // The lead being worked here, and the one exported below, are named. An
    // unordered limit(1) hands a different row on a different database, and the
    // retention test below acts on places by name: drawing 205 or 7 here would
    // hold it back from the purge and fail a test three tests away.
    const worked = (await leadByPlace("ChIJfixture0001")).id;
    assert.equal((await member(ids.search1, worked)).counted, true, "counted, so the removal has something to keep");
    ok(await db.from("leads").update({ stage: "nurture" }).eq("id", worked));
    r = ok(await owner.client.rpc("lead_search_remove", { p_search_id: ids.search1 }));
    assert.ok(r.op_id, JSON.stringify(r));
    assert.deepEqual([r.version, r.blanked], [1, 27], "every membership but the one being worked");
    assert.ok(ok(await db.from("lead_searches").select("removed_at").eq("id", ids.search1).single()).removed_at);
    const blanked = ok(
      await db.from("lead_search_members").select("lead_id").eq("search_id", ids.search1).not("blanked_at", "is", null),
    )
      .map((x) => x.lead_id)
      .sort();
    assert.deepEqual(
      blanked,
      every.filter((id) => id !== worked),
      "and exactly those: the memberships of the leads nobody is working",
    );
    assert.deepEqual(
      ok(
        await db.from("lead_search_members").select("lead_id").eq("search_id", ids.search1).is("blanked_at", null),
      ).map((x) => x.lead_id),
      [worked],
      "the worked lead's membership stays",
    );
    assert.equal(ok(await owner.client.rpc("lead_search_remove", { p_search_id: ids.search1 })).error, "removed");
    // The three movers share one body, and it says the same word: a removed
    // search charges nobody, so Keep, Exclude and Put back are refused too.
    const anyLead = ok(await db.from("lead_search_members").select("lead_id").eq("search_id", ids.search1).limit(1)).at(
      0,
    ).lead_id;
    for (const door of ["lead_member_keep", "lead_member_exclude", "lead_member_put_back"]) {
      assert.equal(
        ok(await owner.client.rpc(door, { p_search_id: ids.search1, p_lead_id: anyLead })).error,
        "removed",
        door,
      );
    }
    // Taken out of the workspace after the removal, so Undo must leave it where
    // it is. Named, and not one of the three places retention acts on.
    const exported = (await leadByPlace("ChIJfixture0010")).id;
    assert.ok(blanked.includes(exported), "the lead that leaves is one the removal blanked");
    ok(await db.from("leads").update({ exported_at: new Date().toISOString() }).eq("id", exported));
    const undone = ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 1 }));
    // recharged is release B's (00142): the undo_search branch now also takes
    // back what the Done strip's Undo credited to a month. A removal credits
    // nothing, so a removal undone recharges nothing.
    assert.deepEqual(
      undone,
      { ok: true, restored: 26, kept: 1, recharged: 0 },
      "the exported lead stays as it is and stays charged",
    );
    assert.deepEqual(
      ok(
        await db
          .from("lead_search_members")
          .select("lead_id")
          .eq("search_id", ids.search1)
          .not("blanked_at", "is", null),
      ).map((x) => x.lead_id),
      [exported],
      "and it is the only membership still blanked",
    );
    assert.equal(
      ok(await db.from("lead_searches").select("removed_at").eq("id", ids.search1).single()).removed_at,
      null,
    );
  },
);

test(
  "a write-in whose number a lead holds is that lead (linked, converted, came from a lead you found); the desk's Add a person never links; erasing the person blanks the lead and suppresses its place and number",
  { skip },
  async () => {
    const lead = await leadByPlace("ChIJfixture0003");
    const desk = ok(
      await owner.client.rpc("create_person", {
        p_tenant_id: A,
        p_phone_e164: lead.phone_e164,
        p_display_name: "Typed at the desk",
        p_source: "manual",
      }),
    );
    assert.equal((await leadByPlace("ChIJfixture0003")).contact_id, null, "the desk never links");
    ok(await db.from("contacts").delete().eq("id", desk.contact_id));
    const person = ok(
      await db.from("contacts").insert({ tenant_id: A, phone_e164: lead.phone_e164 }).select("id").single(),
    );
    const linked = await leadByPlace("ChIJfixture0003");
    assert.deepEqual(
      [linked.contact_id, linked.stage],
      [person.id, "converted"],
      "a write-in whose number a lead holds is that lead",
    );
    const came = ok(
      await db.from("events").select("data").eq("tenant_id", A).eq("kind", "contact.added").eq("subject_id", person.id),
    );
    assert.deepEqual(
      came.map((e) => e.data.source),
      ["lead"],
      "they came from a lead you found",
    );
    ok(await db.from("contacts").update({ erased_at: new Date().toISOString(), phone_e164: null }).eq("id", person.id));
    const gone = ok(
      await db.from("leads").select("blanked_at, erased_at, place_id, business_name").eq("id", lead.id).single(),
    );
    assert.ok(
      gone.blanked_at && gone.erased_at && gone.place_id === null && gone.business_name === "",
      "erasing the person blanks the lead",
    );
    const hashes = ok(await db.from("lead_suppressions").select("kind, hash").eq("tenant_id", A).eq("what", "erased"));
    const phoneHash = await leadSuppressionHash(A, lead.phone_e164);
    const placeHash = await leadSuppressionHash(A, "ChIJfixture0003");
    assert.ok(
      hashes.some((h) => h.kind === "phone" && h.hash === phoneHash),
      "the number is on the never-again list",
    );
    assert.ok(
      hashes.some((h) => h.kind === "place" && h.hash === placeHash),
      "and the place",
    );
    assert.equal(
      ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: lead.id })).error,
      "hidden",
      "and the lead it blanked is never kept back into the search",
    );
  },
);

test(
  "a member reads their workspace's searches with the latest round and the counts, and pages its leads; a member of another workspace reads nothing",
  { skip },
  async () => {
    const mine = ok(await owner.client.from("lead_searches_view").select("*").eq("tenant_id", A));
    assert.equal(mine.length, 3, "every search of the workspace: the two above and the one the check counted in");
    const s2 = mine.find((s) => s.id === ids.search2);
    assert.deepEqual(
      [s2.state, s2.ending, s2.qualified, s2.counted, s2.seq],
      ["ended", "stopped", 3, 3, 1],
      "the view carries the latest round and the counts",
    );
    assert.deepEqual(
      ok(await owner.client.from("lead_searches_view").select("id").eq("tenant_id", B)),
      [],
      "nothing of another workspace",
    );
    const first = ok(
      await owner.client.rpc("leads_page", {
        p_tenant_id: A,
        p_search_id: ids.search2,
        p_class: "qualified",
        p_sort: "found",
        p_after_key: null,
        p_limit: 2,
      }),
    );
    assert.equal(first.length, 2, "a page of two");
    assert.ok(
      first.every((row) => typeof row.place_id === "string" && row.place_id.startsWith("ChIJfixture")),
      "each row carries its lead's place_id, which is how a labelled set names a place",
    );
    const second = ok(
      await owner.client.rpc("leads_page", {
        p_tenant_id: A,
        p_search_id: ids.search2,
        p_class: "qualified",
        p_sort: "found",
        p_after_key: first[1].sort_key,
        p_limit: 2,
      }),
    );
    assert.equal(second.length, 1, "the next page carries on");
    assert.ok(!first.some((r) => r.lead_id === second[0].lead_id), "without repeating");
    assert.equal(
      ok(
        await owner.client.rpc("leads_page", {
          p_tenant_id: A,
          p_search_id: ids.search2,
          p_class: "qualified",
          p_sort: "distance",
          p_after_key: null,
          p_limit: 50,
        }),
      ).length,
      3,
    );
    assert.deepEqual(
      ok(await stranger.client.from("lead_searches_view").select("id").eq("tenant_id", A)),
      [],
      "a stranger sees none of it",
    );
    assert.deepEqual(
      ok(
        await stranger.client.rpc("leads_page", {
          p_tenant_id: A,
          p_search_id: null,
          p_class: "qualified",
          p_sort: "found",
          p_after_key: null,
          p_limit: 50,
        }),
      ),
      [],
      "nor a page",
    );
    assert.deepEqual(
      ok(
        await owner.client.rpc("leads_page", {
          p_tenant_id: B,
          p_search_id: null,
          p_class: "qualified",
          p_sort: "found",
          p_after_key: null,
          p_limit: 50,
        }),
      ),
      [],
      "a wrong workspace reads nothing",
    );
  },
);

// An answer that changed the plan (Include, or Change what I asked) re-judges the places the probe already judged, under
// the new plan (lead_round_rejudge, 00165). Without it the question's "Include large studio chains" left all nine of
// them out: the main phase skips a place the workspace already holds, so they could never come back.
test(
  "an answer that changed the plan re-judges the first places: the one it lets in comes back whole and counted, one it now leaves out gives its lead back and keeps nothing, the owner's own decision stands, and a second pass changes nothing",
  { skip },
  async () => {
    const phonePlan = (version, over = {}) => ({ ...plan(4, version), contact: "phone", ...over });
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: phonePlan(1),
        p_via: "ask",
        p_estimate_usd: 0.01,
      }),
    );
    const roundId = made.round_id;
    const run = await runOf(roundId, "rejudge term", "w9");
    // The probe: a chain left out (keeping nothing, as the runner commits a left-out place), one counted, one to review.
    const chain = place(951, "excluded");
    Object.assign(chain.place, { email: null, email_state: "none", about: null });
    ok(
      await commit(run.id, "w9", run.gen, 0, 4, {
        places: [chain, place(952, "qualified"), place(953, "review"), place(954, "qualified")],
        usage_usd: 0,
        items_seen: 4,
        round: { state: "probing" },
      }),
    );
    ok(
      await commit(run.id, "w9", run.gen, 4, 4, {
        places: [],
        round: {
          state: "waiting_on_owner",
          question: { sentence: "Some of the first 3 are chain gyms. Is that what you meant?", criterionKey: "chain" },
        },
      }),
    );
    const [l1, l2, l3] = await Promise.all(["0951", "0952", "0953"].map((n) => leadByPlace(`ChIJfixture${n}`)));
    // The owner keeps the one under review while the question waits: their decision, which no re-judge undoes.
    ok(await owner.client.rpc("lead_member_keep", { p_search_id: made.search_id, p_lead_id: l3.id }));
    // And marks another's number wrong: a lead they have worked, which no re-judge takes back either.
    const l4 = await leadByPlace("ChIJfixture0954");
    ok(await db.from("leads").update({ phone_wrong: true }).eq("id", l4.id));
    const month = ok(await db.from("lead_rounds").select("month").eq("id", roundId).single()).month;
    const before = await counter("allowance", month);
    const r = ok(
      await owner.client.rpc("lead_round_answer", {
        p_round_id: roundId,
        p_answer: "include",
        p_plan: phonePlan(2, { exclusions: [] }),
      }),
    );
    assert.equal(r.state, "running");

    const judged = (cls, over = {}) => ({
      class: cls,
      excluded_by: cls === "excluded" ? "website" : null,
      fit: cls === "excluded" ? null : "strong",
      reason: cls === "excluded" ? "No website of its own" : "Independent studio with its own site",
      judgment: {
        op_id: "op-rejudge-1",
        term: "rejudge term",
        answer: { criteria: [] },
        model: "m",
        reasons: [],
        plan_version: 2,
      },
      ...over,
    });
    const back = place(951, "qualified");
    Object.assign(back.place, {
      email: "hello@fixture951.example",
      email_state: "checking",
      about: "An independent studio.",
    });
    const pages = [
      { place: back.place, member: judged("qualified") },
      { place: place(952, "excluded").place, member: judged("excluded") },
      { place: place(953, "excluded").place, member: judged("excluded") },
      { place: place(954, "excluded").place, member: judged("excluded") },
    ];
    const judgment = {
      op_id: "op-rejudge-1",
      batch: 0,
      request_hash: "r".repeat(64),
      answer: {},
      model: "m",
      tokens: 30,
    };
    const rejudge = (version, places = pages) =>
      db.rpc("lead_round_rejudge", {
        p_round_id: roundId,
        p_plan_version: version,
        p_places: places,
        p_judgment: judgment,
      });

    assert.deepEqual(ok(await rejudge(1)), { ok: false, why: "version" }, "only under the plan the round runs on now");
    const tokens = ok(await db.from("lead_rounds").select("judge_tokens").eq("id", roundId).single()).judge_tokens;
    assert.deepEqual(ok(await rejudge(2)), { ok: true, changed: 2, counted: 1, uncounted: 1 });

    const m1 = await member(made.search_id, l1.id);
    const m2 = await member(made.search_id, l2.id);
    const m3 = await member(made.search_id, l3.id);
    assert.deepEqual(
      [m1.class, m1.counted, m1.excluded_by, m1.judgment.plan_version, m1.version],
      ["qualified", true, null, 2, 2],
      "the chain it lets in is a lead now, counted from the round's reservation",
    );
    const lead1 = await leadByPlace("ChIJfixture0951");
    assert.deepEqual(
      [lead1.email, lead1.email_state, lead1.about],
      ["hello@fixture951.example", "checking", "An independent studio."],
      "and whole: what a left-out place never kept is filled, its email waiting on the round's checks",
    );
    assert.deepEqual(
      [m2.class, m2.counted, m2.excluded_by, m2.version],
      ["excluded", false, "website", 2],
      "one the new plan leaves out gives its lead back",
    );
    const lead2 = await leadByPlace("ChIJfixture0952");
    assert.deepEqual(
      [lead2.email, lead2.email_state, lead2.about, lead2.image_url],
      [null, "none", null, null],
      "and keeps nothing a left-out place never keeps (PRD 0.4)",
    );
    assert.deepEqual([m3.class, m3.kept_at !== null], ["qualified", true], "the owner's Keep stands");
    const m4 = await member(made.search_id, l4.id);
    assert.deepEqual([m4.class, m4.counted, m4.version], ["qualified", true, 1], "and so does a lead they worked");
    assert.deepEqual(m1.judgment.shares, [], "the shares the collect marked are kept under the new judgment");

    const round = ok(await db.from("lead_rounds").select("allowance_used, judge_tokens").eq("id", roundId).single());
    assert.equal(round.allowance_used, 2, "one in, one out: the round's reservation is used as before");
    assert.equal(round.judge_tokens, tokens + 30, "the judge's answer is kept once, with its tokens");
    assert.deepEqual(await counter("allowance", month), before, "and the month's counter says the same");
    assert.deepEqual(
      ok(await rejudge(2)),
      { ok: true, changed: 0, counted: 0, uncounted: 0 },
      "a second pass changes nothing",
    );
    assert.equal(
      ok(await db.from("lead_rounds").select("judge_tokens").eq("id", roundId).single()).judge_tokens,
      tokens + 30,
      "nor pays for the same answer twice",
    );
    const ev = ok(
      await db
        .from("events")
        .select("data")
        .eq("tenant_id", A)
        .eq("kind", "lead.round")
        .eq("subject_id", roundId)
        .order("created_at", { ascending: false })
        .limit(3),
    );
    assert.ok(
      ev.some((e) => e.data.rejudged === 2 && e.data.plan_version === 2),
      "the round's history says how many the new plan changed",
    );
    const denied = await owner.client.rpc("lead_round_rejudge", {
      p_round_id: roundId,
      p_plan_version: 2,
      p_places: pages,
      p_judgment: judgment,
    });
    assert.ok(denied.error, "the runner's door, not a member's");
    assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: roundId, p_ending: "stopped" })), true);
    assert.deepEqual(ok(await rejudge(2)), { ok: false, why: "state" }, "an ended round is final");
  },
);

test("the owner's other two answers: Keep carries the round on as it is, Stop ends it stopped", { skip }, async () => {
  /** A fresh search whose round is waiting on the owner after the probe. */
  const waiting = async (worker) => {
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(2),
        p_via: "ask",
        p_estimate_usd: 0.01,
      }),
    );
    assert.ok(made.round_id, JSON.stringify(made));
    const run = await runOf(made.round_id, "chain gyms", worker);
    ok(await commit(run.id, worker, run.gen, 0, 0, { places: [], round: { state: "probing" } }));
    ok(
      await commit(run.id, worker, run.gen, 0, 0, {
        places: [],
        round: {
          state: "waiting_on_owner",
          question: { sentence: "Half of the first 25 are chain gyms. Is that what you meant?", criterionKey: "chain" },
        },
      }),
    );
    return made.round_id;
  };

  const carried = await waiting("w6");
  let r = ok(await owner.client.rpc("lead_round_answer", { p_round_id: carried, p_answer: "keep" }));
  assert.deepEqual([r.round_id, r.state], [carried, "running"], "Keep carries the round on");
  let round = ok(
    await db
      .from("lead_rounds")
      .select("state, answered, question, waiting_since, plan_version, target, plan")
      .eq("id", carried)
      .single(),
  );
  assert.deepEqual(
    [round.state, round.answered, round.waiting_since, round.plan_version, round.target, round.plan.exclusions.length],
    ["running", "keep", null, 1, 2, 1],
    "the plan it ran is the plan it runs on: no amendment, no version",
  );
  const { count: resumes } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("kind", "lead_round_start")
    .eq("payload->>round_id", carried)
    .eq("payload->>resume", "true");
  assert.equal(resumes, 1, "a resume job for the same round");
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: carried, p_ending: "stopped" })), true);

  const halted = await waiting("w7");
  r = ok(await owner.client.rpc("lead_round_answer", { p_round_id: halted, p_answer: "stop" }));
  assert.deepEqual([r.round_id, r.state], [halted, "ended"], "Stop ends it");
  round = ok(await db.from("lead_rounds").select("state, answered, ending, ended_at").eq("id", halted).single());
  assert.deepEqual(
    [round.state, round.answered, round.ending, round.ended_at !== null],
    ["ended", "stop", "stopped", true],
    "ended stopped, and answered so",
  );
  const ev = ok(
    await db
      .from("events")
      .select("data")
      .eq("tenant_id", A)
      .eq("kind", "lead.round")
      .eq("subject_id", halted)
      .order("created_at", { ascending: false })
      .limit(1),
  );
  assert.deepEqual([ev[0].data.state, ev[0].data.ending], ["ended", "stopped"]);
});

test(
  "the other three caps refuse in their own sentence: the month's searching budget, the workspace's day and the platform's",
  { skip },
  async () => {
    const month = leadMonth(TZ, new Date());
    const day = ok(await db.rpc("lead_day", { p_tenant_id: A }));
    const platformDay = new Date().toISOString().slice(0, 10);
    const { count: searchesWere } = await db
      .from("lead_searches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A);

    /**
     * One counter put a step from its edge, the door asked for a step more,
     * and the row put back exactly as it was. The rows are this suite's running
     * arithmetic, and the platform's day row is shared with every other suite,
     * so nothing here reads an absolute value and nothing is left moved.
     */
    const atTheEdge = async (where, used, usd) => {
      const was = ok(await where(db.from("lead_counters").select("id, used, reserved")).single());
      ok(await db.from("lead_counters").update({ used, reserved: 0 }).eq("id", was.id));
      const r = ok(
        await owner.client.rpc("lead_search_create", {
          p_tenant_id: A,
          p_plan: plan(1),
          p_via: "ask",
          p_estimate_usd: usd,
        }),
      );
      ok(await db.from("lead_counters").update({ used: was.used, reserved: was.reserved }).eq("id", was.id));
      return r;
    };

    let r = await atTheEdge((q) => q.eq("tenant_id", A).eq("kind", "budget").eq("period", month), 24.9, 0.2);
    assert.equal(r.error, "budget_used", JSON.stringify(r));
    assert.equal(Number(r.left_usd), 0.1, "what is left of the month's $25");
    assert.match(
      r.sentence,
      /^This month's searching is nearly used up\. Try a smaller search, or a phone standard; it renews on [A-Z][a-z]{2} 1\.$/,
    );

    r = await atTheEdge((q) => q.eq("tenant_id", A).eq("kind", "day").eq("period", day), 9.95, 0.1);
    assert.deepEqual(
      [r.error, r.sentence],
      ["day_cap", "Today's searching is used up. Try again tomorrow."],
      "the workspace's own day",
    );

    r = await atTheEdge((q) => q.is("tenant_id", null).eq("kind", "day").eq("period", platformDay), 49.9, 0.2);
    assert.deepEqual(
      [r.error, r.sentence],
      ["day_cap", "Searching is busy today. Try again tomorrow."],
      "and the platform's, which says so differently",
    );

    const { count: searchesNow } = await db
      .from("lead_searches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A);
    assert.equal(
      searchesNow,
      searchesWere,
      "a refusal writes no search, no round and no job: only the counter rows it had to take",
    );
  },
);

test(
  "retention: an untouched lead is set aside at 90 days and blanked at 180; an excluded place at 30 days loses its details when nothing else holds it and keeps its row when something does, and either way it stays counted as left out",
  { skip },
  async () => {
    const old = await leadByPlace("ChIJfixture0007");
    assert.deepEqual(
      [old.stage, old.contact_id, old.contacted_at, old.exported_at],
      ["ready", null, null, null],
      "untouched: no person, no call, nothing taken out of the workspace",
    );
    ok(
      await db
        .from("leads")
        .update({ found_at: new Date(Date.now() - 91 * 86_400_000).toISOString() })
        .eq("id", old.id),
    );

    // A place a search left out has two fates at 30 days, and they are
    // different rows. 205 is a member of this one search and nobody has touched
    // it, so the LEAD loses its details. 204 was taken out of the workspace, so
    // the lead's own row stays as it was and the MEMBERSHIP loses the judgment
    // instead. Both are named: which lead the removal exported is pinned above,
    // exactly so that neither of these is held back by accident.
    const free = await leadByPlace("ChIJfixture0205");
    const held = await leadByPlace("ChIJfixture0204");
    for (const [what, l] of [
      ["205", free],
      ["204", held],
    ]) {
      const own = ok(await db.from("lead_search_members").select("search_id, class, blanked_at").eq("lead_id", l.id));
      assert.deepEqual(
        own.map((m) => [m.search_id, m.class, m.blanked_at]),
        [[ids.search1, "excluded", null]],
        `${what}: one membership, left out of one search, and still there`,
      );
      assert.deepEqual([l.contact_id, l.contacted_at], [null, null], `${what}: no person and no call holds it`);
    }
    assert.equal(free.exported_at, null, "205: and nothing was taken out of the workspace, so nothing holds it at all");
    ok(await db.from("leads").update({ exported_at: new Date().toISOString() }).eq("id", held.id));
    ok(
      await db
        .from("lead_search_members")
        .update({ created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() })
        .in("lead_id", [free.id, held.id]),
    );

    const before = ok(await db.from("lead_searches_view").select("excluded").eq("id", ids.search1).single()).excluded;
    ok(await db.rpc("purge_leads"));
    let l = ok(await db.from("leads").select("stage, closed_reason, blanked_at").eq("id", old.id).single());
    assert.deepEqual(
      [l.stage, l.closed_reason, l.blanked_at],
      ["archived", "stale", null],
      "set aside at 90 days, not yet blanked",
    );
    const e = ok(
      await db.from("leads").select("blanked_at, place_id, business_name, phone_e164").eq("id", free.id).single(),
    );
    assert.deepEqual(
      [e.blanked_at !== null, e.place_id, e.business_name, e.phone_e164],
      [true, null, "", null],
      "an excluded place nothing else holds loses its details at 30 days",
    );
    const h = ok(await db.from("leads").select("blanked_at, place_id, business_name").eq("id", held.id).single());
    assert.deepEqual(
      [h.blanked_at, h.place_id, h.business_name],
      [null, "ChIJfixture0204", "Fixture 204"],
      "one that was taken out of the workspace keeps its row: the copy out there is not rewritten by this",
    );
    const hm = ok(
      await db
        .from("lead_search_members")
        .select("blanked_at, judgment, reason, class")
        .eq("lead_id", held.id)
        .single(),
    );
    assert.deepEqual(
      [hm.blanked_at !== null, hm.judgment, hm.reason, hm.class],
      [true, {}, "", "excluded"],
      "its membership loses the judgment instead, and stays excluded",
    );
    const after_ = ok(await db.from("lead_searches_view").select("excluded").eq("id", ids.search1).single()).excluded;
    assert.equal(after_, before, "and either way it stays counted as left out");

    ok(
      await db
        .from("leads")
        .update({ found_at: new Date(Date.now() - 181 * 86_400_000).toISOString() })
        .eq("id", old.id),
    );
    ok(await db.rpc("purge_leads"));
    l = ok(await db.from("leads").select("blanked_at, business_name").eq("id", old.id).single());
    assert.ok(l.blanked_at && l.business_name === "", "blanked at 180");
  },
);

/** What request_sweep writes when there is no edge to ask, which is every database this suite will run against. */
const NO_EDGE = "missing cron_sweep_key or edge_base_url in Vault";

/**
 * One turn of the clock, with what its own predicate saw at that moment.
 *
 * The two branches write disjoint columns of sweep_status: asking goes
 * through request_sweep, which rewrites note; recording a look stamps
 * requested_at and never touches note. A sentinel in note therefore tells
 * them apart whatever the row said before -- and the row is the platform's,
 * so it is put back as it was.
 *
 * The counts are read through the service role immediately before the call,
 * because the predicate is the whole database's: other database suites run
 * beside this one and their open rounds are lead work too.
 */
/**
 * The same turn, judged against the counts the predicate itself reads. This suite shares its database with every
 * other, and the counts are read before the clock asks, so work that arrives in between makes one turn disagree
 * with itself. A turn that disagrees is taken again: three in a row is the predicate, not the traffic.
 */
async function turnAgrees(why) {
  let turn = null;
  for (let i = 0; i < 3; i += 1) {
    turn = await turnTheClock(why);
    if (turn.asked === (turn.open > 0 || turn.live > 0)) return turn;
  }
  return assert.fail(`${why}: the clock and the database disagreed three turns running: ${JSON.stringify(turn)}`);
}

async function turnTheClock(why) {
  const was = ok(await db.from("sweep_status").select("note, requested_at").eq("sweep", "leads").single());
  const mark = `lead-engine ${Math.random().toString(36).slice(2)}`;
  ok(await db.from("sweep_status").update({ note: mark }).eq("sweep", "leads"));
  const open = await db.from("lead_rounds").select("id", { count: "exact", head: true }).neq("state", "ended");
  assert.equal(open.error, null, open.error?.message);
  const live = await db
    .from("lead_runs")
    .select("id", { count: "exact", head: true })
    .in("state", ["claimed", "starting", "running", "unknown"]);
  assert.equal(live.error, null, live.error?.message);
  const returned = ok(await db.rpc("trigger_leads_sweep"));
  const now = ok(await db.from("sweep_status").select("note, requested_at").eq("sweep", "leads").single());
  ok(await db.from("sweep_status").update({ note: was.note }).eq("sweep", "leads"));
  const asked = now.note !== mark;
  assert.equal(returned, null, `${why}: on a database with no edge to ask, either branch answers null`);
  if (asked) assert.equal(now.note, NO_EDGE, `${why}: the ask reached request_sweep`);
  else assert.notEqual(now.requested_at, was.requested_at, `${why}: a look is a look only once it is stamped`);
  return { asked, open: open.count, live: live.count };
}

test(
  "the clock asks the edge exactly when the database holds lead work, and records a look when it holds none",
  { skip },
  async () => {
    // This suite's own rounds and runs go first -- where the cleanup would have
    // taken them anyway -- so that when this file runs alone the look is the
    // branch that runs. What is left may still be another suite's work, so both
    // turns are judged against the counts the predicate itself reads.
    for (const id of [A, B]) {
      for (const r of ok(await db.from("lead_rounds").select("platform_day").eq("tenant_id", id)))
        platformDays.add(r.platform_day);
      ok(await db.from("lead_runs").delete().eq("tenant_id", id));
      ok(await db.from("lead_rounds").delete().eq("tenant_id", id));
    }
    assert.deepEqual(
      ok(await db.from("lead_rounds").select("id").eq("tenant_id", A)),
      [],
      "none of this suite's rounds is left",
    );
    await turnAgrees("nothing of this suite's left");

    // A round queued with no run at all: its start job died before it wrote
    // one, and nothing but the sweep can end it and give its reservation back.
    // This is the case a clock that asked only for a round waiting or checking
    // would walk past, and the reason the predicate reads lead_rounds_live.
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(1),
        p_via: "people",
        p_estimate_usd: 0.01,
      }),
    );
    assert.ok(made.round_id, JSON.stringify(made));
    assert.equal(ok(await db.from("lead_rounds").select("state").eq("id", made.round_id).single()).state, "queued");
    assert.deepEqual(
      ok(await db.from("lead_runs").select("id").eq("round_id", made.round_id)),
      [],
      "and nothing has run for it",
    );
    const turn = await turnAgrees("a round of this suite's own, queued, with no run");
    assert.ok(turn.open >= 1, "this suite's own round is open");
    assert.equal(turn.asked, true, "a round that has not ended is work, whether or not anything has run for it");
  },
);

/* =========================================================================
 * Release A2 (gate G3, the runtime cases): the runner's verbs over the real
 * database adapter (apps/edge/lib/leads/lead-db.ts) on this Postgres, with the
 * provider and the judge faked. Appended to A1's file; it shares its world
 * (db, A, owner, plan) and its skip. Every case below is one of the
 * interface's G3 items that only the runtime can show: two starts of one
 * round reach the provider once; a late webhook schedules the final collect
 * once; Stop during the checks ends the round 'stopped' only after the last
 * check commits; a place erased between the read and the commit is never
 * inserted; an out-of-area place is Needs review by rule with its distance;
 * a stale generation loses its commit.
 * ========================================================================= */

test(
  "A2: two starts of one round make one set of run rows and reach the provider once; the loser sees the rows already taken",
  { skip },
  async () => {
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: plan(20),
        p_via: "people",
        p_estimate_usd: 1,
      }),
    );
    const w = a2World(126);
    // At the same time, not one after the other: run them in turn and the second
    // reads the rows already started and never reaches lead_run_claim at all.
    // Together, the claim itself is what decides, one row at a time.
    const [first, second] = await Promise.all([
      startRound(w.ports("job-a"), made.round_id, "job-a"),
      startRound(w.ports("job-b"), made.round_id, "job-b"),
    ]);
    const kinds = [...first.runs, ...second.runs].map((r) => r.kind);
    assert.equal(kinds.filter((k) => k === "started").length, 2, `one start per term across both jobs: ${kinds}`);
    assert.ok(
      kinds.every((k) => ["started", "already", "someone_elses"].includes(k)),
      `whoever loses a row is refused by the claim, never by a throw: ${kinds}`,
    );
    assert.equal(
      w.apify.calls.filter((c) => c.op === "startRun").length,
      2,
      "one provider run per term, whoever wins the claim",
    );
    const runs = ok(
      await db
        .from("lead_runs")
        .select("id, state, claimed_by, apify_run_id, webhook_token_hash")
        .eq("round_id", made.round_id)
        .order("term"),
    );
    assert.equal(runs.length, 2);
    assert.ok(runs.every((r) => r.state === "running" && ["job-a", "job-b"].includes(r.claimed_by) && r.apify_run_id));
    assert.deepEqual(
      runs.map((r) => r.id),
      [
        await runIdFor(made.round_id, "probe", "personal trainer"),
        await runIdFor(made.round_id, "probe", "strength coach"),
      ],
      "each row's id is derived from the round, the phase and the term",
    );
    assert.equal(
      runs[0].webhook_token_hash,
      sha256(await w.wires.webhookToken(runs[0].id)),
      "and the token the door will be shown is the row's, hashed",
    );
    ids.a2 = { round: made.round_id, search: made.search_id, runs: runs.map((r) => r.id), world: w };
  },
);

test(
  "A2: a late webhook schedules the final collect once: three deliveries, one job; a wrong token writes nothing",
  { skip },
  async () => {
    const { runs, world: w } = ids.a2;
    const runRow = ok(await db.from("lead_runs").select("id, apify_run_id").eq("id", runs[0]).single());
    const { setPg } = await import(at("apps/edge/lib/pg.ts"));
    const door = await import(at("apps/edge/api/apify-webhook.ts"));
    setPg(db);
    try {
      const body = JSON.stringify({
        eventType: "ACTOR.RUN.SUCCEEDED",
        eventData: { actorRunId: runRow.apify_run_id },
        resource: { id: runRow.apify_run_id, status: "SUCCEEDED" },
      });
      const deliver = async (token) =>
        (
          await door.POST(
            new Request(`https://edge.example/api/apify-webhook?run=${runRow.id}&token=${token}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body,
            }),
            { waitUntil: () => {} },
          )
        ).status;
      const token = await w.wires.webhookToken(runRow.id);
      const finals = async () =>
        ok(
          await db
            .from("jobs")
            .select("payload")
            .eq("tenant_id", A)
            .eq("kind", "lead_collect")
            .in("state", ["scheduled", "fired"]),
        ).filter((j) => j.payload.run_id === runRow.id && j.payload.seq === "final").length;
      assert.equal(await deliver(await w.wires.webhookToken(ids.a2.runs[1])), 401, "another row's token");
      // Counted here, before any good delivery: after one, the once-per-key index would hide a job the 401 had written.
      assert.equal(await finals(), 0, "a wrong token writes nothing");
      assert.deepEqual([await deliver(token), await deliver(token), await deliver(token)], [200, 200, 200]);
      assert.equal(await finals(), 1);
    } finally {
      setPg(null);
    }
  },
);

test(
  "A2: a collect commits one batch of the probe through the real adapter; a stale generation loses its commit",
  { skip },
  async () => {
    const { runs, world: w, round } = ids.a2;
    w.finishRuns();
    const out = await collect(w.ports("collect-1"), runs[0], "p0", "collect-1");
    assert.equal(out.kind, "committed", JSON.stringify(out));
    const members = ok(await db.from("lead_search_members").select("class, judgment").eq("round_id", round));
    assert.ok(members.length >= 12, `one member per place of the page: ${members.length}`);
    assert.ok(
      members.every((m) => Array.isArray(m.judgment.reasons)),
      "the reason tokens ride the judgment, for lead_check_commit to read",
    );
    ok(await owner.client.rpc("lead_round_stop", { p_search_id: ids.a2.search }));
    // Stop left an ending pending on the round. The poll the door never
    // cancelled arrives now: it commits nothing and decides nothing, or it would
    // write over the ending the owner asked for and start the next phase.
    const stale = await collect(w.ports("collect-2"), runs[1], "p0", "collect-2");
    assert.equal(stale.kind, "round_closing", "a poll that lands after Stop is refused, not committed");
    const gen = ok(await db.rpc("lead_run_lease", { p_run_id: runs[1], p_owner: "collect-3", p_seconds: 60 }));
    // The row's own offset, so only the generation is wrong: 00140 checks the
    // lease before the offset, and a made-up offset would answer "lease" here
    // whatever the generation was.
    const at = ok(await db.from("lead_runs").select("read_offset").eq("id", runs[1]).single()).read_offset;
    const page = { judgment: null, places: [], usage_usd: 0, items_seen: 0, run_state: null, next: null, round: null };
    assert.deepEqual(await w.db.collectCommit(runs[1], "collect-3", gen - 1, at, at, page), {
      ok: false,
      why: "lease",
    });
  },
);

test("A2: Stop during the checks: the round ends 'stopped' only after the last check commits", { skip }, async () => {
  const made = ok(
    await owner.client.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: {
        ...plan(20),
        criteria: [{ key: "website", text: "With a website", standard: "likely", required: false }],
        exclusions: [],
      },
      p_via: "people",
      p_estimate_usd: 1,
    }),
  );
  const w = a2World(140);
  await startRound(w.ports("s1"), made.round_id, "s1");
  w.finishRuns();
  const runs = ok(await db.from("lead_runs").select("id").eq("round_id", made.round_id));
  for (const r of runs) await collect(w.ports(`c-${r.id}`), r.id, "p0", `c-${r.id}`);
  await startRound(w.ports("s2"), made.round_id, "s2", true);
  w.finishRuns();
  for (const r of ok(await db.from("lead_runs").select("id").eq("round_id", made.round_id).eq("state", "running")))
    await collect(w.ports(`m-${r.id}`), r.id, "p0", `m-${r.id}`);
  let round = ok(await db.from("lead_rounds").select("state, ending_pending").eq("id", made.round_id).single());
  assert.equal(round.state, "checking", JSON.stringify(round));
  await check(w.ports("k1"), made.round_id, 0, "k1");
  ok(await owner.client.rpc("lead_round_stop", { p_search_id: made.search_id }));
  round = ok(await db.from("lead_rounds").select("state, ending, ending_pending").eq("id", made.round_id).single());
  assert.deepEqual(
    [round.state, round.ending, round.ending_pending],
    ["checking", null, "stopped"],
    "still checking the emails",
  );
  w.finishRuns();
  const checkRun = ok(
    await db.from("lead_runs").select("id").eq("round_id", made.round_id).eq("purpose", "check").single(),
  );
  const done = await collect(w.ports("kc"), checkRun.id, "final", "kc");
  assert.deepEqual([done.kind, done.last], ["checked", true]);
  round = ok(await db.from("lead_rounds").select("state, ending").eq("id", made.round_id).single());
  assert.deepEqual(round, { state: "ended", ending: "stopped" });
});

test(
  "A2: erasure mid-run: a place suppressed between the read and the commit is never inserted; an out-of-area place is Needs review by rule, with its distance",
  { skip },
  async () => {
    const zipPlan = {
      ...plan(20),
      area: {
        kind: "zip",
        label: "near 78704",
        state: "TX",
        center: null,
        radius_m: 8000,
        zip: "78704",
        query: "78704, TX, USA",
      },
    };
    const made = ok(
      await owner.client.rpc("lead_search_create", {
        p_tenant_id: A,
        p_plan: zipPlan,
        p_via: "people",
        p_estimate_usd: 1,
      }),
    );
    const w = a2World(180);
    await startRound(w.ports("s1"), made.round_id, "s1");
    const runs = ok(await db.from("lead_runs").select("id, dataset_id").eq("round_id", made.round_id).order("term"));
    const src = probeItems();
    const erased = unseen(src[0], 160);
    const far = { ...unseen(src[1], 161), location: { lat: 32.7767, lng: -96.797 }, city: "Dallas" };
    const near = unseen(src[2], 162);
    w.apify.state.datasets[runs[0].dataset_id] = [erased, far, near];
    // The erasure lands after the runner has read the items and before it commits: the judge's port is where the two meet.
    const judge = w.judge.judge.bind(w.judge);
    w.judge.judge = async (p, places) => {
      ok(
        await db
          .from("lead_suppressions")
          .insert({ tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, erased.placeId), what: "erased" }),
      );
      return judge(p, places);
    };
    w.finishRuns();
    const out = await collect(w.ports("c1"), runs[0].id, "p0", "c1");
    assert.equal(out.kind, "committed", JSON.stringify(out));
    const leads = ok(
      await db
        .from("leads")
        .select("place_id, city")
        .eq("tenant_id", A)
        .in("place_id", [erased.placeId, far.placeId, near.placeId]),
    );
    assert.deepEqual(
      leads.map((l) => [l.place_id, l.city]).sort(),
      [
        [far.placeId, "Dallas"],
        [near.placeId, "Austin"],
      ].sort(),
      "the erased place was never inserted",
    );
    const members = ok(
      await db
        .from("lead_search_members")
        .select("lead_id, class, reason, distance_m, judgment")
        .eq("round_id", made.round_id),
    );
    const farLead = await leadByPlace(far.placeId);
    const held = members.find((m) => m.lead_id === farLead.id);
    assert.ok(held, JSON.stringify(members));
    assert.deepEqual(
      [held.class, held.reason, held.judgment.reasons, held.distance_m > 250_000],
      ["review", OUT_OF_AREA_REASON, ["out_of_area"], true],
    );
  },
);

// D2 (00144): what the listing shows about the business rides the same commit, comes back from leads_page, fills an
// already-known place only where it was empty, and goes with the rest when the lead is blanked. Its own search, round
// and run, made the way leads.db.test.mjs makes them, so nothing it counts moves a number another test pins.
test(
  "the lead carries what the listing shows: written by the commit, read by the page, filled where empty for a known place, blanked with the rest",
  { skip },
  async () => {
    const search = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          created_by: owner.userId,
          via: "people",
          card: "local_businesses",
          name: "wedding venues",
          asked: "wedding venues in Austin",
          plan: plan(5),
        })
        .select("id")
        .single(),
    ).id;
    const round = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: search,
          seq: 1,
          purpose: "probe",
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
          allowance_reserved: 5,
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "wedding venue", "w9");
    const shown = {
      about: "Waterfront venue for weddings.",
      hours: [{ day: "Monday", hours: "9 AM to 6 PM" }],
      image_url: "https://lh3.example/p.jpg",
      price: "$$",
      reviews_dist: { one: 1, two: 0, three: 2, four: 8, five: 30 },
      facebook_url: "https://www.facebook.example/p",
      linkedin_url: null,
      tiktok_url: null,
      claimed: true,
      maps_url: "https://maps.example/?cid=904",
      rank: 3,
    };
    const rich = place(904, "qualified");
    rich.place = { ...rich.place, ...shown };
    // A round starts queued and the first page moves it, as the shared-phone test above does.
    const r = ok(await commit(run.id, "w9", run.gen, 0, 1, { places: [rich], round: { state: "probing" } }));
    assert.equal(r.counted, 1);
    const rows = ok(
      await owner.client.rpc("leads_page", {
        p_tenant_id: A,
        p_search_id: search,
        p_class: "qualified",
        p_sort: "found",
        p_after_key: null,
        p_limit: 50,
      }),
    );
    const row = rows.find((x) => x.place_id === "ChIJfixture0904");
    assert.deepEqual(
      [
        row.about,
        row.hours,
        row.image_url,
        row.price,
        row.reviews_dist,
        row.facebook_url,
        row.linkedin_url,
        row.claimed,
        row.maps_url,
        row.rank,
      ],
      [
        shown.about,
        shown.hours,
        shown.image_url,
        shown.price,
        shown.reviews_dist,
        shown.facebook_url,
        null,
        shown.claimed,
        shown.maps_url,
        shown.rank,
      ],
      "the page returns what the commit wrote",
    );
    // The same place found again by another page: what it already shows stays; what was empty is filled; nothing else moves.
    const lead = await leadByPlace("ChIJfixture0904");
    ok(await db.from("leads").update({ stage: "nurture" }).eq("id", lead.id));
    const again = place(904, "qualified");
    again.place = {
      ...again.place,
      about: "A different line.",
      linkedin_url: "https://www.linkedin.example/p",
      claimed: false,
    };
    ok(await commit(run.id, "w9", run.gen, 1, 2, { places: [again] }));
    const after = ok(await db.from("leads").select("about, linkedin_url, claimed, stage").eq("id", lead.id).single());
    assert.deepEqual(
      after,
      { about: shown.about, linkedin_url: "https://www.linkedin.example/p", claimed: true, stage: "nurture" },
      "filled where empty, kept where not, and the worked stage untouched",
    );
    // Blanked with the rest.
    ok(await db.rpc("lead_blank", { p_lead_id: lead.id }));
    const blanked = ok(
      await db
        .from("leads")
        .select("about, hours, image_url, reviews_dist, facebook_url, linkedin_url, claimed, maps_url, rank, email")
        .eq("id", lead.id)
        .single(),
    );
    assert.deepEqual(blanked, {
      about: null,
      hours: [],
      image_url: null,
      reviews_dist: null,
      facebook_url: null,
      linkedin_url: null,
      claimed: null,
      maps_url: null,
      rank: null,
      email: null,
    });
  },
);

// D3 (00145): the two commits after a round ended. A check run started by Check again commits its page on the
// ended round (it decides nothing, and nothing of the round is outstanding), and a mailbox that now answers makes
// the member Qualified and counted through the month's allowance the way Keep is, not through the reservation the
// round already gave back. A discover run's page is refused as before.
test(
  "after a round ended, a check run still commits its page and usage, and a member whose address now checks out counts through the month, not the round",
  { skip },
  async () => {
    const month = leadMonth(TZ, new Date());
    const search = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          created_by: owner.userId,
          via: "people",
          card: "local_businesses",
          name: "florists",
          asked: "florists in Austin",
          plan: plan(5),
        })
        .select("id")
        .single(),
    ).id;
    const round = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: search,
          seq: 1,
          purpose: "probe",
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          allowance_reserved: 5,
          allowance_used: 2,
          cost_reserved_usd: 1,
          cost_usd: 0.4,
          month,
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    // A round starts queued (a trigger refuses an ended insert) and ends through its door, giving its unused reservation back.
    assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: round, p_ending: "target_reached" })), true);
    const lead = ok(
      await db
        .from("leads")
        .insert({
          tenant_id: A,
          place_id: "ChIJfixtureD3E1",
          business_name: "Again 1",
          category: "Florist",
          city: "Austin",
          region: "TX",
          website_host: "againe1.example",
          email: "hello@againe1.example",
          email_state: "checking",
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
        judgment: { reasons: ["email:checking"], shares: [] },
        class: "review",
        fit: "look",
        reason: "A fixture.",
        counted: false,
      }),
    );
    const read = async (kind) => {
      const r = await db
        .from("lead_counters")
        .select("used, reserved")
        .eq("tenant_id", A)
        .eq("kind", kind)
        .eq("period", month)
        .maybeSingle();
      return { used: Number(r.data?.used ?? 0), reserved: Number(r.data?.reserved ?? 0) };
    };
    const budget0 = await read("budget");
    const allowance0 = await read("allowance");
    // A check run under the ended round, claimed, started and leased as the runner does it.
    const run = ok(
      await db
        .from("lead_runs")
        .insert({
          tenant_id: A,
          round_id: round,
          purpose: "check",
          term: "again:n1:0",
          actor: "bounceverify/bounceverify-email-verifier",
          build: "1",
          webhook_token_hash: `hash-again-${Date.now()}`,
        })
        .select("id")
        .single(),
    );
    assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "again-1" })), true);
    assert.equal(
      ok(
        await db.rpc("lead_run_record_start", {
          p_run_id: run.id,
          p_owner: "again-1",
          p_apify_run_id: `apr-${run.id}`,
          p_dataset_id: `ds-${run.id}`,
          p_cap_usd: 0.5,
        }),
      ),
      true,
    );
    const gen = ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "again-1", p_seconds: 60 }));
    const page = ok(
      await commit(run.id, "again-1", gen, 0, 1, {
        judgment: null,
        places: [],
        usage_usd: 0.01,
        items_seen: 1,
        run_state: "succeeded",
        next: null,
        round: null,
      }),
    );
    assert.equal(page.ok, true, `a check run's page commits after the round ended: ${JSON.stringify(page)}`);
    const runRow = ok(await db.from("lead_runs").select("state, usage_usd").eq("id", run.id).single());
    assert.deepEqual([runRow.state, Number(runRow.usage_usd)], ["succeeded", 0.01]);
    const budget1 = await read("budget");
    assert.deepEqual(
      [Math.round((budget1.used - budget0.used) * 10_000) / 10_000, budget1.reserved],
      [0.01, budget0.reserved],
      "the usage settles against nothing outstanding: reserved does not move",
    );
    const a = ok(
      await db.rpc("lead_check_commit", {
        p_round_id: round,
        p_run_id: run.id,
        p_results: [{ lead_id: lead, email_state: "ok", checked_at: new Date().toISOString() }],
        p_usage_usd: 0.01,
        p_last: false,
      }),
    );
    assert.deepEqual([a.ok, a.qualified, a.counted, a.ended], [true, 1, 1, false]);
    const m = ok(
      await db
        .from("lead_search_members")
        .select("class, counted, counted_month, judgment")
        .eq("search_id", search)
        .eq("lead_id", lead)
        .single(),
    );
    assert.deepEqual([m.class, m.counted, m.counted_month, m.judgment.reasons], ["qualified", true, month, []]);
    const r = ok(await db.from("lead_rounds").select("state, allowance_used, cost_usd").eq("id", round).single());
    assert.deepEqual(
      [r.state, r.allowance_used, Number(r.cost_usd)],
      ["ended", 2, 0.4],
      "the round is final: neither reopened, nor charged a lead it did not reserve, nor the cents the month's counter carries",
    );
    const allowance1 = await read("allowance");
    assert.deepEqual(
      [allowance1.used - allowance0.used, allowance1.reserved],
      [1, allowance0.reserved],
      "counted through the month, as Keep is",
    );
    assert.equal(ok(await db.from("leads").select("email_state").eq("id", lead).single()).email_state, "ok");
    const disc = await runOf(round, "florist", "w-d3");
    assert.deepEqual(
      ok(
        await commit(disc.id, "w-d3", disc.gen, 0, 1, {
          judgment: null,
          places: [],
          usage_usd: 0,
          items_seen: 0,
          run_state: null,
          next: null,
          round: null,
        }),
      ),
      { ok: false, why: "ended" },
      "a discover run's page is still refused after the round ended",
    );
  },
);

// D3 (00145): a round that ran dry writes where to look next with its ending, and the view carries it to the page.
test(
  "a round's nearby areas ride the commit with the ending and come back from lead_searches_view",
  { skip },
  async () => {
    const search = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          created_by: owner.userId,
          via: "people",
          card: "local_businesses",
          name: "florists",
          asked: "florists in Austin",
          plan: plan(5),
        })
        .select("id")
        .single(),
    ).id;
    const round = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: search,
          seq: 1,
          purpose: "probe",
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "florist", "w-n1");
    const far = [
      {
        kind: "zip",
        label: "near 78660",
        state: "TX",
        center: { lat: 30.44, lng: -97.62 },
        radius_m: 8000,
        zip: "78660",
        query: "78660, TX, USA",
      },
    ];
    assert.deepEqual(
      ok(await db.from("lead_searches_view").select("nearby").eq("id", search).single()),
      { nearby: [] },
      "nothing before the round wrote it",
    );
    // A round starts queued and the first page moves it to probing; the ending and its nearby ride a later page, as the runner writes them.
    let r = ok(
      await commit(run.id, "w-n1", run.gen, 0, 1, {
        judgment: null,
        places: [],
        usage_usd: 0,
        items_seen: 0,
        run_state: null,
        next: null,
        round: { state: "probing", question: null, ending: null },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    r = ok(
      await commit(run.id, "w-n1", run.gen, 1, 2, {
        judgment: null,
        places: [],
        usage_usd: 0,
        items_seen: 0,
        run_state: null,
        next: null,
        round: { state: null, question: null, ending: null, ending_pending: "searched_everything", nearby: far },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(ok(await db.from("lead_rounds").select("nearby, ending_pending").eq("id", round).single()), {
      nearby: far,
      ending_pending: "searched_everything",
    });
    assert.deepEqual(
      ok(await db.from("lead_searches_view").select("nearby").eq("id", search).single()),
      { nearby: far },
      "the view carries it to the page",
    );
  },
);

// D5 (00146): the neighbourhood rides the same commit as the listing's other facts, comes back from leads_page beside
// the coordinates it already returned, fills a known place only where it was empty, and goes with the rest when the
// lead is blanked; and lead_searches_view splits a search's qualified members by fit band for the band bar.
test(
  "the row reads the neighbourhood and the band reads the fit split: written by the commit, returned by the page and the view, filled where empty, blanked with the rest",
  { skip },
  async () => {
    const search = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          created_by: owner.userId,
          via: "people",
          card: "local_businesses",
          name: "bookstores",
          asked: "bookstores in Austin",
          plan: plan(5),
        })
        .select("id")
        .single(),
    ).id;
    const round = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: search,
          seq: 1,
          purpose: "probe",
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          allowance_reserved: 5,
          cost_reserved_usd: 1,
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "bookstore", "w-n5");
    const withFit = (n, cls, fit, neighborhood) => {
      const p = place(n, cls);
      p.member.fit = fit;
      p.place = { ...p.place, neighborhood };
      return p;
    };
    const places = [
      withFit(921, "qualified", "strong", "Hawthorne"),
      withFit(922, "qualified", "strong", null),
      withFit(923, "qualified", "look", "Buckman"),
      withFit(924, "qualified", "long", null),
      withFit(925, "review", "look", "Sellwood"),
    ];
    let r = ok(
      await commit(run.id, "w-n5", run.gen, 0, 1, {
        judgment: null,
        places,
        usage_usd: 0,
        items_seen: 5,
        run_state: null,
        next: null,
        round: { state: "probing", question: null, ending: null },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const rows = ok(
      await owner.client.rpc("leads_page", {
        p_tenant_id: A,
        p_search_id: search,
        p_class: "qualified",
        p_sort: "found",
        p_after_key: null,
        p_limit: 50,
      }),
    );
    const row = rows.find((x) => x.place_id === "ChIJfixture0921");
    assert.deepEqual(
      [row.neighborhood, typeof row.lat, typeof row.lng],
      ["Hawthorne", "number", "number"],
      "the page returns the neighbourhood beside the coordinates",
    );
    assert.equal(
      rows.find((x) => x.place_id === "ChIJfixture0922").neighborhood,
      null,
      "null when the source did not say",
    );
    const band = ok(
      await db.from("lead_searches_view").select("strong, look, long, qualified, review").eq("id", search).single(),
    );
    assert.deepEqual(
      band,
      { strong: 2, look: 1, long: 1, qualified: 4, review: 1 },
      "the qualified members by fit band; a review member counts in none",
    );
    // The same place found again: what it already says stays; what was empty is filled.
    const again = [withFit(921, "qualified", "strong", "Elsewhere"), withFit(922, "qualified", "strong", "Irvington")];
    r = ok(
      await commit(run.id, "w-n5", run.gen, 1, 2, {
        judgment: null,
        places: again,
        usage_usd: 0,
        items_seen: 2,
        run_state: null,
        next: null,
        round: null,
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const lead1 = await leadByPlace("ChIJfixture0921");
    const lead2 = await leadByPlace("ChIJfixture0922");
    assert.deepEqual(
      [lead1.neighborhood, lead2.neighborhood],
      ["Hawthorne", "Irvington"],
      "kept where it was said, filled where it was empty",
    );
    ok(await db.rpc("lead_blank", { p_lead_id: lead1.id }));
    assert.equal(
      ok(await db.from("leads").select("neighborhood").eq("id", lead1.id).single()).neighborhood,
      null,
      "blanked with the rest",
    );
  },
);

// D6 (00147): the business's own mark rides the same commit as every other fact about it, fills a known place only
// where it was empty, and goes with the rest when the lead is blanked. Since 00161 the page returns the copy we keep
// (the next case) and not this address, which the dashboard could never draw; the address is read from the row.
test(
  "the lead wears its own mark: written by the commit, filled where empty, blanked with the rest",
  { skip },
  async () => {
    const search = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          created_by: owner.userId,
          via: "people",
          card: "local_businesses",
          name: "barbers",
          asked: "barbers in Austin",
          plan: plan(5),
        })
        .select("id")
        .single(),
    ).id;
    const round = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: search,
          seq: 1,
          purpose: "probe",
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          allowance_reserved: 5,
          cost_reserved_usd: 1,
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "barber", "w-m6");
    const marked = (n, logo) => {
      const x = place(n, "qualified");
      x.place = { ...x.place, logo_url: logo };
      return x;
    };
    let r = ok(
      await commit(run.id, "w-m6", run.gen, 0, 1, {
        judgment: null,
        places: [marked(931, "https://cdn.example/mark.png"), marked(932, null)],
        usage_usd: 0,
        items_seen: 2,
        run_state: null,
        next: null,
        round: { state: "probing", question: null, ending: null },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(
      (await leadByPlace("ChIJfixture0931")).logo_url,
      "https://cdn.example/mark.png",
      "the row holds what the commit wrote",
    );
    assert.equal((await leadByPlace("ChIJfixture0932")).logo_url, null, "a site that declared none keeps none");
    // The same place found again: a mark it already wears stays, and one it was missing is filled.
    r = ok(
      await commit(run.id, "w-m6", run.gen, 1, 2, {
        judgment: null,
        places: [marked(931, "https://cdn.example/other.png"), marked(932, "https://place932.example/icon.svg")],
        usage_usd: 0,
        items_seen: 2,
        run_state: null,
        next: null,
        round: null,
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const one = await leadByPlace("ChIJfixture0931");
    const two = await leadByPlace("ChIJfixture0932");
    assert.deepEqual(
      [one.logo_url, two.logo_url],
      ["https://cdn.example/mark.png", "https://place932.example/icon.svg"],
      "kept where it was worn, filled where it was empty",
    );
    ok(await db.rpc("lead_blank", { p_lead_id: one.id }));
    assert.equal(
      ok(await db.from("leads").select("logo_url").eq("id", one.id).single()).logo_url,
      null,
      "blanked with the rest",
    );
  },
);

// 00161: the copy of the mark we keep. The commit writes its name only when it is a name we write, the page returns
// it in place of the site's address, a known place keeps the copy it wears, the column refuses anything else, and
// blanking lets go of it. The bucket is public to read, and holds only the kinds of image we keep.
test(
  "the lead's mark is ours: the name of a kept copy is written, returned, kept, refused when it is not ours, and blanked",
  { skip },
  async () => {
    const search = ok(
      await db
        .from("lead_searches")
        .insert({
          tenant_id: A,
          created_by: owner.userId,
          via: "people",
          card: "local_businesses",
          name: "florists",
          asked: "florists in Austin",
          plan: plan(5),
        })
        .select("id")
        .single(),
    ).id;
    const round = ok(
      await db
        .from("lead_rounds")
        .insert({
          tenant_id: A,
          search_id: search,
          seq: 1,
          purpose: "probe",
          plan: plan(5),
          plan_version: 1,
          target: 5,
          state: "queued",
          allowance_reserved: 5,
          cost_reserved_usd: 1,
          month: leadMonth(TZ, new Date()),
          day: "2026-09-20",
          platform_day: "2026-09-20",
        })
        .select("id")
        .single(),
    ).id;
    const run = await runOf(round, "florist", "w-m7");
    const KEPT = `${"a1".repeat(32)}.png`;
    const OTHER = `${"b2".repeat(32)}.webp`;
    const kept = (n, name) => {
      const x = place(n, "qualified");
      x.place = { ...x.place, logo_url: `https://fixture${n}.example/touch.png`, mark_path: name };
      return x;
    };
    let r = ok(
      await commit(run.id, "w-m7", run.gen, 0, 1, {
        judgment: null,
        // A kept copy; none yet; and a name that is not one of ours, which the door drops rather than refusing the page.
        places: [kept(941, KEPT), kept(942, null), kept(943, "https://fixture943.example/touch.png")],
        usage_usd: 0,
        items_seen: 3,
        run_state: null,
        next: null,
        round: { state: "probing", question: null, ending: null },
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const rows = ok(
      await owner.client.rpc("leads_page", {
        p_tenant_id: A,
        p_search_id: search,
        p_class: "qualified",
        p_sort: "found",
        p_after_key: null,
        p_limit: 50,
      }),
    );
    const onPage = (n) => rows.find((x) => x.place_id === `ChIJfixture0${n}`);
    assert.deepEqual(
      [onPage(941).mark_path, onPage(942).mark_path, onPage(943).mark_path],
      [KEPT, null, null],
      "the page returns the name the commit wrote, and nothing for a name that was not ours",
    );
    assert.equal("logo_url" in onPage(941), false, "and not the site's own address, which could never draw");

    // Found again: a copy it wears stays, and one it was missing is filled.
    r = ok(
      await commit(run.id, "w-m7", run.gen, 1, 2, {
        judgment: null,
        places: [kept(941, OTHER), kept(942, OTHER)],
        usage_usd: 0,
        items_seen: 2,
        run_state: null,
        next: null,
        round: null,
      }),
    );
    assert.equal(r.ok, true, JSON.stringify(r));
    const one = await leadByPlace("ChIJfixture0941");
    const two = await leadByPlace("ChIJfixture0942");
    assert.deepEqual(
      [one.mark_path, two.mark_path],
      [KEPT, OTHER],
      "kept where it was worn, filled where it was empty",
    );

    // The column itself holds only our names, whoever writes it.
    const bad = await db.from("leads").update({ mark_path: "../media/call.wav" }).eq("id", two.id);
    assert.ok(bad.error, "a name that is not ours is refused by the column");
    assert.match(bad.error.message, /leads_mark_path_shape/);

    ok(await db.rpc("lead_blank", { p_lead_id: one.id }));
    assert.equal(
      ok(await db.from("leads").select("mark_path").eq("id", one.id).single()).mark_path,
      null,
      "blanked with the rest",
    );

    const bucket = ok(await db.storage.getBucket("lead-marks"));
    assert.equal(bucket.public, true, "public to read: a logo is what a business shows the world");
    assert.equal(bucket.file_size_limit, 524288, "a logo's size, as core's check keeps");
    assert.deepEqual(
      [...bucket.allowed_mime_types].sort(),
      ["image/gif", "image/jpeg", "image/png", "image/webp", "image/x-icon"],
      "the five kinds core keeps, and never an SVG",
    );
  },
);
