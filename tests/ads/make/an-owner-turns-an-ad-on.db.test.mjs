/**
 * 00666 on a real Postgres: an owner turns an ad on (decision 0050, calls 2, 3, 5, 6 and 11; the Ads plan's 4.7).
 *
 * What must hold. The kept draft, as the press judged it, becomes one ad made here, setting up, with the decision, the
 * event and the account's job asked for at once, and the draft gone. The same press twice is one ad; a draft changed
 * since the press judged it is refused; one ad of an account is set up at a time; the owner alone; nothing while AI is
 * stopped. The launch's door keeps what was made step by step, ends a launch once, and keeps a part made after a stop
 * as left. A disconnect stops a launch on its way, what it made left at Meta. A tap on any version of an ad made here
 * names the one ad, and the bell's "nobody wrote" hears it. Runs against the database `supabase start` builds on this
 * machine, never production.
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

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** What the edge hands the door: the ad as the press approved it. */
const AD = {
  name: "First visit",
  total_minor: 7500,
  ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  approved: { service: "Consultation", most_minor: 7500, declared: "none" },
  shown_on: ["facebook"],
  said: { headline: "First visit", body: "Message Harbor Studio on WhatsApp." },
};

async function member(tenant, role, tag) {
  const made = await db.auth.admin.createUser({
    email: `ads-turn-on-${role}-${tag}-${stamp}@example.com`,
    password: `pw-${Math.random().toString(36).slice(2)}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  return made.data.user.id;
}

/** A workspace with a connected ad account, its owner and an operator, and a draft kept. */
async function workspace(tag) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-on-${tag}-${stamp}`, name: `Harbor On ${tag}` })
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
        external_id: `act-on-${tag}-${stamp}`,
        currency: "USD",
        status: "connected",
      })
      .select("id")
      .single(),
  ).id;
  const owner = await member(tenant, "owner", tag);
  const operator = await member(tenant, "operator", tag);
  const draft = ok(
    await db
      .from("ad_drafts")
      .insert({ tenant_id: tenant, account_id: account, draft: { service: "Consultation" }, kept_by: owner })
      .select("updated_at")
      .single(),
  );
  return { tenant, account, owner, operator, draftAt: draft.updated_at };
}

const turnOn = async (ws, over = {}) =>
  ok(
    await db.rpc("ad_turn_on", {
      p_tenant_id: ws.tenant,
      p_actor: ws.owner,
      p_key: crypto.randomUUID(),
      p_draft_at: ws.draftAt,
      p_ad: AD,
      ...over,
    }),
  );
const adOf = async (id) => ok(await db.from("ads").select("*").eq("id", id).single());
const keepStep = async (ws, adId, kept) =>
  ok(await db.rpc("ad_launch_keep", { p_tenant_id: ws.tenant, p_ad_id: adId, p_kept: kept }));

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
  "the kept draft becomes one ad, setting up, with the decision, the event and the account's job; the draft goes",
  { skip },
  async () => {
    const ws = await workspace("one");
    const key = crypto.randomUUID();
    const kept = await turnOn(ws, { p_key: key });
    assert.equal(kept.outcome, "kept");
    const ad = await adOf(kept.ad_id);
    assert.deepEqual(
      [
        ad.origin,
        ad.status,
        ad.intent,
        ad.name,
        ad.door,
        ad.budget_kind,
        ad.budget_minor,
        ad.budget_shared,
        ad.platform_ad_id,
      ],
      ["chanlytics", "sending", "on", "First visit", "whatsapp", "total", 7500, false, null],
    );
    assert.deepEqual(
      [ad.launch.key, ad.launch.step, ad.shown_on, ad.approved.most_minor],
      [key, "make", ["facebook"], 7500],
    );
    assert.deepEqual(
      ok(await db.from("ad_drafts").select("id").eq("tenant_id", ws.tenant)),
      [],
      "the draft is the ad now",
    );
    const decisions = ok(await db.from("decisions").select("verb, actor_user_id, payload").eq("subject_id", ad.id));
    assert.deepEqual(
      decisions.map((row) => [row.verb, row.actor_user_id, row.payload.total_minor]),
      [["turn_on_ad", ws.owner, 7500]],
    );
    const events = ok(await db.from("events").select("kind").eq("subject_id", ad.id));
    assert.deepEqual(
      events.map((row) => row.kind),
      ["ad.turned_on"],
    );
    const jobs = ok(await db.from("jobs").select("kind, payload").eq("tenant_id", ws.tenant).eq("kind", "ad_read"));
    assert.deepEqual(
      jobs.map((row) => row.payload.account_id),
      [ws.account],
      "the account's job, asked for at once",
    );
    // The same press again: the one ad, never a second.
    assert.deepEqual(await turnOn(ws, { p_key: key }), { outcome: "same", ad_id: ad.id, status: "sending" });
    assert.equal(ok(await db.from("ads").select("id").eq("tenant_id", ws.tenant)).length, 1);
  },
);

