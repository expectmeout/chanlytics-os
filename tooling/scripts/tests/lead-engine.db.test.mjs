/**
 * The lead finder's engine (00139), proved on a real Postgres with real
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

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip = !URL_ || !KEY
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
  version, card: "local_businesses", name: "personal trainers", asked: "personal trainers in Austin",
  terms: ["personal trainer", "strength coach"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});

/** One place of a page, as the collect commits it: the lead's columns and the member's judgment. */
const place = (n, cls, { phone = null, reasons = [], shares = [], duplicateOf = null } = {}) => ({
  place: {
    place_id: `ChIJfixture${String(n).padStart(4, "0")}`, business_name: `Fixture ${n}`, category: "Personal trainer",
    street: `${n} Fixture St`, city: "Austin", region: "TX", postal_code: "78704", country: "US", lat: 30.25, lng: -97.75,
    website_host: `fixture${n}.example`, phone_e164: phone ?? `+1512555${String(100 + n).padStart(4, "0")}`, phone_sources: 2,
    email: `hello@fixture${n}.example`, email_state: cls === "qualified" ? "ok" : "catch_all", rating: 4.5, reviews: 12,
  },
  member: { judgment: { reasons }, class: cls, excluded_by: cls === "excluded" ? "chain" : null, fit: cls === "excluded" ? null : "strong", reason: "A fixture.", distance_m: 1200 },
  duplicate_of_place_id: duplicateOf,
  shares,
});

/** A discover run of a round, claimed, started and leased by `worker`. */
async function runOf(roundId, term, worker) {
  const run = ok(await db.from("lead_runs").insert({ tenant_id: A, round_id: roundId, purpose: "discover", term, actor: "card-a", build: "1", webhook_token_hash: `hash-${term}-${Date.now()}` }).select("id").single());
  assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: worker })), true, "the claim");
  assert.equal(ok(await db.rpc("lead_run_record_start", { p_run_id: run.id, p_owner: worker, p_apify_run_id: `apr-${run.id}`, p_dataset_id: `ds-${run.id}`, p_cap_usd: 0.5 })), true, "the start");
  const gen = ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: worker, p_seconds: 60 }));
  return { id: run.id, gen };
}

const commit = (run, worker, gen, from, to, page) => db.rpc("lead_collect_commit", { p_run_id: run, p_owner: worker, p_gen: gen, p_from_offset: from, p_to_offset: to, p_page: page });
/** A counter row's two numbers. PostgREST sends numeric(10,4) as a JSON number, so they arrive as numbers. */
const counter = async (kind, period) => {
  const row = ok(await db.from("lead_counters").select("used, reserved").eq("tenant_id", A).eq("kind", kind).eq("period", period).single());
  return { used: Number(row.used), reserved: Number(row.reserved) };
};
const member = async (searchId, leadId) => ok(await db.from("lead_search_members").select("*").eq("search_id", searchId).eq("lead_id", leadId).single());
const leadByPlace = async (placeId) => ok(await db.from("leads").select("*").eq("tenant_id", A).eq("place_id", placeId).single());

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(await db.from("tenants").insert({ slug: `lead-engine-${Date.now()}`, name: "Lead engine", timezone: TZ }).select("id").single()).id;
  B = ok(await db.from("tenants").insert({ slug: `lead-engine-other-${Date.now()}`, name: "Other" }).select("id").single()).id;
  owner = await memberClient("owner", A);
  operator = await memberClient("operator", A);
  stranger = await memberClient("owner", B);
  // The switch stays off; this workspace is listed, as the nightly's is in release A (30).
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
  ok(await db.from("lead_platform").update({ tenants_on: [...(p.tenants_on ?? []), A] }).eq("id", true));
});

