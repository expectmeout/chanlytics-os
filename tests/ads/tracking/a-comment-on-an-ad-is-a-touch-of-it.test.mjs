/**
 * A comment on an ad counts as a touch of that ad (00719; the whole-system plan of 28 Nov 2026, lane 6, item 7). 00719
 * built it and none had been seen arriving, since no ad was running: this runs the whole path, with Meta's webhook faked.
 *
 * One delivery, posted the way Meta posts one and signed with the app's secret, goes through the real Instagram door
 * (apps/edge/lib/instagram/webhook.ts) to the comment's keep (post-said.ts, packages/db keepPostComment), whose database
 * door is answered here as 00719's `post_comment_keep` answers (its SQL is held by tests/content/results/results.db.test.mjs
 * on a real Postgres). Then the readers the pages use read what was kept: who commented on each ad (packages/db
 * readAdCommenters), the Ads page's own read and model (server/readers/ads-page.ts, surfaces live/model.ts), and a
 * workspace's touches (listTouchesIn), which is what the one rule reads (the database's booking_sources, 00732: what
 * their booking is put down to is proved on a real database by tests/content/results/results.db.test.mjs).
 *
 * What must hold. The comment is kept once, on the ad Meta names, with its person. It is counted on that ad, where its
 * owner reads it. And the person is credited to it: a visit they book after it, inside the window, is put down to the ad.
 * A comment that names no ad of this workspace's on a post Chanlytics did not send is acknowledged and kept nowhere.
 *
 * The delivery is the shape Meta's own page gives a comment (Instagram webhooks, notification examples, read 28 Nov
 * 2026): `media.ad_id`, `ad_title` and `original_media_id` "included if the comment was on an ad post". The comment's
 * own id is `id`, as the first-post sitting saw one delivered (21 Nov 2026); that page's example writes `comment_id`.
 * No comment on a running ad has been seen arriving: which of `media.id` and `original_media_id` is the post Chanlytics
 * keeps, on an ad that shows one it sent, is Meta's to show (the door reads `media.id`; the ad is found either way).
 *
 * A made-up business throughout.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const IG_SECRET = "instagram-app-secret-for-this-file";
process.env.INSTAGRAM_APP_SECRET = IG_SECRET;
process.env.META_APP_SECRET = "meta-app-secret-for-this-file";
process.env.INSTAGRAM_VERIFY_TOKEN = "verify-token-for-this-file";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
for (const k of ["ANTHROPIC_API_KEY", "SUPABASE_URL", "EDGE_URL", "EDGE_CALL_SECRET", "DIAG_KEY", "VERCEL_ENV"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { instagramReceiver } = await import(at("apps/edge/lib/instagram/webhook.ts"));
const { readAdCommenters } = await import(at("packages/db/src/repositories/ads/engaged.ts"));
const { listTouchesIn } = await import(at("packages/db/src/repositories/content/touches.ts"));
const { adsPage } = await import(at("apps/dashboard/src/server/readers/ads-page.ts"));
const { readerContext, readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { liveModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/model.ts"));
const { sheetModel } = await import(at("apps/dashboard/src/surfaces/campaigns/ads/live/model/sheet.ts"));

const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});
beforeEach(() => readerCache.clear());

const DOOR = "https://edge.example.com/api/instagram";
const sign = (raw) => "sha256=" + crypto.createHmac("sha256", IG_SECRET).update(raw).digest("hex");
const receive = instagramReceiver(5);
/** A delivery as Meta posts it, signed. */
const deliver = (body) => {
  const raw = JSON.stringify(body);
  return receive(
    new Request(DOOR, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(raw) },
      body: raw,
    }),
  );
};

const TZ = "America/New_York";
const NOW = new Date();
const USER = "bbbbbbbb-7777-4bbb-8bbb-bbbbbbbbbbbb";
const pad = (n, width) => String(n).padStart(width, "0");
let seq = 0;

/**
 * One workspace with a connected Instagram account and a connected ad account holding one ad made in Meta, a boosted post
 * that opens no chat; every identifier its own (the channel resolver keeps a routing answer in module state).
 */
