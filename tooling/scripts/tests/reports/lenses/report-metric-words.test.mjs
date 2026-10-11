/**
 * What a figure counts, and that the page says it (contracts metricWordsOf): every figure a report builds names a metric that
 * has words, the words that cite a window cite the constant the report counts by, each strip draws its figures with the words
 * over the label, and the Campaigns lens draws who said yes and who asked to stop, each with the period before beside it.
 * EXECUTED on the stub React over the one read the surface holds.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, all, byTestId, textOf, classes, find } from "../../_legacy-react.mjs";
import { DEALS, campaignDto, cday, reviewsDto, reviewsGoogle, reviewsHeld, surface } from "../_report-world.mjs";
import { ownHeld } from "../receptionist/_receptionist-world.mjs";
import { dtoWith } from "../people/_people-world.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
globalThis.window.fetch = async () =>
  new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "not read here" } }), { status: 500 });
const S = "../../../../../apps/dashboard/src";
const { ReportsPage } = await import(`${S}/surfaces/reports/reports-page.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { keepReportPeriod } = await import(`${S}/surfaces/reports/surface.ts`);
const { forgetStanding } = await import(`${S}/surfaces/kit/head/standing.ts`);
const {
  bookedTileOf,
  metricWordsOf,
  toGoogleVM,
  toPeopleReportVM,
  toReceptionistReportVM,
  MISSED_CALL_TOUCH_WORDS,
  REPLY_WINDOW_WORDS,
  DELIVERY_RECEIPTS_WORDS,
} = await import("@chanlytics/contracts");
after(() => forgetStanding());

const NOW = Date.parse("2026-09-07T15:00:00Z");
/** The Receptionist lens's own figures (contracts reports/receptionist/), folded from a small week with the hours said. */
const receptionistTiles = () => {
  const mix = { total: 0, by_reason: {} };
  const handover = { n: 2, replied: { n: 2, median_s: 300 }, settled: { n: 1, median_s: 900 } };
  const dto = {
    timezone: "America/New_York",
    today: "2026-09-07",
    days: 7,
    series: {
      timezone: "America/New_York",
      today: "2026-09-07",
      days: 7,
      hold: {
        now: {
          total: 0,
          sent: 0,
          canceled: 0,
          steered: 0,
          overtaken: 0,
          person_first: 0,
          waiting: 0,
          other: 0,
          low_confidence: 0,
        },
        before: { total: 0, sent: 0 },
      },
      topics: { of: 0, stamped: 0, by_intent: {} },
      languages: { of: 0, stamped: 0, by_language: {} },
      blocked: mix,
      call_endings: mix,
      handover: { now: handover, before: handover },
      missed: {
        now: { n: 3, touched: 2, pending: 0, unknown: 0 },
        before: { n: 0, touched: 0, pending: 0, unknown: 0 },
      },
      after_hours: [{ d: "2026-09-06", q: 44, n: 2, a: 1 }],
      links: { sent: 0, booked: null, calendar: "none" },
      stuck: { waiting: 1, oldest_at: "2026-09-07T13:00:00Z", callbacks: 0, capped: false },
    },
    profile: { hours: { mon: { open: "09:00", close: "17:00" } } },
  };
  const vm = toReceptionistReportVM(dto, { nowMs: NOW });
  return [...vm.handover, vm.missed, vm.closed, ...vm.stuck];
};
/** The People lens's own figures (contracts reports/people/): the strip, what is stuck now and where the book stands. */
const peopleTiles = () => {
  const vm = toPeopleReportVM(dtoWith());
  return [...vm.strip, ...vm.stuck, ...vm.stand];
};
/** A listing as the edge reads it (the shape of tests/google/google.test.mjs's own), with one review. */
const GOOGLE = {
  ready: { places: true, profile: false },
  listing: {
    place_id: "place-1",
    name: "Harbor Studio",
    address: "1 Dock Street",
    maps_uri: "https://maps.example.com/harbor",
    business_status: "OPERATIONAL",
    rating: 4.6,
    review_count: 78,
    linked_at: "2026-08-01T12:00:00Z",
    checked_at: "2026-09-07T12:00:00Z",
    check_error: null,
  },
  connection: null,
  reviews: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      review_id: "r-ana",
      origin: "places",
      rating: 5,
      author: "Ana P.",
      author_uri: null,
      author_photo_uri: null,
      body: "Fast, careful, and on time.",
      language_code: "en",
      published_at: "2026-09-07T13:00:00Z",
      reply_text: null,
      replied_at: null,
      maps_uri: null,
      first_seen_at: "2026-09-07T14:00:00Z",
    },
  ],
  days: [],
  role: "owner",
};

