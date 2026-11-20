/**
 * 00658 on a real Postgres: the bell rings for an owner's ads (decision 0050, call 15; the Ads plan's 4.10 and G9).
 *
 * Five things ring, each worked out by the read's own door from what the read keeps: Meta didn't approve an ad, Meta
 * couldn't charge the card for one, one ended, one spent its total, and no one wrote from one in seven days while it
 * ran. What must hold: each rings once, on the read that finds it, and never again on the next; it closes for everyone
 * at the read that finds its cause gone; it reaches the owner alone, never a partner, an operator or a viewer; an ad
 * made in Meta rings the same as one made here; the first look after a connect rings nothing; one cause is one row,
 * and the card is never told twice, by an ad's row and the account's. Runs against the database `supabase start`
 * builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces, members and ads"
      : false;

const stamp = Date.now();
const ZONE = "America/New_York";
const workspaces = [];
const users = [];
let db;
let seq = 0;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A workspace with an owner, a partner, an operator and a viewer, and one connected ad account. */
async function workspace(tag, over = {}) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-bell-${tag}-${stamp}`, name: `Harbor Bell ${tag}` })
      .select("id")
      .single(),
  ).id;
  workspaces.push(tenant);
  const member = async (role) => {
    const made = await db.auth.admin.createUser({
      email: `ads-bell-${role}-${tag}-${stamp}@example.com`,
      password: `pw-${Math.random().toString(36).slice(2)}-Aa1!`,
      email_confirm: true,
    });
    assert.equal(made.error, null, made.error?.message);
    users.push(made.data.user.id);
    ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
    return made.data.user.id;
  };
  const owner = await member("owner");
  const others = [await member("partner"), await member("operator"), await member("viewer")];
  const account = ok(
    await db
      .from("ad_accounts")
      .insert({
        tenant_id: tenant,
        platform: "meta",
        external_id: `1500${stamp}${++seq}`,
        name: "Harbor ads",
        currency: "USD",
        timezone: ZONE,
        status: "connected",
        standing: { account: "active", funding: "ok" },
        // Not due: the ads clock another suite runs hands this account no read of its own.
        next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
        ...over,
      })
      .select("id")
      .single(),
  ).id;
  return { tenant, account, owner, others };
}

const adRead = (id, over = {}) => ({
  platform_ad_id: id,
  name: `Ad ${id}`,
  door: "whatsapp",
  platform_set_id: `set-${id}`,
  platform_campaign_id: `campaign-${id}`,
  budget_kind: "total",
  budget_minor: 7000,
  budget_left_minor: 1800,
  budget_at: "set",
  budget_shared: false,
  starts_at: "2026-11-01T04:00:00Z",
  ends_at: "2099-12-01T04:59:00Z",
  platform_state: "ACTIVE",
  platform_issue: null,
  intent: "on",
  said: { headline: "First appointment" },
  ...over,
});
const keep = async (ws, read) =>
  ok(
    await db.rpc("ads_read_keep", {
      p_tenant_id: ws.tenant,
      p_account_id: ws.account,
      p_read: { account: {}, next_read_at: new Date(Date.now() + 3_600_000).toISOString(), ...read },
    }),
  );
const bellOf = async (ws) =>
  ok(
    await db
      .from("notifications")
      .select("kind, title, body, route, subject_type, subject_id, recipient_user_id, closed_at")
      .eq("tenant_id", ws.tenant)
      .order("created_at"),
  );
const adIdOf = async (ws, platformAdId) =>
  ok(await db.from("ads").select("id").eq("tenant_id", ws.tenant).eq("platform_ad_id", platformAdId).single()).id;
const ofKind = (rows, kind) => rows.filter((r) => r.kind === kind);
const open = (rows) => rows.filter((r) => r.closed_at === null);

/** The database's own moment, as the account's last read stamped it, and the day it is in the account's zone. */
async function todayOf(ws) {
  const at = ok(await db.from("ad_accounts").select("read_at").eq("id", ws.account).single()).read_at;
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(at));
}
const dayBefore = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const spentOn = (id, days) =>
  days.map((day) => ({ platform_ad_id: id, day, spend_minor: 900, impressions: 80, clicks: 4 }));

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

test("the first look after a connect rings nothing: what the account already held is not news", { skip }, async () => {
  const ws = await workspace("first");
  await keep(ws, {
    ads: [
      adRead("f1", { platform_state: "DISAPPROVED", platform_issue: "Old refusal." }),
      adRead("f2", { budget_left_minor: 0 }),
      adRead("f3", { ends_at: "2026-01-01T05:00:00Z" }),
    ],
  });
  assert.deepEqual(await bellOf(ws), []);
  // And the next read, finding the same, rings nothing either.
  await keep(ws, {
    ads: [
      adRead("f1", { platform_state: "DISAPPROVED", platform_issue: "Old refusal." }),
      adRead("f2", { budget_left_minor: 0 }),
      adRead("f3", { ends_at: "2026-01-01T05:00:00Z" }),
    ],
  });
  assert.deepEqual(await bellOf(ws), []);
  const account = ok(await db.from("ad_accounts").select("rung_at").eq("id", ws.account).single());
  assert.ok(account.rung_at, "the bell's look is stamped");
});

test(
  "an ad Meta didn't approve rings once, to the owner alone, in Meta's words, and closes once Meta approves it",
  { skip },
  async () => {
    const ws = await workspace("refused");
    await keep(ws, { ads: [adRead("r1")] });
    const refused = adRead("r1", {
      platform_state: "DISAPPROVED",
      platform_issue: "Your ad names a medical condition.",
    });
    await keep(ws, { ads: [refused] });
    let rows = await bellOf(ws);
    assert.equal(rows.length, 1, "one row: the owner's");
    const id = await adIdOf(ws, "r1");
    assert.deepEqual(rows[0], {
      kind: "ad_refused",
      title: "Meta didn't approve “Ad r1”",
      body: "Meta said: “Your ad names a medical condition.” Fix it in Meta, and Meta checks it again.",
      route: `campaigns/ads:ad:${id}`,
      subject_type: "ad",
      subject_id: id,
      recipient_user_id: ws.owner,
      closed_at: null,
    });
    for (const other of ws.others) assert.ok(!rows.some((r) => r.recipient_user_id === other), "never a partner");

    await keep(ws, { ads: [refused] });
    rows = await bellOf(ws);
    assert.equal(rows.length, 1, "the next read rings nothing again");

    await keep(ws, { ads: [adRead("r1")] });
    rows = await bellOf(ws);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].closed_at, "approved: the row closes");

    // Turned down again: a new cause, told again.
    await keep(ws, { ads: [adRead("r1", { platform_state: "DISAPPROVED" })] });
    rows = await bellOf(ws);
    assert.equal(open(rows).length, 1);
    assert.equal(open(rows)[0].body, "Meta didn't say why. Fix it in Meta, and Meta checks it again.");
  },
);

test("an ad made in Meta rings the same as one made here", { skip }, async () => {
  const ws = await workspace("origin");
  ok(
    await db.from("ads").insert({
      tenant_id: ws.tenant,
      account_id: ws.account,
      platform: "meta",
      origin: "chanlytics",
      name: "Made here",
      door: "whatsapp",
      platform_ad_id: "c1",
      status: "made",
      intent: "on",
      platform_state: "PENDING_REVIEW",
    }),
  );
  await keep(ws, { ads: [adRead("c1", { platform_state: "PENDING_REVIEW" }), adRead("m1", { name: "Made in Meta" })] });
  await keep(ws, {
    ads: [
      adRead("c1", { platform_state: "DISAPPROVED", platform_issue: "Too much text." }),
      adRead("m1", { name: "Made in Meta", platform_state: "DISAPPROVED", platform_issue: "Too much text." }),
    ],
  });
  const rows = await bellOf(ws);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.title, r.body, r.recipient_user_id]).sort(),
    [
      [
        "ad_refused",
        "Meta didn't approve “Made here”",
        "Meta said: “Too much text.” Fix it in Meta, and Meta checks it again.",
        ws.owner,
      ],
      [
        "ad_refused",
        "Meta didn't approve “Made in Meta”",
        "Meta said: “Too much text.” Fix it in Meta, and Meta checks it again.",
        ws.owner,
      ],
    ].sort(),
  );
});

test(
  "an ad first seen after the first look rings for Meta's check, and never for a run that was over before",
  { skip },
  async () => {
    const ws = await workspace("adopted");
    await keep(ws, { ads: [adRead("a1")] });
    await keep(ws, {
      ads: [
        adRead("a1"),
        adRead("a2", { platform_state: "DISAPPROVED", platform_issue: "No." }),
        adRead("a3", { ends_at: "2026-01-01T05:00:00Z" }),
        adRead("a4", { budget_left_minor: 0 }),
      ],
    });
    const rows = await bellOf(ws);
    assert.deepEqual(
      rows.map((r) => r.kind),
      ["ad_refused"],
      "a new ad Meta turned down is news; one that ended or spent before Chanlytics held it is not",
    );
  },
);

test(
  "an ad that spent its total rings once for its budget, naming its first ad, and closes if the total is raised",
  { skip },
  async () => {
    const ws = await workspace("spent");
    const shared = { platform_set_id: "set-s", budget_shared: true };
    await keep(ws, {
      ads: [adRead("s1", { ...shared, name: "Spring offer" }), adRead("s2", { ...shared, name: "Summer offer" })],
    });
    const spent = [
      adRead("s1", { ...shared, name: "Spring offer", budget_left_minor: 0 }),
      adRead("s2", { ...shared, name: "Summer offer", budget_left_minor: 0 }),
    ];
    await keep(ws, { ads: spent });
    let rows = await bellOf(ws);
    assert.equal(rows.length, 1, "one budget, one row");
    assert.equal(rows[0].kind, "ad_spent");
    assert.equal(rows[0].title, "“Spring offer” and 1 more spent their total");
    assert.equal(rows[0].body, "Meta stopped showing them. Raise the total in Meta to run them longer.");
    assert.equal(rows[0].subject_id, await adIdOf(ws, "s1"));
    assert.equal(rows[0].recipient_user_id, ws.owner);
    await keep(ws, { ads: spent });
    assert.equal((await bellOf(ws)).length, 1, "rung once");
    await keep(ws, {
      ads: [
        adRead("s1", { ...shared, name: "Spring offer", budget_minor: 9000, budget_left_minor: 2000 }),
        adRead("s2", { ...shared, name: "Summer offer", budget_minor: 9000, budget_left_minor: 2000 }),
      ],
    });
    rows = await bellOf(ws);
    assert.ok(rows[0].closed_at, "the total raised: the row closes");
  },
);

test(
  "an ad that was on and reached its last day rings once; one paused before its end does not",
  { skip },
  async () => {
    const ws = await workspace("ended");
    await keep(ws, {
      ads: [adRead("e1", { name: "Autumn offer" }), adRead("e2", { intent: "paused", platform_state: "PAUSED" })],
    });
    const past = "2026-11-10T05:00:00Z";
    const ended = [
      adRead("e1", { name: "Autumn offer", ends_at: past }),
      adRead("e2", { intent: "paused", platform_state: "PAUSED", ends_at: past }),
    ];
    await keep(ws, { ads: ended });
    let rows = await bellOf(ws);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "ad_ended");
    assert.equal(rows[0].title, "“Autumn offer” ended");
    assert.equal(rows[0].body, "It ran until Tue 10 Nov, and Meta stopped showing it.");
    assert.equal(rows[0].subject_id, await adIdOf(ws, "e1"));
    await keep(ws, { ads: ended });
    rows = await bellOf(ws);
    assert.equal(rows.length, 1, "rung once");
    // Its run extended in Meta: no longer ended, and the row closes.
    await keep(ws, { ads: [adRead("e1", { name: "Autumn offer" }), ended[1]] });
    assert.ok((await bellOf(ws))[0].closed_at);
  },
);

test(
  "no one writing from a running ad in seven days rings once, and closes once someone writes",
  { skip },
  async () => {
    const ws = await workspace("quiet");
    await keep(ws, { ads: [adRead("q1", { name: "Winter offer" }), adRead("q2", { door: "website" })] });
    const today = await todayOf(ws);
    const week = [1, 2, 3, 4, 5, 6, 7].map((n) => dayBefore(today, n));
    // Six days of the seven: not a week yet.
    await keep(ws, { ads: [adRead("q1", { name: "Winter offer" })], days: spentOn("q1", week.slice(1)) });
    assert.deepEqual(await bellOf(ws), []);
    // The seventh. A website ad's people are never counted, so it never rings for them.
    const quiet = {
      ads: [adRead("q1", { name: "Winter offer" }), adRead("q2", { door: "website" })],
      days: [...spentOn("q1", week), ...spentOn("q2", week)],
    };
    await keep(ws, quiet);
    let rows = await bellOf(ws);
    assert.equal(rows.length, 1);
    assert.deepEqual(
      [rows[0].kind, rows[0].title, rows[0].body, rows[0].recipient_user_id],
      [
        "ad_quiet",
        "No one wrote from “Winter offer” in 7 days",
        "It ran all 7 days, and Meta charges while it runs. Pause it, or change it in Meta.",
        ws.owner,
      ],
    );
    await keep(ws, quiet);
    assert.equal((await bellOf(ws)).length, 1, "rung once");
    // Someone writes from it.
    ok(
      await db.from("ad_entries").insert({
        tenant_id: ws.tenant,
        platform: "meta",
        platform_ad_id: "q1",
        kind: "number",
        new_person: true,
        external_ref: `bell-quiet-${stamp}`,
      }),
    );
    await keep(ws, quiet);
    rows = await bellOf(ws);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].closed_at, "someone wrote: the row closes");
  },
);

test("a card Meta couldn't charge is told once, whether an ad or the account says it first", { skip }, async () => {
  // An ad says it first: the ad's row, and the account's row is not rung beside it when the account says it too.
  const first = await workspace("card-ad");
  await keep(first, { ads: [adRead("p1", { name: "Spring offer" }), adRead("p2", { name: "Summer offer" })] });
  const pending = [
    adRead("p1", { name: "Spring offer", platform_state: "PENDING_BILLING_INFO" }),
    adRead("p2", { name: "Summer offer", platform_state: "PENDING_BILLING_INFO" }),
  ];
  await keep(first, { ads: pending });
  let rows = await bellOf(first);
  assert.equal(rows.length, 1, "one card, one row for the account");
  assert.deepEqual(
    [rows[0].kind, rows[0].title, rows[0].body, rows[0].recipient_user_id],
    [
      "ad_unpaid",
      "Meta couldn't charge your card for “Spring offer” and 1 more",
      "They don't run until Meta can. Fix the payment method in Meta.",
      first.owner,
    ],
  );
  await keep(first, { account: { standing: { account: "unsettled", funding: "ok" } }, ads: pending });
  rows = await bellOf(first);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.closed_at === null]),
    [["ad_unpaid", true]],
    "the account's row is not rung beside the ad's, and the ad's stays open while the card is unpaid",
  );
  await keep(first, {
    account: { standing: { account: "active", funding: "ok" } },
    ads: [adRead("p1", { name: "Spring offer" }), adRead("p2", { name: "Summer offer" })],
  });
  assert.ok((await bellOf(first))[0].closed_at, "paid: the row closes");

  // The account says it first: its own row, never an ad's as well, and it closes once Meta can charge again.
  const second = await workspace("card-account");
  await keep(second, { ads: [adRead("k1")] });
  await keep(second, {
    account: { standing: { account: "unsettled", funding: "ok" } },
    ads: [adRead("k1", { platform_state: "PENDING_BILLING_INFO" })],
  });
  await keep(second, {
    account: { standing: { account: "active", funding: "ok" } },
    ads: [adRead("k1", { platform_state: "PENDING_BILLING_INFO" })],
  });
  rows = await bellOf(second);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.title, r.closed_at === null]),
    [["ad_account", "Meta can't charge your ad account", true]],
    "an ad still saying it after the account is the same card",
  );
  await keep(second, { ads: [adRead("k1")] });
  assert.ok((await bellOf(second))[0].closed_at, "the card cleared: the account's row closes too");
});

test("a disconnect closes the rows about the account's ads", { skip }, async () => {
  const ws = await workspace("disconnect");
  await keep(ws, { ads: [adRead("d1")] });
  await keep(ws, { ads: [adRead("d1", { platform_state: "DISAPPROVED" })] });
  assert.equal(open(await bellOf(ws)).length, 1);
  ok(await db.rpc("ad_account_disconnect", { p_tenant_id: ws.tenant, p_actor: ws.owner, p_account_id: ws.account }));
  const rows = await bellOf(ws);
  assert.equal(ofKind(rows, "ad_refused").length, 1);
  assert.ok(ofKind(rows, "ad_refused")[0].closed_at);
});

const skipVisitor =
  skip || (!process.env.SUPABASE_ANON_KEY ? "no SUPABASE_ANON_KEY in env: a visitor needs it" : false);

test("every bell door is the service role's", { skip: skipVisitor }, async () => {
  const anon = createClient(URL_, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const ws = await workspace("doors");
  for (const [fn, args] of [
    ["ad_bell_ring", { p_tenant_id: ws.tenant, p_account_id: ws.account, p_before: [] }],
    ["ad_bell_causes", { p_tenant_id: ws.tenant, p_account_id: ws.account, p_at: new Date().toISOString() }],
    ["ad_bell_hearers", { p_tenant_id: ws.tenant }],
  ]) {
    const res = await anon.rpc(fn, args);
    assert.ok(res.error, `${fn} refuses a visitor`);
  }
});
