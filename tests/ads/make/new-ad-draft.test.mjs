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
    { id: "ch-wa", tenant_id: A, kind: "whatsapp", status: "active", number_e164: "+13055550142", config: {} },
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
  globalThis.fetch = async (url) => {
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
});

/** The model, answering `answer` (or throwing `refused`), one text event and a stop, as the gateway streams them. */
const modelSays = (answer, refused = null) =>
  setModelStream(async function* (call) {
    calls.push(call);
    if (refused) throw refused;
    yield { type: "text", index: 0, text: JSON.stringify(answer) };
    yield { type: "stop", stopReason: "end_turn" };
  });

/** A workspace no two tests share: the edge's word is kept by workspace for a minute. */
let seat = 0;
function seated(tables, role = "owner") {
  seat += 1;
  const tenantId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seat).padStart(12, "0")}`;
  const mine = JSON.parse(JSON.stringify(tables).replaceAll(A, tenantId));
  const db = fakeDb(mine, {}, { ads_page_counts: () => NO_COUNTS });
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: {} };
  return { rc: readerContext(ctx, { tenantId, role }, NOW), userId: USER };
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
  assert.deepEqual(answer.amount, { starting: true, least_minor: 7500, history: false });
  assert.deepEqual(answer.checks, []);
  // The job that makes an ad at Meta is the next part: the press is drawn, and cannot be pressed yet.
  assert.equal(answer.turn_on, "not_yet");
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
  assert.equal(await missing(world({ tables: { files: [] } })), "picture");
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

test("only a picture that shows nobody and has no music is offered, in a shape the feed takes: never one to crop (G15)", async () => {
  const offeredOf = async (files) => {
    const { answer } = await fresh(world({ tables: { files } }));
    return answer.can ? answer.draft.picture.id : answer.missing;
  };
  // A person shown, a yes for posts alone, a photo nobody has looked at, a story's tall shape, a small one: none.
  assert.equal(
    await offeredOf([
      file(1, { look: { line: "Two stylists at work.", people: { count: 2, recognizable: 2 }, issues: [] } }),
      file(2, { who_in_it: "agreed" }),
      file(3, { look: null, look_status: "waiting" }),
      file(4, { width: 1080, height: 1920 }),
      file(5, { width: 400, height: 500 }),
      file(6, {
        look: { line: "A before and after of the salon.", people: { count: 0, recognizable: 0 }, issues: [] },
      }),
    ]),
    "picture",
  );
  // A member's own word that nobody is in it is enough.
  assert.equal(await offeredOf([file(1, { who_in_it: "no_one", look: null, look_status: "waiting" })]), FILE(1));
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
  assert.equal(await offeredOf([video(2, loud), video(3, null)]), "picture");
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
  assert.deepEqual([judged.draft.total_minor, judged.amount.starting, judged.checks.length], [12000, false, 0]);
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