const workspace = () => {
  globalThis.__WORKSPACES = [
    {
      id: "w1",
      slug: "harbor",
      name: "Harbor Studio",
      status: "active",
      timezone: "America/New_York",
      sells_by: "proposal",
      role: "owner",
    },
  ];
  globalThis.__ACTIVE_WORKSPACE = "w1";
};
const held = reviewsHeld;
/** Google's public listing alone: the five reviews it shows, the Business Profile not connected, and so no ledger. */
const PUBLIC_LISTING = held(reviewsDto({ days: 7, google: GOOGLE, ledger: null }));
/** Harbor Studio with its Business Profile synced: the reviews on record are counted. */
const PROFILE_SYNCED = held(reviewsDto({ days: 7, google: reviewsGoogle() }));
const draw = (lens, R, reviews = PUBLIC_LISTING, own = ownHeld()) => {
  workspace();
  keepReportPeriod("7d");
  setSurfaceValue("reports", R);
  setSurfaceValue("reports_reviews", reviews);
  setSurfaceValue("reports_receptionist", own);
  fresh();
  return ReportsPage({ pathname: `/w/harbor/reports${lens === "overview" ? "" : `/${lens}`}` });
};
const figures = (tree) => all(tree, (n) => n.props?.["data-figure"] !== undefined);
/** A figure as a person reads it: its metric, its value with the period before, and the words over its label. */
const said = (fig) => ({
  metric: fig.props["data-figure"],
  value: textOf(find(fig, (n) => classes(n).includes("figure-value"))),
  tip: find(fig, (n) => typeof n.props?.tip === "string")?.props.tip,
});

test("every figure the reports build names a metric that has words, and no two metrics say the same", () => {
  const R = surface({ deals: DEALS });
  const reviews = reviewsHeld(reviewsDto({ days: 7 })).vm;
  const tiles = [
    ...R.vm.tiles,
    bookedTileOf(R.booking),
    ...R.campaigns.tiles,
    ...toGoogleVM(GOOGLE, { days: 7, until: null }, NOW, "UTC").tiles,
    ...reviews.tiles,
    ...receptionistTiles(),
    ...peopleTiles(),
  ];
  const metrics = [...new Set(tiles.map((t) => t.metric))];
  assert.equal(
    metrics.length,
    36,
    "the receptionist's six, booked, the campaigns' five, Google's four, the three more the profile's reviews add, the seven the Receptionist lens's own read adds and the ten the People lens's own read adds (its New people is the Overview's)",
  );
  for (const m of metrics) {
    const words = metricWordsOf(m);
    assert.ok(typeof words === "string" && words.length > 40 && words.endsWith("."), `${m}: a sentence of words`);
  }
  assert.equal(new Set(metrics.map(metricWordsOf)).size, metrics.length, "each metric says what only it counts");
  // What sent them is a campaign to the owner reading over a figure, never a playbook (decision 19).
  for (const m of metrics) assert.doesNotMatch(metricWordsOf(m), /playbook/i, m);
  assert.match(metricWordsOf("messages_sent"), /^Messages your broadcasts and campaign runs sent in this period/);
});

