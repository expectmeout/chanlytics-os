/**
 * 00685 on a real Postgres: a visit is worth its service's amount on the day it was booked, and the Ads page's counts
 * sum what an ad's bookings are worth (the Ads tracking plan's T6 and its call 5).
 *
 * What must hold. A visit is stamped with its service's amount when it is written, found by the service's name as the
 * owner reads it, and a later change of the amount never moves it; only a change of the visit's service stamps it
 * again. A service with a price note and no amount stamps nothing: a note is never read for a number. The page's worth
 * adds up from the visits that make an ad's people booked and nothing else: a cancelled visit, a request nobody
 * confirmed and a visit before the first touch are not in it. A visit written before its service had an amount takes
 * the first one the service is given, in the save that gives it, and its updated_at stays where it was. One whose
 * service has none is left out, and counted. Two currencies are two sums. The sums are read from the visits' own rows,
 * so a member who cannot read the settings reads the same sums as the owner. Runs against the database `supabase
 * start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

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

const SERVICES = [
  { name: "Cut", price_note: "from $45", amount_minor: 4500, currency: "USD" },
  { name: "Full Colour", price_note: "$120", amount_minor: 12000, currency: "USD" },
  { name: "Tinte", price_note: "40 EUR", amount_minor: 4000, currency: "EUR" },
  // A price note and no amount: never read for a number.
  { name: "Balayage", price_note: "from $180" },
  // A number with no currency is no amount.
  { name: "Gloss", amount_minor: 3000 },
];
const settingsOf = (services) => ({
  brain: { business_name: "Harbor Worth", system_prompt: "", fallbacks: {}, profile: { services } },
});

/** A workspace with its owner signed in, its services, and one connected ad account with one ad adopted. */
async function workspace(tag, services = SERVICES) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-worth-${tag}-${stamp}`, name: `Harbor Worth ${tag}` })
      .select("id")
      .single(),
  ).id;
  workspaces.push(tenant);
  const email = `ads-worth-${tag}-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role: "owner" }));
  const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await session.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, signedIn.error?.message);
  ok(await db.from("tenant_config").upsert({ tenant_id: tenant, config: settingsOf(services) }));
  const account = ok(
    await db
      .from("ad_accounts")
      .insert({
        tenant_id: tenant,
        platform: "meta",
        external_id: `1500${stamp}${++seq}`,
        name: "Harbor ads",
        currency: "USD",
        timezone: "America/New_York",
        status: "connected",
        next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single(),
  ).id;
  const platformAdId = `2385000000000${1000 + ++seq}`;
  ok(
    await db.rpc("ads_read_keep", {
      p_tenant_id: tenant,
      p_account_id: account,
      p_read: {
        account: {},
        next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
        ads: [
          {
            platform_ad_id: platformAdId,
            name: "Spring colour offer",
            door: "whatsapp",
            budget_kind: "total",
            budget_minor: 40000,
            budget_left_minor: 18000,
            budget_at: "set",
            budget_shared: false,
            ends_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
            platform_state: "ACTIVE",
            intent: "on",
          },
        ],
      },
    }),
  );
  const ad = ok(
    await db.from("ads").select("id").eq("tenant_id", tenant).eq("platform_ad_id", platformAdId).single(),
  ).id;
  return { tenant, session, ad, platformAdId };
}

/** Someone writes for the first time on WhatsApp after tapping the workspace's ad. */
async function arrive(ws) {
  seq += 1;
  const number = `+1555017${1000 + seq}`;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: ws.tenant,
      p_channel: "whatsapp",
      p_identity_external_id: number.slice(1),
      p_phone_e164: number,
      p_wa_profile_name: null,
      p_message_external_id: `worth.${stamp}.${seq}`,
      p_type: "text",
      p_body: "Hi, I saw your ad",
      p_channel_ts: null,
      p_media: null,
      p_meta: { raw_type: "text", referral: { source_id: ws.platformAdId, source_type: "ad" } },
      p_opt_out: false,
      p_opt_in: false,
    }),
  ).contact_id;
}

