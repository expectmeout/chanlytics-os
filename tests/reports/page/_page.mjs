/**
 * The world the tests of page/ share. Split by behaviour from reports-page.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The Reports page (apps/dashboard/src/surfaces/reports, TSX since decision 0015), EXECUTED on a stub React over the view
 * models the bridge publishes through the seam (surface-values.ts): the headline (the
 * receptionist's share, Worth knowing), the tiles compared in counts, every card under its testid with the view
 * model's own sentence, the empty, failed, unreadable-calendar and no-calendar states, a v2 payload, the period (the head's
 * act on a desk, a row of the page's own on a phone), a period that fails to load, Google's section, and every lens over the tests' sample. The page's regressions live here too, moved from
 * reports-honest and rewritten for this page (C13, C25 to C28): every row a door, the period before drawn where it
 * reads, one keyboard stop per chart, a period control that never holds (the latest pick wins), and a table that
 * leaves the page. The period's own door (period.ts) runs for real, over a fetch this test holds, answers or refuses.
 *
 * And the date range: the capsule that says what the page is on, the days picked on its month or reached in one press,
 * which move the address and are read by their first and last day, and days that fail to load. What the page does when
 * its address moves by itself (a link, Back) is periods/report-range-page.test.mjs's, on a document of its own.
 */
import { after } from "node:test";
import { reportDaysCount, reportRangeOfKey, shiftKey } from "@chanlytics/contracts";
import { installStubReact, fresh, again, all, find, byTestId, textOf, classes, settle } from "../../_stub-react.mjs";
import {
  reportDto,
  quiet,
  campaignDto,
  CALENDAR,
  surface,
  rday,
  reviewsDto,
  reviewsHeld,
  reviewsLedger,
  writtenReview,
} from "../_report-world.mjs";
import { ownHeld } from "../receptionist/_receptionist-world.mjs";
import { held as peopleHeld, dtoWith as peopleDto } from "../people/_people-world.mjs";
import { dtoWith as campaignsLedger, held as campaignsHeld } from "../campaigns/_campaign-world.mjs";
import { reachOuts as campaignsReachOuts } from "../campaigns/_reach-out-world.mjs";
import { bridgeHolds, heldDoors } from "../../shell/_bridge-holds.mjs";

export const went = [];

export const flashed = [];

bridgeHolds({ parts: { surfaceState: () => "live" } });
installStubReact({});

bridgeHolds({
  who: {
    workspaces: [
      {
        id: "w1",
        slug: "harbor",
        name: "Harbor Studio",
        status: "active",
        timezone: "America/New_York",
        appointment_word: "meeting",
        role: "owner",
      },
    ],
  },
});

bridgeHolds({ who: { activeWorkspaceId: "w1" } });

export const S = "../../../apps/dashboard/src";

export const { ReportsPage } = await import(`${S}/surfaces/reports/reports-page.tsx`);

export const { RPT_CHANNEL_COLORS } = await import(`${S}/surfaces/reports/series.ts`);