test("the words that cite a window cite the constant the report counts by, not a second spelling of it", () => {
  assert.ok(metricWordsOf("replied_share").includes(REPLY_WINDOW_WORDS), REPLY_WINDOW_WORDS);
  assert.ok(metricWordsOf("delivered_share").includes(DELIVERY_RECEIPTS_WORDS), DELIVERY_RECEIPTS_WORDS);
  assert.ok(metricWordsOf("missed_calls_answered").includes(MISSED_CALL_TOUCH_WORDS), MISSED_CALL_TOUCH_WORDS);
  // Said once and read twice, in the words the figure's own line uses ("under an hour old"): the definition, character for character.
  assert.equal(
    metricWordsOf("missed_calls_answered"),
    `Of the people who rang in this period and found nobody (the call never connected, or reached voicemail), how many you or the receptionist reached within ${MISSED_CALL_TOUCH_WORDS}, by a message that went out or a call that got through. A person counts once, at their first such call; a call the receptionist placed, a person whose call is under ${MISSED_CALL_TOUCH_WORDS} old, and a call with no caller on record are not counted.`,
  );
});

test("a definition uses the word the figure's own line uses: calls that connected, handovers that wanted a message", () => {
  assert.match(metricWordsOf("calls"), /^Calls to the receptionist that connected\. /);
  assert.match(metricWordsOf("handover_first_reply"), /, over the handovers that wanted a message, /);
  for (const m of ["calls", "handover_first_reply"])
    assert.doesNotMatch(metricWordsOf(m), /someone spoke on/, `${m}: one word for a call that connected`);
});

test("the Receptionist lens's seven figures name a metric each, and each metric says what is not counted", () => {
  const ids = [
    "handover_first_reply",
    "handover_settled",
    "missed_calls_answered",
    "answered_while_closed",
    "waiting_on_you",
    "call_backs",
    "replies_held_back",
  ];
  const tiles = receptionistTiles();
  assert.deepEqual(
    tiles.map((t) => t.metric),
    ids,
    "the figures, in the order the lens draws them",
  );
  for (const id of ids) {
    const words = metricWordsOf(id);
    assert.match(words, /\bnot counted\b/, `${id}: says what is not counted`);
    assert.ok(words.length > 80 && words.endsWith("."), `${id}: a sentence of words`);
  }
  assert.equal(new Set(ids.map(metricWordsOf)).size, ids.length, "each says what only it counts");
});

test("the People lens's ten figures name a metric each, and each metric says what is not counted", () => {
  const ids = [
    "people_reached",
    "yeses_won",
    "stops_recorded",
    "steps_overdue",
    "steps_due_today",
    "email_stopped_now",
    "said_yes_messages",
    "can_receive_offers",
    "opted_out_now",
    "quiet_now",
  ];
  const vm = toPeopleReportVM(dtoWith());
  assert.deepEqual(
    [...vm.strip, ...vm.stuck, ...vm.stand].map((t) => t.metric),
    [
      "people_reached",
      "new_people",
      "yeses_won",
      "stops_recorded",
      "steps_overdue",
      "steps_due_today",
      "email_stopped_now",
      "said_yes_messages",
      "can_receive_offers",
      "opted_out_now",
      "quiet_now",
    ],
    "the figures, in the order the lens draws them; its second is the Overview's New people",
  );
  for (const id of ids) {
    const words = metricWordsOf(id);
    assert.match(words, /\bnot counted\b/, `${id}: says what is not counted`);
    assert.ok(words.length > 80 && words.endsWith("."), `${id}: a sentence of words`);
    assert.doesNotMatch(words, /playbook/i, id);
  }
  const every = [
    ...ids,
    "new_people",
    "customer_messages",
    "said_yes",
    "asked_to_stop",
    "waiting_on_you",
    "call_backs",
  ];
  assert.equal(new Set(every.map(metricWordsOf)).size, every.length, "each says what only it counts");
  // The two sides of the same day say it in different words, and the two people lists that overlap say what each leaves out.
  assert.match(metricWordsOf("steps_overdue"), /a day before today/);
  assert.match(metricWordsOf("steps_due_today"), /has today for its day/);
  assert.match(metricWordsOf("said_yes"), /counted once a day each/, "the Campaigns lens's yeses stay per day");
  assert.match(
    metricWordsOf("yeses_won"),
    /one for each person and each kind of message/,
    "the People lens's are per person",
  );
  // Like people_reached, the answers are of live people only: the SQL leaves out an erased person and a merged-away record.
  for (const id of ["people_reached", "yeses_won", "stops_recorded"]) {
    assert.match(metricWordsOf(id), /asked to be forgotten/, `${id}: says an erased person is left out`);
  }
  for (const id of ["yeses_won", "stops_recorded"]) {
    assert.match(metricWordsOf(id), /a record merged into another/, `${id}: says a merged-away record is left out`);
  }
});

