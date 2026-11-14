/**
 * A search widens until its count (decision 0133, 00627): where the platform widens for the workspace, a round that ends
 * short of the search's count, having run dry, opens the search's next leg itself (lead_round_end), on the first area it
 * named, for what the count still wants, through the same reservation as any round; it rings nothing, and the leg that
 * ends the search rings with every leg's count. It stops on reach_searched (no area left, or the last two legs adding
 * fewer than three leads) and on the day's cap (day_used). Off for a workspace the platform does not name. Local stack
 * only: it makes a workspace and a person.
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
      ? "refusing a database that is not on this machine: this suite makes a workspace"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

const stamp = Date.now().toString(36);
let db;
let A;
let owner;
const users = [];
const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

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
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});

/** A ZIP area as the ladder names one (core nearestAreas). */
const zip = (code, lat, lng) => ({
  kind: "zip",
  label: `near ${code}`,
  state: "TX",
  center: { lat, lng },
  radius_m: 8_000,
  zip: code,
  query: `${code}, TX, USA`,
});
const ROUND_ROCK = zip("78664", 30.5083, -97.6789);
const KYLE = zip("78640", 29.9888, -97.8772);
const MANOR = zip("78653", 30.3408, -97.5567);

/** The platform's switches, one array every lead suite reads: taken under the lock the others take (_file-lock.mjs). */
async function platform(patch) {
  const p = ok(await db.from("lead_platform").select("tenants_on, widen_tenants").eq("id", true).single(), "switches");
  const next = patch(p);
  ok(await db.from("lead_platform").update(next).eq("id", true), "switches written");
}
const widening = (on) =>
  platform((p) => ({ widen_tenants: [...(p.widen_tenants ?? []).filter((t) => t !== A), ...(on ? [A] : [])] }));

let releaseList;
before(async () => {
  if (skip) return;
  releaseList = await takeLock("lead-platform-list");
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `widen-${stamp}`, name: "Widen Co", timezone: "America/Chicago" })
      .select("id")
      .single(),
    "tenant",
  ).id;
  ok(await db.rpc("provision_tenant", { p_tenant_id: A }), "provision");
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }), "billing");
  const email = `owner-${stamp}@fixture-widen.example`;
  const password = `pw-${stamp}-Aa1!`;
  const made = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user");
  users.push(made.user.id);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.user.id, role: "owner" }), "membership");
  owner = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await owner.auth.signInWithPassword({ email, password }), "sign in");
  await platform((p) => ({ tenants_on: [...(p.tenants_on ?? []), A] }));
});

after(async () => {
  try {
    if (skip) return;
    await platform((p) => ({
      tenants_on: (p.tenants_on ?? []).filter((t) => t !== A),
      widen_tenants: (p.widen_tenants ?? []).filter((t) => t !== A),
    })).catch(() => undefined);
    if (A) {
      await db.from("events").delete().eq("tenant_id", A);
      await db.from("tenants").delete().eq("id", A);
    }
    for (const id of users) await db.auth.admin.deleteUser(id).catch(() => undefined);
  } finally {
    await releaseList?.();
  }
});

/** A search of `count`: its id and its first round's. */
const search = async (count) =>
  ok(
    await owner.rpc("lead_search_create", { p_tenant_id: A, p_plan: plan(count), p_via: "people", p_estimate_usd: 1 }),
    "search",
  );
const named = async (roundId, nearby) =>
  ok(await db.from("lead_rounds").update({ nearby }).eq("id", roundId), "nearby");
const ended = async (roundId, ending) =>
  ok(await db.rpc("lead_round_end", { p_round_id: roundId, p_ending: ending }), `end ${ending}`);
const round = async (id) => ok(await db.from("lead_rounds").select("*").eq("id", id).single(), "round");
const roundsOf = async (searchId) =>
  ok(await db.from("lead_rounds").select("*").eq("search_id", searchId).order("seq"), "rounds");
const rang = async (roundId) =>
  ok(
    await db
      .from("notifications")
      .select("title, body")
      .eq("tenant_id", A)
      .eq("kind", "leads_ready")
      .eq("subject_id", roundId),
    "rang",
  );

