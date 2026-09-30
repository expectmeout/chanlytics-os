/**
 * The lead finder's money lock, the whole way, as the writers write it (00140 and later): the owner's door reserves a
 * search's leads and its estimate (lead_search_create -> lead_reserve, on the owner's own session), the runner spends
 * them (core startRound, collect and check over the edge's real adapter, apps/edge/lib/leads/lead-db.ts: the commits
 * count the leads and settle the provider's usage, lead_collect_commit -> lead_settle_usage), and the round's end gives
 * back what it reserved and did not use (lead_round_end -> lead_release). The workspace's three counters (the month's
 * allowance and budget, the day) are read after every writer's move, never written here.
 *
 *   reserve, spend, settle    five leads found and counted, the provider's usage settled, the rest given back
 *   past the cap              a search past the month's 500 is refused in a sentence, and nothing is reserved
 *   a run that fails          the provider refuses every start: the round ends source_failed and gives it all back
 *
 * The provider (Apify) and the judge are the repo's fakes (_lead-fixtures.mjs), at the runner's ports; nothing else is.
 * Everything is kept in the workspace this file makes and deletes. Two shared rows are not a workspace's: the
 * platform's switch list (this workspace is listed, as every lead suite lists its own, and taken off after) and the
 * platform's day counter, which this file only reads through what the workspace's own rows say.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fakeApify, fakeJudge, checkerItem, probeItems } from "../../_lead-fixtures.mjs";
import { webhookToken } from "../../_lead-world.mjs";
import { takeLock } from "../../_file-lock.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no service-role credentials in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a user, a workspace and leads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the owner this suite signs in as needs it"
        : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const stamp = Date.now().toString(36);
const TZ = "America/Chicago";

let db;
let A;
let owner;
let runner;
let leadDb;
let scheduleJobOnce;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** Trainers in Austin by phone: a place with a number that dials counts when it is committed. */
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
  contact: "phone",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: false }],
  exclusions: [],
});

/**
 * The runner's world over THIS database: the edge's adapter, the provider and the judge faked, the next job written
 * as the edge writes it. The provider's run ids are unique across the table, so this file's start past anyone else's.
 */
let started = 900_000 + (Date.now() % 90_000);
const four = (n) => String(n).padStart(4, "0");
function world(base, { refuseStarts = false } = {}) {
  const apify = fakeApify();
  apify.state.started = started;
  const realStart = apify.startRun;
  apify.startRun = async (actor, input, opts) => {
    if (refuseStarts)
      throw Object.assign(new Error("the provider refused: actor-is-not-rented"), {
        name: "ApifyRefused",
        status: 403,
      });
    const out = await realStart(actor, input, opts);
    started = apify.state.started;
    apify.state.datasets[out.datasetId] = actor.includes("email-verifier")
      ? (input.emails ?? []).map((e) => checkerItem(e, "valid"))
      : probeItems()
          .slice(0, 13)
          .map((item, i) => ({
            ...item,
            placeId: `ChIJfixture${four(base + i)}`,
            phoneUnformatted: `+1512555${four(base + i)}`,
            phone: `(512) 555-${four(base + i)}`,
            phones: [`(512) 555-${four(base + i)}`],
          }));
    return out;
  };
  const ports = (worker) => ({
    db: leadDb(db),
    apify,
    judge: fakeJudge(),
    now: () => new Date(),
    webhookBase: "https://edge.example",
    webhookToken,
    fetchText: async () => null,
    schedule: async (kind, payload, secs) => {
      await scheduleJobOnce(db, { tenantId: A, kind, dueAt: new Date(Date.now() + secs * 1000), payload });
    },
    deadline: Date.now() + 45_000,
    owner: worker,
  });
  const finishRuns = () => {
    for (const r of Object.values(apify.state.runs)) if (r.status === "RUNNING") apify.finish(r.id, "SUCCEEDED", 0.05);
  };
  return { apify, ports, finishRuns };
}

/** The workspace on the platform's list, as each lead suite lists its own: read, added, and read back. */
async function listed(on = true) {
  for (let i = 0; i < 5; i += 1) {
    const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
    const has = (p.tenants_on ?? []).includes(A);
    if (has === on) return;
    const next = on ? [...(p.tenants_on ?? []), A] : (p.tenants_on ?? []).filter((t) => t !== A);
    ok(await db.from("lead_platform").update({ tenants_on: next }).eq("id", true));
  }
  assert.fail("the platform's list would not keep this workspace");
}

