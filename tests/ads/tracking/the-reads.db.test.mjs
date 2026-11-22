/**
 * 00678 on a real Postgres: a conversation's ad, Meta's count beside Chanlytics', and the people an ad brought back (the
 * Ads tracking plan's T1, T2 and T3). The messages arrive through ingest_inbound, so the entries are the first-touch
 * trigger's own, new person and known one as the database judges them.
 *
 * What must hold. Meta's chats over the days it has settled stand beside the entries kept on them, for an ad whose chat
 * the workspace hears, and never for one that opens Messenger or an Instagram account it does not hear. A known person
 * who writes from an ad is counted once for it, and booked after only for a visit asked for in the chat and confirmed,
 * or one a member added, made after the message; never for one read in from a calendar, and never the ad's own new
 * person. A thread's messages say the ad they came from, and a first touch its ad, named as every page names it. A
 * member reads all three for their own workspace and nothing of another's. Runs against the database `supabase start`
 * builds on this machine, never production.
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
      ? "refusing a database that is not on this machine: this suite writes workspaces, people, messages and ads"
      : false;

const ZONE = "America/New_York";
const stamp = Date.now();
const users = [];
const workspaces = [];
let db;
let seq = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const adMeta = (id) => ({ raw_type: "text", referral: { source_id: id, source_type: "ad" } });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const id of workspaces) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A workspace in New York with its owner signed in, a connected ad account, and the WhatsApp number it hears. */
async function workspace(tag) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-tracking-${tag}-${stamp}`, name: `Harbor Tracking ${tag}`, timezone: ZONE })
      .select("id")
      .single(),
  ).id;
  workspaces.push(tenant);
  const email = `ads-tracking-${tag}-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role: "owner" }));
  const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await session.auth.signInWithPassword({ email, password });
  assert.equal(signedIn.error, null, signedIn.error?.message);
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
        // Not due: the ads clock hands this account no read while the suite runs.
        next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select("id")
      .single(),
  ).id;
  ok(
    await db
      .from("tenant_channels")
      .insert({ tenant_id: tenant, kind: "whatsapp", external_id: `wa-${stamp}-${seq}`, status: "active" }),
  );
  return { tenant, session, account };
}

/** Ads adopted for the account, as a read keeps them: the platform's id and the door a tap opens. */
async function adopt(ws, ads) {
  ok(
    await db.rpc("ads_read_keep", {
      p_tenant_id: ws.tenant,
      p_account_id: ws.account,
      p_read: {
        account: {},
        next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
        ads: ads.map(([platformAdId, door]) => ({
          platform_ad_id: platformAdId,
          name: `Ad ${platformAdId}`,
          door,
          budget_kind: "total",
          budget_minor: 40000,
          budget_left_minor: 18000,
          budget_at: "set",
          budget_shared: false,
          ends_at: inDays(10),
          platform_state: "ACTIVE",
          intent: "on",
        })),
      },
    }),
  );
  const rows = ok(await db.from("ads").select("id, platform_ad_id").eq("tenant_id", ws.tenant));
  return Object.fromEntries(rows.map((row) => [row.platform_ad_id, row.id]));
}

/** Meta's day for an ad: its count of chats, settled. */
const metaDay = (ws, adId, chats) =>
  db
    .from("ad_days")
    .insert({ tenant_id: ws.tenant, ad_id: adId, day: today(), platform_results: chats, settled: true });

/** Someone writes, as the edge takes a message in: from an ad where `ad` names one. Answers their person and message. */
async function writes(ws, number, ad = null) {
  seq += 1;
  return ok(
    await db.rpc("ingest_inbound", {
      p_tenant_id: ws.tenant,
      p_channel: "whatsapp",
      p_identity_external_id: number.slice(1),
      p_phone_e164: number,
      p_wa_profile_name: null,
      p_message_external_id: `tracking.${stamp}.${seq}`,
      p_type: "text",
      p_body: ad ? "Hi, I saw your ad" : "Hello",
      p_channel_ts: null,
      p_media: null,
      p_meta: ad ? adMeta(ad) : { raw_type: "text" },
      p_opt_out: false,
      p_opt_in: false,
    }),
  );
}

/** A visit of theirs, starting tomorrow, from a source, in a status. */
const visit = (ws, contactId, source, status = "booked") =>
  db.from("appointments").insert({
    tenant_id: ws.tenant,
    contact_id: contactId,
    source,
    status,
    starts_at: inDays(1),
    ends_at: inDays(1.05),
    timezone: ZONE,
  });

