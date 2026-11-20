/**
 * What stops a new ad before Turn on (the Ads plan's 5.1; the dashboard's server/ads/draft-checks.ts): every row of
 * the plan's table, each run with words, a picture or an amount that passes and one that fails, and the one act the
 * failing one is offered. They are rules in code: no model is asked, and none decides whether a check passed.
 *
 * The brief each draft is judged against is built by the product's own builder (server/ask/skills/ad/brief.ts
 * adBriefOf), the one New ad's route, AI's own turn and the writer's test set share.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { adDeclared, adDraftChecks, adKindsOf } = await import(at("apps/dashboard/src/server/ads/draft-checks.ts"));
const { adBriefOf, adServiceFacts, adWordIssues } = await import(
  at("apps/dashboard/src/server/ask/skills/ad/brief.ts")
);
const C = await import("@chanlytics/contracts");

const TODAY = "2026-11-19";

/** Harbor Studio, as its settings say it. */
const business = (over = {}) => ({
  name: "Harbor Studio",
  tone: "Warm and brief.",
  word: "appointment",
  neverPrices: false,
  language: "en",
  ...over,
});
/** A first appointment at $45, forty-five minutes, shown within five miles on Facebook. */
const offer = (over = {}) => ({
  service: { name: "First appointment", price: "$45" },
  facts: adServiceFacts({ name: "First appointment", minutes: 45 }),
  picture: "the front desk, nobody in it",
  area: { place: null, miles: 5 },
  places: ["facebook"],
  ...over,
});
const briefOf = (b = {}, o = {}) => adBriefOf(business(b), offer(o), { job: "write" });

/** Three versions that pass every rule. */
const GOOD = [
  {
    headline: "First appointment, $45",
    text: "A first appointment at Harbor Studio takes 45 minutes. Message us on WhatsApp to pick a time.",
  },
  { headline: "Harbor Studio", text: "First appointments at Harbor Studio. Message us on WhatsApp for a time." },
  { headline: "First appointment", text: "45 minutes, $45. Message Harbor Studio on WhatsApp to book." },
];
/** The same three, the first with other words. */
const withText = (text, headline = "First appointment") => [{ headline, text }, GOOD[1], GOOD[2]];

/** A picture that is fine in ads: nobody in it, the feed's shape, wide enough. */
const picture = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  serviceId: null,
  kind: "photo",
  width: 1440,
  height: 1800,
  seconds: null,
  people: false,
  music: false,
  beforeAfter: false,
  made: true,
  ...over,
});

const CARD_OK = C.AD_CARD_CHECKS.map((id) => ({ id, ok: true }));
/** An account in dollars whose least is $5 a day: fourteen days need $70. */
const facts = (over = {}) => ({
  today: TODAY,
  account: { currency: "USD", minDailyMinor: 500, checks: CARD_OK },
  ownerMostMinor: null,
  picture: picture(),
  brief: briefOf(),
  ...over,
});
/** A draft that passes: five miles, $70, fourteen days. */
const draft = (over = {}) => ({
  miles: 5,
  total_minor: 7000,
  end_day: C.addDays(TODAY, 14),
  versions: GOOD,
  ...over,
});
const checks = (d = {}, f = {}) => adDraftChecks(draft(d), facts(f));

test("a draft with nothing wrong has no line: the words, the picture, the amount, the end, the area and the account all pass", () => {
  assert.deepEqual(checks(), []);
  // Words not written yet are judged by nothing: a draft's sentence stands before its words arrive.
  assert.deepEqual(checks({ versions: [] }), []);
});

test("5.1 row 1, words that speak about the reader: refused, with AI's rewrite as the one act; the service described passes", () => {
  for (const text of [
    "Are you tired of waiting weeks? Message us on WhatsApp.",
    "Do you have back pain? Message us on WhatsApp.",
    "We look after your wrinkles. Message us on WhatsApp.",
    "¿Tienes dolor de espalda? Escríbenos por WhatsApp.",
  ])
    assert.deepEqual(checks({ versions: withText(text) }), [{ code: "words", fault: "about_reader" }], text);
  for (const text of [
    "New appointments this month at Harbor Studio. Message us on WhatsApp.",
    "Message us on WhatsApp to pick a time that suits you.",
  ])
    assert.deepEqual(checks({ versions: withText(text) }), [], text);
});