/** A visit written for a person: a day ahead unless `inHours` says otherwise. */
async function visit(ws, contactId, service, over = {}) {
  const inHours = over.inHours ?? 24;
  return ok(
    await db
      .from("appointments")
      .insert({
        tenant_id: ws.tenant,
        contact_id: contactId,
        source: "person",
        status: over.status ?? "booked",
        timezone: "America/New_York",
        service,
        starts_at: new Date(Date.now() + inHours * 3_600_000).toISOString(),
        ends_at: new Date(Date.now() + (inHours + 1) * 3_600_000).toISOString(),
      })
      .select("id, worth_minor, worth_currency")
      .single(),
  );
}
const worthOf = async (id) => {
  const row = ok(await db.from("appointments").select("worth_minor, worth_currency").eq("id", id).single());
  return [row.worth_minor, row.worth_currency];
};
const setServices = async (ws, services) => {
  const { version } = ok(await db.from("tenant_config").select("version").eq("tenant_id", ws.tenant).single());
  ok(
    await db
      .from("tenant_config")
      .update({ config: settingsOf(services), version: version + 1 })
      .eq("tenant_id", ws.tenant),
  );
};
const pageWorth = async (ws, as = db) => ok(await as.rpc("ads_page_counts", { p_tenant_id: ws.tenant })).worth;

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

test(
  "a visit is stamped with its service's amount when it is written, by the name as the owner reads it",
  { skip },
  async () => {
    const ws = await workspace("stamp");
    const person = await arrive(ws);
    const stamped = async (service) => {
      const made = await visit(ws, person, service);
      return [made.worth_minor, made.worth_currency];
    };
    assert.deepEqual(await stamped("Cut"), [4500, "USD"]);
    assert.deepEqual(await stamped("  full   COLOUR "), [12000, "USD"], "case and spacing aside");
    assert.deepEqual(await stamped("Tinte"), [4000, "EUR"]);
    assert.deepEqual(await stamped("Balayage"), [null, null], "a price note is never read for a number");
    assert.deepEqual(await stamped("Gloss"), [null, null], "a number with no currency is no amount");
    assert.deepEqual(await stamped("Something else"), [null, null]);
    assert.deepEqual(await stamped(null), [null, null]);
  },
);

test(
  "a later change of the amount never moves a visit; only a change of its service stamps it again",
  { skip },
  async () => {
    const ws = await workspace("keep");
    const person = await arrive(ws);
    const made = await visit(ws, person, "Cut");
    await setServices(ws, [{ name: "Cut", amount_minor: 6000, currency: "USD" }, SERVICES[1]]);
    assert.deepEqual(await worthOf(made.id), [4500, "USD"], "the amount on the day it was booked");
    ok(await db.from("appointments").update({ status: "kept" }).eq("id", made.id));
    ok(await db.from("appointments").update({ service: "Cut", note: "window seat" }).eq("id", made.id));
    assert.deepEqual(await worthOf(made.id), [4500, "USD"], "its service written again unchanged stamps nothing");
    assert.deepEqual((await visit(ws, person, "Cut")).worth_minor, 6000, "a visit written now takes the amount of now");
    ok(await db.from("appointments").update({ service: "Full Colour" }).eq("id", made.id));
    assert.deepEqual(await worthOf(made.id), [12000, "USD"], "another service is another worth");
    ok(await db.from("appointments").update({ service: "Balayage" }).eq("id", made.id));
    assert.deepEqual(await worthOf(made.id), [null, null]);
  },
);

test("a visit's worth is a pair or nothing", { skip }, async () => {
  const ws = await workspace("pair");
  const made = await visit(ws, await arrive(ws), "Cut");
  for (const patch of [
    { worth_currency: null },
    { worth_minor: null },
    { worth_minor: -1 },
    { worth_currency: "usd" },
  ]) {
    const res = await db.from("appointments").update(patch).eq("id", made.id);
    assert.equal(res.error?.code, "23514", JSON.stringify(patch));
  }
});

