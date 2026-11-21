/**
 * 00670 on a real Postgres: an owner changes a running ad made here (decision 0050, Routes budget, end-date, end; the
 * Ads plan's step 4, item 6).
 *
 * What must hold. The owner's change is kept on the ad with what Meta held, its version bumped and the decision
 * written, in one transaction; the owner alone; an ad made in Meta is not changed here. A press drawn from an old
 * version, or from a total Meta no longer holds, is refused; the same press twice is answered once; one change at a
 * time, ending taking the place of any; four amounts an hour. Telling Meta: taken, the row says the new total (what is
 * left of it, and what was approved with it) and an event says so; refused, nothing changed and Meta's words kept; no
 * answer, kept as sent and nothing more asked until settled; ended, the ad is ended. The page hears a change on its
 * way. Runs against the database `supabase start` builds on this machine, never production.
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
const users = [];
const workspaces = [];
let db;
let seq = 0;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

async function member(tenant, role, tag) {
  const made = await db.auth.admin.createUser({
    email: `ads-change-${role}-${tag}-${stamp}@example.com`,
    password: `pw-${Math.random().toString(36).slice(2)}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  return made.data.user.id;
}

/** A workspace with a connected account, its owner and an operator, and one ad made here running: $70, $20 spent. */
async function workspace(tag, ad = {}) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-change-${tag}-${stamp}`, name: `Harbor Change ${tag}` })
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
        external_id: `act-change-${tag}-${stamp}`,
        currency: "USD",
        status: "connected",
      })
      .select("id")
      .single(),
  ).id;
  const owner = await member(tenant, "owner", tag);
  const operator = await member(tenant, "operator", tag);
  seq += 1;
  const row = ok(
    await db
      .from("ads")
      .insert({
        tenant_id: tenant,
        account_id: account,
        platform: "meta",
        origin: "chanlytics",
        name: "First visit",
        door: "whatsapp",
        platform_ad_id: `2385000${String(seq).padStart(4, "0")}${stamp % 100000}`,
        platform_set_id: "23850000000000071",
        platform_campaign_id: "23850000000000072",
        status: "made",
        intent: "on",
        platform_state: "ACTIVE",
        budget_kind: "total",
        budget_minor: 7000,
        budget_left_minor: 5000,
        budget_at: "set",
        budget_shared: false,
        ends_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
        approved: { service: "Consultation", miles: 5, total_minor: 7000, most_minor: 7000 },
        ...ad,
      })
      .select("*")
      .single(),
  );
  return { tenant, account, owner, operator, ad: row };
}

const keep = async (ws, change, over = {}) =>
  ok(
    await db.rpc("ad_change_keep", {
      p_tenant_id: ws.tenant,
      p_actor: ws.owner,
      p_ad_id: ws.ad.id,
      p_version: ws.ad.version,
      p_change: change,
      ...over,
    }),
  );
const told = async (ws, outcome, said = null) =>
  ok(
    await db.rpc("ad_change_told", {
      p_tenant_id: ws.tenant,
      p_ad_id: ws.ad.id,
      p_outcome: outcome,
      ...(said ? { p_said: said } : {}),
    }),
  );
const adOf = async (ws) => ok(await db.from("ads").select("*").eq("id", ws.ad.id).single());
const raise = (to = 9000) => ({ what: "total", total_minor: to, from_minor: 7000, expect_max_minor: to });

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const tenant of workspaces) await db.from("tenants").delete().eq("id", tenant);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the owner's change is kept with what Meta held, its version bumped, and the decision written",
  { skip },
  async () => {
    const ws = await workspace("keep");
    const kept = await keep(ws, raise());
    assert.deepEqual([kept.outcome, kept.version, kept.tell], ["asked", ws.ad.version + 1, true]);
    const ad = await adOf(ws);
    assert.deepEqual(
      [ad.change.what, ad.change.total_minor, ad.change.from_minor, ad.change.by, ad.version],
      ["total", 9000, 7000, ws.owner, ws.ad.version + 1],
    );
    assert.equal(ad.budget_minor, 7000, "nothing of what Meta holds moves until Meta takes it");
    const decisions = ok(await db.from("decisions").select("verb, payload").eq("subject_id", ws.ad.id));
    assert.deepEqual(
      decisions.map((one) => [one.verb, one.payload.what, one.payload.to, one.payload.most_minor]),
      [["change_ad", "total", 9000, 9000]],
    );
    const keptEvents = ok(await db.from("events").select("kind, data").eq("subject_id", ws.ad.id));
    assert.deepEqual(
      keptEvents.map((one) => [one.kind, one.data.what, one.data.to]),
      [["ad.change_asked", "total", 9000]],
      "the fact and its event, in one transaction",
    );
    // The same press again: answered once, changed once.
    assert.deepEqual((await keep(ws, raise())).outcome, "same");
    assert.equal(ok(await db.from("decisions").select("id").eq("subject_id", ws.ad.id)).length, 1);
  },
);

test("the owner alone; an ad made in Meta is not changed here", { skip }, async () => {
  const ws = await workspace("who");
  assert.equal((await keep(ws, raise(), { p_actor: ws.operator })).outcome, "not_allowed");
  const inMeta = await workspace("meta", { origin: "platform" });
  assert.equal((await keep(inMeta, raise())).outcome, "not_here");
  assert.equal((await adOf(ws)).change, null);
});

test("a press drawn from an old version, or from a total Meta no longer holds, is refused", { skip }, async () => {
  const ws = await workspace("stale");
  assert.equal((await keep(ws, raise(), { p_version: ws.ad.version + 5 })).outcome, "stale");
  assert.equal((await keep(ws, { ...raise(), from_minor: 6000 })).outcome, "stale");
  const ends = {
    what: "end_day",
    end_day: "2027-01-01",
    ends_at: "2027-01-02T04:59:00Z",
    from_ends_at: "2026-01-01T00:00:00Z",
  };
  assert.equal((await keep(ws, ends)).outcome, "stale");
  assert.equal((await adOf(ws)).change, null);
});

test("one change at a time, ending taking the place of any; four amounts an hour", { skip }, async () => {
  const ws = await workspace("one");
  await keep(ws, raise());
  const fresh = await adOf(ws);
  const next = { ...ws, ad: fresh };
  assert.equal((await keep(next, { what: "miles", miles: 8 })).outcome, "busy");
  assert.equal((await keep(next, { what: "end" })).outcome, "asked");
  assert.equal((await adOf(ws)).change.what, "end");

  const hour = await workspace("hour", {
    amounts_at: [10, 20, 30, 40].map((m) => new Date(Date.now() - m * 60_000).toISOString()),
  });
  const soon = await keep(hour, raise());
  assert.equal(soon.outcome, "amount_soon");
  assert.ok(Date.parse(soon.next_at) > Date.now(), "with when the next is taken");
});

test(
  "taken: the row says Meta's new total, what is left of it and what was approved, and an event says so",
  { skip },
  async () => {
    const ws = await workspace("taken");
    await keep(ws, raise());
    assert.equal(await told(ws, "told"), "told");
    const ad = await adOf(ws);
    assert.deepEqual(
      [ad.change, ad.budget_minor, ad.budget_left_minor, ad.approved.total_minor, ad.approved.most_minor],
      [null, 9000, 7000, 9000, 9000],
    );
    assert.equal(ad.amounts_at.length, 1);
    assert.ok(ad.told_at, "Meta's thirty seconds run from now");
    const events = ok(
      await db.from("events").select("kind, data").eq("subject_id", ws.ad.id).neq("kind", "ad.change_asked"),
    );
    assert.deepEqual(
      events.map((one) => [one.kind, one.data.what, one.data.to_minor]),
      [["ad.changed", "total", 9000]],
    );
  },
);

test(
  "refused: nothing changes, Meta's words are kept; no answer: kept as sent until it is settled",
  { skip },
  async () => {
    const refused = await workspace("refused");
    await keep(refused, raise());
    assert.equal(await told(refused, "refused", "The budget is too low for this schedule."), "refused");
    const ad = await adOf(refused);
    assert.deepEqual([ad.change, ad.budget_minor], [null, 7000]);
    const events = ok(
      await db.from("events").select("kind, data").eq("subject_id", refused.ad.id).neq("kind", "ad.change_asked"),
    );
    assert.deepEqual(
      events.map((one) => [one.kind, one.data.asked, one.data.said]),
      [["ad.press_refused", "total", "The budget is too low for this schedule."]],
    );

    const silent = await workspace("silent");
    await keep(silent, raise());
    assert.equal(await told(silent, "unknown"), "unknown");
    const sent = await adOf(silent);
    assert.ok(sent.change.sent_at, "kept as sent, with no answer");
    assert.equal((await keep({ ...silent, ad: sent }, { what: "miles", miles: 8 })).outcome, "unsure");
    // The read back found Meta did not take it.
    assert.equal(await told(silent, "not_taken"), "not_taken");
    assert.deepEqual([(await adOf(silent)).change, (await adOf(silent)).budget_minor], [null, 7000]);
  },
);

test(
  "a later last day and the miles are kept with what was approved; ending ends the ad, and nothing after",
  { skip },
  async () => {
    const ws = await workspace("end");
    const endsAt = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const day = endsAt.slice(0, 10);
    await keep(ws, { what: "end_day", end_day: day, ends_at: endsAt, from_ends_at: ws.ad.ends_at });
    await told(ws, "told");
    let ad = await adOf(ws);
    assert.deepEqual([Date.parse(ad.ends_at), ad.approved.end_day], [Date.parse(endsAt), day]);
    await keep({ ...ws, ad }, { what: "miles", miles: 8 });
    await told(ws, "told");
    ad = await adOf(ws);
    assert.equal(ad.approved.miles, 8);
    await keep({ ...ws, ad }, { what: "end" });
    await told(ws, "told");
    ad = await adOf(ws);
    assert.equal(ad.intent, "ended");
    assert.equal((await keep({ ...ws, ad }, raise())).outcome, "over");
    const kinds = ok(await db.from("events").select("kind").eq("subject_id", ws.ad.id)).map((one) => one.kind);
    const asked = Array.from({ length: 3 }, () => "ad.change_asked");
    assert.deepEqual(kinds.sort(), [...asked, "ad.changed", "ad.changed", "ad.ended"]);
    const verbs = ok(await db.from("decisions").select("verb").eq("subject_id", ws.ad.id)).map((one) => one.verb);
    assert.deepEqual(verbs.sort(), ["change_ad", "change_ad", "end_ad"]);
  },
);
