/**
 * The world the tests of engine/ share. Split by behaviour from lead-engine.db.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
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
import { before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { takeLock } from "../../../_file-lock.mjs";
import { siteReaderOver, webhookToken } from "../../../_lead-world.mjs";
import { fakeApify, fakeJudge, checkerItem, probeItems } from "../../../_lead-fixtures.mjs";
import { scheduleJobOnce } from "../../../../packages/jobs/src/runner/schedule.ts";
import { leadDb } from "../../../../apps/edge/lib/leads/db.ts";

/**
 * This process's own mark in the names it makes on the stack: the suite runs as three files since 25 Nov 2026 (layer 14),
 * side by side, and a name made from the clock alone could be made twice in one millisecond.
 */
const RUN = Math.random().toString(36).slice(2, 8);

export const URL_ = process.env.SUPABASE_URL;

export const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const ANON = process.env.SUPABASE_ANON_KEY;

export const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

export let db;

export let A;
// the workspace under test, in America/Chicago
export let B;
// another workspace
export let owner;
// an owner of A
export let operator;
// an operator of A
export let partner;
// the partner who brought A (0012)
export let stranger;
// an owner of B
export const users = [];

export const TZ = "America/Chicago";

export const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A real session for a fresh user with this role in this workspace. */
export async function memberClient(role, tenant) {
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
export const plan = (count, version = 1) => ({
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
export const place = (n, cls, { phone = null, reasons = [], shares = [], duplicateOf = null } = {}) => ({
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
export async function runOf(roundId, term, worker) {
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
        webhook_token_hash: `hash-${term}-${Date.now()}-${RUN}`,
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

export const commit = (run, worker, gen, from, to, page) =>
  db.rpc("lead_collect_commit", {
    p_run_id: run,
    p_owner: worker,
    p_gen: gen,
    p_from_offset: from,
    p_to_offset: to,
    p_page: page,
  });

/** A counter row's two numbers. PostgREST sends numeric(10,4) as a JSON number, so they arrive as numbers. */
export const counter = async (kind, period) => {
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

export const member = async (searchId, leadId) =>
  ok(await db.from("lead_search_members").select("*").eq("search_id", searchId).eq("lead_id", leadId).single());

export const leadByPlace = async (placeId) =>
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
export const pad4 = (n) => String(n).padStart(4, "0");

export const unseen = (item, n) => ({
  ...item,
  placeId: `ChIJfixture${pad4(n)}`,
  phoneUnformatted: `+1512555${pad4(n)}`,
  phone: `(512) 555-${pad4(n)}`,
  phones: [`(512) 555-${pad4(n)}`],
});

export const a2Items = (base) =>
  probeItems()
    .slice(0, 13)
    .map((item, i) => unseen(item, base + i));

/** lead_runs.apify_run_id is unique across the table, so every world of this file carries on from the last one's count. */
export let a2Started = 0;

/**
 * A2's runtime world over THIS database: the real adapter (apps/edge/lib/leads/lead-db.ts), the
 * provider and the judge faked (_lead-fixtures.mjs), scheduleJobOnce for the next job, and
 * the webhook token derived as the edge derives it, under the test secret _lead-world.mjs holds.
 */
export const pages = {};

export function a2World(base) {
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
    readSite: siteReaderOver(pages),
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

// The platform's switch list, lead_platform.tenants_on, is one array every lead suite reads, adds itself to and writes
// back: this file takes the lock for the whole of it, as lead-lists.db and the money-lock walk do (_file-lock.mjs), or
// one's write erases another's and its workspace finds its searches paused.
export let releaseList;

before(async () => {
  if (skip) return;
  releaseList = await takeLock("lead-platform-list");
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `lead-engine-${Date.now()}-${RUN}`, name: "Lead engine", timezone: TZ })
      .select("id")
      .single(),
  ).id;
  // A workspace that may spend (00364): the doors and the runner ask, and a new workspace's plan has not started.
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }));
  B = ok(
    await db
      .from("tenants")
      .insert({ slug: `lead-engine-other-${Date.now()}-${RUN}`, name: "Other" })
      .select("id")
      .single(),
  ).id;
  owner = await memberClient("owner", A);
  operator = await memberClient("operator", A);
  partner = await memberClient("partner", A);
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
  try {
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
  } finally {
    await releaseList?.();
  }
});

export const ids = {};
// what the tests hand each other, in order
export const platformDays = new Set();