test("5.1 row 2, words that make someone feel bad about how they look, or promise a sure result", () => {
  assert.deepEqual(checks({ versions: withText("Fix your flaws at Harbor Studio. Message us on WhatsApp.") }), [
    { code: "words", fault: "feel_bad" },
  ]);
  assert.deepEqual(checks({ versions: withText("Guaranteed results at Harbor Studio. Message us on WhatsApp.") }), [
    { code: "words", fault: "sure_result" },
  ]);
  assert.deepEqual(checks({ versions: withText("Resultados garantizados. Escríbenos por WhatsApp.") }), [
    { code: "words", fault: "sure_result" },
  ]);
  // The owner's own word for the service is theirs to say: "Permanent makeup" promises nothing.
  const permanent = facts({ brief: briefOf({}, { service: { name: "Permanent makeup", price: null }, facts: [] }) });
  assert.deepEqual(
    adDraftChecks(
      draft({
        versions: [
          { headline: "Permanent makeup", text: "Permanent makeup at Harbor Studio. Message us on WhatsApp." },
          { headline: "Harbor Studio", text: "Harbor Studio does permanent makeup. Message us on WhatsApp to ask." },
          { headline: "By appointment", text: "Permanent makeup, by appointment. Message us on WhatsApp for a time." },
        ],
      }),
      permanent,
    ),
    [],
  );
});

test("hurry put on the reader, and words that say before and after, are named; anything else of the writer's is one line", () => {
  assert.deepEqual(checks({ versions: withText("Last chance at Harbor Studio! Message us on WhatsApp.") }), [
    { code: "words", fault: "pressure" },
  ]);
  assert.deepEqual(checks({ versions: withText("See the before and after. Message us on WhatsApp.") }), [
    { code: "words", fault: "before_after" },
  ]);
  // A phone number typed in, shouting, a text past what reads whole, two versions the same: the writer's to mend.
  for (const versions of [
    withText("Call 305 555 0142 or message us on WhatsApp."),
    withText("AMAZING first appointments. Message us on WhatsApp."),
    withText(`${"A first appointment at Harbor Studio. ".repeat(4)}Message us on WhatsApp.`),
    [GOOD[0], GOOD[0], GOOD[2]],
    [GOOD[0]],
  ])
    assert.deepEqual(checks({ versions }), [{ code: "words", fault: "other" }], versions[0].text);
});

test("5.1 row 3, a before-and-after picture: not offered, and a draft that shows one is told to take the next", () => {
  assert.deepEqual(checks({}, { picture: picture({ beforeAfter: true }) }), [
    { code: "picture", fault: "before_after" },
  ]);
  // Files notes it in the look's own sentence, read by the rule the words are read by. (A file read into a picture
  // is new-ad-draft.test.mjs, over the database.)
  const looked = (line) => C.AD_BEFORE_AFTER.test(line);
  assert.equal(looked("A kitchen before and after its refit, side by side."), true);
  assert.equal(looked("Una cocina, antes y después."), true);
  assert.equal(looked("The front desk with flowers on it."), false);
  assert.equal(C.adPictureIssue(picture()), null);
});
test("5.1 row 4, a picture or video in the wrong shape or length: the feed's shape, wide enough, a video of 3 to 60 seconds", () => {
  // A tall 9:16 is stories' shape, not the feed's: Ads never crops, so it is not offered.
  assert.deepEqual(checks({}, { picture: picture({ width: 1080, height: 1920 }) }), [
    { code: "picture", fault: "shape" },
  ]);
  assert.deepEqual(checks({}, { picture: picture({ width: 500, height: 625 }) }), [
    { code: "picture", fault: "small" },
  ]);
  const video = (seconds) => picture({ kind: "video", seconds, width: 1080, height: 1080 });
  assert.deepEqual(checks({}, { picture: video(90) }), [{ code: "picture", fault: "length" }]);
  assert.deepEqual(checks({}, { picture: video(2) }), [{ code: "picture", fault: "length" }]);
  for (const fine of [
    picture(),
    picture({ width: 1200, height: 1200 }),
    picture({ width: 1200, height: 628 }),
    video(30),
  ])
    assert.deepEqual(checks({}, { picture: fine }), [], `${fine.width}x${fine.height}`);
  // A picture no longer in Files is said as gone.
  assert.deepEqual(checks({}, { picture: null }), [{ code: "picture", fault: "gone" }]);
});

