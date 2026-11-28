/**
 * 00651, 00652 and 00653 on a real Postgres: the Ads page's counts, an owner's presses, and Disconnect (decision
 * 0049, calls 5 and 6; decision 0050, calls 1, 2, 8 and 9; the Ads plan's C1).
 *
 * What must hold. The page's people for its ads plus the ones from an ad it cannot name are exactly the people the
 * people report counts under "An ad", so the two pages cannot disagree. A person is booked from an ad when a booking
 * of theirs is put down to it by the one rule (00732, booking_sources: made inside the window after their touch, the
 * ad its main source, neither cancelled nor only asked for; a visit with no moment it was made is none). Two records of one person, merged,
 * are one person. A press is kept once: two at once make one change, a stale one is refused, turning back on is refused
 * where the rule says no, and taking back a press the platform was never told of leaves nothing to tell. A change the
 * platform refuses puts the ad back and says so. Disconnect is the owner's, never refused, lets go what was on its way,
 * and a sign-out rings the bell. Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { DAY_MS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces, people, visits and ads"
      : false;

const stamp = Date.now();
const users = [];
const workspaces = [];
let db;
let seq = 0;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A workspace with its owner signed in, an operator, and one connected ad account. */
async function workspace(tag) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-page-${tag}-${stamp}`, name: `Harbor Page ${tag}` })
      .select("id")
      .single(),
  ).id;
  workspaces.push(tenant);
  const member = async (role) => {
    const email = `ads-page-${role}-${tag}-${stamp}@example.com`;
    const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
    return { id: made.data.user.id, email, password };
  };
  const owner = await member("owner");
  const operator = await member("operator");
  const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await session.auth.signInWithPassword({ email: owner.email, password: owner.password });
  assert.equal(signedIn.error, null, signedIn.error?.message);
  const account = ok(
    await db
      .from("ad_accounts")
      .insert({
        tenant_id: tenant,
        platform: "meta",
        external_id: `1400${stamp}${++seq}`,
        name: "Harbor ads",
        currency: "USD",
        timezone: "America/New_York",
        status: "connected",
        // Not due: the ads clock, which another suite runs for every workspace at once, hands this account no read,
        // so the reads this suite puts on the ledger itself are the only ones there.
        next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single(),
  ).id;
  return { tenant, owner, operator, session, account };
}

/** An ad adopted for the account, as a read keeps it. */
async function adopt(ws, platformAdId, over = {}) {
  ok(
    await db.rpc("ads_read_keep", {
      p_tenant_id: ws.tenant,
      p_account_id: ws.account,
      p_read: {
        account: {},
        next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
        ads: [
          {
            platform_ad_id: platformAdId,
            name: `Ad ${platformAdId}`,
            door: "whatsapp",
            budget_kind: "total",
            budget_minor: 40000,
            budget_left_minor: 18000,
            budget_at: "set",
            budget_shared: false,
            ends_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
            platform_state: "ACTIVE",
            intent: "on",
            ...over,
          },
        ],
      },
    }),
  );
  return ok(
    await db.from("ads").select("id, version").eq("tenant_id", ws.tenant).eq("platform_ad_id", platformAdId).single(),
  );
}

/**
 * Someone writes for the first time, after tapping an ad where `adId` names one: on WhatsApp by their number, or by
 * email, known by their address alone.
 */
async function arrive(ws, adId, channel = "whatsapp") {
  seq += 1;
  const number = `+1555016${1000 + seq}`;
  const address = `guest${seq}.${stamp}@example.com`;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: ws.tenant,
      p_channel: channel,
      p_identity_external_id: channel === "email" ? address : number.slice(1),
      p_phone_e164: channel === "email" ? null : number,
      p_wa_profile_name: null,
      p_message_external_id: `page.${stamp}.${seq}`,
      p_type: "text",
      p_body: "Hi, I saw your ad",
      p_channel_ts: null,
      p_media: null,
      p_meta: adId ? { raw_type: "text", referral: { source_id: adId, source_type: "ad" } } : { raw_type: "text" },
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
}

/**
 * A visit that came by the business's booking tool. `arrived`: the moment it arrived as a customer's booking, which the
 * arrival rule stamps as its event is delivered (00647); a second on, so it is after the message whatever the two clocks say.
 */
const visit = (ws, contactId, status, inHours = 24, arrived = true) =>
  db.from("appointments").insert({
    tenant_id: ws.tenant,
    contact_id: contactId,
    source: "booking_tool",
    status,
    ...(arrived ? { arrived_at: new Date(Date.now() + 1000).toISOString() } : {}),
    timezone: "America/New_York",
    starts_at: new Date(Date.now() + inHours * 3_600_000).toISOString(),
    ends_at: new Date(Date.now() + (inHours + 1) * 3_600_000).toISOString(),
  });
const counts = async (ws, as = db) => ok(await as.rpc("ads_page_counts", { p_tenant_id: ws.tenant }));
const press = async (ws, ad, intent, version = ad.version, actor = ws.owner.id) =>
  ok(
    await db.rpc("ad_set_intent", {
      p_tenant_id: ws.tenant,
      p_actor: actor,
      p_ad_id: ad.id,
      p_version: version,
      p_intent: intent,
    }),
  );
const told = async (ws, ad, asked, outcome, state = null) =>
  ok(
    await db.rpc("ad_told", {
      p_tenant_id: ws.tenant,
      p_ad_id: ad.id,
      p_asked: asked,
      p_outcome: outcome,
      ...(state ? { p_platform_state: state } : {}),
    }),
  );
const adNow = async (ad) =>
  ok(await db.from("ads").select("intent, version, intent_at, told_at, platform_state").eq("id", ad.id).single());
const decisionsOf = async (ws, verb) =>
  ok(await db.from("decisions").select("subject_id, payload").eq("tenant_id", ws.tenant).eq("verb", verb));

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
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("the page's people, with the unnamed line, are the people Reports counts under An ad", { skip }, async () => {
  const ws = await workspace("tie");
  const spring = await adopt(ws, "23850000000000801");
  const first = await arrive(ws, "23850000000000801");
  const second = await arrive(ws, "23850000000000801");
  const third = await arrive(ws, "23850000000000801");
  await arrive(ws, "23850000000000899"); // an ad Chanlytics does not hold
  await arrive(ws, null); // nobody's ad
  // Booked: a booking made after the first touch that stands. Cancelled, or only asked for, is not; nor is a visit
  // with no moment it was made (a tool's copy that never arrived as a booking), which is put down to nothing.
  ok(await visit(ws, first.contact_id, "booked"));
  ok(await visit(ws, second.contact_id, "cancelled"));
  ok(await visit(ws, second.contact_id, "booked", 30, false));
  ok(await visit(ws, third.contact_id, "proposed"));

  const page = await counts(ws);
  assert.deepEqual(page.ads, [{ ad_id: spring.id, people: 3, booked: 1 }]);
  assert.deepEqual(page.unnamed, { people: 1, booked: 0 });
  const series = ok(await db.rpc("people_series", { p_tenant_id: ws.tenant }));
  assert.equal(
    page.ads.reduce((sum, ad) => sum + ad.people, 0) + page.unnamed.people,
    series.first_came.by_via.ad,
    "the Ads page and Reports › People count the same people",
  );
  // The owner reads the same numbers under their own row rules.
  assert.deepEqual((await counts(ws, ws.session)).ads, page.ads);

  // One ad's people, newest first, each with whether they booked; the unnamed ones where no ad is given.
  const list = ok(await db.rpc("ad_people", { p_tenant_id: ws.tenant, p_ad_id: spring.id }));
  assert.deepEqual(
    list.map((person) => [person.contact_id, person.booked]),
    [
      [third.contact_id, false],
      [second.contact_id, false],
      [first.contact_id, true],
    ],
  );
  assert.equal(ok(await db.rpc("ad_people", { p_tenant_id: ws.tenant })).length, 1);

  // What the platform says it spent in the same days stands beside it, never added to it. Two days back: the window
  // ends on today in the workspace's own zone, which is still yesterday in UTC's for hours of every day, and this suite
  // also runs with its clock twelve hours on (red at 00:02 UTC, 20 November).
  const spentOn = new Date(Date.now() - 2 * DAY_MS).toISOString().slice(0, 10);
  ok(
    await db.rpc("ads_read_keep", {
      p_tenant_id: ws.tenant,
      p_account_id: ws.account,
      p_read: {
        account: {},
        next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
        days: [{ platform_ad_id: "23850000000000801", day: spentOn, spend_minor: 4200, impressions: 900, clicks: 30 }],
      },
    }),
  );
  const [spend] = (await counts(ws)).spend;
  assert.deepEqual(
    [spend.ad_id, spend.spend_minor, spend.impressions, spend.clicks, spend.settling],
    [spring.id, 4200, 900, 30, true],
  );
});

test("two records of one person, merged, are one person on the page and in the report", { skip }, async () => {
  const ws = await workspace("merge");
  await adopt(ws, "23850000000000811");
  // The same person, first on WhatsApp and then by email, each after tapping the ad: two records until merged.
  const one = await arrive(ws, "23850000000000811");
  const two = await arrive(ws, "23850000000000811", "email");
  ok(
    await db
      .from("contacts")
      .update({ email: `two.${stamp}@example.com` })
      .eq("id", two.contact_id),
  );
  assert.equal((await counts(ws)).ads[0].people, 2);
  ok(await ws.session.rpc("merge_people", { p_keep: one.contact_id, p_merge: two.contact_id }));
  const page = await counts(ws);
  const series = ok(await db.rpc("people_series", { p_tenant_id: ws.tenant }));
  assert.equal(page.ads[0].people, 1, "counted once");
  assert.equal(page.ads[0].people + page.unnamed.people, series.first_came.by_via.ad);
});

test("a press is kept once: two at once make one change, a stale one is refused", { skip }, async () => {
  const ws = await workspace("press");
  const ad = await adopt(ws, "23850000000000821");
  const both = await Promise.all([press(ws, ad, "paused"), press(ws, ad, "paused")]);
  assert.deepEqual(both.map((answer) => answer.outcome).sort(), ["asked", "same"]);
  const now = await adNow(ad);
  assert.deepEqual([now.intent, now.version], ["paused", ad.version + 1]);
  assert.equal((await decisionsOf(ws, "pause_ad")).length, 1, "one decision");
  assert.equal(
    ok(await db.from("events").select("id").eq("tenant_id", ws.tenant).eq("kind", "ad.paused")).length,
    1,
    "one event",
  );
  // A press drawn from the read before that change is refused, and nothing moves.
  assert.deepEqual(await press(ws, ad, "on", ad.version), { outcome: "stale", version: ad.version + 1 });
  // Anyone but the owner is refused by the door itself.
  assert.deepEqual(await press(ws, ad, "on", ad.version + 1, ws.operator.id), { outcome: "not_allowed" });
});

test("turning back on follows the rule, and taking back an untold press leaves nothing to tell", { skip }, async () => {
  const ws = await workspace("resume");
  const daily = await adopt(ws, "23850000000000831", {
    budget_kind: "daily",
    budget_minor: 2000,
    budget_left_minor: null,
    ends_at: null,
    platform_state: "PAUSED",
    intent: "paused",
  });
  assert.equal((await press(ws, daily, "on")).outcome, "cant_resume", "no total and no end: turned back on in Meta");

  const total = await adopt(ws, "23850000000000832");
  // Paused here and not yet told: taking it back is always the owner's, and nothing is left to send.
  const paused = await press(ws, total, "paused");
  assert.deepEqual([paused.outcome, paused.tell], ["asked", true]);
  const back = await press(ws, total, "on", paused.version);
  assert.deepEqual([back.outcome, back.tell], ["asked", false]);
  const now = await adNow(total);
  assert.ok(now.told_at >= now.intent_at, "nothing is on its way");
  assert.equal((await decisionsOf(ws, "resume_ad"))[0].payload.took_back, true);

  // Paused and told: the platform holds it paused, with a total, an end and the budget to itself. It may be resumed.
  const again = await press(ws, total, "paused", back.version);
  assert.equal(await told(ws, total, "paused", "told", "PAUSED"), "told");
  assert.equal((await press(ws, total, "on", again.version)).outcome, "asked");
});

test(
  "a change the platform refuses puts the ad back and says so; one pressed over is kept on its way",
  { skip },
  async () => {
    const ws = await workspace("told");
    const ad = await adopt(ws, "23850000000000841");
    const paused = await press(ws, ad, "paused");
    assert.equal(await told(ws, ad, "paused", "refused"), "refused");
    assert.deepEqual([(await adNow(ad)).intent], ["on"], "as the platform holds it");
    const refused = ok(
      await db.from("events").select("data").eq("tenant_id", ws.tenant).eq("kind", "ad.press_refused"),
    );
    assert.deepEqual([refused.length, refused[0].data.asked], [1, "paused"]);

    // Paused, sent; the owner turns it back on while that pause is on its way; then the platform confirms the pause.
    // A refusal bumps no version: the next press is drawn from the same one.
    const second = await press(ws, ad, "paused", paused.version);
    const over = await press(ws, ad, "on", second.version);
    assert.equal(over.tell, false, "it took back a press nobody had told yet");
    assert.equal(await told(ws, ad, "paused", "told", "PAUSED"), "again", "the newer ask is kept on its way");
    const now = await adNow(ad);
    assert.ok(now.intent === "on" && now.intent_at > now.told_at);
  },
);

test(
  "a press that waits for the platform brings its account's read forward, and a sign-out lets it go unsent",
  { skip },
  async () => {
    const ws = await workspace("wait");
    const ad = await adopt(ws, "23850000000000861");
    // The clock handed the account its hourly read, some minutes on; then the owner pauses, inside the thirty seconds.
    const later = new Date(Date.now() + 40 * 60_000).toISOString();
    ok(
      await db
        .from("jobs")
        .insert({ tenant_id: ws.tenant, kind: "ad_read", due_at: later, payload: { account_id: ws.account } }),
    );
    await press(ws, ad, "paused");
    assert.equal(ok(await db.rpc("ad_tell_ask", { p_tenant_id: ws.tenant, p_ad_id: ad.id })), 0, "a read waits");
    const jobs = ok(
      await db.from("jobs").select("due_at").eq("tenant_id", ws.tenant).eq("kind", "ad_read").eq("state", "scheduled"),
    );
    assert.equal(jobs.length, 1, "still one read");
    assert.ok(Date.parse(jobs[0].due_at) <= Date.now() + 5_000, "brought forward: a pause never waits for the hour");

    // The platform signs Chanlytics out before that read runs. The press is let go: it is never sent days on, when
    // the owner connects again.
    const waiting = await adNow(ad);
    assert.ok(waiting.intent_at > (waiting.told_at ?? ""), "on its way");
    assert.equal(
      ok(await db.rpc("ad_account_revoked", { p_tenant_id: ws.tenant, p_account_id: ws.account, p_how: "read" })),
      true,
    );
    const now = await adNow(ad);
    assert.ok(now.told_at >= now.intent_at, "nothing is left to send");
  },
);

test(
  "Disconnect is the owner's and never refused: what was on its way is let go, and a sign-out rings the bell",
  { skip },
  async () => {
    const ws = await workspace("leave");
    const ad = await adopt(ws, "23850000000000851");
    // One Meta is still checking, its own switch on: it starts once approved, so it is named as left on too. One
    // paused while Meta checks it starts nothing, and is not.
    await adopt(ws, "23850000000000852", { platform_state: "PENDING_REVIEW" });
    await adopt(ws, "23850000000000853", { platform_state: "PENDING_REVIEW", intent: "paused" });
    await press(ws, ad, "paused");
    const refused = ok(
      await db.rpc("ad_account_disconnect", {
        p_tenant_id: ws.tenant,
        p_actor: ws.operator.id,
        p_account_id: ws.account,
      }),
    );
    assert.deepEqual(refused, { outcome: "not_allowed" });
    const done = ok(
      await db.rpc("ad_account_disconnect", { p_tenant_id: ws.tenant, p_actor: ws.owner.id, p_account_id: ws.account }),
    );
    assert.deepEqual(done, {
      outcome: "disconnected",
      left_running: [`Ad 23850000000000851`, `Ad 23850000000000852`],
    });
    const now = await adNow(ad);
    assert.ok(now.told_at >= now.intent_at, "nothing is sent after a disconnect");
    const [decision] = await decisionsOf(ws, "disconnect_ad_account");
    assert.deepEqual(decision.payload.left_running, [`Ad 23850000000000851`, `Ad 23850000000000852`]);
    assert.equal(
      ok(
        await db.rpc("ad_account_disconnect", {
          p_tenant_id: ws.tenant,
          p_actor: ws.owner.id,
          p_account_id: ws.account,
        }),
      ).outcome,
      "already",
    );

    const other = await workspace("bell");
    assert.equal(
      ok(await db.rpc("ad_account_revoked", { p_tenant_id: other.tenant, p_account_id: other.account, p_how: "read" })),
      true,
    );
    const bell = ok(await db.from("notifications").select("kind, title, route").eq("tenant_id", other.tenant));
    assert.deepEqual(bell, [
      { kind: "ad_account", title: "Meta signed Chanlytics out of your ad account", route: "campaigns/ads" },
    ]);
  },
);

test(
  "every ad of a set is paused in one transaction, in the ads' own order: a stale one and a paused one say so, and nothing is kept for anyone but the owner or of a set that cannot be read",
  { skip },
  async () => {
    const ws = await workspace("pause-all");
    const running = await adopt(ws, "23850000000000851");
    const stale = await adopt(ws, "23850000000000852");
    const before = await adopt(ws, "23850000000000853");
    const paused = await press(ws, before, "paused");
    const all = (presses, actor = ws.owner.id) =>
      db.rpc("ad_pause_all", { p_tenant_id: ws.tenant, p_actor: actor, p_presses: presses });

    // Anyone but the owner: nothing of the set is kept.
    assert.deepEqual(ok(await all([{ ad_id: running.id, version: running.version }], ws.operator.id)), {
      outcome: "not_allowed",
    });
    // A set that cannot be read whole is refused whole, in one transaction: nothing of it is kept.
    const bad = await all([
      { ad_id: running.id, version: running.version },
      { ad_id: "not-an-ad", version: 1 },
    ]);
    assert.ok(bad.error, "refused");
    assert.equal((await adNow(running)).intent, "on", "one transaction: nothing of it was kept");

    const kept = ok(
      await all([
        { ad_id: stale.id, version: stale.version + 7 },
        { ad_id: running.id, version: running.version },
        { ad_id: before.id, version: paused.version },
      ]),
    );
    assert.equal(kept.outcome, "kept");
    assert.deepEqual(
      kept.ads.map((one) => one.ad_id),
      [running.id, stale.id, before.id].sort(),
      "taken in the ads' own order, so two presses over the same ads never wait on each other",
    );
    const said = Object.fromEntries(kept.ads.map((one) => [one.ad_id, [one.outcome, one.tell ?? null]]));
    assert.deepEqual(said[running.id], ["asked", true]);
    assert.deepEqual(said[stale.id], ["stale", null]);
    assert.deepEqual(said[before.id][0], "same");
    assert.deepEqual([(await adNow(running)).intent, (await adNow(stale)).intent], ["paused", "on"]);
    assert.equal((await decisionsOf(ws, "pause_ad")).length, 2, "the one before, and the one this kept");
    const reads = ok(await db.from("jobs").select("kind").eq("tenant_id", ws.tenant).eq("kind", "ad_read"));
    assert.ok(reads.length >= 1, "the account's read is asked for: it tells Meta at Meta's pace");
  },
);
