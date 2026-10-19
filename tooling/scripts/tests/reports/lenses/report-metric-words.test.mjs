/**
 * What a figure counts, and that the page says it (contracts metricWordsOf): every figure a report builds names a metric that
 * has words, the words that cite a window cite the constant the report counts by, each strip draws its figures with the words
 * over the label, and the Campaigns lens draws its five figures, who said yes and who asked to stop among them, each with the
 * period before beside it. EXECUTED on the stub React over the reads the surfaces hold.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, all, byTestId, textOf, classes, find } from "../../_legacy-react.mjs";
import { DEALS, reviewsDto, reviewsGoogle, reviewsHeld, surface } from "../_report-world.mjs";
import { ownHeld } from "../receptionist/_receptionist-world.mjs";
import { dtoWith } from "../people/_people-world.mjs";
import {
  CAMPAIGNS,
  CAMPAIGNS_QUIET,
  NOW as CAMPAIGN_NOW,
  QUIET,
  dtoWith as ledgerWith,
  held as campaignsHeld,
} from "../campaigns/_campaign-world.mjs";

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
  toCampaignLensVM,
  toReachOutLensVM,
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
/** The Campaigns lens's Reach-outs part (contracts reports/campaigns/reach-out-lens.ts): the strip of 40 emails to 25 businesses. */
const reachOutTiles = () => {
  const totals = {
    written: 40,
    delivered: 36,
    bounced: 2,
    businesses: 25,
    wrote_back: 6,
    interested: 3,
    booked: 1,
    said_no: 2,
    handed: 0,
  };
  const dto = {
    timezone: "America/New_York",
    days: 7,
    today: "2026-09-07",
    since: "2026-09-01",
    has_reach_out: true,
    totals,
    before: { written: 30, delivered: 27, bounced: 1 },
    series: [],
    chains: [],
    angles: [],
    other_angles: { written: 0, businesses: 0, wrote_back: 0 },
    no_angle: 0,
    mailboxes: [],
  };
  return toReachOutLensVM(dto, NOW).strip;
};
/** The Campaigns lens's own figures (contracts reports/campaigns/campaign-lens.ts): the strip of five and what is stuck now. */
const campaignTiles = () => {
  const vm = toCampaignLensVM({ campaigns: CAMPAIGNS, ledger: ledgerWith(), reachOuts: undefined }, CAMPAIGN_NOW);
  return [...vm.strip, ...vm.stuck];
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
      appointment_word: "meeting",
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
const draw = (lens, R, reviews = PUBLIC_LISTING, own = ownHeld(), campaigns = campaignsHeld(ledgerWith(), "7d")) => {
  workspace();
  keepReportPeriod("7d");
  setSurfaceValue("reports", R);
  setSurfaceValue("reports_reviews", reviews);
  setSurfaceValue("reports_receptionist", own);
  setSurfaceValue("reports_campaigns", campaigns);
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
    ...toGoogleVM(GOOGLE, { days: 7, until: null }, NOW, "UTC").tiles,
    ...reviews.tiles,
    ...receptionistTiles(),
    ...peopleTiles(),
    ...reachOutTiles(),
    ...campaignTiles(),
  ];
  const metrics = [...new Set(tiles.map((t) => t.metric))];
  assert.equal(
    metrics.length,
    44,
    "the receptionist's six, booked, Google's four, the three more the profile's reviews add, the seven the Receptionist lens's own read adds, the ten the People lens's own read adds (its New people is the Overview's), the three the Campaigns lens's reach-outs add and the ten its own read adds (people sent to, delivered, people who wrote back, said yes, asked to stop, and the five that are stuck now); the sends' old Messages sent and Replied tiles went on 11 Oct 2026 with the tiles nothing drew",
  );
  for (const m of metrics) {
    const words = metricWordsOf(m);
    assert.ok(typeof words === "string" && words.length > 40 && words.endsWith("."), `${m}: a sentence of words`);
  }
  assert.equal(new Set(metrics.map(metricWordsOf)).size, metrics.length, "each metric says what only it counts");
  // What sent them is a campaign to the owner reading over a figure, never a playbook (decision 19).
  for (const m of metrics) assert.doesNotMatch(metricWordsOf(m), /playbook/i, m);
});