test("5.1 row 5, music and a person who has not said yes to ads: neither is ever offered, and not known is not offered either (G15)", () => {
  // What Files says of a picture is read into these three answers by server/ads/pictures.ts; new-ad-draft.test.mjs
  // runs that reading over the database, a file at a time. Here: what each answer does to a draft.
  const fault = (over) => checks({}, { picture: picture(over) });
  // Nobody: fine. Someone, or not known: never offered. A yes for posts does not cover an ad.
  assert.deepEqual(fault({ people: false }), []);
  assert.deepEqual(fault({ people: true }), [{ code: "picture", fault: "person" }]);
  assert.deepEqual(fault({ people: null }), [{ code: "picture", fault: "person" }], "not looked at yet");
  // A video: no music is fine. Music, or a sound nobody has heard yet, is not.
  const video = { kind: "video", seconds: 20, width: 1080, height: 1080 };
  assert.deepEqual(fault({ ...video, music: false }), []);
  assert.deepEqual(fault({ ...video, music: true }), [{ code: "picture", fault: "music" }]);
  assert.deepEqual(fault({ ...video, music: null }), [{ code: "picture", fault: "music" }], "not heard yet");
});
test("5.1 row 6, a price: any price while AI never quotes one, and a price Services does not say; each is offered Take the price out", () => {
  // AI is set to never quote prices: the brief hands the writer no price, and a price in the words stops the ad.
  const never = facts({ brief: briefOf({ neverPrices: true }) });
  assert.equal(never.brief.service.price, null, "a business that never quotes one hands the writer no price line");
  assert.deepEqual(
    adDraftChecks(draft(), never).map((check) => check.code),
    ["price"],
  );
  assert.deepEqual(
    adDraftChecks(draft(), never).find((check) => check.code === "price"),
    { code: "price", fault: "never" },
  );
  const unpriced = [
    { headline: "First appointment", text: "A first appointment at Harbor Studio. Message us on WhatsApp." },
    GOOD[1],
    { headline: "Harbor Studio", text: "Message Harbor Studio on WhatsApp to book a first appointment." },
  ];
  assert.deepEqual(adDraftChecks(draft({ versions: unpriced }), never), []);
  // Services says $45: the words may say it, and no other.
  assert.deepEqual(checks(), []);
  const sixty = withText("A first appointment for $60. Message us on WhatsApp.", "First appointment, $60");
  assert.deepEqual(
    checks({ versions: sixty }).find((check) => check.code === "price"),
    { code: "price", fault: "differs" },
  );
  // The price left out for this ad alone ("Take the price out"): the writer is handed none, and words without one pass.
  const left = adBriefOf(business(), offer({ noPrice: true }), { job: "write" });
  assert.equal(left.service.price, null);
  assert.equal(left.business.neverPrices, true);
  assert.deepEqual(adWordIssues(unpriced, left), []);
});

test("5.1 row 7, a job, housing, financial products, politics or gambling: asked of the owner, never run here on a yes, and no check a rewrite clears", () => {
  const hiring = briefOf({}, { service: { name: "Stylist job opening", price: null }, facts: [] });
  assert.deepEqual(adKindsOf(hiring, []), ["employment"]);
  assert.deepEqual(adDeclared(["employment"], {}), { question: "employment", declared: "waiting" });
  assert.deepEqual(adDeclared(["employment"], { employment: "no" }), { question: null, declared: "none" });
  assert.deepEqual(adDeclared(["employment"], { employment: "yes" }), { question: null, declared: "employment" });
  // Most ads read as none: the press tells Meta so.
  assert.deepEqual(adKindsOf(briefOf(), GOOD), []);
  assert.deepEqual(adDeclared([], {}), { question: null, declared: "none" });
  // The words can raise it too, and it is still a question: the writer is never asked to write around a kind of ad.
  const words = withText("We are hiring at Harbor Studio. Message us on WhatsApp.");
  assert.deepEqual(adKindsOf(briefOf(), words), ["employment"]);
  assert.deepEqual(checks({ versions: words }), []);
  for (const [name, kind] of [
    ["Apartments for rent", "housing"],
    ["Credit repair", "financial"],
    ["Vote for Harbor", "politics"],
    ["Sportsbook night", "gambling"],
    ["Se renta local", "housing"],
  ])
    assert.deepEqual(adKindsOf(briefOf({}, { service: { name, price: null }, facts: [] }), []), [kind], name);
  // Cleaning an apartment is no housing ad, and taking a card no financial one.
  assert.deepEqual(adKindsOf(briefOf({}, { service: { name: "Apartment cleaning", price: null }, facts: [] }), []), []);
});