// The local stack is shared with every other worktree, so this suite leaves
// nothing behind. Everything carrying a tenant_id cascades from the
// workspace; events have no foreign key to it, and the platform's day
// counter has no workspace at all, so those two go by hand.
after(async () => {
  if (skip) return;
  const p = await db.from("lead_platform").select("tenants_on").eq("id", true).single();
  if (p.data) await db.from("lead_platform").update({ tenants_on: (p.data.tenants_on ?? []).filter((t) => t !== A) }).eq("id", true);
  for (const id of [A, B].filter(Boolean)) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  await db.from("lead_counters").delete().is("tenant_id", null);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

const ids = {}; // what the tests hand each other, in order

test("has_permission is ROLE_PERMS in SQL: every role and permission agree, and find is the owner's alone", { skip }, async () => {
  const who = { owner: owner.userId, operator: operator.userId };
  for (const [role, perms] of Object.entries(ROLE_PERMS)) {
    if (role === "viewer") continue; // no viewer is seeded here; tenancy.db.test.mjs signs one in
    for (const [perm, may] of Object.entries(perms)) {
      assert.equal(ok(await db.rpc("has_permission", { p_user: who[role], p_tenant_id: A, p_permission: perm })), may, `${role}.${perm}`);
    }
  }
  assert.equal(ok(await db.rpc("has_permission", { p_user: stranger.userId, p_tenant_id: A, p_permission: "find" })), false, "a member of another workspace has nothing here");
  // It takes an arbitrary user id, so a signed-in member could read anyone's
  // role with it: it is the service role's, and the doors call it as definer.
  const asOwner = await owner.client.rpc("has_permission", { p_user: owner.userId, p_tenant_id: A, p_permission: "find" });
  assert.equal(asOwner.data, null, "an owner's own session reads nothing from has_permission");
  assert.equal(asOwner.error?.code, "42501", `has_permission is service_role only: ${JSON.stringify(asOwner.error)}`);
  assert.equal(ok(await db.rpc("lead_month", { p_tenant_id: A, p_at: "2026-10-01T03:30:00Z" })), "2026-09", "still September in Chicago");
  assert.equal(ok(await db.rpc("lead_suppression_hash", { p_tenant_id: "11111111-1111-4111-8111-111111111111", p_value: "+15125550100" })).length, 64);
});

test("the suppression hash in SQL is contracts' keyed digest, byte for byte", { skip }, async () => {
  // lead_suppression_hash is the service role's; the digest is compared through a door that uses it: none reads it back, so compare the function itself.
  const t = "11111111-1111-4111-8111-111111111111";
  const fromSql = ok(await db.rpc("lead_suppression_hash", { p_tenant_id: t, p_value: "+15125550100" }));
  assert.equal(fromSql, await leadSuppressionHash(t, "+15125550100"));
});

test("create reserves the count and the estimate in one transaction, writes the probe round, its start job and the event; the switch and the card refuse first", { skip }, async () => {
  ok(await db.from("lead_platform").update({ tenants_on: [] }).eq("id", true));
  let r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(5), p_via: "people", p_estimate_usd: 0.05 }));
  assert.equal(r.error, "paused", JSON.stringify(r));
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
  ok(await db.from("lead_platform").update({ tenants_on: [...(p.tenants_on ?? []), A] }).eq("id", true));
  r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: { ...plan(5), card: "etsy_shops" }, p_via: "people", p_estimate_usd: 0.05 }));
  assert.equal(r.error, "no_card", "an unapproved card never runs for an owner");
  const demand = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.no_card"));
  assert.equal(demand.length, 1, "the ask is logged as demand");
  assert.equal(demand[0].data.card, "etsy_shops");

  r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(5), p_via: "people", p_estimate_usd: 0.05 }));
  assert.ok(r.search_id && r.round_id, JSON.stringify(r));
  ids.search1 = r.search_id; ids.round1 = r.round_id;
  const round = ok(await db.from("lead_rounds").select("*").eq("id", r.round_id).single());
  const month = leadMonth(TZ, new Date());
  assert.deepEqual([round.state, round.seq, round.purpose, round.target, round.allowance_reserved, Number(round.cost_reserved_usd), round.plan_version, round.month], ["queued", 1, "probe", 5, 5, 0.05, 1, month]);
  assert.deepEqual(await counter("allowance", month), { used: 0, reserved: 5 });
  assert.deepEqual(await counter("budget", month), { used: 0, reserved: 0.05 });
  assert.deepEqual(await counter("day", round.day), { used: 0, reserved: 0.05 });
  const job = ok(await db.from("jobs").select("state, tenant_id").eq("kind", "lead_round_start").eq("payload->>round_id", r.round_id));
  assert.deepEqual(job, [{ state: "scheduled", tenant_id: A }], "the start job is written with the round");
  const ev = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.round").eq("subject_id", r.round_id));
  assert.equal(ev[0].data.state, "queued");

  const denied = await operator.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(5), p_via: "people", p_estimate_usd: 0.05 });
  assert.match(denied.error?.message ?? "", /Only an owner can find businesses for you/, "an operator may not start a search");
  const other = await stranger.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(5), p_via: "people", p_estimate_usd: 0.05 });
  assert.match(other.error?.message ?? "", /Only an owner/, "nor an owner of another workspace");
});

test("the allowance refuses in a sentence: the month's 500 are reserved once, and the 501st is refused with what is left", { skip }, async () => {
  let r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(496), p_via: "ask", p_estimate_usd: 0.5 }));
  assert.equal(r.error, "month_leads_used");
  assert.equal(r.left, 495);
  assert.match(r.sentence, /^You have 495 leads left this month\. Find 495 now, or all 496 when your leads renew on [A-Z][a-z]{2} 1\?$/);
  r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(495), p_via: "ask", p_estimate_usd: 0.5 }));
  assert.ok(r.search_id, "the rest of the month is taken");
  ids.search2 = r.search_id; ids.round2 = r.round_id;
  r = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(1), p_via: "people", p_estimate_usd: 0.01 }));
  assert.equal(r.error, "month_leads_used");
  assert.equal(r.left, 0);
  assert.match(r.sentence, /^You have found this month's 500 leads\. Your leads renew on [A-Z][a-z]{2} 1\.$/);
});