test("the words that cite a window cite the constant the report counts by, not a second spelling of it", () => {
  assert.ok(metricWordsOf("said_yes").includes(REPLY_WINDOW_WORDS), REPLY_WINDOW_WORDS);
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
  assert.match(
    metricWordsOf("said_yes"),
    /counted once in the period/,
    "the Campaigns lens's yeses are a person each, once in the period",
  );
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

test("the Reach-outs part's three figures name a metric each, and each metric says what is not counted", () => {
  const ids = ["emails_written", "emails_landed", "emails_bounced"];
  assert.deepEqual(
    reachOutTiles().map((t) => t.metric),
    ids,
    "the figures, in the order the part draws them",
  );
  for (const id of ids) {
    const words = metricWordsOf(id);
    assert.match(words, /\bnot counted\b/, `${id}: says what is not counted`);
    assert.ok(words.length > 80 && words.endsWith("."), `${id}: a sentence of words`);
    assert.doesNotMatch(words, /playbook/i, id);
  }
  assert.equal(new Set(ids.map(metricWordsOf)).size, ids.length, "each says what only it counts");
  // An email is one that left, however many go to a business; a call or a note handed to you is not an email.
  assert.match(metricWordsOf("emails_written"), /one for each email that left/);
  assert.match(
    metricWordsOf("emails_written"),
    /A call or a note handed to you, and an email that never left, are not counted\.$/,
  );
  assert.match(metricWordsOf("emails_landed"), /An email with no receipt yet is not counted as delivered\.$/);
  assert.match(metricWordsOf("emails_bounced"), /A complaint, and an email that is only late, are not counted\.$/);
});

test("the Campaigns lens's seven new figures name a metric each, each metric says what is not counted, and its yes and stop say the new window", () => {
  const ids = [
    "people_sent_to",
    "people_wrote_back",
    "runs_waiting",
    "runs_failed",
    "campaign_replies_waiting",
    "templates_paused",
    "number_health",
  ];
  assert.deepEqual(
    campaignTiles().map((t) => t.metric),
    [
      "people_sent_to",
      "delivered_share",
      "people_wrote_back",
      "said_yes",
      "asked_to_stop",
      "runs_waiting",
      "runs_failed",
      "campaign_replies_waiting",
      "templates_paused",
      "number_health",
    ],
    "the figures, in the order the lens draws them: the strip, then what is stuck now",
  );
  for (const id of ids) {
    const words = metricWordsOf(id);
    assert.match(words, /\bnot counted\b/, `${id}: says what is not counted`);
    assert.ok(words.length > 80 && words.endsWith("."), `${id}: a sentence of words`);
    assert.doesNotMatch(words, /playbook/i, id);
  }
  const every = [...ids, "delivered_share", "said_yes", "asked_to_stop"];
  assert.equal(new Set(every.map(metricWordsOf)).size, every.length, "each says what only it counts");
  assert.equal(
    metricWordsOf("people_sent_to"),
    "People a campaign sent a message to in this period, counted once however many it sent them. A person a run held back, a message that failed before it left and an email to a lead are not counted.",
  );
  // The window it cites is the constant the report counts by.
  assert.equal(
    metricWordsOf("people_wrote_back"),
    `Of the people sent a message in this period, how many answered in their own words ${REPLY_WINDOW_WORDS}, on any channel, counted once. A note the system wrote, an automatic reply, a booking tool's notice and an answer that came later are not counted; people sent to in the last 3 days may still answer.`,
  );
  // The yes and the stop of a campaign are a person once in the period, within the reply window of the message that reached them.
  assert.equal(
    metricWordsOf("said_yes"),
    `People who said yes to being messaged ${REPLY_WINDOW_WORDS} of a campaign reaching them, in their own words or recorded at the desk, counted once in the period. A yes with no campaign before it, a merge restating an answer and a person who asked to be forgotten are not counted.`,
  );
  assert.equal(
    metricWordsOf("asked_to_stop"),
    `People who asked to stop being messaged ${REPLY_WINDOW_WORDS} of a campaign reaching them, by STOP, a carrier's report or at the desk, and for email by the unsubscribe in the message however late it is used, counted once in the period. A stop with no campaign before it, a merge restating an answer and a person who asked to be forgotten are not counted.`,
  );
  for (const id of ["said_yes", "asked_to_stop"])
    assert.doesNotMatch(metricWordsOf(id), /once a day each/, `${id}: a person once in the period, not once a day`);
  // What is stuck is as of now; the others are of the period.
  for (const id of ids.slice(2)) assert.match(metricWordsOf(id), /as of now, whatever period is picked/, id);
  // The stuck count of failed runs reads every kind of run, a reach-out's step among them (00406); the window's Runs that stopped
  // leaves a reach-out's to its own part, and says so (campaign-lens.test.mjs): the two counts differ by kind alone, in words.
  assert.match(metricWordsOf("runs_failed"), /: a campaign's, a one-off send's or a step to leads\./);
  assert.match(
    metricWordsOf("runs_waiting"),
    /: a campaign's, a one-off send's or a step to leads\./,
    "said as the waiting runs say it",
  );
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

test("the Campaigns lens draws its five figures, who said yes and who asked to stop among them, each with the period before in counts and its words", () => {
  const tree = draw("campaigns", surface({ deals: DEALS }));
  const strip = byTestId(tree, "campaigns-strip");
  assert.ok(strip, "the strip stands on the lens");
  const drawn = figures(strip).map(said);
  assert.deepEqual(
    drawn.map((f) => f.metric),
    ["people_sent_to", "delivered_share", "people_wrote_back", "said_yes", "asked_to_stop"],
  );
  for (const f of drawn) assert.equal(f.tip, metricWordsOf(f.metric), `${f.metric}: what is counted, and what is not`);
  // The yes and the stop are counts, each beside the period before's: 14 yeses after 11, 3 stops after 2.
  assert.deepEqual(drawn.slice(3), [
    { metric: "said_yes", value: "14up from 11", tip: metricWordsOf("said_yes") },
    { metric: "asked_to_stop", value: "3up from 2", tip: metricWordsOf("asked_to_stop") },
  ]);
  const none = draw(
    "campaigns",
    surface({ deals: DEALS }),
    PUBLIC_LISTING,
    ownHeld(),
    campaignsHeld(ledgerWith(QUIET), "7d", { campaigns: CAMPAIGNS_QUIET }),
  );
  assert.equal(
    byTestId(none, "campaigns-strip"),
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
