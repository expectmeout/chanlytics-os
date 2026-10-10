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

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
globalThis.window.fetch = async () =>
  new Response(JSON.stringify({ ok: false, error: { code: "internal", message: "not read here" } }), { status: 500 });
const S = "../../../../../apps/dashboard/src";
const { ReportsPage } = await import(`${S}/surfaces/reports/reports-page.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { keepReportPeriod } = await import(`${S}/surfaces/reports/surface.ts`);
const { forgetStanding } = await import(`${S}/surfaces/kit/head/standing.ts`);
const { bookedTileOf, metricWordsOf, toGoogleVM, REPLY_WINDOW_WORDS, DELIVERY_RECEIPTS_WORDS } =
  await import("@chanlytics/contracts");
after(() => forgetStanding());

const NOW = Date.parse("2026-09-07T15:00:00Z");
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
const draw = (lens, R, reviews = PUBLIC_LISTING) => {
  workspace();
  keepReportPeriod("7d");
  setSurfaceValue("reports", R);
  setSurfaceValue("reports_reviews", reviews);
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
  ];
  const metrics = [...new Set(tiles.map((t) => t.metric))];
  assert.equal(
    metrics.length,
    19,
    "the receptionist's six, booked, the campaigns' five, Google's four and the three more the profile's reviews add",
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
});

test("the Overview's strip draws each figure with its words over the label", () => {
  const strip = figures(byTestId(draw("overview", surface({ deals: DEALS })), "reports-tiles")).map(said);
  assert.deepEqual(
    strip.map((f) => f.metric),
    ["customer_messages", "calls", "new_people", "booked", "handovers"],
  );
  for (const f of strip) assert.equal(f.tip, metricWordsOf(f.metric), `${f.metric}: what is counted, and what is not`);
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