test("5.1 row 8, an amount under Meta's least for the run: the nearest amount Meta takes is offered", () => {
  // $5 a day for fourteen days is $70.
  assert.deepEqual(checks({ total_minor: 5000 }), [{ code: "amount", fault: "under_least", nearest_minor: 7000 }]);
  assert.deepEqual(checks({ total_minor: 7000 }), []);
  assert.deepEqual(checks({ total_minor: 24000 }), []);
  // The least follows the days: seven days need $35, thirty need $150.
  assert.deepEqual(checks({ total_minor: 3500, end_day: C.addDays(TODAY, 7) }), []);
  assert.deepEqual(checks({ total_minor: 7000, end_day: C.addDays(TODAY, 30) }), [
    { code: "amount", fault: "under_least", nearest_minor: 15000 },
  ]);
  // What an owner approves is a whole amount of the currency.
  assert.deepEqual(checks({ total_minor: 7050 }), [{ code: "amount", fault: "not_whole", nearest_minor: 7100 }]);
  // A most the owner said, once it is kept: nothing above it.
  assert.deepEqual(checks({ total_minor: 20000 }, { ownerMostMinor: 15000 }), [
    { code: "amount", fault: "over_most", nearest_minor: 15000 },
  ]);
  // A currency with no minor unit: Meta's least and the amount are whole yen.
  const yen = { account: { currency: "JPY", minDailyMinor: 700, checks: CARD_OK } };
  assert.deepEqual(checks({ total_minor: 9800 }, yen), []);
  assert.deepEqual(checks({ total_minor: 9000 }, yen), [{ code: "amount", fault: "under_least", nearest_minor: 9800 }]);
});

test("5.1 row 9, what Meta lets a new account spend in a day: no page lets it be read, so no rule here guesses one", () => {
  // Meta's own dry run is that check, at the press (the plan's 5.2). A large amount passes every rule in code.
  assert.deepEqual(checks({ total_minor: 5_000_00 }), []);
});

test("5.1 row 10, an end date too close to its start: a whole day at least, with the nearest date offered", () => {
  assert.deepEqual(
    checks({ end_day: TODAY, total_minor: 500 }).find((check) => check.code === "end"),
    { code: "end", nearest_day: C.addDays(TODAY, 1) },
  );
  assert.deepEqual(
    checks({ end_day: C.addDays(TODAY, -3), total_minor: 500 }).find((check) => check.code === "end"),
    { code: "end", nearest_day: C.addDays(TODAY, 1) },
  );
  assert.deepEqual(checks({ end_day: C.addDays(TODAY, 1), total_minor: 500 }), []);
});

test("5.1 row 11, the Page, the WhatsApp number, the payment method and the account's standing: the card's own checks, each its own line", () => {
  const card = (over) => C.AD_CARD_CHECKS.map((id) => ({ id, ok: id in over ? over[id] : true }));
  assert.deepEqual(checks({}, { account: { currency: "USD", minDailyMinor: 500, checks: card({ payment: false }) } }), [
    { code: "account", check: "payment" },
  ]);
  assert.deepEqual(
    checks(
      {},
      {
        account: {
          currency: "USD",
          minDailyMinor: 500,
          checks: card({ "account-active": false, "page-linked": false }),
        },
      },
    ),
    [
      { code: "account", check: "account-active" },
      { code: "account", check: "page-linked" },
    ],
  );
  // What Meta does not say is not known, and stops nothing.
  assert.deepEqual(
    checks({}, { account: { currency: "USD", minDailyMinor: 500, checks: card({ "whatsapp-linked": null }) } }),
    [],
  );
});

test("the area is whole miles inside what Meta takes, and a draft says the nearest", () => {
  assert.deepEqual(checks({ miles: 0 }), [{ code: "area", nearest_miles: 1 }]);
  assert.deepEqual(checks({ miles: 80 }), [{ code: "area", nearest_miles: 50 }]);
  for (const miles of [1, 5, 50]) assert.deepEqual(checks({ miles }), [], String(miles));
});

test("several things at once are said in a draft's order: the account, the picture, the words, a price, the amount, the end, the area", () => {
  const all = adDraftChecks(
    draft({
      versions: withText("Are you ready? A first appointment for $60. Message us.", "First appointment, $60"),
      total_minor: 100,
      end_day: TODAY,
      miles: 0,
    }),
    facts({
      account: { currency: "USD", minDailyMinor: 500, checks: [{ id: "payment", ok: false }] },
      picture: picture({ people: true }),
    }),
  );
  assert.deepEqual(
    all.map((check) => check.code),
    ["account", "picture", "words", "price", "amount", "end", "area"],
  );
});
