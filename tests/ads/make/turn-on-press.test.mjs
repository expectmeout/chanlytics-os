/**
 * Turn on's press, as its route answers it (apps/dashboard/src/server/ads/turn-on.ts requestTurnOn; decision 0050, calls 2,
 * 3 and 11; the Ads plan's 4.7), over a workspace in memory with a kept draft, and the edge a stubbed fetch that keeps
 * what it is handed. Nothing reaches Meta: the route has no way to.
 *
 * What must hold. The press carries what it showed, and the kept draft is judged afresh: a press drawn from an older
 * amount, end, picture or words is refused, so the owner can only press the number the server would have named. Every
 * check before Turn on runs again at the press. While AI is stopped nothing is turned on. The owner alone. What the edge
 * is handed is the draft as judged: the most it can cost worked out in one place, the moment the draft was kept, and
 * the press's own key.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DAY_MS } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-the-press";
process.env.EDGE_URL = "https://edge.example.com";
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { requestTurnOn } = await import(at("apps/dashboard/src/server/ads/turn-on.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
const { AdTurnOnBodySchema } = await import(at("apps/dashboard/src/server/ads/draft-shape.ts"));

const USER = "b0b0b0b0-9999-4000-8000-000000000001";
const ACCOUNT = "c0c0c0c0-9999-4000-8000-000000000001";
const PHOTO = "f0f0f0f0-9999-4000-8000-000000000001";
const KEY = "e0e0e0e0-9999-4000-8000-000000000001";
const KEPT_AT = "2026-11-20T21:00:00.123456+00:00";
const TZ = "America/New_York";
/**
 * A day in the business's zone, whole days from today there, as a draft's end is written. The press counts the days it
 * has left from today (draft-checks.ts), so the draft ends eleven days on: $75 is over Meta's least at $5 a day and
 * under it at $9, whatever the hour. It ended on 3 Dec 2026, and $9 a day stopped it only until New York's midnight on
 * the 26th.
 */
const dayOn = (days) => new Date(Date.now() + days * DAY_MS).toLocaleDateString("en-CA", { timeZone: TZ });
const END_DAY = dayOn(11);

const WORDS = [
  {
    headline: "Your first visit",
    text: "A first visit at Harbor Studio takes 45 minutes. Message us on WhatsApp to pick a time.",
  },
  { headline: "Harbor Studio", text: "First visits at Harbor Studio, 45 minutes. Message us on WhatsApp for a time." },
  { headline: "First visit", text: "45 minutes at Harbor Studio. Message us on WhatsApp to book." },
];
/** The kept draft: three versions of words, a photo, five miles, $75 over the eleven days from today. */
const DRAFT = {
  service: "Consultation",
  label: "First visit",
  picture: PHOTO,
  miles: 5,
  total_minor: 7500,
  end_day: END_DAY,
  versions: WORDS,
  answers: {},
};
/** What the press shows of that draft. */
const SHOWN = {
  service: DRAFT.service,
  picture: PHOTO,
  miles: 5,
  most_minor: 7500,
  end_day: DRAFT.end_day,
  versions: WORDS,
};