test("the run is claimed once, leased by owner and generation, and a page commits by compare-and-set: five asked, twenty qualified, five counted, paid once", { skip }, async () => {
  const run = ok(await db.from("lead_runs").insert({ tenant_id: A, round_id: ids.round1, purpose: "discover", term: "personal trainer", actor: "card-a", build: "1", webhook_token_hash: "hash1" }).select("id").single());
  ids.run1 = run.id;
  assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "w1" })), true, "the first claim wins");
  assert.equal(ok(await db.rpc("lead_run_claim", { p_run_id: run.id, p_owner: "w2" })), false, "the second finds it taken");
  assert.equal(ok(await db.rpc("lead_run_record_start", { p_run_id: run.id, p_owner: "w2", p_apify_run_id: "apr1", p_dataset_id: "ds1", p_cap_usd: 0.5 })), false, "only the claimer records");
  assert.equal(ok(await db.rpc("lead_run_record_start", { p_run_id: run.id, p_owner: "w1", p_apify_run_id: "apr1", p_dataset_id: "ds1", p_cap_usd: 0.5 })), true);
  assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w1", p_seconds: 60 })), 0, "the first lease is generation 0");
  assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w2", p_seconds: 60 })), null, "held by another");

  const page = {
    judgment: { op_id: "ec31567347b5b6e5a548512052a70322c51e2c167b1b1675457ef91e00349f73", request_hash: "rh", answer: { places: [] }, model: "the-judge", tokens: 1200, batch: 1 },
    places: Array.from({ length: 20 }, (_, i) => place(i + 1, "qualified")),
    usage_usd: 0.02, items_seen: 20, run_state: null,
    next: { kind: "lead_collect", seq: "p20", run_after_seconds: 15 },
    round: { state: "probing" },
  };
  assert.deepEqual(ok(await commit(run.id, "w1", 1, 0, 20, page)), { ok: false, why: "lease" }, "a wrong generation");
  assert.deepEqual(ok(await commit(run.id, "w2", 0, 0, 20, page)), { ok: false, why: "lease" }, "a wrong owner");
  assert.deepEqual(ok(await commit(run.id, "w1", 0, 5, 20, page)), { ok: false, why: "offset" }, "a wrong offset");
  const r = ok(await commit(run.id, "w1", 0, 0, 20, page));
  assert.deepEqual(r, { ok: true, counted: 5, qualified: 20, review: 0, excluded: 0, round_state: "probing" });
  const round = ok(await db.from("lead_rounds").select("*").eq("id", ids.round1).single());
  assert.deepEqual([round.allowance_used, Number(round.cost_usd), round.judge_tokens, round.judge_model, round.state], [5, 0.02, 1200, "the-judge", "probing"]);
  const month = leadMonth(TZ, new Date());
  assert.deepEqual(await counter("allowance", month), { used: 5, reserved: 495 }, "five used; the other search's 495 still reserved");
  assert.deepEqual(await counter("budget", month), { used: 0.02, reserved: 0.53 });
  const { count: leads } = await db.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", A);
  assert.equal(leads, 20);
  const { count: counted } = await db.from("lead_search_members").select("id", { count: "exact", head: true }).eq("search_id", ids.search1).eq("counted", true);
  assert.equal(counted, 5, "five asked, twenty qualified, five counted");
  const { count: nextJobs } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_collect").eq("payload->>run_id", run.id).eq("payload->>seq", "p20");
  assert.equal(nextJobs, 1, "the next collect is written");

  assert.deepEqual(ok(await commit(run.id, "w1", 0, 0, 20, page)), { ok: false, why: "offset" }, "a replayed page is refused, so nothing doubles");
  const again = ok(await commit(run.id, "w1", 0, 20, 23, {
    judgment: [{ op_id: "ec31567347b5b6e5a548512052a70322c51e2c167b1b1675457ef91e00349f73", tokens: 1200, model: "the-judge", answer: {} }],
    places: [20, 21, 22].map((n) => place(n, "qualified")), usage_usd: 0.03, items_seen: 23,
    next: { kind: "lead_collect", seq: "p20", run_after_seconds: 15 },
  }));
  assert.deepEqual([again.qualified, again.counted], [2, 0], "two new places; the reservation is spent");
  assert.equal(ok(await db.from("lead_rounds").select("judge_tokens, cost_usd").eq("id", ids.round1).single()).judge_tokens, 1200, "the judgment was kept and paid once");
  const { count: stillOne } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_collect").eq("payload->>run_id", run.id).eq("payload->>seq", "p20");
  assert.equal(stillOne, 1, "the next collect is written once however often it is asked for");
  assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w2", p_gen: 0 })), false);
  assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w1", p_gen: 1 })), false);
  assert.equal(ok(await db.rpc("lead_run_release", { p_run_id: run.id, p_owner: "w1", p_gen: 0 })), true, "released by the holder with the generation");
});

test("the shared-phone triple: three places with one number, one already in the workspace; the other two are delivered and marked, and no person is made", { skip }, async () => {
  const person = ok(await db.from("contacts").insert({ tenant_id: A, phone_e164: "+15125550177", display_name: "Corner Deli" }).select("id").single());
  const run = await runOf(ids.round2, "deli", "w1");
  let r = ok(await commit(run.id, "w1", run.gen, 0, 1, { places: [place(101, "qualified", { phone: "+15125550177" })], round: { state: "probing" } }));
  assert.equal(r.counted, 1);
  const held = (await leadByPlace("ChIJfixture0101")).id;
  const { count: before } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", A);
  const shares = [{ kind: "phone", lead_id: held }, { kind: "phone", contact_id: person.id }];
  r = ok(await commit(run.id, "w1", run.gen, 1, 3, { places: [place(102, "qualified", { phone: "+15125550177", shares }), place(103, "qualified", { phone: "+15125550177", shares })] }));
  assert.deepEqual([r.counted, r.qualified], [2, 2], "the other two are delivered");
  const { count: withNumber } = await db.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", A).eq("phone_e164", "+15125550177");
  assert.equal(withNumber, 3, "three places, three leads, one number: never merged");
  for (const pid of ["ChIJfixture0102", "ChIJfixture0103"]) {
    const m = await member(ids.search2, (await leadByPlace(pid)).id);
    assert.ok(m.judgment.shares.some((s) => s.contact_id === person.id), "marked as sharing the number with the person");
  }
  const { count: after_ } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", A);
  assert.equal(after_, before, "no person was made");
  ids.run2 = run.id; ids.gen2 = run.gen;
});