function world() {
  const i = ++seq;
  const T = `abababab-7777-4000-8000-${pad(i, 12)}`;
  const IG = `178414000007${pad(i, 5)}`;
  const AD = `adadadad-7777-4000-8000-${pad(i, 12)}`;
  const META_AD = `1202431124100${pad(i, 5)}`;
  const ACCOUNT = `acacacac-7777-4000-8000-${pad(i, 12)}`;
  const tables = {
    tenants: [{ id: T, name: "Harbor Studio", timezone: TZ, appointment_word: "appointment" }],
    memberships: [{ user_id: USER, tenant_id: T, role: "owner", created_at: "2026-01-01T00:00:00Z" }],
    tenant_config: [{ tenant_id: T, version: 1, config: {} }],
    tenant_channels: [
      {
        id: `cdcdcdcd-7777-4000-8000-${pad(i, 12)}`,
        tenant_id: T,
        kind: "instagram",
        external_id: IG,
        number_e164: null,
        credentials_ref: `ref-${i}`,
        config: {},
        status: "active",
      },
    ],
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: T,
        platform: "meta",
        external_id: `13000000000${pad(i, 5)}`,
        name: "Harbor ads",
        currency: "USD",
        timezone: TZ,
        status: "connected",
        standing: { account: "active", funding: "ok" },
        config: { page_name: "Harbor Studio", scopes: ["ads_read", "ads_management"] },
        connected_at: "2026-11-18T10:00:00Z",
        disconnected_at: null,
        revoked_at: null,
        read_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
        read_error: null,
      },
    ],
    ads: [
      {
        id: AD,
        tenant_id: T,
        account_id: ACCOUNT,
        platform: "meta",
        origin: "platform",
        door: "other",
        name: "Boost: first visit",
        platform_ad_id: META_AD,
        status: "made",
        intent: "on",
        version: 1,
        intent_at: null,
        told_at: null,
        platform_state: "ACTIVE",
        platform_issue: null,
        ends_at: null,
        budget_kind: null,
        budget_minor: null,
        budget_left_minor: null,
        budget_shared: null,
        created_at: "2026-11-20T00:00:00Z",
      },
    ],
    posts: [],
    touches: [],
    contacts: [],
    appointments: [],
    jobs: [],
    events: [],
    messages: [],
    conversations: [],
    contact_identities: [],
    escalations: [],
  };
  const asked = [];
  /**
   * `post_comment_keep`, as 00719 answers it: the ad Meta names where this workspace holds it, the post where Chanlytics
   * sent one, the person by their Instagram-scoped id (made by the comment when new), and the comment kept once as a
   * touch, on the post where there is one and on the ad otherwise.
   */
  const keep = (args) => {
    asked.push(args);
    const named = String(args.p_ad_id ?? "").trim();
    const ad = named
      ? tables.ads.find((row) => row.tenant_id === args.p_tenant_id && row.platform_ad_id === named)
      : undefined;
    const post = tables.posts.find((row) => row.tenant_id === args.p_tenant_id && row.external_id === args.p_media_id);
    if (!post && !ad) return { kept: false, why: "not_ours" };
    if (tables.touches.some((row) => row.tenant_id === args.p_tenant_id && row.provider_event_id === args.p_comment_id))
      return { kept: false, why: "again", ...(ad ? { ad_id: ad.id } : {}) };
    let person = tables.contacts.find((row) => row.tenant_id === args.p_tenant_id && row.instagram_id === args.p_from);
    const isNew = !person;
    if (!person) {
      person = {
        id: `c0c0c0c0-7777-4000-8000-${pad(tables.contacts.length + 1 + i * 100, 12)}`,
        tenant_id: args.p_tenant_id,
        instagram_id: args.p_from,
        display_name: args.p_username,
        wa_profile_name: null,
        phone_e164: null,
        email: null,
      };
      tables.contacts.push(person);
    }
    const touch = {
      id: `70707070-7777-4000-8000-${pad(tables.touches.length + 1 + i * 100, 12)}`,
      tenant_id: args.p_tenant_id,
      kind: "comment",
      subject_type: post ? "post" : "ad",
      subject_id: post ? post.id : ad.id,
      contact_id: person.id,
      conversation_id: null,
      message_id: null,
      place: "instagram",
      provider_event_id: args.p_comment_id,
      new_person: isNew,
      at: args.p_at ?? new Date().toISOString(),
      emptied_at: null,
      evidence: { words: args.p_words, username: args.p_username, ...(ad ? { ad: ad.id } : {}) },
      // The database in memory joins nothing: the person rides on the row, as the embed reads them.
      contacts: {
        display_name: person.display_name,
        wa_profile_name: null,
        phone_e164: null,
        email: null,
      },
    };
    tables.touches.push(touch);
    return {
      kept: true,
      touch_id: touch.id,
      ...(post ? { post_id: post.id } : {}),
      ...(ad ? { ad_id: ad.id } : {}),
      contact_id: person.id,
      new_person: isNew,
    };
  };
  const NO_COUNTS = { from: "2026-10-30", to: "2026-11-28", ads: [], unnamed: { people: 0, booked: 0 }, spend: [] };
  const db = fakeDb(
    tables,
    {},
    {
      post_comment_keep: keep,
      ads_page_counts: () => NO_COUNTS,
      ad_chats_kept: () => [],
      ad_people_back: () => ({ ads: [], unnamed: { people: 0, booked: 0 }, all: { people: 0, booked: 0 } }),
    },
  );
  setPg(db);
  /** A person's comment as Meta delivers it: on a post, and on the ad it was left on where Meta names one. */
  const comment = (id, from, over = {}) => ({
    object: "instagram",
    entry: [
      {
        id: IG,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "comments",
            value: {
              from: { id: from, username: `person.${from.slice(-3)}` },
              media: {
                id: "18103022591544444",
                media_product_type: "FEED",
                ad_id: META_AD,
                ad_title: "Boost",
                original_media_id: "18103022591544444",
              },
              id,
              text: "do you have openings friday?",
              ...over,
            },
          },
        ],
      },
    ],
  });
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  return {
    T,
    AD,
    META_AD,
    IG,
    tables,
    asked,
    db,
    comment,
    rc: readerContext(ctx, { tenantId: T, role: "owner" }, NOW),
  };
}

