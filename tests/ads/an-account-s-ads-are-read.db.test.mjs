/**
 * 00650 on a real Postgres: an account's ads are read on a clock (decision 0049, step P1).
 *
 * What one read learned is kept by one door in one transaction. What must hold: an ad is made on first sight and
 * written over after, never twice; what the owner asked of an adopted ad follows the platform unless a press of theirs
 * is still on its way; an event is written only where the platform's word for an ad moved; a day is written over until
 * it is settled and never after; a failed read keeps what stood; the next read is never before the platform allows.
 * The clock hands a read to each account that is due and not held back, one an account; a notice asks for one read,
 * soon; a day goes 760 days on; and every door is the service role's. Runs against the database `supabase start`
 * builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces, ads and jobs"
      : false;
const skipMember = skip || (!ANON ? "no SUPABASE_ANON_KEY in env: the visitor this case knocks as needs it" : false);

const stamp = Date.now();
const workspaces = [];
let db;
let seq = 0;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A workspace with one connected account, written straight to the table: the doors under test are the read's. */
async function connected(tag, over = {}) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-read-${tag}-${stamp}`, name: `Harbor Read ${tag}` })
      .select("id")
      .single(),
  ).id;
  workspaces.push(tenant);
  const account = ok(
    await db
      .from("ad_accounts")
      .insert({
        tenant_id: tenant,
        platform: "meta",
        external_id: `1300${stamp}${++seq}`,
        name: "Harbor ads",
        currency: "USD",
        timezone: "America/New_York",
        status: "connected",
        standing: { account: "active", funding: "ok" },
        config: { page_name: "Harbor Nails" },
        ...over,
      })
      .select("id, external_id")
      .single(),
  );
  return { tenant, account: account.id, external: account.external_id };
}

const adRead = (id, over = {}) => ({
  platform_ad_id: id,
  name: `Ad ${id}`,
  door: "whatsapp",
  platform_set_id: "set-1",
  platform_campaign_id: "campaign-1",
  budget_kind: "total",
  budget_minor: 7000,
  budget_left_minor: 1800,
  budget_at: "set",
  budget_shared: false,
  starts_at: "2026-11-01T04:00:00Z",
  ends_at: "2026-12-01T04:59:00Z",
  platform_state: "ACTIVE",
  platform_issue: null,
  intent: "on",
  said: { headline: "First appointment" },
  ...over,
});
const dayRead = (id, day, over = {}) => ({
  platform_ad_id: id,
  day,
  spend_minor: 1234,
  impressions: 100,
  clicks: 7,
  platform_results: 3,
  ...over,
});
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
const keep = async (ws, read) =>
  ok(
    await db.rpc("ads_read_keep", {
      p_tenant_id: ws.tenant,
      p_account_id: ws.account,
      p_read: { account: {}, next_read_at: inAnHour(), ...read },
    }),
  );
const adsOf = async (ws) =>
  ok(
    await db
      .from("ads")
      .select("id, platform_ad_id, origin, name, status, intent, platform_state, budget_left_minor, intent_at, told_at")
      .eq("tenant_id", ws.tenant)
      .order("platform_ad_id"),
  );
const daysOf = async (ws) =>
  ok(await db.from("ad_days").select("day, spend_minor, settled").eq("tenant_id", ws.tenant).order("day"));
const eventsOf = async (ws) =>
  ok(await db.from("events").select("subject_id, data").eq("tenant_id", ws.tenant).eq("kind", "ad.state_changed"));
const readJobsOf = async (ws) =>
  ok(await db.from("jobs").select("due_at, payload, state").eq("tenant_id", ws.tenant).eq("kind", "ad_read"));

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const tenant of workspaces) {
    await db.from("jobs").delete().eq("tenant_id", tenant);
    await db.from("tenants").delete().eq("id", tenant);
  }
});

test(
  "an ad is adopted on first sight and written over after: one row, and an event only where its word moved",
  { skip },
  async () => {
    const ws = await connected("adopt");
    const first = await keep(ws, { ads: [adRead("a1"), adRead("a2", { platform_state: "PAUSED", intent: "paused" })] });
    assert.deepEqual(first, { outcome: "kept", adopted: 2, moved: 0, days: 0 });
    let ads = await adsOf(ws);
    assert.deepEqual(
      ads.map((ad) => [ad.platform_ad_id, ad.origin, ad.status, ad.intent, ad.platform_state]),
      [
        ["a1", "platform", "made", "on", "ACTIVE"],
        ["a2", "platform", "made", "paused", "PAUSED"],
      ],
    );
    assert.deepEqual(await eventsOf(ws), [], "an ad seen for the first time moved from nowhere: no event");

    // Read again: the same two rows, what is left of the budget moved, and the one whose word moved says so.
    const again = await keep(ws, {
      ads: [
        adRead("a1", { budget_left_minor: 900 }),
        adRead("a2", { platform_state: "DISAPPROVED", intent: "paused" }),
      ],
    });
    assert.deepEqual([again.adopted, again.moved], [0, 1]);
    ads = await adsOf(ws);
    assert.deepEqual([ads.length, ads[0].budget_left_minor, ads[1].platform_state], [2, 900, "DISAPPROVED"]);
    const [told] = await eventsOf(ws);
    assert.deepEqual([told.subject_id, told.data.from, told.data.to], [ads[1].id, "PAUSED", "DISAPPROVED"]);
  },
);

test("what the owner asked follows the platform, unless a press of theirs is still on its way", { skip }, async () => {
  const ws = await connected("press");
  await keep(ws, { ads: [adRead("a1"), adRead("a2")] });
  const [one, two] = await adsOf(ws);
  const now = Date.now();
  // The owner paused the first here a moment ago and the platform has not been told; the second's pause was told.
  ok(
    await db
      .from("ads")
      .update({ intent: "paused", intent_at: new Date(now).toISOString() })
      .eq("id", one.id),
  );
  ok(
    await db
      .from("ads")
      .update({
        intent: "paused",
        intent_at: new Date(now - 60_000).toISOString(),
        told_at: new Date(now).toISOString(),
      })
      .eq("id", two.id),
  );
  // The platform still holds both as on: the first's press wins until it is told, the second was resumed at the platform.
  await keep(ws, { ads: [adRead("a1"), adRead("a2")] });
  const ads = await adsOf(ws);
  assert.deepEqual(
    ads.map((ad) => ad.intent),
    ["paused", "on"],
  );
});

test(
  "a day is written over until it is settled, and never after; a day of an ad nobody holds has no home",
  { skip },
  async () => {
    const ws = await connected("days");
    const first = await keep(ws, {
      ads: [adRead("a1")],
      days: [dayRead("a1", "2026-11-01"), dayRead("a1", "2026-11-18"), dayRead("nobody's", "2026-11-18")],
    });
    assert.equal(first.days, 2);
    // The look back has passed the 5th: the first day is settled, and a later read that names it changes nothing.
    await keep(ws, { ads: [adRead("a1")], settled_before: "2026-11-05" });
    const later = await keep(ws, {
      ads: [adRead("a1")],
      days: [dayRead("a1", "2026-11-01", { spend_minor: 1 }), dayRead("a1", "2026-11-18", { spend_minor: 2000 })],
    });
    assert.equal(later.days, 1, "one day written: the settled one is left");
    assert.deepEqual(await daysOf(ws), [
      { day: "2026-11-01", spend_minor: 1234, settled: true },
      { day: "2026-11-18", spend_minor: 2000, settled: false },
    ]);
  },
);

test(
  "a read that failed keeps what stood, and the next read is never before the platform allows",
  { skip },
  async () => {
    const ws = await connected("failed");
    await keep(ws, { ads: [adRead("a1")], days: [dayRead("a1", "2026-11-18")] });
    const later = new Date(Date.now() + 7_200_000).toISOString();
    const failed = await keep(ws, {
      account: { error: "slowed", read_after: later, usage_pct: 100 },
      ads: [adRead("a1", { platform_state: "PAUSED" })],
      next_read_at: new Date(Date.now() + 900_000).toISOString(),
    });
    assert.deepEqual(failed, { outcome: "failed", adopted: 0, moved: 0, days: 0 });
    assert.equal((await adsOf(ws))[0].platform_state, "ACTIVE", "nothing a failed read carried is written");
    const row = ok(
      await db
        .from("ad_accounts")
        .select("read_error, read_after, next_read_at, notices_at")
        .eq("id", ws.account)
        .single(),
    );
    assert.equal(row.read_error, "slowed");
    assert.equal(
      Date.parse(row.next_read_at),
      Date.parse(later),
      "the platform's moment, not the sooner one asked for",
    );

    const good = await keep(ws, { ads: [adRead("a1")], notices: "subscribed", settle_at: later });
    assert.equal(good.outcome, "kept");
    const after_ = ok(
      await db
        .from("ad_accounts")
        .select("read_error, read_after, notices_at, settle_at")
        .eq("id", ws.account)
        .single(),
    );
    assert.deepEqual([after_.read_error, after_.read_after], [null, null]);
    assert.ok(after_.notices_at, "that the platform's notices are subscribed is kept");
    assert.equal(Date.parse(after_.settle_at), Date.parse(later));

    ok(await db.from("ad_accounts").update({ status: "revoked" }).eq("id", ws.account));
    assert.deepEqual(await keep(ws, { ads: [adRead("a9")] }), { outcome: "not_connected" });
    assert.equal((await adsOf(ws)).length, 1, "an account that is not connected is not written");
  },
);

test("the clock hands a read to each account that is due and not held back, one an account", { skip }, async () => {
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const due = await connected("due");
  const notYet = await connected("not-yet", { next_read_at: soon });
  const held = await connected("held", { read_after: soon });
  const gone = await connected("gone", { status: "revoked", revoked_at: new Date().toISOString() });
  ok(await db.rpc("ads_hand_out", { p_spread_seconds: 300 }));
  ok(await db.rpc("ads_hand_out", { p_spread_seconds: 300 }));
  const jobs = await readJobsOf(due);
  assert.equal(jobs.length, 1, "a clock that knocks twice hands one read");
  assert.deepEqual(jobs[0].payload, { account_id: due.account });
  assert.ok(Date.parse(jobs[0].due_at) <= Date.now() + 5_000, "an account never read is read at once");
  for (const ws of [notYet, held, gone]) assert.deepEqual(await readJobsOf(ws), []);
});

test("a notice asks for one read, soon, and never sooner than two minutes after the last", { skip }, async () => {
  const ws = await connected("notice", { read_at: new Date().toISOString() });
  assert.equal(ok(await db.rpc("ads_read_ask", { p_platform: "meta", p_external_id: ws.external })), 1);
  assert.equal(
    ok(await db.rpc("ads_read_ask", { p_platform: "meta", p_external_id: ws.external })),
    0,
    "a burst is one",
  );
  const [job] = await readJobsOf(ws);
  assert.ok(Date.parse(job.due_at) >= Date.now() + 100_000, "two minutes after the read just made");
  assert.equal(ok(await db.rpc("ads_read_ask", { p_platform: "meta", p_external_id: "nobody's account" })), 0);
});

test(
  "a read that waits for a later moment is brought forward by a notice; one due sooner is left",
  { skip },
  async () => {
    // The clock handed this account its hourly read, spread to some minutes on. A notice then says something changed.
    const ws = await connected("forward");
    const later = new Date(Date.now() + 40 * 60_000).toISOString();
    ok(
      await db
        .from("jobs")
        .insert({ tenant_id: ws.tenant, kind: "ad_read", due_at: later, payload: { account_id: ws.account } }),
    );
    assert.equal(ok(await db.rpc("ads_read_ask", { p_platform: "meta", p_external_id: ws.external })), 0, "one waits");
    const [job] = await readJobsOf(ws);
    assert.ok(Date.parse(job.due_at) <= Date.now() + 5_000, "and is brought forward to now: an account never read");
    // Asked again, it is not pushed back, and still one.
    assert.equal(ok(await db.rpc("ads_read_ask", { p_platform: "meta", p_external_id: ws.external })), 0);
    const jobs = await readJobsOf(ws);
    assert.deepEqual([jobs.length, jobs[0].due_at], [1, job.due_at]);
  },
);

test("a day goes 760 days on, and the ad stays", { skip }, async () => {
  const ws = await connected("purge");
  const old = new Date(Date.now() - 761 * 86_400_000).toISOString().slice(0, 10);
  const young = new Date(Date.now() - 759 * 86_400_000).toISOString().slice(0, 10);
  await keep(ws, { ads: [adRead("a1")], days: [dayRead("a1", old), dayRead("a1", young)] });
  assert.ok(ok(await db.rpc("purge_ad_days")) >= 1);
  assert.deepEqual(
    (await daysOf(ws)).map((day) => day.day),
    [young],
  );
  assert.equal((await adsOf(ws)).length, 1);
});

test("no member and no visitor may knock on a door of the read's", { skip: skipMember }, async () => {
  const ws = await connected("doors");
  const visitor = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const [fn, args] of [
    ["ads_read_keep", { p_tenant_id: ws.tenant, p_account_id: ws.account, p_read: {} }],
    ["ads_hand_out", { p_spread_seconds: 1 }],
    ["ads_read_ask", { p_platform: "meta", p_external_id: ws.external }],
    ["ads_sweep_ask", {}],
    ["purge_ad_days", {}],
  ]) {
    const tried = await visitor.rpc(fn, args);
    assert.ok(tried.error, `REGRESSION: a visitor ran ${fn}`);
    assert.equal(tried.error.code, "42501", `${fn}: ${tried.error.message}`);
  }
});