test("a duplicate listing folds into the lead already held; an erased or customer place is never inserted (erasure mid-run)", { skip }, async () => {
  const held = (await leadByPlace("ChIJfixture0101")).id;
  ok(await db.from("lead_suppressions").insert([
    { tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, "ChIJfixture0105"), what: "erased" },
    { tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, "ChIJfixture0106"), what: "customer" },
  ]));
  const r = ok(await commit(ids.run2, "w1", ids.gen2, 3, 6, { places: [place(104, "qualified", { duplicateOf: "ChIJfixture0101" }), place(105, "qualified"), place(106, "qualified")] }));
  assert.equal(r.qualified, 0, "the duplicate is the lead already held (a member once), the hidden two are skipped");
  assert.equal(ok(await db.from("lead_places").select("lead_id").eq("tenant_id", A).eq("place_id", "ChIJfixture0104").single()).lead_id, held);
  const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", A).in("place_id", ["ChIJfixture0104", "ChIJfixture0105", "ChIJfixture0106"]);
  assert.equal(count, 0);
});

test("ending a round releases what it reserved and did not use", { skip }, async () => {
  const month = leadMonth(TZ, new Date());
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: ids.round2, p_ending: "stopped" })), true);
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: ids.round2, p_ending: "stopped" })), false, "and only once");
  assert.deepEqual(await counter("allowance", month), { used: 8, reserved: 0 }, "eight counted so far; the 495 reservation is released");
  const ev = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "lead.round").eq("subject_id", ids.round2).order("created_at", { ascending: false }).limit(1));
  assert.deepEqual([ev[0].data.state, ev[0].data.ending], ["ended", "stopped"]);
});

test("keep, exclude and put back write their operation rows; undo refuses a changed version and credits the month it counted in; a hidden or out-of-area place is never put back", { skip }, async () => {
  const month = leadMonth(TZ, new Date());
  assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: ids.run1, p_owner: "w3", p_seconds: 60 })), 0);
  const r0 = ok(await commit(ids.run1, "w3", 0, 23, 28, { places: [
    place(201, "review", { reasons: ["email:catch_all"] }), place(202, "review", { reasons: ["unknown:chain"] }),
    place(203, "excluded"), place(204, "excluded", { reasons: ["fail:chain", "out_of_area"] }), place(205, "excluded"),
  ] }));
  assert.deepEqual([r0.review, r0.excluded], [2, 3]);
  const a = (await leadByPlace("ChIJfixture0201")).id;
  const b = (await leadByPlace("ChIJfixture0202")).id;
  const c = (await leadByPlace("ChIJfixture0203")).id;
  const d = (await leadByPlace("ChIJfixture0204")).id;

  const denied = await operator.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a });
  assert.match(denied.error?.message ?? "", /Search not found/, "an operator may not keep: the door does not even say the search exists");
  let r = ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a }));
  assert.ok(r.op_id && r.version === 2 && r.counted === true, JSON.stringify(r));
  let m = await member(ids.search1, a);
  assert.deepEqual([m.class, m.counted, m.counted_month, m.kept_by, m.version], ["qualified", true, month, owner.userId, 2]);
  assert.deepEqual(await counter("allowance", month), { used: 9, reserved: 0 }, "keep counts");
  const op = ok(await db.from("lead_operations").select("*").eq("id", r.op_id).single());
  assert.deepEqual([op.kind, op.before.class, op.after.class, op.version, op.by], ["keep", "review", "qualified", 2, owner.userId]);
  assert.equal(ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: a })).error, "state", "kept twice is refused");

  assert.equal(ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 1 })).error, "changed", "undo with the version the client did not see");
  r = ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 2 }));
  assert.deepEqual(r, { ok: true, version: 3 });
  m = await member(ids.search1, a);
  assert.deepEqual([m.class, m.counted, m.counted_month, m.version], ["review", false, null, 3], "back in review");
  assert.deepEqual(await counter("allowance", month), { used: 8, reserved: 0 }, "undo credits the month it counted in");
  assert.equal(ok(await owner.client.rpc("lead_undo", { p_op_id: op.id, p_version: 2 })).error, "undone", "undone once");

  r = ok(await owner.client.rpc("lead_member_exclude", { p_search_id: ids.search1, p_lead_id: b }));
  assert.equal(r.version, 2);
  m = await member(ids.search1, b);
  assert.deepEqual([m.class, m.excluded_by, m.counted], ["excluded", "owner", false], "excluded by the owner, free");
  r = ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: b }));
  assert.deepEqual([r.version, r.counted], [3, true], "put back counts");
  m = await member(ids.search1, b);
  assert.deepEqual([m.class, m.counted, m.excluded_by], ["qualified", true, null]);
  assert.equal(ok(await db.from("lead_operations").select("kind").eq("id", r.op_id).single()).kind, "put_back");

  ok(await db.from("lead_suppressions").insert({ tenant_id: A, kind: "place", hash: await leadSuppressionHash(A, "ChIJfixture0203"), what: "customer" }));
  assert.equal(ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: c })).error, "hidden", "a customer is hidden");
  assert.equal(ok(await owner.client.rpc("lead_member_put_back", { p_search_id: ids.search1, p_lead_id: d })).error, "out_of_area", "out of area stays out");
  assert.equal(ok(await owner.client.rpc("lead_member_exclude", { p_search_id: ids.search1, p_lead_id: c })).error, "state", "exclude wants a member in review");
  assert.equal(ok(await owner.client.rpc("lead_member_keep", { p_search_id: ids.search1, p_lead_id: "00000000-0000-4000-8000-000000000000" })).error, "not_found");
});