const PERSON = "990000000007001";
const OTHER = "990000000007002";

test("a comment Meta says was left on an ad is kept once, on that ad, with its person", async () => {
  const w = world();
  const res = await deliver(w.comment("18452487913130001", PERSON));
  assert.equal(res.status, 200, "acknowledged");
  // The keep's door was handed the ad Meta named, the post, the person, the comment and its words.
  assert.equal(w.asked.length, 1);
  const [args] = w.asked;
  assert.deepEqual(
    [args.p_tenant_id, args.p_account, args.p_ad_id, args.p_media_id, args.p_from, args.p_comment_id, args.p_words],
    [w.T, w.IG, w.META_AD, "18103022591544444", PERSON, "18452487913130001", "do you have openings friday?"],
  );
  // Kept as a touch of the ad: no post of Chanlytics' own is under it.
  assert.deepEqual(
    w.tables.touches.map((row) => [
      row.kind,
      row.subject_type,
      row.subject_id,
      row.place,
      row.new_person,
      row.evidence.ad,
    ]),
    [["comment", "ad", w.AD, "instagram", true, w.AD]],
  );
  assert.equal(w.tables.contacts.length, 1, "the person is made by the comment");
  // Meta sends a delivery again: the comment is kept once.
  assert.equal((await deliver(w.comment("18452487913130001", PERSON))).status, 200);
  assert.equal(w.tables.touches.length, 1);
  assert.equal(w.tables.jobs.filter((job) => job.kind === "comment_reply").length, 0, "no draft: its owner answers it");
});

test("it is counted on the ad: who commented, in the read, on the ad's row and in its drawer", async () => {
  const w = world();
  await deliver(w.comment("18452487913130011", PERSON));
  await deliver(w.comment("18452487913130012", OTHER));
  // The same person again, on another comment: a person is counted once.
  await deliver(w.comment("18452487913130013", PERSON));
  assert.equal(w.tables.touches.length, 3);
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const commenters = await readAdCommenters(w.db, w.T, since);
  assert.deepEqual([commenters?.size, commenters?.get(w.AD)?.count], [1, 2], "two people on the one ad");
  // The Ads page's own read carries them, and the page says them where the ad's people are not counted by a chat.
  const dto = (await adsPage.read(w.rc)).data;
  const ad = dto.ads.find((one) => one.id === w.AD);
  assert.equal(ad.commenters.count, 2);
  assert.deepEqual(ad.commenters.people.map((one) => one.name).sort(), ["person.001", "person.002"]);
  const said = { timezone: TZ, nowMs: NOW.getTime(), word: "appointment" };
  const vm = liveModel(dto, said);
  assert.equal(vm.rows.find((row) => row.id === w.AD).endSub, "2 commented");
  assert.deepEqual(
    vm.figures.find((figure) => figure.label === "Commented on ads"),
    { label: "Commented on ads", value: "2" },
  );
  assert.equal(sheetModel(dto, w.AD, said).commenters.count, 2, "and its drawer lists who");
});

test("the person's comment is a touch of the ad with their name on it: what a booking of theirs is put down to", async () => {
  const w = world();
  await deliver(w.comment("18452487913130021", PERSON));
  const [touch] = w.tables.touches;
  const since = new Date(Date.parse(touch.at) - 3_600_000).toISOString();
  const until = new Date(Date.parse(touch.at) + 3_600_000).toISOString();
  // The workspace's touches, as Reports and the one rule read them: the ad is among them, with its person and its time.
  const touches = await listTouchesIn(w.db, w.T, { since, until });
  assert.deepEqual(
    touches.map((one) => [one.kind, one.subject.type, one.subject.id, one.contact_id, one.at]),
    [["comment", "ad", w.AD, touch.contact_id, touch.at]],
  );
  assert.ok(touch.contact_id, "a touch with no person could be put down to nobody's booking");
});

test("a comment that names no ad of this workspace's, on a post Chanlytics did not send, is acknowledged and kept nowhere", async () => {
  const w = world();
  // No ad named at all, an ad this workspace does not hold, and an id that is no ad's.
  for (const [id, media] of [
    ["18452487913130031", { id: "18103022591544444", media_product_type: "FEED" }],
    ["18452487913130032", { id: "18103022591544444", media_product_type: "FEED", ad_id: "120243112419999999" }],
    ["18452487913130033", { id: "18103022591544444", media_product_type: "FEED", ad_id: "not an ad" }],
  ]) {
    const res = await deliver(w.comment(id, PERSON, { media }));
    assert.equal(res.status, 200, id);
  }
  assert.deepEqual([w.asked.length, w.tables.touches.length, w.tables.contacts.length], [3, 0, 0]);
  assert.deepEqual(
    w.asked.map((args) => args.p_ad_id ?? null),
    [null, "120243112419999999", null],
    "an id that is no ad's is never handed on as one",
  );
});