/** The workspace's three counters for a round's month and day: what is used, and what is held. */
async function counters(round) {
  const read = async (kind, period) => {
    const row = ok(
      await db
        .from("lead_counters")
        .select("used, reserved")
        .eq("tenant_id", A)
        .eq("kind", kind)
        .eq("period", period)
        .maybeSingle(),
    );
    return { used: Number(row?.used ?? 0), reserved: Number(row?.reserved ?? 0) };
  };
  return {
    allowance: await read("allowance", round.month),
    budget: await read("budget", round.month),
    day: await read("day", round.day),
  };
}
const roundOf = async (id) =>
  ok(
    await db
      .from("lead_rounds")
      .select(
        "state, ending, ending_pending, month, day, allowance_reserved, allowance_used, cost_reserved_usd, cost_usd",
      )
      .eq("id", id)
      .single(),
  );
const money = (n) => Math.round(Number(n) * 10_000) / 10_000;

/** The owner's door: a search made from their own session. */
const search = async (count, estimateUsd) => {
  await listed();
  return ok(
    await owner.client.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: plan(count),
      p_via: "people",
      p_estimate_usd: estimateUsd,
    }),
  );
};

// The platform's switch list is one array every lead suite reads, adds itself to and writes back: this file and
// leads/engine/the-money-lock... take a lock for the whole file (_file-lock.mjs), or one's write erases the other's and
// its workspace finds its searches paused.
let releaseList;
before(async () => {
  if (skip) return;
  releaseList = await takeLock("lead-platform-list");
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  runner = {
    ...(await import(at("packages/core/src/leads/runner/start.ts"))),
    ...(await import(at("packages/core/src/leads/runner/collect.ts"))),
    ...(await import(at("packages/core/src/leads/runner/check.ts"))),
  };
  ({ leadDb } = await import(at("apps/edge/lib/leads/lead-db.ts")));
  ({ scheduleJobOnce } = await import(at("packages/jobs/src/schedule.ts")));
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `money-lock-leads-${stamp}`, name: "Money Lock Studio", timezone: TZ })
      .select("id")
      .single(),
  ).id;
  const email = `money-lock-owner-${stamp}@example.com`;
  const password = `pw-${stamp}-Aa1!long`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  ok(await db.from("memberships").insert({ tenant_id: A, user_id: made.data.user.id, role: "owner" }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  owner = { client, userId: made.data.user.id };
});

after(async () => {
  if (skip) return;
  if (!A) return releaseList?.();
  await listed(false).catch(() => undefined);
  await db.from("jobs").delete().eq("tenant_id", A);
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  if (owner) await db.auth.admin.deleteUser(owner.userId).catch(() => {});
  await releaseList?.();
});