test("the check qualifies a member the email standard alone held back; the last batch ends the round with the pending ending; a late page on an ended round is refused", { skip }, async () => {
  const a = (await leadByPlace("ChIJfixture0201")).id;
  let r = ok(await commit(ids.run1, "w3", 0, 28, 29, {
    places: [place(206, "review", { reasons: ["email:unknown"] })], run_state: "succeeded",
    next: { kind: "lead_check", batch: 1, run_after_seconds: 0 },
    round: { state: "checking", ending_pending: "few_new_matches" },
  }));
  assert.equal(r.round_state, "checking");
  assert.equal(ok(await db.from("lead_runs").select("state").eq("id", ids.run1).single()).state, "succeeded");
  const { count: checks } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_check").eq("payload->>round_id", ids.round1);
  assert.equal(checks, 1, "the check job");
  const e = (await leadByPlace("ChIJfixture0206")).id;
  // A check settles against its own run: lead_check_commit takes the check
  // run's id, and p_usage_usd is that RUN'S TOTAL SO FAR, not this batch's
  // delta, so a check job tried again charges once.
  const month = leadMonth(TZ, new Date());
  const checkRun = ok(await db.from("lead_runs").insert({ tenant_id: A, round_id: ids.round1, purpose: "check", actor: "mailbox", build: "1", webhook_token_hash: `check-${Date.now()}` }).select("id").single());
  const budgetBefore = await counter("budget", month);
  const results = [{ lead_id: a, email_state: "ok", checked_at: new Date().toISOString() }, { lead_id: e, email_state: "invalid", checked_at: new Date().toISOString() }];
  r = ok(await db.rpc("lead_check_commit", { p_round_id: ids.round1, p_run_id: checkRun.id, p_results: results, p_usage_usd: 0.001, p_last: false }));
  // Five were asked for and five counted on the first page: the round's
  // reservation is spent, so the member qualifies and nothing counts.
  assert.deepEqual([r.qualified, r.counted, r.ended], [1, 0, false]);
  let m = await member(ids.search1, a);
  assert.deepEqual([m.class, m.counted, m.version], ["qualified", false, 4], "the email was its only reason; qualified now, and past the round's room it counts for nothing");
  m = await member(ids.search1, e);
  assert.equal(m.class, "review", "a bounce stays in review, marked invalid on the lead");
  assert.equal((await leadByPlace("ChIJfixture0206")).email_state, "invalid");

  const budgetAfter = await counter("budget", month);
  assert.equal((budgetAfter.used - budgetBefore.used).toFixed(4), "0.0010", "the batch is charged");
  r = ok(await db.rpc("lead_check_commit", { p_round_id: ids.round1, p_run_id: checkRun.id, p_results: results, p_usage_usd: 0.001, p_last: false }));
  assert.deepEqual([r.qualified, r.counted], [0, 0], "nothing qualifies twice");
  assert.deepEqual(await counter("budget", month), budgetAfter, "and the same total moves the budget once, however often the job is tried");
  assert.equal(Number(ok(await db.from("lead_rounds").select("cost_usd").eq("id", ids.round1).single()).cost_usd), 0.031, "0.02 and 0.01 of discovery, 0.001 of checking");

  // No run, no charge: a caller that names none settles nothing.
  assert.equal(ok(await db.rpc("lead_check_commit", { p_round_id: ids.round1, p_run_id: null, p_results: [], p_usage_usd: 0.9, p_last: false })).ok, true);
  assert.deepEqual(await counter("budget", month), budgetAfter, "a usage with no check run settles nothing");

  r = ok(await db.rpc("lead_check_commit", { p_round_id: ids.round1, p_run_id: checkRun.id, p_results: [], p_usage_usd: 0.001, p_last: true }));
  assert.equal(r.ended, true, "the last batch ends the round");
  const round = ok(await db.from("lead_rounds").select("state, ending, cost_usd").eq("id", ids.round1).single());
  assert.deepEqual([round.state, round.ending, Number(round.cost_usd)], ["ended", "few_new_matches", 0.031]);
  // What release A2 reads a round's spend from: the latest round's cost_usd,
  // on the view a member holds.
  const view = ok(await owner.client.from("lead_searches_view").select("round_id, cost_usd, state, ending").eq("id", ids.search1).single());
  assert.deepEqual([view.round_id, Number(view.cost_usd), view.state, view.ending], [ids.round1, 0.031, "ended", "few_new_matches"], "the view carries the latest round's cost_usd");
  assert.deepEqual(ok(await commit(ids.run1, "w3", 0, 29, 30, { places: [] })), { ok: false, why: "ended" });
  const late = await db.from("lead_rounds").update({ state: "running" }).eq("id", ids.round1);
  assert.match(late.error?.message ?? "", /final once ended/, "an ended round is final, to the service role too");
});