export const { setSurfaceValue, surfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

export const { keepReportPeriod } = await import(`${S}/surfaces/reports/surface.ts`);

export const { peopleSample, receptionistSample, reportsSample, reviewsSample } = await import(
  `${S}/surfaces/reports/sample.ts`
);

export const { campaignsSample } = await import(`${S}/surfaces/reports/campaigns-sample.ts`);

export const { toCampaignLensVM, toPeopleReportVM, toReceptionistReportVM, PEOPLE_RHYTHM_UNIT } =
  await import("@chanlytics/contracts/report-lens");

export const { setStatus } = await import(`${S}/bridge/surface-status.ts`);

export const { startSurfaces } = await import(`${S}/bridge/surface-runner.ts`);

// The shell's doors, which the surface reaches through the bridge's verbs (surfaces/frame-verbs.ts).
bridgeHolds({ parts: { toast: () => [null, (m) => flashed.push([m.tone, textOf(m.msg)])] } });
bridgeHolds({ doors: { navigate: (to) => went.push(to) } });

// The page reads through the runner, which the period's own door refreshes through; nothing to boot.
export let stopRunner = startSurfaces([], () => () => {});

after(() => stopRunner());

export const realConsoleError = console.error;

console.error = () => {};

after(() => {
  console.error = realConsoleError;
});

/* ------------- the period's read: period.ts over a fetch this test holds, answers or refuses ------------- */

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const period = { asked: [], held: [], mode: "hold" };

/** The days each period's answer says it covers (Month on this fixture's day: four). */
export const DAYS_OF = { "7d": 7, "30d": 30, "90d": 90, month: 4 };

/**
 * The report over days a member picked, as the route answers it: as many days to their last day and as many before
 * them, one message a day in the days picked, the last day named (`end`), and a booking line that is not counted for
 * days that ended before today.
 */
export const daysAnswer = (picked) => {
  const days = reportDaysCount(picked);
  const series = Array.from({ length: days * 2 }, (_, i) =>
    rday(
      shiftKey(picked.to, -(days * 2 - 1 - i)),
      i < days ? {} : { messages_in: 1, conversations: 1, answered_ai: 1 },
    ),
  );
  return json(200, {
    ok: true,
    data: {
      report: reportDto({ ...quiet(), days, span_days: days * 2, end: picked.to, series }),
      booking: { calendar: "ended", days, asked: 0, booked: 0 },
      deals: null,
    },
  });
};

export const answer = (id) => {
  const range = reportRangeOfKey(id);
  if (range !== null && typeof range !== "string") return daysAnswer(range);
  return json(200, {
    ok: true,
    data: {
      report: reportDto({ days: DAYS_OF[id] }),
      booking: { ...CALENDAR, days: DAYS_OF[id] },
      deals: null,
    },
  });
};

/**
 * A reply posted to a review, and what the answer's re-read of the Reviews surface finds (null: no reply is on its way). The route
 * accepts the reply, then the refresh map re-reads Google and the Reviews read, which this serves as Google's now holds the review.
 */
export const reviewReply = { posted: [], reread: 0, googleReads: 0, now: null };

globalThis.window.fetch = async (url, init) => {
  const u = new URL(String(url), "https://app.test");
  if (reviewReply.now) {
    if (/\/google\/reviews\/[^/]+\/reply$/.test(u.pathname)) {
      reviewReply.posted.push(JSON.parse(String(init?.body ?? "{}")).comment);
      return json(200, { ok: true, data: { ok: true } });
    }
    if (u.pathname.endsWith("/google")) {
      reviewReply.googleReads += 1;
      return json(200, { ok: true, data: { google: reviewReply.now.google } });
    }
    if (u.pathname.endsWith("/reports/reviews")) {
      reviewReply.reread += 1;
      return json(200, { ok: true, data: reviewReply.now });
    }
  }
  // The Campaigns lens's three reads are its own surface's (campaigns/campaigns-page.test.mjs holds their states): not read here.
  if (/\/reports\/(campaigns(\/ledger)?|reach-outs)$/.test(u.pathname))
    return json(500, { ok: false, error: { code: "internal", message: "not read here" } });
  if (!u.pathname.endsWith("/reports")) return json(404, { ok: false, error: { code: "not_found", message: "no" } });
  // What a read names: a period, or the first and the last of the days picked, said here by the range's one name.
  const id = u.searchParams.has("from")
    ? `${u.searchParams.get("from")}~${u.searchParams.get("to")}`
    : u.searchParams.get("period");
  period.asked.push(id);
  if (period.mode === "refuse") return json(500, { ok: false, error: { code: "internal", message: "down" } });
  if (period.mode === "answer") return answer(id);
  return new Promise((res) => period.held.push({ id, res }));
};

/** A period asked for and held is answered (it lands) or refused (it fails), and the read behind it is over. */
export const land = async () => {
  for (const h of period.held.splice(0)) h.res(answer(h.id));
  for (let i = 0; i < 12; i++) await settle();
};

export const refuse = async () => {
  for (const h of period.held.splice(0)) h.res(json(500, { ok: false, error: { code: "internal", message: "down" } }));
  for (let i = 0; i < 12; i++) await settle();
};

export const inPeriodTest = async (mode, run) => {
  // What the test before left on a clock runs out first (the picker's close, 180ms: a read it led to landed in this test's
  // count, 17 Oct 2026), and a fresh runner drops the retries it held: a read refused there is asked for again 2 and 10 s
  // later (surface-runner.ts RETRY_AFTER_MS), whichever test runs then (a fourth "30d" in the nightly of 27 Oct 2026).
  await new Promise((done) => setTimeout(done, 250));
  for (let i = 0; i < 12; i++) await settle();
  stopRunner();
  stopRunner = startSurfaces([], () => () => {});
  period.mode = mode;
  period.asked.length = 0;
  try {
    await run();
  } finally {
    await refuse();
    period.mode = "hold";
  }
};

/** Reports' lenses' addresses, in the strip's order: the page's old whole is these six drawn one after another. */
export const LENS_PATHS = ["", "/receptionist", "/people", "/pipeline", "/campaigns", "/reviews"].map(
  (l) => `/w/harbor/reports${l}`,
);

/** The lens the address names: the Overview, unless a test says another. */
export let lensAt = LENS_PATHS[0];

export const draw = () => ReportsPage({ pathname: lensAt });

/** The week's 20 messages by channel (0030): 14 on WhatsApp, 4 by text and 2 by email, which add up to the week's sends. */
export const WEEK_SENDS = {
  ...campaignDto(),
  by_channel: [
    { channel: "whatsapp", sent: 14, delivered: 12, read: 11, replied: 3 },
    { channel: "sms", sent: 4, delivered: 3, read: 0, replied: 1 },
    { channel: "email", sent: 2, delivered: 1, read: 0, replied: 0 },
  ],
};

/** The ledger of that week: the 15 people the 20 messages went to over 3 runs, 3 of them wrote back, and the four first replies; the campaign world's otherwise. */
export const WEEK_LEDGER = campaignsLedger({
  days: 7,
  people: { now: { sent_to: 15, wrote_back: 3, counting: 0 }, before: { sent_to: 4, wrote_back: 2 } },
  runs: { now: { moment: 2, broadcast: 1 }, before: { moment: 1, broadcast: 0 } },
  held: { total: 2, skipped: 2, failed: 0, by_reason: { opted_out: 1, no_phone: 1 } },
  stopped: { failed: 0, canceled: 1, by_failure: {} },
  failed_sends: { total: 1, by_code: [{ channel: "whatsapp", code: 131049, kind: null, n: 1 }] },
  by_message: [
    { name: "winback_offer", language: "en_US", sent: 14, mature: 14, replied: 3 },
    { name: "quick_note", language: "en_US", sent: 6, mature: 6, replied: 1 },
  ],
  first_reply: { n: 4, median_s: 5400, buckets: { m15: 1, h1: 1, h4: 1, h24: 1, h72: 0 } },
});

/** The week's reach-outs: the campaign world's salon, over the seven days (campaigns/campaigns-page.test.mjs holds their words and states). */
export const WEEK_REACH_OUTS = campaignsReachOuts({ days: 7, since: "2026-08-29" });

/**
 * The Campaigns lens's own read of the range the report shows: the week's sends (`campaigns`; null is a read that failed) over
 * the week's ledger (`ledger`), and the range it is of.
 */
export const campaignsFor = (key, { campaigns = WEEK_SENDS, ledger = WEEK_LEDGER } = {}) =>
  campaignsHeld(ledger, key, { campaigns, reachOuts: WEEK_REACH_OUTS });

/** One lens drawn over what `set` puts in the surface, as a person at its address sees it. */
export const drawOnce = (set, sends) => {
  set();
  // The period kept in this browser is the one the surface shows, as it is whenever the page's own read published it:
  // the page follows its address, and an address with no days says the period kept.
  const shown = surfaceValue("reports");
  if (shown?.period) keepReportPeriod(shown.period);
  // The Receptionist lens's own read is of the range the report shows (its states are receptionist/receptionist-page.test.mjs's).
  setSurfaceValue("reports_receptionist", shown ? ownHeld(undefined, shown.key) : undefined);
  // The People lens's own read likewise (its states are people/people-page.test.mjs's), and the Campaigns lens's (campaigns/campaigns-page.test.mjs's).
  setSurfaceValue("reports_people", shown ? peopleHeld(peopleDto(), shown.key) : undefined);
  setSurfaceValue("reports_campaigns", shown ? campaignsFor(shown.key, sends) : undefined);
  fresh();
  went.length = 0;
  return draw();
};

export const pageOnce = (opts) => drawOnce(() => setSurfaceValue("reports", surface(opts)), opts);

/**
 * Every lens's body in one tree, for what a test reads across the old page (a card, a row, a sentence). The Overview is drawn
 * last, so the frame the stub keeps (what `redraw` draws again, and where a press's state lands) is the Overview's, whose period
 * row the tests press.
 */
export const across = (set, sends) => {
  const trees = new Map();
  for (const path of [...LENS_PATHS].reverse()) {
    lensAt = path;
    trees.set(path, drawOnce(set, sends));
  }
  lensAt = LENS_PATHS[0];
  return { type: "Fragment", props: { children: LENS_PATHS.map((path) => trees.get(path)) } };
};

export const page = (opts) => across(() => setSurfaceValue("reports", surface(opts)), opts);

/** A test that presses a card of one lens: that lens is the page the stub keeps, so a press's state lands where it is drawn again. */
export const inLens = (n, run) => {
  lensAt = LENS_PATHS[n];
  try {
    return run();
  } finally {
    lensAt = LENS_PATHS[0];
  }
};

export const redraw = () => again(draw);

export const card = (tree, id) => byTestId(tree, id);

export const plot = (tree, id) => find(card(tree, id), (n) => classes(n).includes("ck-plot"));

export const cls = (tree, c) => find(tree, (n) => classes(n).includes(c));

export const { Segmented } = await import(`${S}/surfaces/kit/segmented/segmented.tsx`);

export const { Field } = await import(`${S}/surfaces/kit/field/field.tsx`);

export const { Figure } = await import(`${S}/surfaces/kit/figure/figure.tsx`);

export const { HeatStrip } = await import(`${S}/surfaces/kit/charts/heat.tsx`);

export const { ChartCard } = await import(`${S}/surfaces/kit/charts/card.tsx`);

/** A card as the page draws it, by its test id (the kit's ChartCard element, with the props it was given). */
export const cardOfPage = (tree, id) => find(tree, (n) => n.type === ChartCard && n.props.testid === id);

export const { RadarChart } = await import(`${S}/surfaces/kit/charts/radar.tsx`);

export const { RptStrip } = await import(`${S}/surfaces/reports/blocks.tsx`);

export const { standingSaid } = await import(`${S}/surfaces/kit/head/standing.ts`);

export const { Popover } = await import(`${S}/surfaces/kit/popover/popover.tsx`);

export const { DayRangePicker } = await import(`${S}/surfaces/kit/datepicker/day-range-picker.tsx`);

// What the period's button opens loads on demand in the app (period-picker.tsx, held by periods/period-picker.test.mjs); the page's
// tests read and press it open, so it is loaded first, as a pointer on the button loads it.
export const { loadPeriodPopover } = await import("../../../apps/dashboard/src/surfaces/reports/period-picker.tsx");

await loadPeriodPopover();

/**
 * What a person sees of the page: its tree, and on a desk what it said to the frame's head as its act (the period, at the right of
 * the strip of lenses), which the frame draws beside it. The stub's window is a desk's: it matches no width query.
 */
export const seen = (tree) => ({ type: "Fragment", props: { children: [tree, standingSaid()?.act ?? null] } });

/** A phone's frame for one run: the window answers the frame's `(max-width: 900px)` as a phone's does. */
export const onAPhone = (run) => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({
    media: q,
    matches: q === "(max-width: 900px)",
    addEventListener() {},
    removeEventListener() {},
  });
  try {
    return run();
  } finally {
    globalThis.matchMedia = was;
  }
};

