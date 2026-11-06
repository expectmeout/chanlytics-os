/**
 * 00506 on Postgres, through the real doors (the in-memory world, _lead-world.mjs, copies them by hand; this holds the
 * copy to the database): a search never stalls, never says what is not true, and every spend is counted where it
 * happens.
 *
 *   the commit's next job    a probe that reaches its count is sent to its checks in the commit that says so: the
 *                            lead_check job is written with it, batch 0, under the key packages/jobs writes, so a
 *                            carry-on of the sweep's beside it finds it already on the ledger
 *   a round's end            the judge's dollars (the usage ledger's lead_judge rows under the round) are settled as
 *                            used, and no address of the round is left checking
 *   the sweep's ending       lead_round_end_stuck ends only a round that has not moved, has no job of its own and no
 *                            run at the provider, and then with the ending it had pending
 *   the room a check needs   lead_spend_room refuses a day already spent, and lead_check_estimate is contracts' price
 *                            an address with the estimate's room
 *
 * Local stack only: it makes a workspace, an owner and leads, and deletes them after.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { LEAD_CARDS, LEAD_DAY_CAP_USD, LEAD_ESTIMATE_MARGIN } from "@chanlytics/contracts";
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
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

/** Trainers in Austin by phone, five of them: the probe's own places reach the count. */
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

let started = 700_000 + (Date.now() % 90_000);
const four = (n) => String(n).padStart(4, "0");
/** The runner's world over THIS database: the edge's adapter, the provider and the judge faked. */
function world(base) {
  const apify = fakeApify();
  apify.state.started = started;
  const realStart = apify.startRun;
  apify.startRun = async (actor, input, opts) => {
    const out = await realStart(actor, input, opts);
    started = apify.state.started;
    apify.state.datasets[out.datasetId] = actor.includes("email-verifier")
      ? (input.emails ?? []).map((e) => checkerItem(e, "valid"))
      : probeItems()
          .slice(0, 13)
          .map((item, i) => ({
            ...item,
            placeId: `ChIJstall${four(base + i)}`,
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
    readSite: async () => null,
    schedule: async (kind, payload, secs) => {
      await scheduleJobOnce(db, { tenantId: A, kind, dueAt: new Date(Date.now() + secs * 1000), payload });
    },
    deadline: Date.now() + 45_000,
    owner: worker,
  });
  const finishRuns = () => {
    for (const r of Object.values(apify.state.runs)) if (r.status === "RUNNING") apify.finish(r.id, "SUCCEEDED", 0.05);
  };
  return { ports, finishRuns };
}

/** The workspace on the platform's list, as each lead suite lists its own. */
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
const roundOf = async (id) => ok(await db.from("lead_rounds").select("*").eq("id", id).single());
const money = (n) => Math.round(Number(n) * 10_000) / 10_000;

/** A search whose probe ran and was collected: five asked for, its places reach the count. */
async function probedToChecks(base) {
  const made = await search(5, 1);
  const w = world(base);
  const start = await runner.startRound(w.ports("start-1"), made.round_id, "start-1");
  assert.equal(start.kind, "started", JSON.stringify(start));
  w.finishRuns();
  const runs = ok(await db.from("lead_runs").select("id").eq("round_id", made.round_id).eq("purpose", "discover"));
  for (const r of runs) await runner.collect(w.ports(`collect-${r.id}`), r.id, "p0", `collect-${r.id}`);
  return made;
}

let releaseList;
before(async () => {
  if (skip) return;
  releaseList = await takeLock("lead-platform-list");
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  runner = {
    ...(await import(at("packages/core/src/leads/runner/start.ts"))),
    ...(await import(at("packages/core/src/leads/runner/collect.ts"))),
  };
  ({ leadDb } = await import(at("apps/edge/lib/leads/lead-db.ts")));
  ({ scheduleJobOnce } = await import(at("packages/jobs/src/runner/schedule.ts")));
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `never-stalls-${stamp}`, name: "Never Stalls Studio", timezone: TZ })
      .select("id")
      .single(),
  ).id;
  ok(await db.from("billing_accounts").upsert({ tenant_id: A, mode: "direct", status: "active" }));
  const email = `never-stalls-owner-${stamp}@example.com`;
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
  await db.from("ai_usage").delete().eq("tenant_id", A);
  await db.from("jobs").delete().eq("tenant_id", A);
  await db.from("events").delete().eq("tenant_id", A);
  await db.from("tenants").delete().eq("id", A);
  if (owner) await db.auth.admin.deleteUser(owner.userId).catch(() => {});
  await releaseList?.();
});