test(
  "Meta's settled chats stand beside the entries kept, only for an ad whose chat the workspace hears",
  { skip },
  async () => {
    const ws = await workspace("chats");
    const ids = await adopt(ws, [
      [`wa${stamp}`, "whatsapp"],
      [`ig${stamp}`, "instagram"],
      [`ms${stamp}`, "messenger"],
    ]);
    ok(await metaDay(ws, ids[`wa${stamp}`], 12));
    ok(await metaDay(ws, ids[`ig${stamp}`], 40));
    ok(await metaDay(ws, ids[`ms${stamp}`], 40));
    for (const n of [1, 2, 3]) await writes(ws, `+1555016${String(n).padStart(4, "0")}`, `wa${stamp}`);

    const read = ok(await db.rpc("ad_chats_kept", { p_tenant_id: ws.tenant, p_days: 30 }));
    assert.equal(read.length, 1, "neither the Instagram account nobody hears nor Messenger is compared");
    assert.deepEqual(
      { ...read[0] },
      { ad_id: ids[`wa${stamp}`], name: `Ad wa${stamp}`, meta: 12, kept: 3, through: today() },
    );
    // The owner reads the same; another workspace's owner reads none of it.
    assert.deepEqual(ok(await ws.session.rpc("ad_chats_kept", { p_tenant_id: ws.tenant, p_days: 30 })), read);
    const other = await workspace("chats-other");
    assert.deepEqual(ok(await other.session.rpc("ad_chats_kept", { p_tenant_id: ws.tenant, p_days: 30 })), []);
  },
);

test(
  "a known person who writes from an ad is brought back once, and booked after only by a visit made in or for the chat",
  { skip },
  async () => {
    const ws = await workspace("back");
    const ids = await adopt(ws, [[`wb${stamp}`, "whatsapp"]]);
    const ad = `wb${stamp}`;
    // Known before the ad: each wrote once first. Then each writes from the ad, one of them twice.
    const asked = await writes(ws, "+15550170001");
    const fed = await writes(ws, "+15550170002");
    const proposed = await writes(ws, "+15550170003");
    await writes(ws, "+15550170001", ad);
    await writes(ws, "+15550170001", ad);
    await writes(ws, "+15550170002", ad);
    await writes(ws, "+15550170003", ad);
    // A new person the ad brought, who books: the ad's own new person, never brought back by it.
    const fresh = await writes(ws, "+15550170009", ad);
    ok(await visit(ws, asked.contact_id, "receptionist"));
    ok(await visit(ws, fed.contact_id, "calendar_feed"));
    ok(await visit(ws, proposed.contact_id, "receptionist", "proposed"));
    ok(await visit(ws, fresh.contact_id, "receptionist"));

    const back = ok(await db.rpc("ad_people_back", { p_tenant_id: ws.tenant, p_days: 30 }));
    assert.deepEqual(back.ads, [{ ad_id: ids[ad], people: 3, booked: 1 }]);
    assert.deepEqual(back.unnamed, { people: 0, booked: 0 });
    assert.deepEqual(back.all, { people: 3, booked: 1 });
    // The first line is the people the ad brought, the new one alone, untouched by the second.
    const counts = ok(await db.rpc("ads_page_counts", { p_tenant_id: ws.tenant, p_days: 30 }));
    assert.deepEqual(counts.ads, [{ ad_id: ids[ad], people: 1, booked: 1 }]);
    assert.deepEqual(ok(await ws.session.rpc("ad_people_back", { p_tenant_id: ws.tenant, p_days: 30 })), back);
  },
);

test(
  "a thread's messages say the ad they came from, and a first touch its ad, by this workspace alone",
  { skip },
  async () => {
    const ws = await workspace("touches");
    const ad = `wt${stamp}`;
    const ids = await adopt(ws, [[ad, "whatsapp"]]);
    const plain = await writes(ws, "+15550180001");
    const fromAd = await writes(ws, "+15550180001", ad);
    const fresh = await writes(ws, "+15550180002", ad);
    const firstTouch = ok(await db.from("contacts").select("acquired_ref").eq("id", fresh.contact_id).single());

    const read = ok(
      await ws.session.rpc("ad_touches_of", {
        p_tenant_id: ws.tenant,
        p_messages: [plain.message_id, fromAd.message_id],
        p_refs: [firstTouch.acquired_ref],
      }),
    );
    assert.deepEqual(read.touches, [{ message_id: fromAd.message_id, ref: `meta:${ad}` }]);
    const named = new Map(read.named.map((row) => [row.ref, row]));
    assert.deepEqual({ ...named.get(`meta:${ad}`) }, { ref: `meta:${ad}`, ad_id: ids[ad], name: `Ad ${ad}` });
    assert.equal(named.get(firstTouch.acquired_ref).ad_id, ids[ad], "a first touch names the ad Chanlytics holds");
    const other = await workspace("touches-other");
    const theirs = ok(
      await other.session.rpc("ad_touches_of", {
        p_tenant_id: ws.tenant,
        p_messages: [fromAd.message_id],
        p_refs: [firstTouch.acquired_ref],
      }),
    );
    assert.deepEqual(theirs.touches, [], "another workspace reads no entry of this one's");
    assert.equal(theirs.named[0]?.ad_id ?? null, null, "nor any ad of it");
  },
);