test("the same answer on a round that still has room counts, and the month's allowance moves with it", { skip }, async () => {
  const month = leadMonth(TZ, new Date());
  const made = ok(await owner.client.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(3), p_via: "people", p_estimate_usd: 0.01 }));
  assert.ok(made.search_id && made.round_id, JSON.stringify(made));
  ids.searchRoom = made.search_id; ids.roundRoom = made.round_id;
  const run = await runOf(made.round_id, "strength coach", "w5");
  ok(await commit(run.id, "w5", run.gen, 0, 1, { places: [place(301, "review", { reasons: ["email:unknown"] })], round: { state: "probing" } }));
  const held = (await leadByPlace("ChIJfixture0301")).id;
  const before = await counter("allowance", month);
  const checkRun = ok(await db.from("lead_runs").insert({ tenant_id: A, round_id: made.round_id, purpose: "check", actor: "mailbox", build: "1", webhook_token_hash: `check-room-${Date.now()}` }).select("id").single());
  const r = ok(await db.rpc("lead_check_commit", { p_round_id: made.round_id, p_run_id: checkRun.id, p_results: [{ lead_id: held, email_state: "ok", checked_at: new Date().toISOString() }], p_usage_usd: 0.002, p_last: false }));
  assert.deepEqual([r.qualified, r.counted, r.ended], [1, 1, false], "three asked for and none counted yet: the room is there");
  const m = await member(made.search_id, held);
  assert.deepEqual([m.class, m.counted, m.counted_month, m.version], ["qualified", true, month, 2]);
  assert.deepEqual(await counter("allowance", month),
    { used: before.used + 1, reserved: before.reserved - 1 },
    "the month's allowance moves: reserved becomes used");
  assert.equal(ok(await db.from("lead_rounds").select("allowance_used").eq("id", made.round_id).single()).allowance_used, 1);
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: made.round_id, p_ending: "searched_everything" })), true);
  assert.deepEqual(await counter("allowance", month),
    { used: before.used + 1, reserved: before.reserved - 3 },
    "and the two it never counted come back");
});

test("a top-up reserves the count minus what counted; the question waits on the owner and keep, include and stop answer it; Stop moves the generation so a late worker cannot publish", { skip }, async () => {
  let r = ok(await owner.client.rpc("lead_search_more", { p_search_id: ids.search1, p_purpose: "topup", p_plan: plan(5), p_estimate_usd: 0.05 }));
  assert.equal(r.error, "nothing_to_add", JSON.stringify(r));
  assert.equal(r.counted, 6, "five on the first page and one put back; the checked one never counted");
  r = ok(await owner.client.rpc("lead_search_more", { p_search_id: ids.search1, p_purpose: "topup", p_plan: plan(12, 2), p_estimate_usd: 0.05 }));
  assert.deepEqual([r.seq, r.target], [2, 6], "the count minus what counted");
  ids.round3 = r.round_id;
  assert.equal(ok(await db.from("lead_searches").select("plan").eq("id", ids.search1).single()).plan.version, 2, "the amended plan is the search's");
  assert.equal(ok(await owner.client.rpc("lead_search_more", { p_search_id: ids.search1, p_purpose: "renew", p_plan: plan(12, 2), p_estimate_usd: 0.05 })).error, "live", "one live round");

  const run = await runOf(ids.round3, "personal trainer", "w4");
  ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [], round: { state: "probing" } }));
  r = ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [], round: { state: "waiting_on_owner", question: { sentence: "Half of the first 25 are chain gyms. Is that what you meant?", criterionKey: "chain" } } }));
  assert.equal(r.round_state, "waiting_on_owner");
  const wrong = await owner.client.rpc("lead_round_answer", { p_round_id: ids.round3, p_answer: "include", p_plan: plan(12, 2) });
  assert.match(wrong.error?.message ?? "", /the amended plan is version 3/, "include carries the next version");
  r = ok(await owner.client.rpc("lead_round_answer", { p_round_id: ids.round3, p_answer: "include", p_plan: { ...plan(12, 3), exclusions: [] } }));
  assert.equal(r.state, "running");
  const round = ok(await db.from("lead_rounds").select("plan_version, answered, target, waiting_since, plan").eq("id", ids.round3).single());
  assert.deepEqual([round.plan_version, round.answered, round.target, round.waiting_since, round.plan.exclusions], [3, "include", 12, null, []]);
  const { count: resumes } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_round_start").eq("payload->>round_id", ids.round3).eq("payload->>resume", "true");
  assert.equal(resumes, 1, "the resume job");
  assert.equal(ok(await owner.client.rpc("lead_round_answer", { p_round_id: ids.round3, p_answer: "keep" })).error, "state", "not waiting any more");

  r = ok(await operator.client.rpc("lead_round_stop", { p_search_id: ids.search1 }));
  assert.deepEqual(r, { rounds: 1, runs: 1 }, "an operator may stop");
  const stopped = ok(await db.from("lead_runs").select("lease_gen").eq("id", run.id).single());
  assert.equal(stopped.lease_gen, 1, "the generation moved");
  assert.equal(ok(await db.from("lead_rounds").select("ending_pending, state").eq("id", ids.round3).single()).ending_pending, "stopped");
  const { count: stops } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("kind", "lead_collect").eq("payload->>run_id", run.id).eq("payload->>seq", "stop");
  assert.equal(stops, 1);
  assert.deepEqual(ok(await commit(run.id, "w4", run.gen, 0, 0, { places: [] })), { ok: false, why: "lease" }, "the old worker's generation is refused");
  assert.equal(ok(await db.rpc("lead_run_lease", { p_run_id: run.id, p_owner: "w4", p_seconds: 60 })), 1);
  r = ok(await commit(run.id, "w4", 1, 0, 0, { places: [], run_state: "aborted", round: { ending: "stopped" } }));
  assert.equal(r.round_state, "ended", "the abort ends the round stopped");
  assert.equal(ok(await db.from("lead_rounds").select("ending").eq("id", ids.round3).single()).ending, "stopped");
});

