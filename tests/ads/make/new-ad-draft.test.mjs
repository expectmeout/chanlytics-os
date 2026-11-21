/**
 * New ad's two routes, as their handlers answer them (the Ads plan's 4.6, 6.3, 6.7 and its gaps G5, G7, G8, G13, G15
 * and G18): POST ads/draft (server/ads/draft.ts draftAd) and POST ads/words (server/ads/words.ts writeAdWords), run
 * over a workspace in memory, the model a stream handed in (model-json.ts setModelStream), and the edge's word on
 * whether Ads is switched on a stubbed fetch. Nothing reaches Meta: neither handler has a way to.
 *
 * What must hold. A draft's parts are picked by rules in code, and the sentence needs no model. Where a draft cannot
 * be written, the one thing missing is said. Only a picture that shows nobody and has no music is ever offered. The
 * ad writer is asked under its own purpose, its words are held to the checks before they are shown, and where it has
 * none the draft stands as it was. "Tell AI what to change" makes one change from the closed list, or none.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { until } from "../../shared/_until.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example.com";
// The edge is asked whether Ads is on here, as production asks it; the fetch below answers.
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { draftAd } = await import(at("apps/dashboard/src/server/ads/draft.ts"));
const { writeAdWords } = await import(at("apps/dashboard/src/server/ads/words.ts"));
const { AdDraftBodySchema, AdWordsBodySchema } = await import(at("apps/dashboard/src/server/ads/draft-shape.ts"));
const { setModelStream } = await import(at("apps/dashboard/src/server/shared/model-json.ts"));
const { GatewayRefused } = await import(at("apps/dashboard/src/server/shared/model/gateway.ts"));
const { readerContext, readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { AD_SKILL } = await import(at("apps/dashboard/src/server/ask/skills/ad/skill.ts"));
const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
const { adDraftAct } = await import(at("apps/dashboard/src/server/ask/tools/act/ads/draft.ts"));
const { readPieceAd } = await import(at("apps/dashboard/src/server/content/ad-pictures.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const C = await import("@chanlytics/contracts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCOUNT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TZ = "America/New_York";
const NOW = new Date("2026-11-19T15:00:00Z");
const TODAY = "2026-11-19";
const FILE = (n) => `f000000${n}-0000-4000-8000-000000000000`;

/** A file as Files keeps it: a photo of the front desk, nobody in it, the feed's shape. */
const file = (n, over = {}) => ({
  id: FILE(n),
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: `front-desk-${n}`,
  mime: "image/jpeg",
  bytes: 200_000,
  width: 1440,
  height: 1800,
  look: { line: "The front desk with flowers on it.", people: { count: 0, recognizable: 0 }, issues: [] },
  look_status: "done",
  shows: "interior",
  who_in_it: "not_asked",
  removed_at: null,
  created_at: `2026-11-1${n}T10:00:00Z`,
  updated_at: `2026-11-1${n}T10:00:00Z`,
  kind: "image",
  seconds: null,
  media_status: null,
  sound_said: null,
  sound: null,
  copy_state: "here",
  copy_why: null,
  ...over,
});

/** Harbor Studio: its Services, its address, a WhatsApp number AI answers, an ad account connected, one photo. */
const world = (over = {}) => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "appointment" }],
  tenant_config: [
    {
      tenant_id: A,
      version: 1,
      config: {
        brain: {
          business_name: "Harbor Studio",
          system_prompt: "Answer as the front desk of Harbor Studio.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: {
            address: "12 Harbor St, Miami",
            tone: "Warm and brief.",
            services: [
              { name: "Consultation", duration_min: 30 },
              { name: "First appointment", duration_min: 45, price_note: "$45" },
            ],
            guardrails: { never_quote_prices: false },
            ...over.profile,
          },
        },
        ...over.config,
      },
    },
  ],
  tenant_channels: [
    {
      id: "ch-wa",
      tenant_id: A,
      kind: "whatsapp",
      status: "active",
      number_e164: "+13055550142",
      config: { standing: { can_send: "AVAILABLE", problems: [] } },
    },
  ],
  ad_accounts: [
    {
      id: ACCOUNT,
      tenant_id: A,
      platform: "meta",
      external_id: "1000000000000001",
      name: "Harbor ads",
      currency: "USD",
      timezone: TZ,
      status: "connected",
      standing: { account: "active", funding: "ok" },
      config: {
        page_id: "2000000000000002",
        page_name: "Harbor Studio",
        min_daily_minor: 500,
        scopes: ["ads_read", "ads_management"],
      },
      connected_at: "2026-11-18T10:00:00Z",
      disconnected_at: null,
      revoked_at: null,
      read_at: "2026-11-19T14:00:00Z",
      read_error: null,
      ...over.account,
    },
  ],
  ads: [],
  files: [file(1)],
  appointments: [],
  ...over.tables,
});

/** The page's counts, with nobody brought by an ad yet. */
const NO_COUNTS = { from: "2026-10-21", to: TODAY, ads: [], unnamed: { people: 0, booked: 0 }, spend: [] };