/** The period control: the kit's segmented control, and the option a person presses, by its words. */
export const control = (tree) => find(seen(tree), (n) => n.type === Segmented);

/** What is said of a period that failed to load, beside the control. */
export const failedLine = (tree) => cls(seen(tree), "rpt-failed");

export const choose = (tree, label) => {
  const c = control(tree);
  c.props.onValueChange(c.props.options.find((o) => o.label === label).value);
};

export const chosen = (tree) => {
  const c = control(tree);
  return c.props.options.find((o) => o.value === c.props.value)?.label;
};

export const takeaway = (tree, id) => textOf(find(card(tree, id), (n) => classes(n).includes("ck-card-takeaway")));

/** The date range's button, as what it opens holds it. */
export const rangeButton = (tree) => find(seen(tree), (n) => n.type === Popover).props.trigger;

/** What the date range says of itself: its name to a screen reader, the word on it, and what stands beside it on a desk. */
export const rangeSays = (tree) => [
  rangeButton(tree).props["aria-label"],
  textOf(find(rangeButton(tree), (n) => n.props?.className === "rpt-when-word")),
  textOf(cls(seen(tree), "rpt-dates")),
];

/** The month days are picked on, and a day reached in one press, by its test id. */
export const month = (tree) => find(seen(tree), (n) => n.type === DayRangePicker);