test("rename is the operator's; remove is the owner's and blanks what is not being worked; undo brings the search back without the leads exported since", { skip }, async () => {
  let r = ok(await operator.client.rpc("lead_search_rename", { p_search_id: ids.search1, p_name: "  Trainers,  Austin " }));
  assert.equal(r.name, "Trainers, Austin");
  const denied = await operator.client.rpc("lead_search_remove", { p_search_id: ids.search1 });
  assert.match(denied.error?.message ?? "", /Search not found/, "an operator may not remove");
  const worked = ok(await db.from("lead_search_members").select("lead_id").eq("search_id", ids.search1).eq("counted", true).limit(1)).at(0).lead_id;
  ok(await db.from("leads").update({ stage: "nurture" }).eq("id", worked));
  r = ok(await owner.client.rpc("lead_search_remove", { p_search_id: ids.search1 }));
  assert.ok(r.op_id && r.version === 1 && r.blanked >= 2, JSON.stringify(r));
  assert.ok(ok(await db.from("lead_searches").select("removed_at").eq("id", ids.search1).single()).removed_at);
  const { count: kept } = await db.from("lead_search_members").select("id", { count: "exact", head: true }).eq("search_id", ids.search1).is("blanked_at", null);
  assert.equal(kept, 1, "the worked lead's membership stays");
  assert.equal(ok(await owner.client.rpc("lead_search_remove", { p_search_id: ids.search1 })).error, "removed");
  // The three movers share one body, and it says the same word: a removed
  // search charges nobody, so Keep, Exclude and Put back are refused too.
  const anyLead = ok(await db.from("lead_search_members").select("lead_id").eq("search_id", ids.search1).limit(1)).at(0).lead_id;
  for (const door of ["lead_member_keep", "lead_member_exclude", "lead_member_put_back"]) {
    assert.equal(ok(await owner.client.rpc(door, { p_search_id: ids.search1, p_lead_id: anyLead })).error, "removed", door);
  }
  const exported = ok(await db.from("lead_search_members").select("lead_id").eq("search_id", ids.search1).not("blanked_at", "is", null).limit(1)).at(0).lead_id;
  ok(await db.from("leads").update({ exported_at: new Date().toISOString() }).eq("id", exported));
  const undone = ok(await owner.client.rpc("lead_undo", { p_op_id: r.op_id, p_version: 1 }));
  assert.deepEqual(undone, { ok: true, restored: r.blanked - 1, kept: 1 }, "the exported lead stays as it is and stays charged");
  assert.equal(ok(await db.from("lead_searches").select("removed_at").eq("id", ids.search1).single()).removed_at, null);
});

test("a write-in whose number a lead holds is that lead (linked, converted, came from a lead you found); the desk's Add a person never links; erasing the person blanks the lead and suppresses its place and number", { skip }, async () => {
  const lead = await leadByPlace("ChIJfixture0003");
  const desk = ok(await owner.client.rpc("create_person", { p_tenant_id: A, p_phone_e164: lead.phone_e164, p_display_name: "Typed at the desk", p_source: "manual" }));
  assert.equal((await leadByPlace("ChIJfixture0003")).contact_id, null, "the desk never links");
  ok(await db.from("contacts").delete().eq("id", desk.contact_id));
  const person = ok(await db.from("contacts").insert({ tenant_id: A, phone_e164: lead.phone_e164 }).select("id").single());
  const linked = await leadByPlace("ChIJfixture0003");
  assert.deepEqual([linked.contact_id, linked.stage], [person.id, "converted"], "a write-in whose number a lead holds is that lead");
  const came = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "contact.added").eq("subject_id", person.id));
  assert.deepEqual(came.map((e) => e.data.source), ["lead"], "they came from a lead you found");
  ok(await db.from("contacts").update({ erased_at: new Date().toISOString(), phone_e164: null }).eq("id", person.id));
  const gone = ok(await db.from("leads").select("blanked_at, erased_at, place_id, business_name").eq("id", lead.id).single());
  assert.ok(gone.blanked_at && gone.erased_at && gone.place_id === null && gone.business_name === "", "erasing the person blanks the lead");
  const hashes = ok(await db.from("lead_suppressions").select("kind, hash").eq("tenant_id", A).eq("what", "erased"));
  const phoneHash = await leadSuppressionHash(A, lead.phone_e164);
  const placeHash = await leadSuppressionHash(A, "ChIJfixture0003");
  assert.ok(hashes.some((h) => h.kind === "phone" && h.hash === phoneHash), "the number is on the never-again list");
  assert.ok(hashes.some((h) => h.kind === "place" && h.hash === placeHash), "and the place");
});