/** One lead Qualified and counted in a round: what the search found. */
async function found(searchId, roundId, n) {
  const lead = ok(
    await db
      .from("leads")
      .insert({
        tenant_id: A,
        place_id: `ChIJwiden${stamp}${n}`,
        business_name: `Widen ${n}`,
        category: "Personal trainer",
        city: "Austin",
        region: "TX",
        website_host: `widen${n}.example`,
        email: `hello@widen${n}.example`,
        email_state: "ok",
      })
      .select("id")
      .single(),
    "lead",
  ).id;
  ok(
    await db.from("lead_search_members").insert({
      search_id: searchId,
      lead_id: lead,
      round_id: roundId,
      tenant_id: A,
      judgment: { reasons: [], shares: [] },
      class: "qualified",
      fit: "strong",
      reason: "A fixture.",
      counted: true,
    }),
    "member",
  );
  ok(await db.from("lead_rounds").update({ allowance_used: 1 }).eq("id", roundId), "counted on its round");
}

test("off for the workspace, a round that runs dry ends as it did, opens nothing and rings", { skip }, async () => {
  await widening(false);
  const s = await search(10);
  await named(s.round_id, [ROUND_ROCK]);
  assert.equal(await ended(s.round_id, "few_new_matches"), true);
  const r = await round(s.round_id);
  assert.deepEqual([r.state, r.ending, r.carries_on], ["ended", "few_new_matches", false]);
  assert.equal((await roundsOf(s.search_id)).length, 1, "no leg");
  assert.equal((await rang(s.round_id)).length, 1, "its end rings as before");
});

test(
  "on, a round that runs dry short of its count opens the next leg on the area it named, for what is still wanted, and rings nothing",
  { skip },
  async () => {
    await widening(true);
    const s = await search(10);
    await found(s.search_id, s.round_id, 1);
    await named(s.round_id, [ROUND_ROCK, KYLE]);
    assert.equal(await ended(s.round_id, "few_new_matches"), true);
    const first = await round(s.round_id);
    assert.deepEqual([first.state, first.ending, first.carries_on], ["ended", "few_new_matches", true]);
    assert.equal((await rang(s.round_id)).length, 0, "a round that carries on rings nothing");
    const [, leg] = await roundsOf(s.search_id);
    assert.ok(leg, "the next leg is open");
    assert.deepEqual(
      [leg.seq, leg.purpose, leg.state, leg.target, leg.allowance_reserved, leg.plan.area.zip, leg.plan.terms.length],
      [2, "widen", "queued", 9, 9, "78664", 2],
      "the search's plan on the rung's first area, for the nine its count still wants",
    );
    assert.equal(
      Number(leg.cost_reserved_usd),
      Number(ok(await db.rpc("lead_estimate_ceiling", { p_kind: "search", p_count: 9, p_terms: 2 }), "ceiling")),
    );
    const jobs = ok(
      await db.from("jobs").select("kind, payload").eq("tenant_id", A).eq("kind", "lead_round_start"),
      "jobs",
    );
    assert.ok(
      jobs.some((j) => j.payload.round_id === leg.id),
      "started as any round",
    );

    // The leg runs dry with no area left: the search ends on reach_searched, and rings with every leg's leads.
    await found(s.search_id, leg.id, 2);
    await named(leg.id, []);
    assert.equal(await ended(leg.id, "searched_everything"), true);
    const last = await round(leg.id);
    assert.deepEqual([last.ending, last.carries_on], ["reach_searched", false]);
    assert.equal((await roundsOf(s.search_id)).length, 2, "no third leg");
    const [ring] = await rang(leg.id);
    assert.equal(ring?.body, "2 found.", "every leg's leads, not the last leg's alone");
  },
);