test("the Overview's strip draws each figure with its words over the label", () => {
  const strip = figures(byTestId(draw("overview", surface({ deals: DEALS })), "reports-tiles")).map(said);
  assert.deepEqual(
    strip.map((f) => f.metric),
    ["customer_messages", "calls", "new_people", "booked", "handovers"],
  );
  for (const f of strip) assert.equal(f.tip, metricWordsOf(f.metric), `${f.metric}: what is counted, and what is not`);
});

test("the Receptionist lens's strip against before, its steps after a reply and what is stuck each draw their figures with their words over the label", () => {
  const tree = draw("receptionist", surface({ deals: DEALS }));
  const strips = {
    "receptionist-strip": ["customer_messages", "answered_share", "reply_median", "handovers"],
    "receptionist-figures": [
      "handover_first_reply",
      "handover_settled",
      "missed_calls_answered",
      "answered_while_closed",
    ],
    "receptionist-stuck": ["waiting_on_you", "call_backs", "replies_held_back"],
  };
  for (const [id, metrics] of Object.entries(strips)) {
    const strip = byTestId(tree, id);
    assert.ok(strip, `${id}: the strip stands on the lens`);
    const drawn = figures(strip).map(said);
    assert.deepEqual(
      drawn.map((f) => f.metric),
      metrics,
      `${id}: its figures, in the order the lens draws them`,
    );
    for (const f of drawn)
      assert.equal(f.tip, metricWordsOf(f.metric), `${f.metric}: what is counted, and what is not`);
  }
});

test("the Campaigns lens draws who said yes and who asked to stop, each with the period before in counts and its words", () => {
  const tree = draw("campaigns", surface({ deals: DEALS }));
  const strip = byTestId(tree, "campaign-answers");
  assert.ok(strip, "the strip stands on the lens");
  assert.deepEqual(figures(strip).map(said), [
    {
      metric: "said_yes",
      value: "3up from 1",
      tip: metricWordsOf("said_yes"),
    },
    {
      metric: "asked_to_stop",
      value: "2none the 7 days before",
      tip: metricWordsOf("asked_to_stop"),
    },
  ]);
  const quiet = campaignDto();
  const none = draw(
    "campaigns",
    surface({
      deals: DEALS,
      campaigns: { ...quiet, series: quiet.series.map((d) => cday(d.day)), sources: [] },
    }),
  );
  assert.equal(
    byTestId(none, "campaign-answers"),
    null,
    "nothing sent and nobody answered: the lens says so, with no figures",
  );
});

test("Google's four figures say what they count too", () => {
  const tree = draw("reviews", surface({ deals: DEALS }));
  const strip = byTestId(tree, "google-tiles");
  assert.ok(strip, "the strip stands under a linked listing");
  assert.deepEqual(
    figures(strip).map((f) => [said(f).metric, said(f).tip === metricWordsOf(said(f).metric)]),
    [
      ["rating", true],
      ["reviews", true],
      ["ratings_gained", true],
      ["newest_review", true],
    ],
  );
});

test("with the Business Profile synced the Reviews lens draws five figures, and the three the reviews on record add say what they count too", () => {
  const strip = byTestId(draw("reviews", surface({ deals: DEALS }), PROFILE_SYNCED), "google-tiles");
  assert.ok(strip, "the strip stands under a synced profile");
  assert.deepEqual(
    figures(strip).map((f) => [said(f).metric, said(f).tip === metricWordsOf(said(f).metric)]),
    [
      ["rating", true],
      ["reviews", true],
      ["reviews_written", true],
      ["reviews_answered", true],
      ["review_reply_time", true],
    ],
  );
});