test(
  "reserved by the door, spent by the commits, settled against the reservation, and the rest given back at the end",
  { skip },
  async () => {
    const made = await search(5, 0.6);
    assert.ok(made.round_id, JSON.stringify(made));
    let round = await roundOf(made.round_id);
    assert.deepEqual(
      await counters(round),
      {
        allowance: { used: 0, reserved: 5 },
        budget: { used: 0, reserved: 0.6 },
        day: { used: 0, reserved: 0.6 },
      },
      "the door reserves the count and the estimate before anything runs",
    );

    // The start job: a run per term, claimed and started at the provider. Nothing is spent by starting.
    const w = world(150);
    await listed();
    const start = await runner.startRound(w.ports("start-1"), made.round_id, "start-1");
    assert.equal(start.kind, "started", JSON.stringify(start));
    assert.ok(start.runs.length > 0 && start.runs.every((r) => r.kind === "started"), JSON.stringify(start.runs));
    assert.deepEqual((await counters(round)).allowance, { used: 0, reserved: 5 });

    // The provider finishes; each run's collect commits its places and its usage.
    w.finishRuns();
    const runs = ok(await db.from("lead_runs").select("id").eq("round_id", made.round_id).eq("purpose", "discover"));
    for (const r of runs) {
      const out = await runner.collect(w.ports(`collect-${r.id}`), r.id, "p0", `collect-${r.id}`);
      assert.equal(out.kind, "committed", JSON.stringify(out));
    }
    round = await roundOf(made.round_id);
    assert.equal(round.allowance_used, 5, "five counted: the reservation, and not one more");
    let c = await counters(round);
    assert.deepEqual(c.allowance, { used: 5, reserved: 0 }, "what counted moved from held to used");
    assert.equal(money(c.budget.used), money(round.cost_usd), "the provider's usage is settled against the month");
    assert.equal(money(c.budget.used + c.budget.reserved), 0.6, "out of the reservation, not on top of it");
    assert.equal(money(c.day.used), money(round.cost_usd));
    assert.ok(round.cost_usd > 0);

    // The count was reached, so the round goes to its checks and ends there, as the check job ends it.
    assert.deepEqual([round.state, round.ending_pending], ["checking", "target_reached"]);
    for (let i = 0; i < 3 && (await roundOf(made.round_id)).state !== "ended"; i += 1) {
      const out = await runner.check(w.ports(`check-${i}`), made.round_id, 0, `check-${i}`);
      if (out.kind !== "started") continue;
      w.finishRuns();
      const checker = ok(await db.from("lead_runs").select("id").eq("round_id", made.round_id).eq("purpose", "check"));
      for (const r of checker) await runner.collect(w.ports(`checked-${r.id}`), r.id, "final", `checked-${r.id}`);
    }
    round = await roundOf(made.round_id);
    assert.deepEqual([round.state, round.ending], ["ended", "target_reached"]);
    c = await counters(round);
    assert.deepEqual(c.allowance, { used: 5, reserved: 0 });
    assert.deepEqual(
      [money(c.budget.used), money(c.budget.reserved), money(c.day.used), money(c.day.reserved)],
      [money(round.cost_usd), 0, money(round.cost_usd), 0],
      "every cent spent is used, and what was reserved and not spent is given back",
    );
  },
);

test("a search past the month's 500 is refused in a sentence, and nothing is reserved", { skip }, async () => {
  const [last] = ok(
    await db.from("lead_rounds").select("id").eq("tenant_id", A).order("created_at", { ascending: false }).limit(1),
  );
  const round = await roundOf(last.id);
  const before_ = await counters(round);
  const left = 500 - before_.allowance.used - before_.allowance.reserved;
  const refused = await search(left + 1, 0.5);
  assert.deepEqual([refused.error, refused.left], ["month_leads_used", left], JSON.stringify(refused));
  assert.match(refused.sentence, new RegExp(`^You have ${left} leads left this month\\.`));
  assert.deepEqual(await counters(round), before_, "the refusal held nothing back");
});

test(
  "a round whose every start the provider refuses ends source_failed and gives back all it reserved",
  { skip },
  async () => {
    const [last] = ok(
      await db.from("lead_rounds").select("id").eq("tenant_id", A).order("created_at", { ascending: false }).limit(1),
    );
    const before_ = await counters(await roundOf(last.id));
    const made = await search(20, 1);
    assert.ok(made.round_id, JSON.stringify(made));
    const round = await roundOf(made.round_id);
    const held = await counters(round);
    assert.deepEqual(
      [held.allowance.reserved, money(held.budget.reserved), money(held.day.reserved)],
      [before_.allowance.reserved + 20, money(before_.budget.reserved + 1), money(before_.day.reserved + 1)],
      "reserved",
    );

    const w = world(170, { refuseStarts: true });
    await listed();
    const start = await runner.startRound(w.ports("start-2"), made.round_id, "start-2");
    assert.equal(start.kind, "started", JSON.stringify(start));
    assert.ok(start.runs.length > 0 && start.runs.every((r) => r.kind === "refused"), JSON.stringify(start.runs));
    const ended = await roundOf(made.round_id);
    assert.deepEqual([ended.state, ended.ending, ended.allowance_used], ["ended", "source_failed", 0]);
    const runs = ok(await db.from("lead_runs").select("state").eq("round_id", made.round_id));
    assert.ok(
      runs.every((r) => r.state === "failed"),
      JSON.stringify(runs),
    );
    assert.deepEqual(await counters(round), before_, "every lead and every cent it held is given back");
  },
);