/** The days reached in one press: a track of their own under the periods', drawn as it is. */
export const otherDays = (tree) => find(seen(tree), (n) => n.type === Segmented && n.props.label === "Other days");

/**
 * A run in which the shell's own move is followed, as the frame follows it: the address says the route a pick sent it
 * to, and the page is drawn at it. `moves` holds each move and whether it took its entry's place. Each run is a
 * workspace of its own, since a range read is held by the address's workspace (held-views.ts): what one test read
 * must not paint at once in another that says it was never read.
 */
export const moves = [];

export let rangeWorkspaces = 0;

export const followingMoves = async (run) => {
  const nav = heldDoors().navigate;
  const { hash, pathname } = globalThis.location;
  globalThis.location.pathname = `/w/range-${(rangeWorkspaces += 1)}`;
  moves.length = 0;
  bridgeHolds({
    doors: {
      navigate: (to, opts) => {
        moves.push([to, opts?.replace === true]);
        globalThis.location.hash = `#/${to}`;
        lensAt = `/w/harbor/${to}`;
      },
    },
  });
  try {
    await run();
  } finally {
    bridgeHolds({ doors: { navigate: nav } });
    globalThis.location.hash = hash;
    globalThis.location.pathname = pathname;
    lensAt = LENS_PATHS[0];
  }
};