test(
  "the probe that reaches its count is sent to its checks in its own commit: the lead_check job is written with it, batch 0, once while one is live",
  { skip },
  async () => {
    const made = await probedToChecks(100);
    const round = await roundOf(made.round_id);
    assert.deepEqual([round.state, round.ending_pending], ["checking", "target_reached"]);
    const checks = ok(
      await db.from("jobs").select("payload, dedupe_key, state").eq("tenant_id", A).eq("kind", "lead_check"),
    ).filter((j) => j.payload.round_id === made.round_id);
    assert.equal(checks.length, 1, "the checks are written by the commit, nothing after it");
    assert.equal(checks[0].payload.batch, 0, "batch 0: 00237 defaulted a missing batch to 1, and skipped the first");
    assert.equal(checks[0].dedupe_key, `lead_check:${made.round_id}:round:0`);
    const again = await scheduleJobOnce(db, {
      tenantId: A,
      kind: "lead_check",
      dueAt: new Date(),
      payload: { round_id: made.round_id, batch: 0, carry_on: true },
    });
    assert.equal(again, "already_scheduled", "the sweep's carry-on beside the commit's job checks the batch once");
  },
);

test("a round's end settles what judging it cost and leaves none of its addresses checking", { skip }, async () => {
  const made = await probedToChecks(200);
  const round = await roundOf(made.round_id);
  // What its judge and the second model cost, as the usage ledger keeps them under the round.
  ok(
    await db.from("ai_usage").insert(
      [0.03, 0.01].map((usd) => ({
        tenant_id: A,
        purpose: "lead_judge",
        model_asked: "judge-fixture",
        model: "judge-fixture",
        outcome: "answered",
        usd,
        subject_id: made.round_id,
      })),
    ),
  );
  const budget = async () =>
    Number(
      ok(
        await db
          .from("lead_counters")
          .select("used")
          .eq("tenant_id", A)
          .eq("kind", "budget")
          .eq("period", round.month)
          .maybeSingle(),
      )?.used ?? 0,
    );
  const before = await budget();
  // Some of its leads still wait on their check, as an address of a round the sweep had to end does.
  const members = ok(await db.from("lead_search_members").select("lead_id").eq("round_id", made.round_id));
  ok(
    await db
      .from("leads")
      .update({ email: "hello@stall.example", email_state: "checking" })
      .in(
        "id",
        members.slice(0, 2).map((m) => m.lead_id),
      ),
  );
  assert.equal(ok(await db.rpc("lead_round_end", { p_round_id: made.round_id, p_ending: "target_reached" })), true);
  const ended = await roundOf(made.round_id);
  assert.equal(money(ended.judge_usd), 0.04, "the judge's dollars are the round's");
  assert.equal(money((await budget()) - before), 0.04, "and the month's budget counts them as used");
  const left = ok(
    await db
      .from("leads")
      .select("email_state")
      .in(
        "id",
        members.map((m) => m.lead_id),
      ),
  );
  assert.equal(left.filter((l) => l.email_state === "checking").length, 0, "no address is left Checking for good");
  assert.ok(
    left.some((l) => l.email_state === "unknown"),
    "it says it could not be checked, for Check again",
  );
});

test(
  "the sweep's ending: refused while the round has a job of its own or moved since it was read, and then with the ending it had pending",
  { skip },
  async () => {
    const made = await search(5, 1);
    const round = await roundOf(made.round_id);
    // The month's leads held for the round: what lead_round_end gives back (00140's lead_release, on the counter).
    const held = async () =>
      Number(
        ok(
          await db
            .from("lead_counters")
            .select("reserved")
            .eq("tenant_id", A)
            .eq("kind", "allowance")
            .eq("period", round.month)
            .maybeSingle(),
        )?.reserved ?? 0,
      );
    const before = await held();
    const end = (since) =>
      db.rpc("lead_round_end_stuck", { p_round_id: made.round_id, p_since: since, p_ending: "source_failed" });
    assert.equal(ok(await end(round.state_since)), false, "its start job is still on its way");
    ok(await db.from("jobs").delete().eq("tenant_id", A).eq("kind", "lead_round_start"));
    assert.equal(ok(await end(new Date(Date.parse(round.state_since) - 1000).toISOString())), false, "it moved since");
    assert.equal(ok(await end(round.state_since)), true);
    const ended = await roundOf(made.round_id);
    assert.deepEqual([ended.state, ended.ending], ["ended", "source_failed"], "no ending was pending: the source's");
    assert.equal(before - (await held()), 5, "the five leads it reserved go back to the month");
  },
);

test(
  "a check's room is today's and this month's, and its price is contracts' with the estimate's room",
  { skip },
  async () => {
    const each = LEAD_CARDS.find((c) => c.id === "local_businesses").checkPerEmailUsd;
    assert.equal(
      Number(ok(await db.rpc("lead_check_estimate", { p_addresses: 500 }))),
      Math.round(500 * each * LEAD_ESTIMATE_MARGIN * 10_000) / 10_000,
    );
    assert.equal(ok(await db.rpc("lead_spend_room", { p_tenant_id: A, p_usd: 0.01 })), null, "a quiet day has room");
    const day = ok(await db.rpc("lead_day", { p_tenant_id: A }));
    ok(
      await db
        .from("lead_counters")
        .upsert(
          { tenant_id: A, kind: "day", period: day, used: LEAD_DAY_CAP_USD, reserved: 0 },
          { onConflict: "tenant_id,kind,period" },
        ),
    );
    const refused = ok(await db.rpc("lead_spend_room", { p_tenant_id: A, p_usd: 0.01 }));
    assert.equal(refused.error, "day_cap");
    assert.match(refused.sentence, /^Today's searching is used up/);
  },
);