test(
  "the page's worth adds up from the visits that make an ad's people booked, a sum a currency",
  { skip },
  async () => {
    const ws = await workspace("sum");
    const [one, two, three, four] = [await arrive(ws), await arrive(ws), await arrive(ws), await arrive(ws)];
    await visit(ws, one, "Cut"); // 45
    await visit(ws, one, "Full Colour", { inHours: 48 }); // 120: every visit they booked counts
    await visit(ws, two, "Tinte"); // 40 EUR
    await visit(ws, two, "Balayage"); // no amount: left out
    await visit(ws, three, "Cut", { status: "cancelled" }); // not booked
    await visit(ws, three, "Cut", { status: "proposed" }); // only asked for
    await visit(ws, four, "Cut", { inHours: -48 }); // before they first wrote
    const worth = await pageWorth(ws);
    assert.deepEqual(worth, [
      {
        ad_id: ws.ad,
        sums: [
          { currency: "EUR", minor: 4000 },
          { currency: "USD", minor: 16500 },
        ],
        visits: 3,
        left_out: 1,
      },
    ]);
    assert.deepEqual(await pageWorth(ws, ws.session), worth, "the owner reads the same under their own row rules");
    // The counts beside it are untouched: four came, two booked.
    const page = ok(await db.rpc("ads_page_counts", { p_tenant_id: ws.tenant }));
    assert.deepEqual(page.ads, [{ ad_id: ws.ad, people: 4, booked: 2 }]);
  },
);

test(
  "a visit written before its service had an amount takes the first one the service is given",
  { skip },
  async () => {
    const ws = await workspace("late", [{ name: "Cut", price_note: "from $45" }]);
    const person = await arrive(ws);
    const made = await visit(ws, person, "Cut");
    const old = await visit(ws, person, "Cut", { inHours: -100 * 24, status: "kept" });
    assert.deepEqual([made.worth_minor, made.worth_currency], [null, null]);
    assert.deepEqual(await pageWorth(ws), [{ ad_id: ws.ad, sums: [], visits: 0, left_out: 1 }]);
    const updatedAt = async () =>
      ok(await db.from("appointments").select("updated_at").eq("id", made.id).single()).updated_at;
    const before = await updatedAt();
    // The owner saves the amount on their own session: the save reaches the visit, which no member may write.
    const refused = await ws.session
      .from("appointments")
      .update({ worth_minor: 1, worth_currency: "USD" })
      .eq("id", made.id)
      .select("id");
    assert.ok(refused.error || refused.data.length === 0, "a member writes no visit's worth");
    const version = ok(await db.from("tenant_config").select("version").eq("tenant_id", ws.tenant).single()).version;
    ok(
      await ws.session
        .from("tenant_config")
        .update({
          config: settingsOf([{ name: "Cut", price_note: "from $45", amount_minor: 4500, currency: "USD" }]),
          version: version + 1,
        })
        .eq("tenant_id", ws.tenant),
    );
    assert.deepEqual(await worthOf(made.id), [4500, "USD"]);
    assert.equal(await updatedAt(), before, "the stamp is no change to the visit: updated_at stays");
    assert.deepEqual(await worthOf(old.id), [null, null], "a visit older than ninety days is left as it was");
    assert.deepEqual(await pageWorth(ws), [
      { ad_id: ws.ad, sums: [{ currency: "USD", minor: 4500 }], visits: 1, left_out: 0 },
    ]);
    // A changed amount moves no visit that has a worth, and a change of the visit's service still moves updated_at.
    await setServices(ws, [{ name: "Cut", amount_minor: 7000, currency: "USD" }, SERVICES[1]]);
    assert.deepEqual(await worthOf(made.id), [4500, "USD"]);
    ok(await db.from("appointments").update({ service: "Full Colour" }).eq("id", made.id));
    assert.deepEqual(await worthOf(made.id), [12000, "USD"]);
    assert.notEqual(await updatedAt(), before);
  },
);

test("an ad nobody booked from has no worth, and no session may call the stamps' own helpers", { skip }, async () => {
  const ws = await workspace("none");
  await arrive(ws);
  assert.deepEqual(await pageWorth(ws), []);
  const other = await workspace("other");
  assert.equal(ok(await other.session.rpc("ads_page_counts", { p_tenant_id: ws.tenant })), null);
  for (const session of [ws.session, other.session]) {
    assert.notEqual((await session.rpc("service_amounts", { p_tenant_id: ws.tenant })).error, null);
    assert.notEqual((await session.rpc("service_key", { p_name: "Cut" })).error, null);
  }
});