/** Harbor Studio with an ad account connected, its photo in Files, and its draft kept. */
function tablesOf(tenantId, over = {}) {
  return {
    memberships: [
      {
        user_id: USER,
        tenant_id: tenantId,
        role: "owner",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    tenants: [
      {
        id: tenantId,
        name: "Harbor",
        timezone: TZ,
        appointment_word: "appointment",
        sending_stopped_at: null,
        ...over.tenant,
      },
    ],
    tenant_config: [
      {
        tenant_id: tenantId,
        version: 1,
        config: {
          brain: {
            business_name: "Harbor Studio",
            system_prompt: "Answer as the front desk of Harbor Studio, warmly and in a few words.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: {
              address: "12 Harbor St, Miami",
              services: [{ name: "Consultation", duration_min: 45 }],
              guardrails: { never_quote_prices: false },
            },
          },
          ...over.config,
        },
      },
    ],
    tenant_channels: over.channels ?? [
      {
        id: "ch-wa",
        tenant_id: tenantId,
        kind: "whatsapp",
        status: "active",
        number_e164: "+13055550142",
        config: { standing: { can_send: over.canSend ?? "AVAILABLE", problems: [] } },
      },
    ],
    ad_accounts: [
      {
        id: ACCOUNT,
        tenant_id: tenantId,
        platform: "meta",
        external_id: "1000000000000091",
        name: "Harbor ads",
        currency: "USD",
        timezone: TZ,
        status: "connected",
        standing: { account: "active", funding: "ok" },
        config: {
          page_id: "2000000000000092",
          page_name: "Harbor Studio",
          min_daily_minor: 500,
          scopes: ["ads_read", "ads_management"],
        },
        connected_at: "2026-11-18T10:00:00Z",
        read_at: "2026-11-20T20:00:00Z",
        read_error: null,
        ...over.account,
      },
    ],
    ads: [],
    files: [
      {
        id: PHOTO,
        tenant_id: tenantId,
        status: "filed",
        source: "upload",
        name: "front-desk",
        mime: over.mime ?? "image/jpeg",
        kind: over.mime?.startsWith("video/") ? "video" : "image",
        bytes: 200_000,
        width: 1440,
        height: 1800,
        seconds: over.mime?.startsWith("video/") ? 12 : null,
        sound: over.mime?.startsWith("video/") ? { music: false } : null,
        look: { line: "The front desk.", people: { count: 0, recognizable: 0 }, issues: [] },
        look_status: "done",
        shows: "interior",
        who_in_it: "not_asked",
        removed_at: null,
        copy_state: "here",
        created_at: "2026-11-10T10:00:00Z",
        updated_at: "2026-11-10T10:00:00Z",
      },
    ],
    appointments: [],
    ad_drafts: [
      {
        id: "d0d0d0d0-9999-4000-8000-000000000001",
        tenant_id: tenantId,
        account_id: ACCOUNT,
        draft: { ...DRAFT, ...over.draft },
        kept_by: USER,
        created_at: "2026-11-20T20:00:00Z",
        updated_at: KEPT_AT,
      },
    ],
  };
}

/** What the edge's doors were handed, and how the turn-on door answers. */
let handed;
let edgeSays;
let writes;
/**
 * What Meta answers about the number at the press, as the edge's standing door does: its word, kept on the channel the
 * draft reads (the last press's tables), and how often it was asked.
 */
let metaSays;
let asked;
let current;
const real = globalThis.fetch;
beforeEach(() => {
  handed = [];
  writes = "live";
  metaSays = () => ({ status: 200, canSend: "AVAILABLE" });
  asked = 0;
  edgeSays = () => ({
    status: 202,
    body: { ok: true, outcome: "kept", ad_id: "a0a0a0a0-9999-4000-8000-000000000001" },
  });
  readerCache.clear();
  forgetFeeds();
  globalThis.fetch = async (url, init) => {
    const where = String(url);
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (where.endsWith("/api/admin/ads/account"))
      return json(200, {
        ok: true,
        ready: true,
        on: true,
        writes,
        app: { client_id: "1", config_id: "2", redirect_uri: "https://app.example.com/cb" },
      });
    if (where.endsWith("/api/admin/whatsapp/standing")) {
      asked += 1;
      const said = metaSays();
      if (said.status !== 200) return json(said.status, { ok: false, error: said.error ?? "meta_failed" });
      for (const line of current.tenant_channels) line.config = { standing: { can_send: said.canSend, problems: [] } };
      return json(200, { ok: true, kept: "changed", can_send: said.canSend });
    }
    if (where.endsWith("/api/admin/ads/turn-on")) {
      handed.push(JSON.parse(String(init?.body ?? "{}")));
      const said = edgeSays();
      return json(said.status, said.body);
    }
    throw new Error(`nothing else is reachable: ${where}`);
  };
});
after(() => {
  globalThis.fetch = real;
});

/** A workspace no two tests share (the edge's word is kept a while per workspace), with its member signed in. */
let seat = 0;
function press(over = {}, role = "owner") {
  seat += 1;
  const tenantId = `a0a0a0a0-9999-4000-8000-${String(seat).padStart(12, "0")}`;
  const tables = tablesOf(tenantId, over);
  current = tables;
  const db = fakeDb(
    tables,
    {},
    {
      ads_page_counts: () => ({
        from: "2026-10-22",
        to: "2026-11-20",
        ads: [],
        unnamed: { people: 0, booked: 0 },
        spend: [],
      }),
    },
  );
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  return (expect = SHOWN) => requestTurnOn(ctx, { tenantId, role }, { key: KEY, expect });
}
const refusal = async (pressed) => {
  try {
    await pressed;
  } catch (error) {
    return error.message;
  }
  return null;
};

test("a press that shows what the draft holds is handed on as judged: the most, its end, its words, its key", async () => {
  const answer = await press()();
  assert.deepEqual(answer, { outcome: "kept", ad_id: "a0a0a0a0-9999-4000-8000-000000000001" });
  assert.equal(handed.length, 1);
  const [body] = handed;
  assert.deepEqual([body.key, body.draft_at], [KEY, KEPT_AT], "the press's own key, and the moment the draft was kept");
  assert.deepEqual(body.ad, {
    name: "First visit",
    service: "Consultation",
    picture: PHOTO,
    picture_kind: "photo",
    miles: 5,
    total_minor: 7500,
    most_minor: 7500,
    end_day: END_DAY,
    versions: WORDS,
    address: "12 Harbor St, Miami",
    whatsapp: "+13055550142",
    declared: "none",
  });
  // The same press again is the edge's to answer once: the route says what it said.
  edgeSays = () => ({
    status: 202,
    body: { ok: true, outcome: "same", ad_id: "a0a0a0a0-9999-4000-8000-000000000001" },
  });
  assert.equal((await press()()).outcome, "same");
});

test("a press drawn from an older amount, end, area, picture or words is refused, and the edge is told nothing", async () => {
  for (const [why, stale] of [
    ["an older amount", { most_minor: 7000 }],
    ["another end", { end_day: dayOn(12) }],
    ["another area", { miles: 8 }],
    ["a wider place the draft doesn't hold", { area: { kind: "region", key: "3847" } }],
    ["another picture", { picture: "f0f0f0f0-9999-4000-8000-000000000009" }],
    ["older words", { versions: [WORDS[1], WORDS[0], WORDS[2]] }],
  ]) {
    const said = await refusal(press()({ ...SHOWN, ...stale }));
    assert.equal(said, "This ad changed since you saw it. Look at it again, then press.", why);
  }
  // The draft was changed by someone else since the screen drew it: the screen's press is the older one.
  const said = await refusal(press({ draft: { total_minor: 9000 } })());
  assert.equal(said, "This ad changed since you saw it. Look at it again, then press.");
  // The edge's door finds the draft kept again since: its refusal is said in the same words.
  edgeSays = () => ({ status: 409, body: { ok: false, error: "ad_stale" } });
  assert.equal(await refusal(press()()), "This ad changed since you saw it. Look at it again, then press.");
  assert.equal(handed.length, 1, "only the last press reached the edge");
});

test("a draft shown across a wider place is pressed with that place, and no street address is handed on", async () => {
  const wide = { draft: { area: { kind: "region", key: "3847", name: "Florida", country: "US" } } };
  const shown = { ...SHOWN, area: { kind: "region", key: "3847" } };
  assert.equal((await press(wide)(shown)).outcome, "kept");
  const body = handed.at(-1);
  // Its name and country ride with its key, so the ad's drawer says the place and Fix it can draft it again.
  assert.deepEqual(body.ad.area, { kind: "region", key: "3847", name: "Florida", country: "US" });
  assert.equal(body.ad.address, undefined, "a wider place is named by itself");
  // A press drawn before the place was chosen showed the circle: it is the older one.
  const said = await refusal(press(wide)(SHOWN));
  assert.equal(said, "This ad changed since you saw it. Look at it again, then press.");
  assert.equal(AdTurnOnBodySchema.safeParse({ key: KEY, expect: shown }).success, true);
});

test("every check before Turn on runs again at the press, and what would stop the ad stops the press", async () => {
  // Meta's least for a day rose since the draft was drawn: $75 is under it now.
  const said = await refusal(
    press({ account: { config: { page_id: "2000000000000092", min_daily_minor: 900, scopes: ["ads_management"] } } })(),
  );
  assert.equal(said, "Something on New ad would stop this ad. Fix it there, then press again.");
  // The ad account can no longer be charged.
  const card = await refusal(press({ account: { standing: { account: "active", funding: "none" } } })());
  assert.equal(card, "Something on New ad would stop this ad. Fix it there, then press again.");
  // No words, a video: never turned on.
  const unwritten = await refusal(press({ draft: { versions: [] } })({ ...SHOWN, versions: [WORDS[0]] }));
  assert.equal(unwritten, "This ad changed since you saw it. Look at it again, then press.");
  assert.deepEqual(handed, []);
});

test("while AI is stopped, for anyone but the owner, or where the edge turns nothing on, nothing is turned on", async () => {
  const stopped = await refusal(
    press({ config: { ask: { stopped: { at: "2026-11-20T20:30:00Z", playbooks: [], reply: null } } } })(),
  );
  assert.equal(stopped, "AI is stopped, so no ad is turned on. Start AI again first.");
  assert.equal(await refusal(press({}, "operator")()), "Only the owner can turn an ad on.");
  writes = "off";
  assert.equal(
    await refusal(press()()),
    "Turning an ad on from here isn't on in this workspace yet. Nothing was made.",
  );
  assert.deepEqual(handed, []);
  // The edge's own refusals, each in words an owner can act on.
  writes = "live";
  for (const [code, words] of [
    ["ad_busy", "Another ad is still being set up. Turn this one on once that one is done."],
    ["ai_stopped", "AI is stopped, so no ad is turned on. Start AI again first."],
    ["ad_account_not_owner", "Only the owner can turn an ad on."],
  ]) {
    edgeSays = () => ({ status: code === "ad_account_not_owner" ? 403 : 409, body: { ok: false, error: code } });
    assert.equal(await refusal(press()()), words, code);
  }
});

test("Meta is asked about the ad's number at every press, and its word now decides, never what was kept before", async () => {
  // Kept as able to send six hours ago; Meta says now the number is blocked: the ad would bring people nobody answers.
  metaSays = () => ({ status: 200, canSend: "BLOCKED" });
  assert.equal(
    await refusal(press()()),
    "WhatsApp can't send from your number, so nothing was made. Connections says why.",
  );
  assert.equal(asked, 1, "asked once, at the press");
  assert.deepEqual(handed, []);
  // Kept as blocked; a card was added a minute ago and Meta says now it may send: the press goes on.
  metaSays = () => ({ status: 200, canSend: "AVAILABLE" });
  assert.equal((await press({ canSend: "BLOCKED" })()).outcome, "kept");
  assert.equal(handed.length, 1);
  assert.equal(handed[0].ad.whatsapp, "+13055550142", "the number Meta was asked about is the one the ad names");
});

test("where Meta can't be asked about the number, nothing is turned on, whatever was kept: Check again", async () => {
  const unheard =
    "WhatsApp didn't say if your number can answer this ad's chats, so nothing was made. Check again in a moment.";
  for (const said of [
    { status: 502, error: "meta_failed" },
    { status: 503, error: "no_token" },
  ]) {
    metaSays = () => said;
    assert.equal(await refusal(press()()), unheard, said.error);
  }
  // Meta answered with a word that is none of its three: not known is not a yes.
  metaSays = () => ({ status: 200, canSend: "UNDER_REVIEW" });
  assert.equal(await refusal(press()()), unheard);
  assert.deepEqual(handed, []);
});

test("no number connected, or the workspace paused, is no Turn on, each in words an owner can act on", async () => {
  metaSays = () => ({ status: 409, error: "no_channel" });
  assert.equal(
    await refusal(press({ channels: [] })()),
    "Connect WhatsApp first: the ad opens a chat with your number. Nothing was made.",
  );
  metaSays = () => ({ status: 200, canSend: "AVAILABLE" });
  assert.equal(
    await refusal(press({ tenant: { status: "paused" } })()),
    "This workspace is paused, so no ad is turned on. Nothing was made.",
  );
  assert.deepEqual(handed, []);
});

test("what the press takes: its key and what it showed, and nothing else", () => {
  assert.equal(AdTurnOnBodySchema.safeParse({ key: KEY, expect: SHOWN }).success, true);
  assert.equal(AdTurnOnBodySchema.safeParse({ key: "not-a-key", expect: SHOWN }).success, false);
  assert.equal(AdTurnOnBodySchema.safeParse({ key: KEY, expect: { ...SHOWN, most_minor: 0 } }).success, false);
  assert.equal(AdTurnOnBodySchema.safeParse({ key: KEY, expect: { ...SHOWN, versions: [] } }).success, false);
});