/* --- phase A through the page (the Reports lenses spec, D14 and A2): the hold the owner set, and the hours they keep --- */

/** The workspace's hours as the surface reads them: Monday to Friday 9 to 6, Saturday 10 to 2, and no Sunday. */
export const HOURS = {
  profile: {
    hours: {
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "09:00", close: "18:00" },
      wed: { open: "09:00", close: "18:00" },
      thu: { open: "09:00", close: "18:00" },
      fri: { open: "09:00", close: "18:00" },
      sat: { open: "10:00", close: "14:00" },
    },
  },
};

export const quarter = (h, m = 0) => h * 4 + Math.floor(m / 15);

/** What came in by the quarter hour: 2 + 4 + 2 while open, and 1 + 2 + 3 + 1 = 7 while closed, by HOURS. */
export const ARRIVALS = [
  { d: "2026-08-29", q: quarter(11), n: 2 }, // Saturday, open 10 to 2
  { d: "2026-08-29", q: quarter(15, 30), n: 1 }, // after closing
  { d: "2026-08-30", q: quarter(12), n: 2 }, // Sunday: no hours
  { d: "2026-09-01", q: quarter(10), n: 4 }, // Tuesday, open
  { d: "2026-09-01", q: quarter(20), n: 3 }, // Tuesday evening
  { d: "2026-09-03", q: quarter(8, 45), n: 1 }, // Thursday, before opening
  { d: "2026-09-03", q: quarter(14), n: 2 }, // open
];

/** Most replies waited the 60-second hold and went out as it ended; one had none, and three took longer, one in each span. */
export const HELD = [
  ...Array.from({ length: 8 }, () => ({ day: "2026-09-01", s: 62, hold: 60 })),
  { day: "2026-08-29", s: 6, hold: 0 },
  { day: "2026-08-30", s: 100, hold: 60 },
  { day: "2026-09-03", s: 200, hold: 60 },
  { day: "2026-09-04", s: 600, hold: 60 },
];