let offered;
let calls;
const real = globalThis.fetch;
beforeEach(() => {
  offered = true;
  calls = [];
  readerCache.clear();
  forgetFeeds();
  // The service role's client, which a test of made pieces hands in (seatedMade): built from the environment again.
  setServiceClient(null);
  globalThis.fetch = async (url) => {
    // The calendar a business links (calendar.ical_url): nothing on it is taken, so every hour it offers is open.
    if (String(url).startsWith("https://cal.example/"))
      return new Response(OPEN_CALENDAR, { status: 200, headers: { "content-type": "text/calendar" } });
    if (!String(url).endsWith("/api/admin/ads/account")) throw new Error(`nothing else is reachable: ${url}`);
    return new Response(
      JSON.stringify({
        ok: true,
        ready: true,
        on: offered,
        writes: "sandbox",
        app: { client_id: "1", config_id: "2", redirect_uri: "https://app.example.com/cb" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
});
after(() => {
  globalThis.fetch = real;
  setModelStream(null);
  setServiceClient(null);
});

/** The model, answering `answer` (or throwing `refused`), one text event and a stop, as the gateway streams them. */
const modelSays = (answer, refused = null) =>
  setModelStream(async function* (call) {
    calls.push(call);
    if (refused) throw refused;
    yield { type: "text", index: 0, text: JSON.stringify(answer) };
    yield { type: "stop", stopReason: "end_turn" };
  });

/** An empty calendar: what the business's hours offer is all open. */
const OPEN_CALENDAR = ["BEGIN:VCALENDAR", "END:VCALENDAR"].join("\r\n");

/** No writer out for the draft's words. */
const NO_WRITER = { writing_ask: null, writing_for: null, writing_until: null };

/**
 * The doors of 00659 and 00672 as the database answers them, over the tables in memory: a draft kept as the workspace's
 * one (by whoever is signed in, each keep written down, each at a moment of its own), and nothing written over a newer
 * one by a keep that names the draft it read; the writer out for its words, marked once for the same words; and the
 * owner's most kept on the connected account. Who may, and the owner's bell, are the database's own
 * (a-draft-is-kept-and-left-for-the-owner.db.test.mjs).
 */
function draftDoors(tables, userId, keeps, writers) {
  const draftOf = (tenantId) => tables.ad_drafts?.find((row) => row.tenant_id === tenantId);
  return {
    ad_draft_keep: ({ p_tenant_id, p_account_id, p_draft, p_read_at }) => {
      tables.ad_drafts ??= [];
      const had = draftOf(p_tenant_id);
      if (p_read_at !== undefined && p_read_at !== null && (had?.updated_at ?? "-infinity") !== p_read_at)
        return { kept: false, draft_id: had?.id ?? null, rung: 0, newer: true };
      const row = { ...NO_WRITER, ...had };
      row.id ??= `dddddddd-dddd-4ddd-8ddd-${String(keeps.length + 1).padStart(12, "0")}`;
      Object.assign(row, { tenant_id: p_tenant_id, account_id: p_account_id, draft: p_draft, kept_by: userId });
      row.updated_at = new Date(NOW.getTime() + keeps.length + 1).toISOString();
      tables.ad_drafts = [...tables.ad_drafts.filter((one) => one !== had), row];
      keeps.push({ by: userId, draft: p_draft });
      return { kept: true, draft_id: row.id, rung: 0 };
    },
    ad_draft_writing: ({ p_tenant_id, p_ask, p_for, p_until }) => {
      writers.push({ ask: p_ask, for: p_for });
      const row = draftOf(p_tenant_id);
      if (!row) return { held: false, ask: null, until: null };
      const out = row.writing_ask && row.writing_ask !== p_ask && row.writing_for === p_for;
      if (out && Date.parse(row.writing_until) > Date.now())
        return { held: false, ask: row.writing_ask, until: row.writing_until };
      Object.assign(row, { writing_ask: p_ask, writing_for: p_for, writing_until: p_until });
      return { held: true, ask: p_ask, until: p_until };
    },
    ad_draft_written: ({ p_tenant_id, p_ask }) => {
      const row = draftOf(p_tenant_id);
      if (row?.writing_ask !== p_ask) return false;
      Object.assign(row, NO_WRITER);
      return true;
    },
    ad_account_most: ({ p_tenant_id, p_most_minor }) => {
      const account = tables.ad_accounts.find((one) => one.tenant_id === p_tenant_id && one.status === "connected");
      if (account) account.most_minor = p_most_minor;
      return Boolean(account);
    },
  };
}

/** A workspace no two tests share: the edge's word is kept by workspace for a minute. */
let seat = 0;
function seated(tables, role = "owner", { counts = NO_COUNTS, userId = USER } = {}) {
  seat += 1;
  const tenantId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seat).padStart(12, "0")}`;
  const mine = JSON.parse(JSON.stringify(tables).replaceAll(A, tenantId));
  const keeps = [];
  const writers = [];
  const db = fakeDb(mine, {}, { ads_page_counts: () => counts, ...draftDoors(mine, userId, keeps, writers) });
  const ctx = { supabase: db, userId, email: "ada@example.com", params: {} };
  return { rc: readerContext(ctx, { tenantId, role }, NOW), userId, tables: mine, keeps, writers, tenantId };
}
/** The same workspace, another member signed in to it. */
function alsoSeated(who, role, userId) {
  const { keeps, writers } = who;
  const doors = draftDoors(who.tables, userId, keeps, writers);
  const db = fakeDb(who.tables, {}, { ads_page_counts: () => NO_COUNTS, ...doors });
  const ctx = { supabase: db, userId, email: "sam@example.com", params: {} };
  readerCache.clear();
  const rc = readerContext(ctx, { tenantId: who.tenantId, role }, NOW);
  return { rc, userId, tables: who.tables, keeps, writers, tenantId: who.tenantId };
}
const fresh = (tables = world(), role = "owner") => {
  const who = seated(tables, role);
  return draftAd(who.rc, {}).then((answer) => ({ answer, who }));
};

const VERSIONS = [
  {
    headline: "First appointment, $45",
    text: "A first appointment at Harbor Studio takes 45 minutes. Message us on WhatsApp to pick a time.",
  },
  { headline: "Harbor Studio", text: "First appointments at Harbor Studio. Message us on WhatsApp for a time." },
  { headline: "First appointment", text: "45 minutes, $45. Message Harbor Studio on WhatsApp to book." },
];
const NO_CHANGE = { kind: "none", service: "", miles: 0, amount: 0, end: "" };
const wrote = (versions = VERSIONS, change = NO_CHANGE) => ({ versions, change, could_not: "" });
/** A draft as the screen sends it back. */
const sent = (answer, over = {}) => ({ ...answer.draft, picture: answer.draft.picture.id, ...over });

test("a fresh draft: the service, the picture, five miles, Meta's least for the days it touches and its end, with no model asked", async () => {
  modelSays(wrote());
  const { answer } = await fresh();
  assert.equal(answer.can, true);
  assert.deepEqual(answer.draft, {
    // Nobody booked anything yet, so the first in Services (G5).
    service: "Consultation",
    picture: { id: FILE(1), kind: "photo", name: "front-desk-1", made: false },
    miles: 5,
    // $5 a day for the fifteen days a two-week run touches, today included: a starting amount.
    total_minor: 7500,
    end_day: "2026-12-03",
    versions: [],
    answers: {},
  });
  assert.deepEqual(
    [answer.today, answer.days, answer.picked, answer.question, answer.declared, answer.owner],
    [TODAY, 14, "first", null, "none", true],
  );
  assert.deepEqual(answer.account, {
    name: "Harbor ads",
    currency: "USD",
    page: "Harbor Studio",
    min_daily_minor: 500,
  });
  assert.deepEqual(answer.amount, {
    least_minor: 7500,
    proposed: { total_minor: 7500, days: 14, basis: { kind: "starting", why: "few_booked" } },
    most_minor: null,
  });
  assert.equal(answer.left_by, null);
  assert.deepEqual(answer.checks, []);
  // The edge turns ads on in this workspace, and the picture is a photo: Turn on may be pressed (its checks aside).
  assert.equal(answer.turn_on, "ready");
  assert.equal(calls.length, 0, "the sentence is there at once: it waits for no model");
});

test("the service is the one booked most in the last ninety days, and never one an ad made here already runs for (G5)", async () => {
  const visit = (n, service, status = "booked") => ({
    id: `90000000-0000-4000-8000-00000000000${n}`,
    tenant_id: A,
    status,
    service,
    source: "person",
    starts_at: `2026-11-0${n}T15:00:00Z`,
    ends_at: `2026-11-0${n}T16:00:00Z`,
  });
  const booked = world({
    tables: {
      appointments: [
        visit(1, "First appointment"),
        visit(2, "first appointment "),
        visit(3, "Consultation"),
        // A cancelled visit and a proposed time are no booking.
        visit(4, "Consultation", "cancelled"),
        visit(5, "Consultation", "proposed"),
      ],
    },
  });
  const most = (await fresh(booked)).answer;
  assert.deepEqual([most.draft.service, most.picked], ["First appointment", "most_booked"]);
  // An ad made here already runs for it: the next service is offered.
  const running = world({
    tables: {
      appointments: booked.appointments,
      ads: [
        {
          id: "d0000000-0000-4000-8000-000000000001",
          tenant_id: A,
          account_id: ACCOUNT,
          platform: "meta",
          origin: "chanlytics",
          name: "First appointment",
          door: "whatsapp",
          status: "made",
          intent: "on",
          platform_state: "ACTIVE",
          platform_ad_id: "23850000000000001",
          budget_kind: "total",
          budget_minor: 12000,
          budget_left_minor: 9000,
          ends_at: "2026-12-10T22:00:00Z",
          version: 1,
          created_at: "2026-11-10T10:00:00Z",
        },
      ],
    },
  });
  assert.equal((await fresh(running)).answer.draft.service, "Consultation");
});

test("where a draft cannot be written, the one thing missing is said: a service, the address, WhatsApp, a picture (G13)", async () => {
  const missing = async (tables) => {
    const { answer } = await fresh(tables);
    return answer.can ? null : answer.missing;
  };
  assert.equal(await missing(world({ profile: { services: [] } })), "service");
  assert.equal(await missing(world({ profile: { address: "  " } })), "address");
  assert.equal(await missing(world({ tables: { tenant_channels: [] } })), "whatsapp");
  assert.equal(await missing(world({ tables: { files: [] } })), "picture_none");
  // An ad account that is not connected, or whose least Meta has not said yet, and AI stopped.
  assert.equal(await missing(world({ tables: { ad_accounts: [] } })), "account");
  assert.equal(await missing(world({ account: { status: "revoked" } })), "account");
  assert.equal(
    await missing(world({ account: { config: { page_id: "2", page_name: "Harbor Studio" } } })),
    "account_reading",
  );
  assert.equal(
    await missing(world({ config: { ask: { stopped: { at: "2026-11-19T12:00:00Z", playbooks: [], reply: null } } } })),
    "stopped",
  );
});

test("a WhatsApp chat AI couldn't answer is said for what it is: switched off, not heard from, blocked, or paused", async () => {
  const missing = async (tables) => {
    const { answer } = await fresh(tables);
    return answer.can ? null : answer.missing;
  };
  const line = (over) => ({
    id: "ch-wa",
    tenant_id: A,
    kind: "whatsapp",
    status: "active",
    number_e164: "+13055550142",
    config: { standing: { can_send: "AVAILABLE", problems: [] } },
    ...over,
  });
  // The number switched off is no number to name: Connections is where it is turned back on.
  assert.equal(await missing(world({ tables: { tenant_channels: [line({ status: "disabled" })] } })), "whatsapp");
  // Never read, or read as a word that is none of Meta's three: not known, so no ad is drafted on it.
  assert.equal(await missing(world({ tables: { tenant_channels: [line({ config: {} })] } })), "whatsapp_unread");
  // Meta says the number may not send: a tap on the ad would open a chat nobody answers.
  const blocked = line({ config: { standing: { can_send: "BLOCKED", problems: [] } } });
  assert.equal(await missing(world({ tables: { tenant_channels: [blocked] } })), "whatsapp_blocked");
  // A limit, or no card on file, still lets a reply to someone who wrote first go: the draft is written.
  const limited = line({ config: { standing: { can_send: "LIMITED", problems: [], has_payment_method: false } } });
  assert.equal(await missing(world({ tables: { tenant_channels: [limited] } })), null);
  // The workspace's billing paused: new messages wait for a person.
  const paused = [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "appointment", status: "paused" }];
  assert.equal(await missing(world({ tables: { tenants: paused } })), "paused");
});

test("a folder of clips nobody has looked at, or a run of photos of people, never buries the one picture fine in ads", async () => {
  // 20 Nov 2026: a Drive folder's clips, none looked at yet, pushed the one photo fine in ads out of the newest 24 read,
  // and every draft said a picture was missing. Many more than that now, and newer than the photo.
  const id = (n) => `f${String(n).padStart(7, "0")}-0000-4000-8000-000000000000`;
  const newer = (n) => `2026-11-19T${String(10 + (n % 10)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00Z`;
  const fine = file(1, { created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z" });
  const clips = Array.from({ length: 60 }, (_, n) =>
    file(1, {
      id: id(100 + n),
      name: `drive-clip-${n}`,
      kind: "video",
      mime: "video/mp4",
      seconds: 20,
      media_status: "ready",
      look: null,
      look_status: "waiting",
      created_at: newer(n),
      updated_at: newer(n),
    }),
  );
  const people = Array.from({ length: 40 }, (_, n) =>
    file(1, {
      id: id(200 + n),
      name: `team-${n}`,
      look: { line: "Two stylists at work.", people: { count: 2, recognizable: 2 }, issues: [] },
      created_at: newer(n),
      updated_at: newer(n),
    }),
  );
  const { answer } = await fresh(world({ tables: { files: [fine, ...clips, ...people] } }));
  assert.equal(answer.can, true, "a draft can be written");
  assert.equal(answer.draft.picture.id, FILE(1), "the one picture fine in ads, however many newer files there are");
});

test("only a picture whose people said yes to ads, and with no music, is offered, in a shape the feed takes: never one to crop (G15)", async () => {
  const offeredOf = async (files) => {
    const { answer } = await fresh(world({ tables: { files } }));
    return answer.can ? answer.draft.picture.id : answer.missing;
  };
  // A person shown, a yes for posts alone, a photo nobody has looked at, a story's tall shape, a small one: none.
  assert.equal(
    await offeredOf([
      file(1, { look: { line: "Two stylists at work.", people: { count: 2, recognizable: 2 }, issues: [] } }),
      file(2, {
        yes_for: ["post"],
        look: { line: "A stylist at the chair.", people: { count: 1, recognizable: 1 }, issues: [] },
      }),
      file(3, { look: null, look_status: "waiting" }),
      file(4, { width: 1080, height: 1920 }),
      file(5, { width: 400, height: 500 }),
      file(6, {
        look: { line: "A before and after of the salon.", people: { count: 0, recognizable: 0 }, issues: [] },
      }),
    ]),
    "picture_person",
    "someone shown, or nobody said who, is what to mend first",
  );
  // Each picture missing says which: none at all, someone in each, music in each, none that fits an ad.
  assert.equal(await offeredOf([]), "picture_none");
  assert.equal(
    await offeredOf([file(4, { width: 1080, height: 1920 }), file(5, { width: 400, height: 500 })]),
    "picture",
  );
  // A member's own word that nobody is in it is enough.
  assert.equal(await offeredOf([file(1, { who_in_it: "no_one", look: null, look_status: "waiting" })]), FILE(1));
  // Someone shown who said yes to ads (00665, Content's step L4): offered, as Content answers it; a yes taken back, not.
  const said = { line: "A stylist at the chair.", people: { count: 1, recognizable: 1 }, issues: [] };
  assert.equal(await offeredOf([file(1, { look: said, yes_for: ["ad", "post"] })]), FILE(1));
  assert.equal(await offeredOf([file(1, { look: said, yes_for: ["post"], yes_back: ["ad"] })]), "picture_person");
  // A video before a photo, where its sound was heard and holds no music; one with music is never offered.
  const video = (n, sound) =>
    file(n, { kind: "video", mime: "video/mp4", width: 1080, height: 1080, seconds: 20, media_status: "ready", sound });
  const quiet = {
    note: { speech: false, music: { present: false }, voices: [], sounds: [], feel: "calm", unsure: false },
  };
  const loud = {
    note: {
      speech: false,
      music: { present: true, kind: "pop" },
      voices: [],
      sounds: [],
      feel: "bright",
      unsure: false,
    },
  };
  assert.equal(await offeredOf([file(1), video(2, quiet)]), FILE(2));
  assert.equal(await offeredOf([file(1), video(2, loud)]), FILE(1));
  assert.equal(await offeredOf([video(2, loud), video(3, null)]), "picture_music", "music, or not heard yet");
  assert.equal(await offeredOf([video(2, { none: true })]), FILE(2));
});

test("Ads switched off for the workspace on this deployment: neither route answers, and no model is asked", async () => {
  offered = false;
  modelSays(wrote());
  const who = seated(world());
  await assert.rejects(draftAd(who.rc, {}), /Ads aren't available in this workspace yet/);
  await assert.rejects(
    writeAdWords(who, {
      job: "write",
      draft: {
        service: "Consultation",
        picture: FILE(1),
        miles: 5,
        total_minor: 7000,
        end_day: "2026-12-03",
        versions: [],
        answers: {},
      },
    }),
    /Ads aren't available in this workspace yet/,
  );
  assert.equal(calls.length, 0);
});

test("the words: the ad writer is asked once, under its own purpose, from the shared brief, and its words are kept with the draft", async () => {
  modelSays(wrote());
  const { answer, who } = await fresh(
    world({ profile: { services: [{ name: "First appointment", duration_min: 45, price_note: "$45" }] } }),
  );
  const written = await writeAdWords(who, { job: "write", draft: sent(answer) });
  assert.deepEqual(written.wrote, { ok: true });
  assert.deepEqual(written.draft.versions, VERSIONS);
  assert.deepEqual(written.checks, []);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.purpose, "ad_draft", "what ad writing costs is read apart (G19)");
  assert.equal(call.request.model, C.MODEL_ROUTES.ask.model);
  assert.equal(call.request.output_config.effort, AD_SKILL.craft.effort);
  assert.equal(call.request.system, C.craftSystem(AD_SKILL));
  const question = call.request.messages[0].content;
  assert.match(question, /The business: Harbor Studio\./);
  assert.match(question, /The service the ad offers: First appointment\./);
  assert.match(question, /Its price, in the business's own words: \$45/);
  assert.match(question, /First appointment takes 45 minutes\./);
  assert.match(question, /The picture shows: The front desk with flowers on it\./);
  assert.match(question, /adults within 5 miles, on facebook\./);
  // Written once: the draft judged again, after the amount changes, asks no model and keeps the same words.
  const judged = await draftAd(who.rc, { draft: sent(written, { total_minor: 12000 }) });
  assert.deepEqual(judged.draft.versions, VERSIONS);
  assert.deepEqual(
    [judged.draft.total_minor, judged.amount.proposed.total_minor, judged.checks.length],
    [12000, 7500, 0],
  );
  assert.equal(calls.length, 1);
});

test("words that fail a check are never shown: the draft stands with none, and says why there are none", async () => {
  const { answer, who } = await fresh();
  modelSays(
    wrote([
      { headline: "Tired of waiting?", text: "Are you tired of waiting? Message us on WhatsApp." },
      VERSIONS[1],
      VERSIONS[2],
    ]),
  );
  const failed = await writeAdWords(who, { job: "write", draft: sent(answer) });
  assert.deepEqual(failed.wrote, { ok: false, why: "checks" });
  assert.deepEqual(failed.draft.versions, []);
  // The day's AI limit, a paused workspace, and no answer at all: each its own word, none of them an error.
  modelSays(null, new GatewayRefused({ kind: "budget", message: "the day's budget is spent" }));
  assert.deepEqual((await writeAdWords(who, { job: "write", draft: sent(answer) })).wrote, { ok: false, why: "limit" });
  modelSays(null, new GatewayRefused({ kind: "paused", message: "paused" }));
  assert.deepEqual((await writeAdWords(who, { job: "write", draft: sent(answer) })).wrote, {
    ok: false,
    why: "paused",
  });
  modelSays(null, new Error("the stream broke"));
  const broke = await writeAdWords(who, { job: "write", draft: sent(answer) });
  assert.deepEqual(broke.wrote, { ok: false, why: "other" });
  assert.equal(broke.can, true, "the amount and the dates are kept");
});

test("a business that never quotes prices: the writer is handed none, and Take the price out writes without one", async () => {
  const never = world({
    profile: { services: [{ name: "First appointment", price_note: "$45" }], guardrails: { never_quote_prices: true } },
  });
  const unpriced = [
    { headline: "First appointment", text: "A first appointment at Harbor Studio. Message us on WhatsApp." },
    VERSIONS[1],
    { headline: "Harbor Studio", text: "Message Harbor Studio on WhatsApp to book a first appointment." },
  ];
  modelSays(wrote(unpriced));
  const { answer, who } = await fresh(never);
  const written = await writeAdWords(who, { job: "write", draft: sent(answer) });
  assert.deepEqual(written.wrote, { ok: true });
  assert.match(calls[0].request.messages[0].content, /No price may be said: this business never quotes prices\./);
  assert.doesNotMatch(calls[0].request.messages[0].content, /\$45/);
  // Words kept from before the switch was turned on trip the check, with its one act.
  const judged = await draftAd(who.rc, { draft: sent(answer, { versions: VERSIONS }) });
  assert.deepEqual(judged.checks, [{ code: "price", fault: "never" }]);
  // Where prices are quoted, the owner may still take it out of this ad.
  const quoting = await fresh(world({ profile: { services: [{ name: "First appointment", price_note: "$45" }] } }));
  await writeAdWords(quoting.who, { job: "write", draft: sent(quoting.answer), no_price: true });
  assert.match(calls.at(-1).request.messages[0].content, /No price may be said/);
});

test("the special-kind question: asked of the owner, a no is what the press tells Meta, and a yes is not run here (G7)", async () => {
  const hiring = world({ profile: { services: [{ name: "Stylist job opening" }] } });
  const { answer, who } = await fresh(hiring);
  assert.deepEqual([answer.question, answer.declared], ["employment", "waiting"]);
  const no = await draftAd(who.rc, { draft: sent(answer, { answers: { employment: "no" } }) });
  assert.deepEqual([no.question, no.declared], [null, "none"]);
  const yes = await draftAd(who.rc, { draft: sent(answer, { answers: { employment: "yes" } }) });
  assert.deepEqual([yes.question, yes.declared], [null, "employment"]);
});

test("Tell AI what to change: one change from the closed list, judged again like any other, and never free text (G8)", async () => {
  const two = world({ tables: { files: [file(1), file(2)] } });
  const { answer, who } = await fresh(two);
  const held = sent(answer, { versions: VERSIONS, service: "First appointment" });
  const tell = (asked, change, versions = []) => {
    modelSays({ versions, change: { ...NO_CHANGE, ...change }, could_not: "" });
    return writeAdWords(who, { job: "change", draft: held, asked });
  };
  // The amount, the miles and the end date.
  const amount = await tell("make it 120 dollars", { kind: "amount", amount: 120 });
  assert.deepEqual([amount.changed, amount.draft.total_minor], [{ kind: "amount" }, 12000]);
  const area = await tell("reach ten miles", { kind: "area", miles: 10 });
  assert.deepEqual([area.changed, area.draft.miles], [{ kind: "area" }, 10]);
  const end = await tell("run it to the 20th", { kind: "end", end: "2026-12-20" });
  assert.deepEqual([end.changed, end.draft.end_day, end.days], [{ kind: "end" }, "2026-12-20", 31]);
  // A change that breaks a rule is made, and the check says so with its one act: $40 is under Meta's least.
  const low = await tell("only 40 dollars", { kind: "amount", amount: 40 });
  assert.deepEqual(low.checks, [{ code: "amount", fault: "under_least", nearest_minor: 7500 }]);
  // Another picture: the next that is fine in ads.
  const pictured = await tell("use another photo", { kind: "picture" });
  assert.deepEqual([pictured.changed, pictured.draft.picture.id !== held.picture], [{ kind: "picture" }, true]);
  // Another service: the draft waits for that service's own words.
  const service = await tell("advertise the consultation instead", { kind: "service", service: "consultation" });
  assert.deepEqual(
    [service.changed, service.draft.service, service.draft.versions],
    [{ kind: "service" }, "Consultation", []],
  );
  // The words, where they pass the checks; words that would not are a change not made, said with the rule they met.
  const warmer = VERSIONS.map((version) => ({ ...version, text: version.text.replace("Message us", "Write to us") }));
  const words = await tell("say write instead of message", { kind: "words" }, warmer);
  assert.deepEqual([words.changed, words.draft.versions], [{ kind: "words" }, warmer]);
  const pushy = await tell("add a guarantee", { kind: "words" }, [
    { headline: "Guaranteed", text: "Guaranteed results at Harbor Studio. Message us on WhatsApp." },
    VERSIONS[1],
    VERSIONS[2],
  ]);
  assert.deepEqual([pushy.changed, pushy.draft.versions], [{ kind: "none", fault: "sure_result" }, VERSIONS]);
  // Anything outside the list changes nothing: a service not in Services, miles Meta does not take, an earlier end.
  for (const [asked, change] of [
    ["show it only to women", { kind: "none" }],
    ["advertise massages", { kind: "service", service: "Massage" }],
    ["reach 500 miles", { kind: "area", miles: 500 }],
    ["end it yesterday", { kind: "end", end: "2026-11-18" }],
    ["spend nothing", { kind: "amount", amount: 0 }],
  ]) {
    const none = await tell(asked, change);
    assert.deepEqual(none.changed, { kind: "none", fault: null }, asked);
    assert.deepEqual(none.draft, (await draftAd(who.rc, { draft: held })).draft, asked);
  }
  // What the owner asked reaches the writer fenced, with the draft as it stands and the services it may pick from.
  const question = calls.at(-1).request.messages[0].content;
  assert.match(question, /What the owner asked, in their own words:/);
  assert.match(question, /The other services it could offer: Consultation\./);
  assert.match(question, /It ends on 2026-12-03\. Today is 2026-11-19\./);
});

test("a draft sent back is held to what the business is now: a service no longer in Services is the rule's pick again", async () => {
  const { answer, who } = await fresh();
  const gone = await draftAd(who.rc, { draft: sent(answer, { service: "Massage", versions: VERSIONS }) });
  assert.deepEqual([gone.draft.service, gone.draft.versions], ["Consultation", []]);
  // A picture no longer in Files is said as gone, with the next as its one act.
  const lost = await draftAd(who.rc, { draft: sent(answer, { picture: FILE(9) }) });
  assert.deepEqual(lost.checks, [{ code: "picture", fault: "gone" }]);
  const next = await draftAd(who.rc, { draft: sent(answer, { picture: FILE(9) }), act: "next_picture" });
  assert.deepEqual([next.draft.picture.id, next.checks], [FILE(1), []]);
  // An operator may draft; only the owner turns an ad on.
  assert.equal((await fresh(world(), "operator")).answer.owner, false);
});

test("what the routes take: a draft's own shape, and nothing else", () => {
  const draft = {
    service: "Consultation",
    picture: FILE(1),
    miles: 5,
    total_minor: 7000,
    end_day: "2026-12-03",
    versions: [],
  };
  assert.equal(AdDraftBodySchema.safeParse({}).success, true);
  assert.equal(AdDraftBodySchema.safeParse({ draft }).success, true);
  assert.equal(AdDraftBodySchema.safeParse({ draft, act: "next_picture" }).success, true);
  assert.equal(AdDraftBodySchema.safeParse({ draft, act: "turn_on" }).success, false);
  // AI's card: a service by its name, and the owner's most in whole units.
  assert.equal(AdDraftBodySchema.safeParse({ service: "Consultation", most: 300 }).success, true);
  // Run as an ad, in Content: a picture by its file's id, and nothing else in its place.
  assert.equal(AdDraftBodySchema.safeParse({ picture: FILE(1) }).success, true);
  assert.equal(AdDraftBodySchema.safeParse({ picture: "front-desk-1" }).success, false);
  assert.equal(AdDraftBodySchema.safeParse({ most: 0 }).success, false);
  assert.equal(AdDraftBodySchema.safeParse({ most: 2.5 }).success, false);
  assert.equal(AdDraftBodySchema.safeParse({ draft: { ...draft, picture: "not-an-id" } }).success, false);
  assert.equal(AdDraftBodySchema.safeParse({ draft: { ...draft, total_minor: 70.5 } }).success, false);
  assert.equal(
    AdDraftBodySchema.safeParse({ draft: { ...draft, versions: [VERSIONS[0], VERSIONS[1], VERSIONS[2], VERSIONS[0]] } })
      .success,
    false,
  );
  assert.equal(AdDraftBodySchema.safeParse({ draft: { ...draft, answers: { employment: "maybe" } } }).success, false);
  assert.equal(AdWordsBodySchema.safeParse({ job: "write", draft }).success, true);
  assert.equal(AdWordsBodySchema.safeParse({ job: "change", draft, asked: "ten miles" }).success, true);
  assert.equal(AdWordsBodySchema.safeParse({ job: "change", draft, asked: "  " }).success, false);
  assert.equal(AdWordsBodySchema.safeParse({ job: "turn_on", draft }).success, false);
});

// ---------------------------------------------------------------------------------------------------------------------
// The amount from the business's own numbers (4.6, G6)

const AD_ID = "d0000000-0000-4000-8000-000000000009";
/** An ad the owner ran in Meta, adopted on the first read: a total of $300 over its run. */
const metaAd = (over = {}) => ({
  id: AD_ID,
  tenant_id: A,
  account_id: ACCOUNT,
  platform: "meta",
  origin: "platform",
  name: "Autumn offer",
  door: "whatsapp",
  status: "made",
  intent: "on",
  platform_state: "ACTIVE",
  platform_ad_id: "23850000000000009",
  budget_kind: "total",
  budget_minor: 30_000,
  budget_left_minor: 1_000,
  ends_at: "2026-11-30T22:00:00Z",
  version: 1,
  created_at: "2026-10-25T10:00:00Z",
  ...over,
});
/** The page's counts: who that ad brought and booked, and what Meta says it spent, in the account's minor units. */
const countsOf = (booked, spendMinor) => ({
  ...NO_COUNTS,
  ads: [{ ad_id: AD_ID, people: booked + 2, booked }],
  spend: [{ ad_id: AD_ID, spend_minor: spendMinor, impressions: 9000, clicks: 300, settling: false }],
});
/** Open every day from ten to eleven, with a calendar linked that has nothing taken on it. */
const DAILY = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, { open: "10:00", close: "11:00" }]),
);
const CLOSED = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, {}]));
const linked = (hours = DAILY) =>
  world({
    profile: { hours, closures: [], booking_rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 30 } },
    config: { calendar: { ical_url: "https://cal.example/harbor.ics" } },
    tables: { ads: [metaAd()] },
  });
/** The draft a workspace's numbers propose, and whether its calendar was asked. */
async function proposedOf(tables, counts, role = "owner") {
  const asked = [];
  const network = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    if (String(url).startsWith("https://cal.example/")) asked.push(String(url));
    return network(url, init);
  };
  try {
    const answer = await draftAd(seated(tables, role, { counts }).rc, {});
    return { answer, calendarRead: asked.length > 0 };
  } finally {
    globalThis.fetch = network;
  }
}

test("the amount: the calendar's open times, times what a booking from an ad has cost, from five booked (4.6)", async () => {
  // Six booked from the account's ads, which spent $54 in the window: $9 a booking.
  const { answer, calendarRead } = await proposedOf(linked(), countsOf(6, 5400));
  assert.equal(calendarRead, true);
  const { basis } = answer.amount.proposed;
  assert.equal(basis.kind, "booked");
  assert.equal(basis.cost_minor, 900);
  assert.ok(basis.open_times > 0, "an open day offers its half hours");
  // Never above the largest total turned on (the ad's $300, made in Meta), never under Meta's least: whole dollars.
  const wanted = Math.ceil((basis.open_times * 900) / 100) * 100;
  const expected = Math.min(30_000, Math.max(7500, wanted));
  assert.deepEqual([answer.draft.total_minor, answer.amount.proposed.total_minor], [expected, expected]);
  assert.equal(basis.held_to, wanted > 30_000 ? "largest_turned_on" : wanted < 7500 ? "meta_least" : null);
  assert.deepEqual(answer.checks, [], "the amount it proposes passes its own check");
});

test("the amount at its edges: zero and four booked, no calendar link, a full calendar, a currency of whole units", async () => {
  // Zero and four booked: a starting amount, and the calendar is not even read.
  for (const booked of [0, 4]) {
    const { answer, calendarRead } = await proposedOf(linked(), countsOf(booked, 3600));
    assert.deepEqual(answer.amount.proposed.basis, { kind: "starting", why: "few_booked" }, `${booked} booked`);
    assert.equal(answer.draft.total_minor, 7500);
    assert.equal(calendarRead, false, `${booked} booked: nothing to lean on, so nothing is read`);
  }
  // Booked, but nothing spent yet: no cost to work from.
  const unspent = await proposedOf(linked(), countsOf(6, 0));
  assert.deepEqual(unspent.answer.amount.proposed.basis, { kind: "starting", why: "few_booked" });
  // Five booked with no calendar link: a starting amount, said so.
  const unlinked = await proposedOf(world({ tables: { ads: [metaAd()] } }), countsOf(5, 4500));
  assert.deepEqual(unlinked.answer.amount.proposed.basis, { kind: "starting", why: "no_calendar" });
  assert.equal(unlinked.answer.draft.total_minor, 7500);
  // Five booked and a calendar with no open time over the run: a starting amount.
  const full = await proposedOf(linked(CLOSED), countsOf(5, 4500));
  assert.deepEqual(full.answer.amount.proposed.basis, { kind: "starting", why: "full" });
  assert.equal(full.answer.draft.total_minor, 7500);
  // A yen account: its least is whole yen (150 a day for the fifteen days a two-week run touches), and so is what its open times come to.
  const yen = (tables) => ({
    ...tables,
    ad_accounts: tables.ad_accounts.map((row) => ({
      ...row,
      currency: "JPY",
      config: { ...row.config, min_daily_minor: 150 },
    })),
  });
  const starting = await proposedOf(yen(linked()), NO_COUNTS);
  assert.deepEqual([starting.answer.draft.total_minor, starting.answer.amount.least_minor], [2250, 2250]);
  const bookedYen = await proposedOf(yen(linked()), countsOf(7, 8638));
  const { basis } = bookedYen.answer.amount.proposed;
  assert.equal(basis.cost_minor, 1234, "8,638 yen over seven booked");
  assert.equal(
    bookedYen.answer.draft.total_minor,
    Math.min(30_000, Math.max(2250, basis.open_times * 1234)),
    "whole yen: nothing to round",
  );
});

test("the owner's most, said once to AI: kept on the account, and every draft held to it; nobody else's (G6)", async () => {
  const who = seated(linked(), "owner", { counts: countsOf(6, 5400) });
  const answer = await draftAd(who.rc, { most: 80 });
  assert.equal(who.tables.ad_accounts[0].most_minor, 8000, "kept in the account's minor units");
  assert.equal(answer.amount.most_minor, 8000);
  assert.equal(answer.draft.total_minor, 8000, "the open times come to more: held to the most they said");
  assert.equal(answer.amount.proposed.basis.held_to, "owner_most");
  // An amount over it is said with the most as its one act.
  const over = await draftAd(who.rc, { draft: sent(answer, { total_minor: 12_000 }) });
  assert.deepEqual(over.checks, [{ code: "amount", fault: "over_most", nearest_minor: 8000 }]);
  // An operator's word is not the owner's.
  const operator = seated(linked(), "operator");
  await assert.rejects(draftAd(operator.rc, { most: 500 }), /Only the owner can say the most an ad may cost/);
  assert.equal(operator.tables.ad_accounts[0].most_minor, undefined);
});

// ---------------------------------------------------------------------------------------------------------------------
// The draft the workspace keeps (6.2, G18)

const OPERATOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
/** One service, the one the words are written for. */
const ONE_SERVICE = { services: [{ name: "First appointment", duration_min: 45, price_note: "$45" }] };

test("the draft is kept: read back with its words on any device, the writer not asked twice, never kept again as it opens", async () => {
  modelSays(wrote());
  const { answer, who } = await fresh(world({ profile: ONE_SERVICE }));
  assert.equal(who.keeps.length, 1, "a fresh draft is kept the moment it is picked");
  assert.deepEqual(who.keeps[0].draft.versions, []);
  await writeAdWords(who, { job: "write", draft: sent(answer) });
  assert.deepEqual(who.keeps.at(-1).draft.versions, VERSIONS, "kept with its words");
  // Opened again, here or on another device: the kept draft, words and all, with no model asked.
  const again = await draftAd(who.rc, {});
  assert.deepEqual(again.draft.versions, VERSIONS);
  assert.equal(calls.length, 1, "the writer was asked once");
  assert.equal(who.keeps.length, 2, "opening it changed nothing, so nothing was kept");
  // Changed, it is kept again.
  await draftAd(who.rc, { draft: sent(again, { miles: 10 }) });
  assert.equal(who.keeps.at(-1).draft.miles, 10);
  // A draft kept for an account no longer connected is not offered: a fresh one is picked.
  who.tables.ad_drafts[0].account_id = "cccccccc-cccc-4ccc-8ccc-000000000000";
  assert.deepEqual((await draftAd(who.rc, {})).draft.versions, []);
});

test("a draft an operator leaves: the owner opens it as left, by name, and it is theirs once they change it (6.2)", async () => {
  modelSays(wrote());
  const operator = seated(
    world({
      profile: ONE_SERVICE,
      tables: { profiles: [{ user_id: OPERATOR, display_name: "Maria", updated_at: NOW.toISOString() }] },
    }),
    "operator",
    { userId: OPERATOR },
  );
  const left = await draftAd(operator.rc, {});
  await writeAdWords(operator, { job: "write", draft: sent(left) });
  assert.deepEqual(
    operator.keeps.map((one) => [one.by, one.draft.versions.length]),
    [
      [OPERATOR, 0],
      [OPERATOR, 3],
    ],
  );
  const owner = alsoSeated(operator, "owner", USER);
  const opened = await draftAd(owner.rc, {});
  assert.deepEqual([opened.left_by, opened.draft.versions], ["Maria", VERSIONS]);
  assert.equal(operator.keeps.length, 2, "opening it keeps nothing: the bell's row waits for the owner's change");
  const changed = await draftAd(owner.rc, { draft: sent(opened, { total_minor: 9000 }) });
  assert.equal(changed.left_by, null, "changed, it is the owner's");
  assert.deepEqual(operator.keeps.at(-1).by, USER);
  assert.equal(calls.length, 1);
});

// ---------------------------------------------------------------------------------------------------------------------
// Two asks at once: a reload, a second device, another member (00672)

/** The model, its answer (or `refused`) held until the test lets it go: a writer out for as long as a test needs. */
function modelHeld(answer, refused = null) {
  let go = () => {};
  const gate = new Promise((resolve) => {
    go = resolve;
  });
  setModelStream(async function* (call) {
    calls.push(call);
    await gate;
    if (refused) throw refused;
    yield { type: "text", index: 0, text: JSON.stringify(answer) };
    yield { type: "stop", stopReason: "end_turn" };
  });
  return go;
}

test("reloaded while the writer is out: the second ask waits for the first one's words, and the writer is asked once", async () => {
  const go = modelHeld(wrote());
  const { answer, who } = await fresh(world({ profile: ONE_SERVICE }));
  const first = writeAdWords(who, { job: "write", draft: sent(answer) });
  await until(() => calls.length === 1, "the writer to be asked");
  // Reloaded, or opened on another device: the kept draft holds no words yet, so the screen asks for them.
  const reopened = await draftAd(who.rc, {});
  assert.deepEqual(reopened.draft.versions, []);
  const second = writeAdWords(who, { job: "write", draft: sent(reopened) });
  await until(() => who.writers.length === 2 || calls.length === 2, "the second ask to be out");
  go();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(calls.length, 1, "REGRESSION: the writer was asked twice for one draft");
  assert.deepEqual([one.wrote, one.draft.versions], [{ ok: true }, VERSIONS]);
  assert.deepEqual([two.wrote, two.draft.versions], [{ ok: true }, VERSIONS], "the words the first one kept");
  assert.equal(who.tables.ad_drafts[0].writing_ask, null, "back, the writer is no longer marked out");
});

test("an ask that waited for a writer who came to nothing, or who is out past its time, writes the words itself", async () => {
  const go = modelHeld(null, new Error("the stream broke"));
  const { answer, who } = await fresh(world({ profile: ONE_SERVICE }));
  const first = writeAdWords(who, { job: "write", draft: sent(answer) });
  await until(() => calls.length === 1, "the writer to be asked");
  const second = writeAdWords(who, { job: "write", draft: sent(answer) });
  await until(() => who.writers.length === 2, "the second ask to find the writer out");
  modelSays(wrote());
  go();
  assert.deepEqual((await first).wrote, { ok: false, why: "other" });
  const written = await second;
  assert.deepEqual([written.wrote, written.draft.versions, calls.length], [{ ok: true }, VERSIONS, 2]);
  // A writer out past its time (its request gone with it) is not waited for.
  const stuck = modelHeld(wrote());
  const lost = writeAdWords(who, { job: "write", draft: sent(answer), no_price: true });
  await until(() => calls.length === 3, "a writer to be out");
  who.tables.ad_drafts[0].writing_until = new Date(Date.now() - 1).toISOString();
  const next = writeAdWords(who, { job: "write", draft: sent(answer), no_price: true });
  await until(() => calls.length === 4, "the next ask to write its own");
  stuck();
  await Promise.all([lost, next]);
});

test("a writer out for other words is not waited for: Take the price out, or another picture, is written for itself", async () => {
  const go = modelHeld(wrote());
  const { answer, who } = await fresh(world({ profile: ONE_SERVICE, tables: { files: [file(1), file(2)] } }));
  const first = writeAdWords(who, { job: "write", draft: sent(answer) });
  await until(() => calls.length === 1, "the writer to be asked");
  const unpriced = writeAdWords(who, { job: "write", draft: sent(answer), no_price: true });
  await until(() => calls.length === 2, "the words without the price to be asked for themselves");
  const pictured = writeAdWords(who, { job: "write", draft: sent(answer, { picture: FILE(2) }) });
  await until(() => calls.length === 3, "the next picture's words to be asked for themselves");
  go();
  await Promise.all([first, unpriced, pictured]);
});

test("words that land after the draft was changed on another device are put into it: what was set there stands", async () => {
  const go = modelHeld(wrote());
  const { answer, who } = await fresh(world({ profile: ONE_SERVICE }));
  const writing = writeAdWords(who, { job: "write", draft: sent(answer) });
  await until(() => calls.length === 1, "the writer to be asked");
  // In those seconds, an operator sets the amount and the miles on their own device.
  const operator = alsoSeated(who, "operator", OPERATOR);
  await draftAd(operator.rc, { draft: sent(answer, { total_minor: 9000, miles: 8 }) });
  go();
  const landed = await writing;
  const { draft } = who.tables.ad_drafts[0];
  assert.deepEqual(
    [draft.total_minor, draft.miles, draft.versions],
    [9000, 8, VERSIONS],
    "REGRESSION: the words were kept over the amount and the miles set meanwhile",
  );
  assert.deepEqual(
    [landed.wrote, landed.draft.total_minor, landed.draft.miles, landed.draft.versions],
    [{ ok: true }, 9000, 8, VERSIONS],
    "the answer is the draft as it now stands",
  );
});

test("words for a service the draft no longer offers are not put into it: the draft stands as changed", async () => {
  const both = { services: [...ONE_SERVICE.services, { name: "Consultation", duration_min: 30 }] };
  const go = modelHeld(wrote());
  const { answer, who } = await fresh(world({ profile: both }));
  assert.equal(answer.draft.service, "First appointment");
  const writing = writeAdWords(who, { job: "write", draft: sent(answer) });
  await until(() => calls.length === 1, "the writer to be asked");
  await draftAd(who.rc, { draft: sent(answer, { service: "Consultation" }) });
  go();
  const landed = await writing;
  const { draft } = who.tables.ad_drafts[0];
  assert.deepEqual([draft.service, draft.versions], ["Consultation", []], "REGRESSION: another service's words kept");
  assert.deepEqual(
    [landed.draft.service, landed.draft.versions, landed.wrote],
    ["Consultation", [], { ok: false, why: "other" }],
  );
});

test("a change of AI's that lands after the same thing was set on another device is not made; one of another thing is", async () => {
  const { answer, who } = await fresh(world({ profile: ONE_SERVICE }));
  const held = sent(answer, { versions: VERSIONS });
  await draftAd(who.rc, { draft: held });
  const tell = async (asked, change, meanwhile) => {
    const go = modelHeld({ versions: [], change: { ...NO_CHANGE, ...change }, could_not: "" });
    const asking = writeAdWords(who, { job: "change", draft: held, asked });
    await until(() => calls.length > 0, "AI to be told");
    await draftAd(who.rc, { draft: sent(answer, { versions: VERSIONS, ...meanwhile }) });
    go();
    calls = [];
    return asking;
  };
  const amount = await tell("make it 120 dollars", { kind: "amount", amount: 120 }, { total_minor: 9000 });
  assert.equal(who.tables.ad_drafts[0].draft.total_minor, 9000, "REGRESSION: AI's amount kept over the one set");
  assert.deepEqual([amount.draft.total_minor, amount.changed], [9000, { kind: "none", fault: null }]);
  const area = await tell("reach ten miles", { kind: "area", miles: 10 }, { total_minor: 8000 });
  assert.deepEqual(
    [who.tables.ad_drafts[0].draft.miles, who.tables.ad_drafts[0].draft.total_minor],
    [10, 8000],
    "REGRESSION: AI's miles kept over the amount set meanwhile",
  );
  assert.deepEqual([area.draft.miles, area.draft.total_minor, area.changed], [10, 8000, { kind: "area" }]);
});

test("words that land after the draft was turned on bring no draft back", async () => {
  const go = modelHeld(wrote());
  const { answer, who } = await fresh(world({ profile: ONE_SERVICE }));
  const writing = writeAdWords(who, { job: "write", draft: sent(answer) });
  await until(() => calls.length === 1, "the writer to be asked");
  // Turned on from another device: the draft becomes the ad, and goes (00666 ad_turn_on).
  who.tables.ad_drafts = [];
  go();
  await writing;
  assert.deepEqual(who.tables.ad_drafts, [], "REGRESSION: a draft turned on came back with its words");
});

test("words that land over a draft kept meanwhile for another ad account take its place, as before", async () => {
  const go = modelHeld(wrote());
  const { answer, who } = await fresh(world({ profile: ONE_SERVICE }));
  const writing = writeAdWords(who, { job: "write", draft: sent(answer) });
  await until(() => calls.length === 1, "the writer to be asked");
  Object.assign(who.tables.ad_drafts[0], {
    account_id: "cccccccc-cccc-4ccc-8ccc-000000000000",
    updated_at: new Date(NOW.getTime() + 60_000).toISOString(),
  });
  go();
  const landed = await writing;
  const [row] = who.tables.ad_drafts;
  assert.deepEqual([row.account_id, row.draft.versions, landed.wrote], [ACCOUNT, VERSIONS, { ok: true }]);
});

// ---------------------------------------------------------------------------------------------------------------------
// AI's own turn drafts an ad (6.3, 6.7)

test("AI's card drafts on New ad's own route: the service it named, with that service's own picture, kept", async () => {
  const who = seated(world());
  const named = await draftAd(who.rc, { service: "first appointment" });
  assert.deepEqual([named.draft.service, named.picked, named.draft.versions], ["First appointment", null, []]);
  assert.equal(who.keeps.at(-1).draft.service, "First appointment", "kept in place of what was there");
  // A service Services does not list is the rule's own pick.
  assert.equal((await draftAd(who.rc, { service: "Massage" })).draft.service, "Consultation");
  // The card's own press: New ad's route with what the card carries, and New ad opened.
  const spec = C.PROPOSAL_SPECS.ad_draft;
  assert.deepEqual(spec.commit({ payload: { service: "First appointment", most: 300 } }, { settings: null }), {
    route: "POST ads/draft",
    body: { service: "First appointment", most: 300 },
  });
  assert.deepEqual(spec.commit({ payload: { service: null, most: null } }, { settings: null }), {
    route: "POST ads/draft",
    body: {},
  });
  // The piece the owner asked about rides beside them, as Run as an ad's press sends it; the route takes the body whole.
  const around = spec.commit(
    { payload: { service: "Consultation", most: null, picture: FILE(7) } },
    { settings: null },
  );
  assert.deepEqual(around.body, { service: "Consultation", picture: FILE(7) });
  assert.deepEqual(AdDraftBodySchema.parse(around.body), around.body);
  assert.deepEqual([spec.needs, spec.open({ payload: {} }, null)], ["operator", "campaigns/ads:new"]);
});

/**
 * AI's tool, built as a turn builds it: the member, their question, and the workspace; `about`, the file the question is
 * asked about (Content's line to AI on an open piece), and `who`, a workspace already seated.
 */
function toolOf(tables, role = "owner", question = "Make me an ad", { who = seated(tables, role), about } = {}) {
  const { build } = adDraftAct.actions[""];
  const toolContext = {
    ctx: who.rc.ctx,
    tenantId: who.rc.tenantId,
    role,
    rc: who.rc,
    question,
    now: NOW,
    timezone: TZ,
    ...(about ? { subjectFile: about } : {}),
  };
  return (input) => build(toolContext, input);
}

test("AI's tool proposes the card and decides none of the draft; the most is only the owner's, as they said it", async () => {
  const owner = toolOf(world(), "owner", "Make an ad for first appointments, and never spend more than $1,200 on one");
  const card = await owner({ service: "First Appointment", most: 1200 });
  assert.equal(card.isError, false);
  assert.equal(card.proposal.kind, "ad_draft");
  assert.deepEqual(card.proposal.payload, { service: "First appointment", most: 1200, picture: null });
  assert.equal(card.proposal.title, "New ad for First appointment");
  assert.match(card.proposal.summary, /From now on, no ad costs more than 1200 USD\.$/);
  assert.equal(card.proposal.needs, "operator");
  // A most the owner did not say in this question is left out, and AI is told so.
  const unsaid = await toolOf(world(), "owner", "Make me an ad")({ most: 500 });
  assert.deepEqual([unsaid.proposal.payload.most, typeof unsaid.noted], [null, "string"]);
  // An operator's most is not kept: the card leaves it out, says it is the owner's alone, and is left for the owner.
  const operator = await toolOf(world(), "operator", "Make an ad, at most 500 dollars")({ most: 500 });
  assert.equal(operator.proposal.payload.most, null);
  assert.match(operator.noted, /Only the owner can say the most an ad may cost/);
  assert.match(operator.proposal.summary, /left for the owner/);
  // A service Services does not list is refused with what it does list; no account, or Ads not on here, too.
  const unknown = await toolOf(world())({ service: "Massage" });
  assert.match(unknown.refusal, /Services lists no "Massage"\. Its services are: Consultation, First appointment\./);
  assert.match((await toolOf(world({ tables: { ad_accounts: [] } }))({})).refusal, /No Meta ad account is connected/);
  offered = false;
  assert.match((await toolOf(world())({})).refusal, /Ads are not switched on in this workspace/);
});

// ---------------------------------------------------------------------------------------------------------------------
// A service's own name is free text: the writer names it in a few words (4.6)

/** A service named the way an owner might, in a sentence. */
const LONG = "discovery call on Chanlytics and how it helps streamline parts of your business";
const CALL_VERSIONS = [
  {
    headline: "A call with Chanlytics",
    text: "A call about how Chanlytics helps a business run. Message us on WhatsApp to set a time.",
  },
  {
    headline: "Talk to Chanlytics",
    text: "Chanlytics helps a business with its daily work. Message us on WhatsApp to talk it through.",
  },
  { headline: "Discovery call", text: "A discovery call with Chanlytics. Message us on WhatsApp to pick a time." },
];

test("a service named in a sentence: the writer names it in a few words, kept with its words, gone with the service", async () => {
  const who = seated(world({ profile: { services: [{ name: LONG }] } }));
  const answer = await draftAd(who.rc, {});
  assert.equal(answer.draft.label, undefined, "no name of its own before the words");
  modelSays({ ...wrote(CALL_VERSIONS), label: "  Discovery call " });
  const written = await writeAdWords(who, { job: "write", draft: sent(answer) });
  assert.deepEqual([written.wrote, written.draft.label], [{ ok: true }, "Discovery call"]);
  assert.equal(who.keeps.at(-1).draft.label, "Discovery call", "kept with the words");
  assert.match(calls.at(-1).request.messages[0].content, /Answer label: the service in a few words/);
  // Judged again, sent back as the screen sends it: it stays.
  assert.equal((await draftAd(who.rc, { draft: sent(written) })).draft.label, "Discovery call");
  // A service Services no longer lists: the rule's own pick, with no words and no name of the one that went.
  const gone = await draftAd(who.rc, { draft: sent(written, { service: "Massage" }) });
  assert.deepEqual([gone.draft.service, gone.draft.label, gone.draft.versions], [LONG, undefined, []]);
  // A name no shorter than the service's own, or past forty characters, is no name: none is kept.
  for (const label of [LONG, "A call about Chanlytics and the business it runs"]) {
    modelSays({ ...wrote(CALL_VERSIONS), label });
    const none = await writeAdWords(who, { job: "write", draft: sent(answer) });
    assert.equal(none.draft.label, undefined, label);
  }
  // The writer is told to answer it, as its schema requires.
  assert.ok(C.AD_CRAFT_JSON_SCHEMA.required.includes("label"));
});

// ---------------------------------------------------------------------------------------------------------------------
// Run as an ad, on a made piece in Content (the plan's 6.8, join 3, with G13 and G15)

/** A post AI made of the front desk: nobody in it, the feed's portrait shape. */
const piece = (n, over = {}) =>
  file(n, {
    source: "made",
    name: `post-${n}`,
    width: 1080,
    height: 1350,
    look: { line: "A post of the front desk.", people: { count: 0, recognizable: 0 }, issues: [] },
    ...over,
  });
/** A video AI made, ready to play. */
const pieceVideo = (over = {}) =>
  piece(7, { kind: "video", mime: "video/mp4", seconds: 20, media_status: "ready", ...over });
/** What a made piece was drawn from, as files_drawn_from answers it: the photo or the clips it shows. */
const drawnFrom = (from) => ({ file_id: FILE(7), from_id: from });
/** Someone at the chair, whom someone who knows them could recognize. */
const AT_THE_CHAIR = { line: "A stylist at the chair.", people: { count: 1, recognizable: 1 }, issues: [] };
/** A video's sound, heard whole: with music, or with none. */
const HEARD = (music) => ({
  note: {
    speech: false,
    music: music ? { present: true, kind: "pop" } : { present: false },
    voices: [],
    sounds: [],
    feel: music ? "bright" : "calm",
    unsure: false,
  },
});

/**
 * A workspace whose made pieces say what they were drawn from. The service role reads that (files_drawn_from), so its
 * client is this workspace's database in memory, as the session's is.
 */
function seatedMade(tables, drawn = [], role = "owner") {
  const who = seated(tables, role);
  const db = fakeDb(
    who.tables,
    {},
    {
      ads_page_counts: () => NO_COUNTS,
      ...draftDoors(who.tables, who.userId, who.keeps, who.writers),
      files_drawn_from: ({ p_ids }) => drawn.filter((row) => p_ids.includes(row.file_id)),
    },
  );
  setServiceClient(db);
  const ctx = { supabase: db, userId: who.userId, email: "ada@example.com", params: {} };
  return { ...who, rc: readerContext(ctx, { tenantId: who.tenantId, role }, NOW) };
}

test("Run as an ad: a fresh draft around the piece Content chose, kept, and never 'gone' for being older than the newest read", async () => {
  // Thirty newer posts, each fine in ads, fill the shelf a draft reads: the one chosen is older than all of them.
  const id = (n) => `f${String(n).padStart(7, "0")}-0000-4000-8000-000000000000`;
  const newer = (n) => `2026-11-19T${String(10 + (n % 10)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00Z`;
  const others = Array.from({ length: 30 }, (_, n) =>
    piece(1, { id: id(300 + n), name: `post-new-${n}`, created_at: newer(n), updated_at: newer(n) }),
  );
  const chosen = piece(7, { created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z" });
  const who = seatedMade(world({ tables: { files: [...others, chosen, file(1)] } }));
  const plain = await draftAd(who.rc, {});
  assert.notEqual(plain.draft.picture.id, FILE(7), "+ New picks by its own rule: the newest piece AI made");
  const ran = await draftAd(who.rc, { picture: FILE(7) });
  assert.equal(ran.can, true);
  assert.deepEqual(ran.draft.picture, { id: FILE(7), kind: "photo", name: "post-7", made: true });
  // Files says no service a picture is about: the draft's own pick, said as it is for + New.
  assert.deepEqual([ran.draft.service, ran.picked, ran.draft.versions, ran.checks], ["Consultation", "first", [], []]);
  assert.equal(who.keeps.at(-1).draft.picture, FILE(7), "kept in place of the draft there was");
  // Judged again as the screen sends it, opened again from the kept draft, and written: still its picture.
  const judged = await draftAd(who.rc, { draft: sent(ran) });
  assert.deepEqual([judged.draft.picture.id, judged.checks], [FILE(7), []]);
  const reopened = await draftAd(who.rc, {});
  assert.deepEqual([reopened.draft.picture.id, reopened.checks], [FILE(7), []]);
  modelSays(
    wrote([
      { headline: "Consultation", text: "A consultation at Harbor Studio. Message us on WhatsApp to pick a time." },
      { headline: "Harbor Studio", text: "Consultations at Harbor Studio. Message us on WhatsApp for a time." },
      { headline: "A consultation", text: "Message Harbor Studio on WhatsApp to book a consultation." },
    ]),
  );
  const words = await writeAdWords(who, { job: "write", draft: sent(ran) });
  assert.deepEqual([words.wrote, words.draft.picture.id, words.checks], [{ ok: true }, FILE(7), []]);
  // Nothing is made at Meta by drafting: this file's fetch answers the edge's word on Ads alone, and refuses the rest.
});

test("Run as an ad offers the service the piece is about, where its name says one, as a calendar title names one", async () => {
  const offered = async (name, tables = {}) => {
    const who = seatedMade(world({ tables: { files: [file(1), piece(7, { name })], ...tables } }));
    const answer = await draftAd(who.rc, { picture: FILE(7) });
    return [answer.draft.service, answer.picked];
  };
  // A post named for its headline: the service it names, said with no "why this service", since the piece says it.
  assert.deepEqual(await offered("Autumn FIRST appointment"), ["First appointment", null]);
  // A name that names none, or a service an ad made here already runs for: the draft's own pick, and why.
  assert.deepEqual(await offered("The front desk"), ["Consultation", "first"]);
  const running = {
    id: "d0000000-0000-4000-8000-000000000002",
    tenant_id: A,
    account_id: ACCOUNT,
    platform: "meta",
    origin: "chanlytics",
    name: "First appointment",
    door: "whatsapp",
    status: "made",
    intent: "on",
    platform_state: "ACTIVE",
    platform_ad_id: "23850000000000002",
    budget_kind: "total",
    budget_minor: 12000,
    budget_left_minor: 9000,
    ends_at: "2026-12-10T22:00:00Z",
    version: 1,
    created_at: "2026-11-10T10:00:00Z",
  };
  assert.deepEqual(await offered("Autumn first appointment", { ads: [running] }), ["Consultation", "first"]);
  // AI's card named one: the card's, whatever the piece is named.
  const who = seatedMade(world({ tables: { files: [file(1), piece(7, { name: "Autumn first appointment" })] } }));
  const both = await draftAd(who.rc, { picture: FILE(7), service: "Consultation" });
  assert.deepEqual([both.draft.service, both.draft.picture.id, both.picked], ["Consultation", FILE(7), null]);
});

test("Run as an ad on a piece that may not run: the one thing missing for it, never another picture, and nothing kept", async () => {
  const ranOn = async (files, drawn = [], tables = {}) => {
    const who = seatedMade(world({ tables: { files: [file(1), ...files], ...tables } }), drawn);
    const answer = await draftAd(who.rc, { picture: FILE(7) });
    return { got: answer.can ? answer.draft.picture.id : answer.missing, kept: who.keeps.length };
  };
  // Fine: drawn from a photo whose person said yes to ads.
  const yes = file(2, { look: AT_THE_CHAIR, yes_for: ["ad", "post"] });
  assert.deepEqual(await ranOn([piece(7), yes], [drawnFrom(FILE(2))]), { got: FILE(7), kept: 1 });
  // Someone shown, on the piece or on the photo it was drawn from with a yes for posts alone. The front desk photo,
  // fine in ads, stands beside it the whole time, and is never offered in its place.
  assert.deepEqual(await ranOn([piece(7, { look: AT_THE_CHAIR })]), { got: "picture_person", kept: 0 });
  const postsOnly = file(2, { look: AT_THE_CHAIR, yes_for: ["post"] });
  assert.deepEqual(await ranOn([piece(7), postsOnly], [drawnFrom(FILE(2))]), { got: "picture_person", kept: 0 });
  // A video with music, or not heard yet; a quiet square one runs; a story's tall shape is not a feed's.
  assert.equal((await ranOn([pieceVideo({ sound: HEARD(true) })])).got, "picture_music");
  assert.equal((await ranOn([pieceVideo({ sound: null })])).got, "picture_music");
  assert.equal((await ranOn([pieceVideo({ sound: HEARD(false), width: 1080, height: 1080 })])).got, FILE(7));
  assert.equal((await ranOn([piece(7, { width: 1080, height: 1920 })])).got, "picture");
  // Deleted, or set aside, since the press: gone, said as such; an ad account not connected is said first.
  assert.equal((await ranOn([piece(7, { removed_at: "2026-11-19T14:00:00Z" })])).got, "picture_gone");
  assert.equal((await ranOn([piece(7, { status: "set_aside" })])).got, "picture_gone");
  assert.equal((await ranOn([])).got, "picture_gone");
  assert.equal((await ranOn([piece(7)], [], { ad_accounts: [] })).got, "account");
});

test("a made piece says as it opens whether it may run as an ad: Content's one rule, where Ads is on and an account connected", async () => {
  const standsOf = async (row, { drawn = [], others = [], tables = {} } = {}) => {
    const who = seatedMade(world({ tables: { files: [row, ...others], ...tables } }), drawn);
    return readPieceAd(
      who.rc,
      who.tables.files.find((one) => one.id === row.id),
    );
  };
  assert.deepEqual(await standsOf(piece(7)), { is: "may" });
  assert.deepEqual(await standsOf(piece(7, { look: AT_THE_CHAIR })), { is: "wont", why: "person" });
  assert.deepEqual(await standsOf(piece(7, { look: AT_THE_CHAIR, yes_for: ["ad"] })), { is: "may" });
  assert.deepEqual(
    await standsOf(piece(7), {
      drawn: [drawnFrom(FILE(2))],
      others: [file(2, { look: AT_THE_CHAIR, yes_for: ["post"] })],
    }),
    { is: "wont", why: "person" },
    "a piece shows who its photo shows: a yes for posts doesn't cover an ad",
  );
  // Music, and a video not heard yet: both held back, each said as what it is.
  assert.deepEqual(await standsOf(pieceVideo({ sound: HEARD(true) })), { is: "wont", why: "music" });
  assert.deepEqual(await standsOf(pieceVideo({ sound: null })), { is: "wont", why: "unheard" });
  assert.deepEqual(await standsOf(pieceVideo({ sound: HEARD(false), width: 1080, height: 1080 })), { is: "may" });
  assert.deepEqual(await standsOf(pieceVideo({ sound: HEARD(false), width: 1080, height: 1920 })), {
    is: "wont",
    why: "shape",
  });
  assert.deepEqual(await standsOf(pieceVideo({ sound: HEARD(false), seconds: 90 })), { is: "wont", why: "length" });
  // No ad account connected yet: that is what it says, whatever the picture.
  assert.deepEqual(await standsOf(piece(7), { tables: { ad_accounts: [] } }), { is: "no_account" });
  assert.deepEqual(await standsOf(piece(7, { look: AT_THE_CHAIR }), { tables: { ad_accounts: [] } }), {
    is: "no_account",
  });
  // Nothing said: a photo of the Library, a video not ready to play, and Ads not on in this workspace here.
  assert.equal(await standsOf(file(1)), null);
  assert.equal(await standsOf(pieceVideo({ media_status: "processing" })), null);
  offered = false;
  assert.equal(await standsOf(piece(7)), null);
});

// AI's card around the piece the owner asks about (6.3 with 6.8, join 3)

/** A workspace no seat rewrites: a piece of its own is never this one's. */
const ELSEWHERE = "99999999-9999-4999-8999-999999999999";

/** AI's tool in a workspace of made pieces, the question asked about `about` (a file's id; Content's line on a piece). */
function pieceToolOf(files, { drawn = [], about = FILE(7), question = "Run this as an ad" } = {}) {
  const who = seatedMade(world({ tables: { files: [file(1), ...files] } }), drawn);
  return { who, tool: toolOf(null, "owner", question, { who, ...(about ? { about } : {}) }) };
}

test("AI's tool asked about a made piece: a card drafted around it where Content's rule lets it run, and why not where it doesn't", async () => {
  // The piece open in Content, left out of the call: the card carries it, and its press drafts around it on New ad's route.
  const { who, tool } = pieceToolOf([piece(7)]);
  const card = await tool({});
  assert.deepEqual(card.proposal.payload, { service: null, most: null, picture: FILE(7) });
  assert.equal(card.proposal.title, "Run Post 7 as an ad");
  const pressed = await draftAd(who.rc, C.PROPOSAL_SPECS.ad_draft.commit(card.proposal, { settings: null }).body);
  assert.deepEqual([pressed.can, pressed.draft.picture.id], [true, FILE(7)]);
  assert.equal(who.keeps.at(-1).draft.picture, FILE(7), "kept, so New ad opens on it");
  // Named by its name in a turn about nothing, beside a service: both ride, and the card says the piece once.
  const named = await pieceToolOf([piece(7)], { about: null }).tool({ file: "post-7", service: "consultation" });
  assert.deepEqual(named.proposal.payload, { service: "Consultation", most: null, picture: FILE(7) });
  assert.equal(named.proposal.title, "New ad for Consultation");
  assert.match(named.proposal.summary, /^Shows Post 7\. AI drafts it in New ad/);
  // Where it may not run: why, by Content's one rule, so AI says it; and no card.
  const refusedFor = async (files, drawn = []) => {
    const answer = await pieceToolOf(files, { drawn }).tool({});
    assert.equal(answer.proposal, null, "no card");
    return answer.refusal;
  };
  assert.match(await refusedFor([piece(7, { look: AT_THE_CHAIR })]), /hasn't said yes to ads/);
  const postsOnly = file(2, { look: AT_THE_CHAIR, yes_for: ["post"] });
  assert.match(await refusedFor([piece(7), postsOnly], [drawnFrom(FILE(2))]), /hasn't said yes to ads/);
  assert.match(await refusedFor([pieceVideo({ sound: HEARD(true) })]), /has music/);
  assert.match(await refusedFor([pieceVideo({ sound: null })]), /isn't heard yet/);
  assert.match(await refusedFor([piece(7, { width: 1080, height: 1920 })]), /shape doesn't fit/);
  assert.match(await refusedFor([pieceVideo({ sound: HEARD(false), seconds: 90 })]), /too long or too short/);
  assert.match(await refusedFor([pieceVideo({ media_status: "processing" })]), /can't be played yet/);
  assert.match(await refusedFor([piece(7, { status: "set_aside" })]), /is set aside/);
  // Only a piece AI made, and only this workspace's: a photo the question is about is no piece, so the draft's own pick.
  const library = pieceToolOf([piece(7)], { about: FILE(1) }).tool;
  assert.equal((await library({})).proposal.payload.picture, null);
  assert.match((await library({ file: "front-desk-1" })).refusal, /isn't a piece AI made/);
  const theirs = piece(8, { tenant_id: ELSEWHERE, name: "post-elsewhere" });
  const notHere = pieceToolOf([piece(7), theirs], { about: null }).tool;
  assert.match((await notHere({ file: "post-elsewhere" })).refusal, /No file named post-elsewhere/);
  // The piece the question was about, deleted since: said as gone, its id never told.
  const gone = await pieceToolOf([piece(7, { removed_at: "2026-11-19T14:00:00Z" })]).tool({});
  assert.match(gone.refusal, /isn't in Files any more/);
  assert.doesNotMatch(gone.refusal, new RegExp(FILE(7)));
});