test("the last two legs adding fewer than three leads stop the search on reach_searched", { skip }, async () => {
  await widening(true);
  const s = await search(10);
  await named(s.round_id, [ROUND_ROCK]);
  await ended(s.round_id, "few_new_matches");
  const [, leg2] = await roundsOf(s.search_id);
  await named(leg2.id, [KYLE]);
  await ended(leg2.id, "few_new_matches");
  const [, , leg3] = await roundsOf(s.search_id);
  assert.equal(leg3?.purpose, "widen", "one leg that found nothing is no reason to stop");
  await named(leg3.id, [MANOR]);
  await ended(leg3.id, "few_new_matches");
  assert.equal((await round(leg3.id)).ending, "reach_searched", "two legs, nothing between them");
  assert.equal((await roundsOf(s.search_id)).length, 3, "no fourth leg");
});

test("a leg the day's searching cannot hold stops the search on day_used, and rings so", { skip }, async () => {
  await widening(true);
  const s = await search(10);
  await named(s.round_id, [ROUND_ROCK]);
  const day = ok(await db.rpc("lead_day", { p_tenant_id: A }), "day");
  const counter = ok(
    await db.from("lead_counters").select("id, used").eq("tenant_id", A).eq("kind", "day").eq("period", day).single(),
    "day counter",
  );
  ok(await db.from("lead_counters").update({ used: 24.9 }).eq("id", counter.id), "near the day's $25");
  try {
    await ended(s.round_id, "few_new_matches");
  } finally {
    ok(await db.from("lead_counters").update({ used: counter.used }).eq("id", counter.id), "put back");
  }
  const r = await round(s.round_id);
  assert.deepEqual([r.ending, r.carries_on], ["day_used", false]);
  assert.equal((await roundsOf(s.search_id)).length, 1, "no leg");
  const [ring] = await rang(s.round_id);
  assert.match(ring?.title ?? "", /stopped: today's searching is used up$/);
});

test("a round that failed, or that met its count, never opens a leg", { skip }, async () => {
  await widening(true);
  const failed = await search(10);
  await named(failed.round_id, [ROUND_ROCK]);
  await ended(failed.round_id, "source_failed");
  assert.equal((await round(failed.round_id)).ending, "source_failed", "a source that failed is never searched");
  assert.equal((await roundsOf(failed.search_id)).length, 1);
  const met = await search(1);
  await found(met.search_id, met.round_id, 3);
  await named(met.round_id, [ROUND_ROCK]);
  await ended(met.round_id, "few_new_matches");
  assert.deepEqual(
    [(await round(met.round_id)).carries_on, (await roundsOf(met.search_id)).length],
    [false, 1],
    "its count met, nothing more is wanted",
  );
});

test(
  "an area past the reach is never opened by a round's end; the owner's Find more with that reach carries on from it as a leg",
  { skip },
  async () => {
    await widening(true);
    const s = await search(10);
    const past = { ...ROUND_ROCK, beyond_m: 80_450 };
    await named(s.round_id, [past]);
    await ended(s.round_id, "few_new_matches");
    assert.equal((await round(s.round_id)).ending, "reach_searched", "an area past the reach is the owner's to ask");
    assert.equal((await roundsOf(s.search_id)).length, 1, "no leg opened by itself");
    const narrow = await owner.rpc("lead_search_more", {
      p_search_id: s.search_id,
      p_purpose: "topup",
      p_plan: { ...plan(10), version: 2, reach_m: 40_000 },
      p_estimate_usd: 1,
    });
    ok(narrow, "a top-up with a reach short of the area");
    const [, plain] = await roundsOf(s.search_id);
    assert.equal(plain.purpose, "topup", "a reach that does not take it in is an ordinary top-up");
    await named(plain.id, [past]);
    await ended(plain.id, "few_new_matches");
    assert.equal((await round(plain.id)).ending, "reach_searched");
    ok(
      await owner.rpc("lead_search_more", {
        p_search_id: s.search_id,
        p_purpose: "topup",
        p_plan: { ...plan(10), version: 3, reach_m: 80_450 },
        p_estimate_usd: 1,
      }),
      "Look up to 50 miles",
    );
    const [, , leg] = await roundsOf(s.search_id);
    assert.equal(leg.purpose, "widen", "it carries on as a leg");
    assert.equal(leg.plan.area.zip, "78664", "from the area past the reach");
    assert.equal("beyond_m" in leg.plan.area, false, "its plan's area is an area, unmarked");
    assert.equal(leg.plan.reach_m, 80_450);
  },
);