export const factOf = (tree, id) => find(card(tree, "reports-facts"), (n) => n.props?.["data-fact"] === id);

/** The week before the fixture's own: seven days that ended before the business's today. */
export const WEEK_BEFORE = { from: "2026-08-22", to: "2026-08-28" };

export const WEEK_BEFORE_KEY = "2026-08-22~2026-08-28";

/** Northside Studio on Google as the edge answers it: the listing, the Business Profile synced, and one review through it. */
export const NORTHSIDE = {
  ready: { places: true, profile: true },
  listing: {
    place_id: "p-1",
    name: "Northside Studio",
    address: null,
    maps_uri: null,
    business_status: "OPERATIONAL",
    rating: 4.8,
    review_count: 213,
    linked_at: "2026-08-01T12:00:00Z",
    checked_at: "2026-09-04T12:00:00Z",
    check_error: null,
  },
  connection: {
    google_email: "owner@example.com",
    account_title: "Northside",
    location_name: "locations/1",
    location_title: "Northside Studio",
    connected_at: "2026-08-01T12:00:00Z",
    last_synced_at: "2026-09-04T12:00:00Z",
    sync_error: null,
  },
  reviews: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      review_id: "r-ana",
      origin: "profile",
      rating: 5,
      author: "Ana P.",
      author_uri: null,
      author_photo_uri: null,
      body: "Careful and kind.",
      language_code: "en",
      published_at: "2026-09-03T13:00:00Z",
      reply_text: null,
      replied_at: null,
      maps_uri: null,
      first_seen_at: "2026-09-03T14:00:00Z",
    },
  ],
  days: [
    { day: "2026-08-29", rating: 4.8, review_count: 205 },
    { day: "2026-09-01", rating: 4.8, review_count: 209 },
    { day: "2026-09-04", rating: 4.8, review_count: 213 },
  ],
  reply_mode: "ask",
};

/** The reviews on record when Ana's is the only one this week, and she has not been answered: the reply the receptionist held for her named a price. */
export const northsideLedger = (over = {}) => {
  const [ana] = NORTHSIDE.reviews;
  return reviewsLedger({
    written: [writtenReview(ana.id, ana.published_at, 5)],
    waiting_total: 1,
    waiting: [{ ...ana, held: "price" }],
    ...over,
  });
};

/** The Reviews read for seven days, held as the surface holds it (the fold and its period), the period the strip shows and the read follows. */
export const holdReviews = (google, ledger) => {
  keepReportPeriod("7d");
  const held = reviewsHeld(reviewsDto({ days: 7, google, ledger }));
  setSurfaceValue("reports_reviews", held);
  return held.vm;
};

export const reviewRows = (tree) => all(tree, (n) => n.props?.["data-testid"] === "google-review");

export const figureIds = (tree) => all(byTestId(tree, "google-tiles"), (n) => n.type === Figure).map((n) => n.props.id);

export const sectionMeta = (tree) =>
  textOf(
    cls(
      find(tree, (n) => n.type === "section" && n.props["aria-label"] === "Google reviews"),
      "rpt-section-meta",
    ),
  );

/** Every lens drawn over the tests' sample as its reads: the report, and each lens's own read, of the same thirty days. */
export const overSample = (n) => {
  keepReportPeriod("30d");
  setSurfaceValue("reports", reportsSample("30d"));
  setSurfaceValue("reports_reviews", reviewsSample("30d"));
  setSurfaceValue("reports_receptionist", receptionistSample("30d"));
  setSurfaceValue("reports_people", peopleSample("30d"));
  setSurfaceValue("reports_campaigns", campaignsSample("30d"));
  lensAt = LENS_PATHS[n];
  fresh();
  return draw();
};

/** The sample's reads let go of, back on the Overview and the period the other tests keep. */
export const offSample = () => {
  for (const key of ["reports", "reports_reviews", "reports_receptionist", "reports_people", "reports_campaigns"])
    setSurfaceValue(key, undefined);
  lensAt = LENS_PATHS[0];
  keepReportPeriod("7d");
};

/** Sets the world's `lensAt` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setLensAt = (value) => (lensAt = value);

/** Sets the world's `stopRunner` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setStopRunner = (value) => (stopRunner = value);