test("a member reads their workspace's searches with the latest round and the counts, and pages its leads; a member of another workspace reads nothing", { skip }, async () => {
  const mine = ok(await owner.client.from("lead_searches_view").select("*").eq("tenant_id", A));
  assert.equal(mine.length, 3, "every search of the workspace: the two above and the one the check counted in");
  const s2 = mine.find((s) => s.id === ids.search2);
  assert.deepEqual([s2.state, s2.ending, s2.qualified, s2.counted, s2.seq], ["ended", "stopped", 3, 3, 1], "the view carries the latest round and the counts");
  assert.deepEqual(ok(await owner.client.from("lead_searches_view").select("id").eq("tenant_id", B)), [], "nothing of another workspace");
  const first = ok(await owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: ids.search2, p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 2 }));
  assert.equal(first.length, 2, "a page of two");
  assert.ok(first.every((row) => typeof row.place_id === "string" && row.place_id.startsWith("ChIJfixture")), "each row carries its lead's place_id, which is how a labelled set names a place");
  const second = ok(await owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: ids.search2, p_class: "qualified", p_sort: "found", p_after_key: first[1].sort_key, p_limit: 2 }));
  assert.equal(second.length, 1, "the next page carries on");
  assert.ok(!first.some((r) => r.lead_id === second[0].lead_id), "without repeating");
  assert.equal(ok(await owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: ids.search2, p_class: "qualified", p_sort: "distance", p_after_key: null, p_limit: 50 })).length, 3);
  assert.deepEqual(ok(await stranger.client.from("lead_searches_view").select("id").eq("tenant_id", A)), [], "a stranger sees none of it");
  assert.deepEqual(ok(await stranger.client.rpc("leads_page", { p_tenant_id: A, p_search_id: null, p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 50 })), [], "nor a page");
  assert.deepEqual(ok(await owner.client.rpc("leads_page", { p_tenant_id: B, p_search_id: null, p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 50 })), [], "a wrong workspace reads nothing");
});

test("retention: an untouched lead is set aside at 90 days and blanked at 180; an excluded place is blanked at 30 but stays counted as left out", { skip }, async () => {
  const old = await leadByPlace("ChIJfixture0007");
  ok(await db.from("leads").update({ found_at: new Date(Date.now() - 91 * 86_400_000).toISOString() }).eq("id", old.id));
  const ex = await leadByPlace("ChIJfixture0205");
  ok(await db.from("lead_search_members").update({ created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq("lead_id", ex.id));
  const before = ok(await db.from("lead_searches_view").select("excluded").eq("id", ids.search1).single()).excluded;
  ok(await db.rpc("purge_leads"));
  let l = ok(await db.from("leads").select("stage, closed_reason, blanked_at").eq("id", old.id).single());
  assert.deepEqual([l.stage, l.closed_reason, l.blanked_at], ["archived", "stale", null], "set aside at 90 days, not yet blanked");
  const e = ok(await db.from("leads").select("blanked_at, place_id").eq("id", ex.id).single());
  assert.ok(e.blanked_at && e.place_id === null, "an excluded place loses its details at 30 days");
  const after_ = ok(await db.from("lead_searches_view").select("excluded").eq("id", ids.search1).single()).excluded;
  assert.equal(after_, before, "and stays counted as left out");
  ok(await db.from("leads").update({ found_at: new Date(Date.now() - 181 * 86_400_000).toISOString() }).eq("id", old.id));
  ok(await db.rpc("purge_leads"));
  l = ok(await db.from("leads").select("blanked_at, business_name").eq("id", old.id).single());
  assert.ok(l.blanked_at && l.business_name === "", "blanked at 180");
});

test("the clock asks the edge only when there is lead work: with no round left open it records a look and asks nothing", { skip }, async () => {
  // trigger_leads_sweep asks for ANY round that has not ended -- a round
  // whose start job died sits queued with no run at all, and only the sweep
  // can give its reservation back -- so the quiet path needs a database with
  // none. This suite's rounds and runs go here, where the cleanup would have
  // taken them anyway.
  for (const id of [A, B]) {
    ok(await db.from("lead_runs").delete().eq("tenant_id", id));
    ok(await db.from("lead_rounds").delete().eq("tenant_id", id));
  }
  assert.deepEqual(ok(await db.from("lead_rounds").select("id, state").neq("state", "ended")), [], "no round anywhere is still open");
  assert.deepEqual(ok(await db.from("lead_runs").select("id, state").in("state", ["claimed", "starting", "running", "unknown"])), [], "and no run is live");
  const before = ok(await db.from("sweep_status").select("requested_at").eq("sweep", "leads").single());
  assert.equal(ok(await db.rpc("trigger_leads_sweep")), null, "nothing to do, so the edge is not asked");
  const after_ = ok(await db.from("sweep_status").select("requested_at").eq("sweep", "leads").single());
  assert.ok(new Date(after_.requested_at) > new Date(before.requested_at), "but the look is recorded, so sweep_health can tell a quiet engine from a stopped clock");
});