test(
  "a draft changed since, another launch on its way, AI stopped, or anyone but the owner: refused, nothing kept",
  { skip },
  async () => {
    const ws = await workspace("no");
    assert.equal(
      (await turnOn(ws, { p_draft_at: new Date(Date.parse(ws.draftAt) - 1000).toISOString() })).outcome,
      "stale",
    );
    assert.equal((await turnOn(ws, { p_actor: ws.operator })).outcome, "not_allowed");
    ok(await db.from("tenants").update({ sending_stopped_at: new Date().toISOString() }).eq("id", ws.tenant));
    assert.equal((await turnOn(ws)).outcome, "stopped");
    ok(await db.from("tenants").update({ sending_stopped_at: null }).eq("id", ws.tenant));
    assert.deepEqual(ok(await db.from("ads").select("id").eq("tenant_id", ws.tenant)), []);
    assert.equal((await turnOn(ws)).outcome, "kept");
    // The draft went with the first: a second press of another key finds none.
    assert.equal((await turnOn(ws)).outcome, "busy", "one launch an account at a time");
  },
);

test(
  "the launch's door keeps each part, ends a launch once, and keeps a part made after a stop as left",
  { skip },
  async () => {
    const ws = await workspace("keep");
    const { ad_id: adId } = await turnOn(ws);
    const part = (kind, version, state, platformId) => ({
      kind,
      version,
      name: `Chanlytics · First visit [cl:x]`,
      state,
      platform_id: platformId,
    });
    assert.equal((await keepStep(ws, adId, { objects: [part("campaign", 0, "sent")] })).status, "sending");
    await keepStep(ws, adId, { objects: [part("campaign", 0, "made", "23850000000000901")] });
    for (const [n, id] of [
      [1, "23850000000000911"],
      [2, "23850000000000912"],
    ])
      await keepStep(ws, adId, { objects: [part("ad", n, "made", id)] });
    const made = await keepStep(ws, adId, {
      status: "made",
      campaign_id: "23850000000000901",
      set_id: "23850000000000902",
      platform_ad_id: "23850000000000911",
      platform_state: "PENDING_REVIEW",
      launch: { step: "done", unknown_at: new Date().toISOString() },
    });
    assert.equal(made.status, "made");
    const ad = await adOf(adId);
    assert.deepEqual(
      [ad.platform_ad_id, ad.platform_state, ad.launch.step],
      ["23850000000000911", "PENDING_REVIEW", "done"],
    );
    // Once made, made: a later keep cannot fail it.
    assert.equal((await keepStep(ws, adId, { status: "failed" })).status, "made");
    // A tap on the second version names the one ad.
    const held = ok(
      await db.rpc("ad_held_for", {
        p_tenant_id: ws.tenant,
        p_platform: "meta",
        p_platform_ad_id: "23850000000000912",
      }),
    );
    assert.equal(held, adId);
    const events = ok(await db.from("events").select("kind").eq("subject_id", adId).order("created_at"));
    assert.deepEqual(
      events.map((row) => row.kind),
      ["ad.turned_on", "ad.made"],
    );
    // A read of it settles a last switch nobody answered.
    ok(
      await db.rpc("ads_read_keep", {
        p_tenant_id: ws.tenant,
        p_account_id: ws.account,
        p_read: {
          account: {},
          ads: [
            {
              platform_ad_id: "23850000000000911",
              name: "x",
              door: "whatsapp",
              platform_state: "ACTIVE",
              intent: "on",
              shown_on: ["facebook"],
            },
          ],
          next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
      }),
    );
    const read = await adOf(adId);
    assert.deepEqual([read.platform_state, read.name, "unknown_at" in read.launch], ["ACTIVE", "First visit", false]);
  },
);

test("a disconnect stops a launch on its way, and what it made is left at Meta", { skip }, async () => {
  const ws = await workspace("gone");
  const { ad_id: adId } = await turnOn(ws);
  await keepStep(ws, adId, {
    objects: [{ kind: "campaign", version: 0, name: "c [cl:x]", state: "made", platform_id: "23850000000000951" }],
  });
  ok(await db.rpc("ad_account_disconnect", { p_tenant_id: ws.tenant, p_actor: ws.owner, p_account_id: ws.account }));
  const ad = await adOf(adId);
  assert.deepEqual([ad.status, ad.launch.stopped], ["failed", "disconnected"]);
  // Meta's answer to a make sent just before it lands after: kept as left there.
  const after = await keepStep(ws, adId, {
    objects: [{ kind: "set", version: 0, name: "s [cl:x]", state: "made", platform_id: "23850000000000952" }],
  });
  assert.equal(after.status, "failed");
  const parts = ok(await db.from("ad_objects").select("kind, state").eq("ad_id", adId).order("kind"));
  assert.deepEqual(
    parts.map((row) => [row.kind, row.state]),
    [
      ["campaign", "left"],
      ["set", "left"],
    ],
  );
  const events = ok(await db.from("events").select("kind, data").eq("subject_id", adId).eq("kind", "ad.setup_stopped"));
  assert.deepEqual(
    events.map((row) => row.data.why),
    ["disconnected"],
  );
});
