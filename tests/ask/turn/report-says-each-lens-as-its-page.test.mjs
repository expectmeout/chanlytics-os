/**
 * report says each Reports lens as its page does: the strip's shares only of five or more, an empty period in the
 * lens's own words, and the Reviews, Receptionist and People lenses from the page's own fold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rows } from "../../_rows.mjs";
import { QUIET } from "../../reports/people/_people-world.mjs";
import {
  CAMPAIGNS as SALON_SENDS,
  CAMPAIGNS_QUIET as SALON_QUIET_SENDS,
  QUIET as SALON_QUIET,
  SERIES as SALON_WINDOW,
} from "../../reports/campaigns/_campaign-world.mjs";
import { toPeopleReportVM, toReceptionistReportVM, toReviewsReportVM } from "@chanlytics/contracts";
import {
  A,
  BOOK,
  BOOK_NOW,
  NOW,
  PEOPLE_GONE,
  RPCS,
  TZ,
  at,
  ctxFor,
  iso,
  logged,
  newToolContext,
  peopleSeriesFor,
  runTool,
  salonReport,
  salonRpcs,
  tables,
} from "./_turn.mjs";

test("report says the strip's shares only of five or more: of four sends the page greys Delivered and Wrote back, and AI says no percentage -- the value is null and the meta carries the count -- while of five it says them", async () => {
  /** `sent` messages to `sent` people on the last day, all but one delivered and all but two answered, and nothing before. */
  const world = (sent) =>
    salonRpcs({
      campaign_series: () => ({
        ...SALON_QUIET_SENDS,
        series: SALON_QUIET_SENDS.series.map((d, i, days) =>
          i === days.length - 1 ? { ...d, sent, delivered: sent - 1, replied: sent - 2 } : d,
        ),
      }),
      campaign_ledger: (a) => ({
        ...SALON_WINDOW,
        ...SALON_QUIET,
        days: a.p_days,
        people: {
          now: { sent_to: sent, wrote_back: sent - 2, counting: 0 },
          before: { sent_to: 0, wrote_back: 0 },
        },
        runs: { now: { moment: 1, broadcast: 0 }, before: { moment: 0, broadcast: 0 } },
      }),
    });
  const four = (await salonReport(world(4))).campaigns.figures;
  assert.deepEqual(
    four.map((f) => [f.label, f.value]),
    [
      ["People sent to", "4"],
      ["Delivered", null],
      ["Wrote back", null],
      ["Said yes", "0"],
      ["Asked to stop", "0"],
    ],
  );
  assert.deepEqual(
    four.slice(1, 3).map((f) => [f.meta, f.change]),
    [
      ["3 of 4 · each channel's own receipts", null],
      ["2 of 4 people within 3 days", null],
    ],
    "the count it is of is the fold's own, and nothing is set against a period with nothing to take a share of",
  );
  const five = (await salonReport(world(5))).campaigns.figures;
  assert.deepEqual(
    five.map((f) => [f.label, f.value]),
    [
      ["People sent to", "5"],
      ["Delivered", "80%"],
      ["Wrote back", "60%"],
      ["Said yes", "0"],
      ["Asked to stop", "0"],
    ],
  );
});

test("report says an empty period in the lens's own words, with no share and no zero said for what has no source, and what is stuck as it stands", async () => {
  const quiet = salonRpcs({
    campaign_series: () => SALON_QUIET_SENDS,
    campaign_ledger: (a) => ({ ...SALON_WINDOW, ...SALON_QUIET, days: a.p_days }),
    campaign_stuck: () => ({ runs_waiting: [], runs_failed: [], replies: [], templates: [] }),
  });
  const said = (await salonReport(quiet)).campaigns;
  assert.equal(said.head, "Nothing went out in this period.");
  assert.deepEqual(said.figures, [
    { label: "People sent to", value: "0", meta: "no message went out in this period", change: null },
    { label: "Delivered", value: "—", meta: "nothing sent", change: null },
    { label: "Wrote back", value: "—", meta: "nobody was sent a message in this period", change: null },
    { label: "Said yes", value: "0", meta: "nobody in this period", change: null },
    { label: "Asked to stop", value: "0", meta: "nobody in this period", change: null },
  ]);
  assert.deepEqual(said.funnel, { empty: "No message went out in this period." });
  assert.equal(said.by_channel, null, "no channel sent");
  assert.deepEqual(said.sources, []);
  assert.deepEqual(said.window, {
    held: { empty: "Nobody was held back in this period." },
    runs_stopped: {
      empty: "No run stopped on a problem or was canceled in this period. Runs to leads are not counted here.",
    },
    failed_sends: { empty: "No message sent in this period came back." },
    by_message: { empty: "No message went out in this period." },
    send_to_first_reply: { empty: "No message was answered in this period." },
    wait_for_your_ok: { empty: "No run waited for your approval in this period." },
  });
  assert.deepEqual(
    said.stuck.map((f) => [f.label, f.value, f.meta]),
    [
      ["Runs waiting for you", "0", "nothing is waiting for your approval"],
      ["Runs with a problem", "0", "no run stopped on a problem in the last 30 days"],
      ["Replies that need you", "0", "nobody who answered a campaign is waiting"],
      ["Messages Meta stopped", "0", "every WhatsApp message is approved"],
      ["Your WhatsApp number", "Good", "Number quality: good · up to 1,000 new conversations a day · checked today"],
    ],
  );
  const text = JSON.stringify(said);
  for (const bad of ["NaN", "undefined", "null%", "%"]) assert.equal(text.includes(bad), false, bad);
});

test("report says a share of the lens only of five or more -- a channel's and a source's -- and the count it is of under that, and only the five sources that sent the most", async () => {
  const source = (n, sent, delivered, replied) => ({
    id: `s${n}`,
    kind: "broadcast",
    name: `Note ${n}`,
    template_name: null,
    runs: 1,
    sent,
    delivered,
    read: 0,
    replied,
    last_at: "2026-09-01T15:00:00.000Z",
  });
  const small = salonRpcs({
    campaign_series: () => ({
      ...SALON_SENDS,
      // The database orders them by what they sent; seven, of which the page's table shows them all and Ask five.
      sources: [
        source(1, 60, 54, 12),
        source(2, 40, 36, 8),
        source(3, 20, 18, 4),
        source(4, 5, 4, 1),
        source(5, 4, 3, 2),
        source(6, 3, 3, 0),
        source(7, 2, 2, 1),
      ],
      by_channel: [
        { channel: "sms", sent: 6, delivered: 6, read: 0, replied: 3 },
        { channel: "whatsapp", sent: 4, delivered: 3, read: 2, replied: 1 },
      ],
    }),
  });
  const said = (await salonReport(small)).campaigns;
  assert.deepEqual(
    said.sources.map((s) => [s.name, s.sent, s.delivered, s.answered]),
    [
      ["Note 1", 60, "90%", "20%"],
      ["Note 2", 40, "90%", "20%"],
      ["Note 3", 20, "90%", "20%"],
      ["Note 4", 5, "80%", "20%"],
      // Four sends: 3 of 4 delivered is a count, not 75%.
      ["Note 5", 4, "3 of 4", "2 of 4"],
    ],
  );
  assert.deepEqual(said.by_channel, [
    { channel: "Text", sent: 6, delivered: "100%", read: null, answered: "50%" },
    // WhatsApp sent four, so its read is a count too.
    { channel: "WhatsApp", sent: 4, delivered: "3 of 4", read: "2 of 4", answered: "1 of 4" },
  ]);
  // A source that sent nothing has no share to say.
  const none = salonRpcs({
    campaign_series: () => ({ ...SALON_SENDS, sources: [source(1, 0, 0, 0)], by_channel: [] }),
  });
  assert.deepEqual((await salonReport(none)).campaigns.sources, [
    { name: "Note 1", kind: "Sent once", runs: 1, sent: 0, delivered: null, answered: null },
  ]);
});

test("report says the Reviews lens as the page does (Reports phase C, lens 1): the head and the figures from the one fold, the mix and who waits where the Business Profile holds the reviews, the head and four figures from a public listing, linked false with none, and an error where its read failed", async () => {
  const today = iso(NOW.getTime()).slice(0, 10);
  const rpcs = {
    ...RPCS,
    report_series: (a) => ({
      timezone: TZ,
      days: a.p_days,
      span_days: a.p_days * 2,
      today,
      series: [],
      reasons: {},
      reply_seconds: [],
      sentiments: {},
      voicemail: 0,
    }),
  };
  const review = (n, published, over = {}) =>
    rows.googleReview({
      id: `ffffffff-ffff-4fff-8fff-ffffffffff0${n}`,
      tenant_id: A,
      review_id: `g-0${n}`,
      rating: 5,
      author: "Ana P.",
      body: "Fast, careful, and on time.",
      published_at: published,
      first_seen_at: published,
      last_seen_at: published,
      ...over,
    });
  const listing = (over = {}) =>
    rows.googleListing({
      tenant_id: A,
      address: "1 Dock Street",
      maps_uri: "https://maps.example.com/harbor",
      business_status: "OPERATIONAL",
      rating: 4.8,
      review_count: 4,
      linked_at: "2026-08-01T12:00:00Z",
      checked_at: "2026-09-14T12:00:00Z",
      ...over,
    });
  const connection = (over = {}) =>
    rows.googleConnection({
      tenant_id: A,
      google_email: "owner@example.com",
      account_title: "Harbor Studio",
      location_name: "locations/1",
      location_title: "Harbor Studio",
      connected_at: "2026-08-01T12:00:00Z",
      last_synced_at: "2026-09-14T12:00:00Z",
      ...over,
    });
  // Four reviews on the profile, which is every one Google counts: two written in the last 7 days (one answered by the
  // receptionist six hours later, one waiting, a reply to it written and held for naming a price), one in the 7 before
  // (answered by its owner), one older; and a fifth, one of the five the public listing shows, which counts for nothing.
  const reviews = [
    review(1, "2026-09-10T14:00:00Z", { reply_text: "Thank you!", replied_at: "2026-09-10T20:00:00Z" }),
    review(2, "2026-09-12T09:00:00Z", { rating: 2 }),
    review(3, "2026-09-02T10:00:00Z", { rating: 4, reply_text: "Thanks!", replied_at: "2026-09-03T10:00:00Z" }),
    review(4, "2026-08-15T10:00:00Z", { reply_text: "Thanks!", replied_at: "2026-08-15T12:00:00Z" }),
    review(5, "2026-09-13T10:00:00Z", { origin: "places", rating: 1 }),
  ];
  // What reviews_ledger answers for the profile's four (the database counts in SQL: google-reviews-ledger.db.test.mjs).
  const drawn = ({ tenant_id: _tenant, last_seen_at: _seen, ...row }) => row;
  const ledger = (a) => ({
    timezone: TZ,
    today,
    days: a.p_days,
    on_record: { profile: 4, places: 1, complete: true },
    written: [
      { id: reviews[3].id, d: "2026-08-15", rating: 5, replied: true, secs: 7_200, by: null },
      { id: reviews[2].id, d: "2026-09-02", rating: 4, replied: true, secs: 86_400, by: null },
      { id: reviews[0].id, d: "2026-09-10", rating: 5, replied: true, secs: 21_600, by: "receptionist" },
      { id: reviews[1].id, d: "2026-09-12", rating: 2, replied: false, secs: null, by: null },
    ],
    waiting_total: 1,
    waiting: [{ ...drawn(reviews[1]), held: "price" }],
  });
  const profile = tables({
    google_listings: [listing()],
    google_connections: [connection()],
    google_reviews: reviews,
  });
  // A review as report lists it (15 Oct 2026): its row's id, who wrote it, its stars, when, its words and whether it was answered.
  const said = (n, stars, when, replied) => ({
    id: reviews[n - 1].id,
    author: "Ana P.",
    stars,
    when,
    text: "Fast, careful, and on time.",
    replied,
  });
  const run = async (t, over = {}) => {
    const tc = newToolContext(ctxFor(t, { ...rpcs, reviews_ledger: ledger, ...over }), A, "owner", TZ, NOW);
    const out = await runTool(tc, { name: "report", input: { period: "7d" } });
    assert.equal(out.isError, false, out.result);
    const said = JSON.parse(out.result);
    const { weekly: _weeks, gained: _days, ...reviews } = said.reviews; // ask/charts/report-series.test.mjs
    return { ...said, reviews };
  };

  // The Business Profile holds the reviews: its head, its five figures, the mix, and who waits.
  assert.deepEqual((await run(profile)).reviews, {
    head: "4.8 on Google from 4 reviews; 2 new in the last 7 days, 1 answered.",
    tiles: [
      { label: "Rating on Google", value: "4.8", meta: "4 reviews · checked 2h ago", change: null },
      { label: "Reviews on Google", value: "4", meta: "as Google counts them, with or without words", change: null },
      { label: "New in 7 days", value: "2", meta: "with words or without", change: "up from 1" },
      { label: "Answered", value: "1 of 2", meta: "1 by AI", change: null },
      { label: "Time to reply", value: "—", meta: "1 reply so far · the middle needs 3", change: null },
    ],
    stars: {
      line: "1 of the 2 reviews written in the last 7 days are 4 or 5 stars.",
      rows: ["5 stars: 1 · 50%", "4 stars: 0 · 0%", "3 stars: 0 · 0%", "2 stars: 1 · 50%", "1 star: 0 · 0%"],
    },
    waiting: {
      count: 1,
      held: 1,
      // The oldest waiting as the page lists them, each with its id and the reply the receptionist held (15 Oct 2026).
      rows: [{ ...said(2, "★★☆☆☆", "2d ago", false), held: "AI wrote a reply and held it: it named a price." }],
    },
    // The newest besides, as the page lists them: the one waiting is above, and the one public review is among them.
    latest: [
      said(5, "★☆☆☆☆", "1d ago", false),
      said(1, "★★★★★", "4d ago", true),
      said(3, "★★★★☆", "Sep 2", true),
      said(4, "★★★★★", "Aug 15", true),
    ],
  });
  // Each review listed is a row an answer may cite (kind review), opening on the lens with its reply box.
  const cited = newToolContext(ctxFor(profile, { ...rpcs, reviews_ledger: ledger }), A, "owner", TZ, NOW);
  await runTool(cited, { name: "report", input: { period: "7d" } });
  assert.deepEqual(
    [...cited.read.review.values()].map((r) => [r.id, r.route]),
    [2, 5, 1, 3, 4].map((n) => [reviews[n - 1].id, `reports/reviews:${reviews[n - 1].id}`]),
  );

  // Only the five Google shows of a public listing: the listing's head and four figures, and nothing that needs the whole set.
  const publicOnly = tables({
    google_listings: [listing({ rating: 4.6, review_count: 213 })],
    google_reviews: reviews.map((r) => ({ ...r, origin: "places" })),
  });
  const places = (await run(publicOnly)).reviews;
  assert.deepEqual(places, {
    head: "4.6 on Google from 213 reviews; what changed needs a second day of reading.",
    tiles: [
      { label: "Rating on Google", value: "4.6", meta: "213 reviews · checked 2h ago", change: null },
      { label: "Reviews on Google", value: "213", meta: "as Google counts them, with or without words", change: null },
      { label: "Gained in 7 days", value: "—", meta: "needs a second day of reading", change: null },
      { label: "Newest review", value: "1d ago", meta: "★☆☆☆☆ · Ana P.", change: null },
    ],
    // The five Google shows, listed as the lens lists them, each a review an answer may cite.
    latest: [
      said(5, "★☆☆☆☆", "1d ago", false),
      said(2, "★★☆☆☆", "2d ago", false),
      said(1, "★★★★★", "4d ago", true),
      said(3, "★★★★☆", "Sep 2", true),
      said(4, "★★★★★", "Aug 15", true),
    ],
    connect: "Connect your Business Profile to see every review, who answered, and how fast.",
  });
  assert.deepEqual(
    Object.keys(places),
    ["head", "tiles", "latest", "connect"],
    "no answered, stars or waiting from five reviews that are a sample of nothing: the five listed, and what the profile would add",
  );
  // A profile connected whose first sync has not yet run holds none of the reviews: it says what the public listing says,
  // and offers no connection to one that is already there.
  const unsynced = tables({
    ...publicOnly,
    google_connections: [connection({ last_synced_at: null })],
  });
  assert.deepEqual((await run(unsynced)).reviews, { ...places, connect: null });

  // No listing linked: that, and the fold's words for it, which a person reads as nothing to say, never as no reviews.
  const unlinked = await run(tables());
  const nothingLinked = toReviewsReportVM(
    {
      timezone: TZ,
      today,
      days: 7,
      google: { listing: null, connection: null, reviews: [], days: [], reply_mode: "ask" },
      readable: false,
      ledger: null,
    },
    { nowMs: NOW.getTime() },
  );
  assert.ok(nothingLinked.lines.empty, "the fold has words for a workspace with nothing linked");
  assert.deepEqual(
    unlinked.reviews,
    { linked: false, words: nothingLinked.lines.empty },
    "and the tool says them: here, a deployment that can neither look a listing up nor connect a profile",
  );

  // Its read failed (the ledger's here): said so, never as no reviews, and the report stands.
  const failed = await run(profile, {
    reviews_ledger: () => {
      throw new Error("connection refused");
    },
  });
  assert.deepEqual(failed.reviews, { error: "the review numbers could not be read just now" });
  assert.deepEqual(
    [failed.range, failed.tiles.length, failed.campaigns.error],
    ["7 days", (await run(profile)).tiles.length, "the campaign numbers could not be read just now"],
    "the report's own numbers stand beside it",
  );
});

test("report says the Receptionist lens as the page does (Reports C2, the Receptionist lens): the hold, the topics and languages, how calls ended, the booking link and who booked, the two handover times, the calls nobody took, what came while closed and what is stuck, each sentence from the one fold; available false on a database without the function, an error where its read failed, words for an empty period", async () => {
  const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  const today = iso(NOW.getTime()).slice(0, 10);
  const ics = (ms) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  // Rosa was sent the booking link yesterday and has a visit the day after tomorrow; six more were sent it and People holds
  // none of them (merged or erased: a person it no longer holds is not counted, the link having gone to seven).
  const ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:r1",
    `DTSTART:${ics(NOW.getTime() + 2 * DAY)}`,
    `DTEND:${ics(NOW.getTime() + 2 * DAY + HOUR)}`,
    "SUMMARY:Rosa · Estimate",
    "DESCRIPTION:+15555550100",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
  const rosa = {
    id: CLIENT,
    display_name: "Rosa",
    wa_profile_name: null,
    phone_e164: "+15555550100",
    email: null,
    came_from: "lead",
    last_inbound_at: iso(NOW.getTime() - DAY),
  };
  const sentTheLink = [CLIENT, ...[2, 3, 4, 5, 6, 7].map((n) => `cccccccc-cccc-4ccc-8ccc-cccccccccc0${n}`)].map(
    (c) => ({ c, at: iso(NOW.getTime() - DAY) }),
  );
  const NO_HOLD = {
    total: 0,
    sent: 0,
    canceled: 0,
    steered: 0,
    overtaken: 0,
    person_first: 0,
    waiting: 0,
    other: 0,
    low_confidence: 0,
  };
  const NO_HANDOVERS = { n: 0, replied: { n: 0, median_s: null }, settled: { n: 0, median_s: null } };
  const NO_MISSED = { n: 0, touched: 0, pending: 0, unknown: 0 };
  /** What receptionist_series answers (00380) for a period with nothing in it; `over` is what a world puts in it. */
  const quietSeries = (a, over = {}) => ({
    timezone: TZ,
    today,
    days: a.p_days,
    hold: { now: NO_HOLD, before: { total: 0, sent: 0 } },
    topics: { of: 0, stamped: 0, by_intent: {} },
    languages: { of: 0, stamped: 0, by_language: {} },
    blocked: { total: 0, by_reason: {} },
    call_endings: { total: 0, by_reason: {} },
    handover: { now: NO_HANDOVERS, before: NO_HANDOVERS },
    missed: { now: NO_MISSED, before: NO_MISSED },
    after_hours: [],
    links: { total: 0, people: [] },
    stuck: { open: [] },
    ...over,
  });
  // A week's worth of counts. The workspace's hours are Monday 9 to 5 alone, so the Sunday and Saturday messages came while
  // it was closed (three and two, the receptionist answered first to one and to both) and Monday 10:00 did not count.
  const escalation = (reason, agoMs, state, over = {}) => ({
    reason,
    created_at: iso(NOW.getTime() - agoMs),
    state,
    paused_until: null,
    assignee_user_id: null,
    ...over,
  });
  const busy = {
    hold: {
      now: {
        total: 14,
        sent: 9,
        canceled: 1,
        steered: 1,
        overtaken: 1,
        person_first: 1,
        waiting: 0,
        other: 1,
        low_confidence: 3,
      },
      before: { total: 10, sent: 8 },
    },
    topics: { of: 41, stamped: 33, by_intent: { booking: 12, pricing: 9, hours: 6, services: 4, other: 2 } },
    languages: { of: 38, stamped: 38, by_language: { en: 30, es: 8 } },
    blocked: { total: 4, by_reason: { human_has_it: 3, opted_out: 1 } },
    call_endings: { total: 18, by_reason: { user_hangup: 11, agent_hangup: 5, unknown: 2 } },
    handover: {
      now: { n: 12, replied: { n: 11, median_s: 540 }, settled: { n: 9, median_s: 3900 } },
      before: { n: 10, replied: { n: 9, median_s: 780 }, settled: { n: 7, median_s: 5400 } },
    },
    missed: { now: { n: 6, touched: 4, pending: 1, unknown: 1 }, before: { n: 4, touched: 3, pending: 0, unknown: 0 } },
    after_hours: [
      { d: "2026-09-13", q: 44, n: 3, a: 1 },
      { d: "2026-09-12", q: 84, n: 2, a: 2 },
      { d: "2026-09-14", q: 40, n: 4, a: 4 },
    ],
    links: { total: 7, people: sentTheLink },
    // Four are open: one flagged and nobody's, a call-back, one a teammate has, and one put aside: two wait on the member.
    stuck: {
      open: [
        escalation("human_token", 6 * HOUR, "needs_human"),
        escalation("callback", 5 * HOUR, "open"),
        escalation("manual", 7 * HOUR, "open", { assignee_user_id: "u2" }),
        escalation("human_token", DAY, "snoozed"),
      ],
    },
  };
  const rpcs = {
    ...RPCS,
    report_series: (a) => ({
      timezone: TZ,
      days: a.p_days,
      span_days: a.p_days * 2,
      today,
      series: [],
      reasons: {},
      reply_seconds: [],
      sentiments: {},
      voicemail: 0,
    }),
    people_list: () => [rosa],
  };
  const base = tables();
  const world = tables({
    tenant_config: [
      {
        ...base.tenant_config[0],
        config: { ...base.tenant_config[0].config, calendar: { ical_url: "https://calendar.example/harbor.ics" } },
      },
    ],
  });
  const run = async (over) => {
    const ctx = ctxFor(world, { ...rpcs, ...over });
    const out = await runTool(newToolContext(ctx, A, "owner", TZ, NOW), { name: "report", input: { period: "7d" } });
    assert.equal(out.isError, false, out.result);
    return { said: JSON.parse(out.result), ctx };
  };
  const peopleRead = ({ ctx }) => ctx.supabase.seen.filter((q) => q.rpc === "people_list").length;
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async () => new Response(ICS, { status: 200, headers: { "content-type": "text/calendar" } });
  try {
    forgetFeeds();
    // A busy week: every part, in the page's own words.
    const week = await run({ receptionist_series: (a) => quietSeries(a, busy) });
    assert.deepEqual(week.said.receptionist, {
      hold: {
        rows: [
          "Went out as the hold ended: 9",
          "You cancelled: 1",
          "You changed: 1",
          "A newer message came first: 1",
          "A person answered first: 1",
          "Did not go out: 1",
        ],
        line: "9 of 14 went out as the hold ended. 3 were held back as not sure enough to send alone.",
      },
      topics: {
        rows: ["Booking: 12", "Pricing question: 9", "Hours: 6", "Services: 4", "Other: 2"],
        line: "33 of 41 text and WhatsApp messages had a topic.",
      },
      languages: ["English: 30", "Spanish: 8"],
      call_endings: ["Customer hung up: 11", "AI ended the call: 5", "Not recorded: 2"],
      calls_kept_off_your_list: "No calls were kept off your list in this period.",
      link: "7 people were sent the booking link; 1 has booked since.",
      handover: [
        {
          label: "Your first reply after a handover",
          value: "9m",
          meta: "11 of 12 handovers that wanted a message had a reply from you",
          change: "was 13m the 7 days before",
        },
        {
          label: "Time to settle a handover",
          value: "1h 5m",
          meta: "9 of 12 settled",
          change: "was 1h 30m the 7 days before",
        },
      ],
      missed: {
        label: "Missed calls answered within an hour",
        value: "4 of 6",
        meta: "1 under an hour old, not counted yet · 1 with no caller on record not counted",
        change: "was 3 of 4 the 7 days before",
      },
      closed: { value: "3 of 5", meta: "5 messages came while you were closed; AI answered 3." },
      stuck: [
        { label: "Needs you", value: "2", meta: "the oldest has waited 6h" },
        { label: "Call-backs", value: "1", meta: "people to ring, counted in Needs you" },
        { label: "Replies held back", value: "4", meta: "a person had the conversation 3 · asked to stop 1" },
      ],
      held_back: ["A person had the conversation: 3", "Asked to stop: 1"],
    });
    assert.equal(week.said.receptionist.held_back[0], "A person had the conversation: 3");
    assert.equal(week.said.receptionist.stuck[0].value, "2");
    assert.equal(
      peopleRead(week),
      1,
      "the booking line's read of People and the link's are the turn's one read (readers/everyone.ts): the link's people are filtered from it, not read again",
    );
    assert.deepEqual(
      [week.said.range, week.said.campaigns.error, week.said.reviews.linked],
      ["7 days", "the campaign numbers could not be read just now", false],
      "the report's own parts stand beside it",
    );

    // The same fold the page draws: the same view model's words, whoever asks.
    const folded = toReceptionistReportVM(
      {
        timezone: TZ,
        today,
        days: 7,
        series: {
          ...quietSeries({ p_days: 7 }, busy),
          links: { sent: 7, booked: 1, calendar: "ok" },
          stuck: { waiting: 2, oldest_at: iso(NOW.getTime() - 6 * HOUR), callbacks: 1, capped: false },
        },
        profile: { hours: { mon: { open: "09:00", close: "17:00" } } },
      },
      { nowMs: NOW.getTime() },
    );
    assert.equal(week.said.receptionist.link, folded.link.line);
    assert.equal(week.said.receptionist.hold.line, folded.hold.line);
    assert.deepEqual(
      week.said.receptionist.stuck.map((s) => s.meta),
      folded.stuck.map((s) => s.meta),
    );

    // A database that does not have the function yet (00380 not applied): said so, and once in the log.
    const gone = Object.assign(
      new Error("Could not find the function public.receptionist_series in the schema cache"),
      {
        code: "PGRST202",
      },
    );
    const absent = await logged("receptionist_series_missing", () =>
      run({
        receptionist_series: () => {
          throw gone;
        },
      }),
    );
    assert.deepEqual(absent.result.said.receptionist, { available: false });
    assert.deepEqual(absent.lines, [JSON.stringify({ tenant_id: A })], "said once for the read, naming the workspace");

    // A read that fails, here a function nobody scripted: said as an error, never as nothing happening, and in the log;
    // the report's own numbers stand.
    const failed = await logged("ask_tool_read_failed", () => run({}));
    assert.deepEqual(failed.result.said.receptionist, {
      error: "AI's numbers could not be read just now",
    });
    assert.deepEqual(
      failed.lines.map((l) => JSON.parse(l).read).filter((read) => read === "receptionist"),
      ["receptionist"],
      "and said once in the log",
    );
    assert.equal(failed.result.said.range, "7 days");
    const down = await run({
      receptionist_series: () => {
        throw new Error("connection refused");
      },
    });
    assert.deepEqual(down.said.receptionist, { error: "AI's numbers could not be read just now" });

    // A period with nothing in it: the page's words for each part, and no zero said for what has no source.
    const quiet = await run({ receptionist_series: (a) => quietSeries(a) });
    assert.deepEqual(quiet.said.receptionist, {
      hold: { empty: "No reply waited in a hold in this period." },
      topics: { empty: "Topics are read from texts and WhatsApp messages. None came in this period." },
      languages: null,
      call_endings: { empty: "Nobody phoned in this period." },
      calls_kept_off_your_list: "No calls were kept off your list in this period.",
      link: "Nobody was sent the booking link in this period.",
      handover: [
        {
          label: "Your first reply after a handover",
          value: "—",
          meta: "nothing was handed over in this period",
          change: null,
        },
        {
          label: "Time to settle a handover",
          value: "—",
          meta: "nothing was handed over in this period",
          change: null,
        },
      ],
      missed: {
        label: "Missed calls answered within an hour",
        value: "—",
        meta: "no call went unanswered at the phone",
        change: null,
      },
      closed: { value: "0", meta: "no message came while you were closed" },
      stuck: [
        { label: "Needs you", value: "0", meta: "nobody is waiting for you" },
        { label: "Call-backs", value: "0", meta: "no call-back is waiting" },
        { label: "Replies held back", value: "0", meta: "none were held at the door in this period" },
      ],
      held_back: [],
    });
    // Calls that did not connect are not "nobody phoned": the page's own empty words for the endings, said as the page does.
    const rang = await run({
      receptionist_series: (a) =>
        quietSeries(a, { missed: { now: { n: 2, touched: 1, pending: 0, unknown: 0 }, before: NO_MISSED } }),
    });
    assert.deepEqual(rang.said.receptionist.call_endings, { empty: "No call connected in this period." });
    assert.equal(JSON.stringify(quiet.said.receptionist).includes("NaN"), false);
    assert.equal(peopleRead(quiet), 1, "no link was sent: nobody is read for it, only the booking line's own read");
  } finally {
    globalThis.fetch = fetchWas;
    forgetFeeds();
  }
});

test("report says the People lens as the page does (Reports C3, the People lens): the head, the window's four figures and six mixes, and the book's wires, freshness, what is stuck and where it stands -- each sentence the fold's, one read of the series and of People; either half alone, an error where it could not be read, and available false where neither could", async () => {
  const today = "2026-09-14";
  const quietReport = (a) => ({
    timezone: TZ,
    days: a.p_days,
    span_days: a.p_days * 2,
    today,
    series: [],
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  });
  const rpcs = {
    ...RPCS,
    report_series: quietReport,
    people_list: () => BOOK,
    people_series: (a) => peopleSeriesFor(a),
  };
  const run = async (over = {}) => {
    const ctx = ctxFor(tables(), { ...rpcs, ...over });
    const out = await runTool(newToolContext(ctx, A, "owner", TZ, NOW), { name: "report", input: { period: "7d" } });
    assert.equal(out.isError, false, out.result);
    return { said: JSON.parse(out.result), ctx };
  };
  const readsOf = ({ ctx }, rpc) => ctx.supabase.seen.filter((q) => q.rpc === rpc).length;
  const down = () => {
    throw new Error("people down");
  };
  const gone = () => {
    throw PEOPLE_GONE;
  };

  // The book of eight, as the page draws it.
  const BOOK_SAID = {
    wires: {
      rows: ["WhatsApp only: 7", "More than one way: 1"],
      line: "1 of 8 have reached you more than one way, as of today.",
    },
    fresh: {
      rows: [
        "Under 7 days: 3",
        "7 to 30 days: 2",
        "31 to 60 days: 1",
        "61 to 90 days: 1",
        "91 days or more: 1",
        "Never heard from: 0",
      ],
      line: "Of 8 people as of today: the days since they last wrote or called. Your own messages do not count.",
      quiet: "3 people have been quiet for more than 30 days.",
    },
    stuck: [
      { label: "Steps overdue", value: "6", meta: "people whose next step is past its day", change: null },
      { label: "Steps due today", value: "1", meta: "people whose next step is due today", change: null },
      { label: "Email stopped working", value: "0", meta: "every address works", change: null },
    ],
    stand: [
      { label: "Said yes to messages", value: "7", meta: "of 8 people", change: null },
      { label: "Can receive offers", value: "3", meta: "of 8 people", change: null },
      { label: "Opted out", value: "1", meta: "of 8 people", change: null },
      { label: "Quiet 30+ days", value: "3", meta: "of 8 people", change: null },
    ],
  };

  // A busy week: every part, in the page's own words.
  const week = await run();
  assert.deepEqual(week.said.people, {
    head: "40 people reached you, 12 new (8 the 7 days before); 7 of 8 have said yes to messages.",
    window: {
      reached: [
        { label: "People who reached you", value: "40", meta: "12 new · 28 you knew already", change: "up from 31" },
        { label: "New people", value: "12", meta: "of the 40 who reached you", change: "up from 8" },
        {
          label: "Yeses won",
          value: "9",
          meta: "6 to messages · 2 to offers · 1 to email offers",
          change: "up from 7",
        },
        {
          label: "Stops",
          value: "4",
          meta: "2 stopped all messages · 1 stopped offers · 1 stopped email offers",
          change: "up from 2",
        },
      ],
      channels: {
        rows: ["WhatsApp: 25", "Phone: 11", "Email: 6", "Text: 3"],
        line: "A person who reached you more than one way is counted in each.",
      },
      first_came: {
        rows: ["WhatsApp: 5", "Phone: 3", "The calendar: 1", "An ad: 1", "Not recorded: 2"],
        line: "10 of 12 new people have a recorded way in.",
      },
      yeses: {
        rows: ["Their own message: 6", "A form: 2", "In person: 1"],
        line: "Each person is counted once for each kind of message they said yes to.",
      },
      stops: {
        rows: ["Their own STOP: 2", "Their phone company: 1", "An unsubscribe: 1"],
        line: "Each person is counted once for each kind of message they stopped.",
      },
      steps_done: {
        rows: ["Done on or before their day: 8", "Done after their day: 3"],
        line: "8 of 11 were done on or before their day.",
      },
      email_stopped: {
        rows: ["Bounced for good: 1", "Marked as spam: 1"],
        line: "2 addresses stopped working in this period.",
      },
    },
    book: BOOK_SAID,
  });
  assert.equal(week.said.people.window.reached[0].value, "40");
  assert.equal(week.said.people.book.stuck[0].value, "6");
  assert.equal(week.said.people.book.stand[0].label, "Said yes to messages");
  // The same fold the page draws: the lens's sentence is the view model's, whoever asks.
  const folded = toPeopleReportVM({
    timezone: TZ,
    today,
    days: 7,
    series: peopleSeriesFor({ p_days: 7 }),
    now: BOOK_NOW,
  });
  assert.equal(week.said.people.head, folded.head);
  assert.equal(week.said.people.book.fresh.quiet, folded.fresh.quiet.line);
  assert.deepEqual(
    week.said.people.window.reached.map((x) => x.meta),
    folded.strip.map((x) => x.meta),
  );
  // One read of the series and of People, and of the channels the book is judged against, for the whole report.
  assert.deepEqual(
    ["people_series", "people_list"].map((rpc) => readsOf(week, rpc)),
    [1, 1],
    "the booking line's read of People and the book's are the turn's one read (readers/everyone.ts)",
  );
  // The channels: the book is judged against the turn's one read of them (the number's row and the texting line's), and the
  // Campaigns lens's ledger reads the connected number's row once more, to say its health (readers/campaign-report.ts).
  assert.deepEqual(
    ["tenant_channels", "lines"].map((table) => week.ctx.supabase.seen.filter((q) => q.table === table).length),
    [2, 1],
    "the channels: the book's judgment, once, and the number's health, once",
  );
  assert.deepEqual(
    [week.said.range, week.said.campaigns.error, week.said.reviews.linked],
    ["7 days", "the campaign numbers could not be read just now", false],
    "the report's own parts stand beside it",
  );

  // A database that does not have the function yet (00395 not applied): the book alone, no head of the window's, once in the log.
  const absent = await logged("people_series_missing", () => run({ people_series: gone }));
  assert.deepEqual(absent.result.said.people, { head: null, window: null, book: BOOK_SAID });
  assert.deepEqual(absent.lines, [JSON.stringify({ tenant_id: A })], "said once for the read, naming the workspace");

  // People that cannot be read: the window alone, said without the yes of the book, and in the log.
  const pool = await logged("people_pool_failed", () => run({ people_list: down }));
  assert.deepEqual(pool.result.said.people, {
    head: "40 people reached you, 12 new (8 the 7 days before).",
    window: week.said.people.window,
    book: null,
  });
  assert.equal(pool.lines.length, 1, "said once in the log");
  assert.match(JSON.parse(pool.lines[0]).error, /people down/);
  assert.equal(pool.result.said.range, "7 days", "the report's own numbers stand");

  // Neither half: not "nothing", the lens is not kept in this database.
  const { result: neither } = await logged("people_pool_failed", () => run({ people_series: gone, people_list: down }));
  assert.deepEqual(neither.said.people, { available: false });

  // A read that fails, here a function nobody scripted, or one that raises: an error in words, never as nobody reached
  // you, and once in the log; the report's own numbers stand.
  const { people_series: _scripted, ...unscripted } = rpcs;
  const failed = await logged("ask_tool_read_failed", async () => {
    const ctx = ctxFor(tables(), unscripted);
    const out = await runTool(newToolContext(ctx, A, "owner", TZ, NOW), { name: "report", input: { period: "7d" } });
    assert.equal(out.isError, false, out.result);
    return JSON.parse(out.result);
  });
  assert.deepEqual(failed.result.people, { error: "the people numbers could not be read just now" });
  assert.deepEqual(
    failed.lines.map((l) => JSON.parse(l).read).filter((read) => read === "people"),
    ["people"],
    "and said once in the log",
  );
  assert.equal(failed.result.range, "7 days");
  const { result: raised } = await logged("ask_tool_read_failed", () =>
    run({
      people_series: () => {
        throw new Error("connection refused");
      },
    }),
  );
  assert.deepEqual(raised.said.people, { error: "the people numbers could not be read just now" });

  // A period nobody reached you in: the page's words for each part, and no zero said for what has no source; the book stands.
  const quiet = await run({ people_series: (a) => peopleSeriesFor(a, QUIET) });
  assert.deepEqual(quiet.said.people, {
    head: "Nobody reached you in this period; 7 of 8 have said yes to messages.",
    window: {
      reached: [
        { label: "People who reached you", value: "0", meta: "nobody wrote or called in this period", change: null },
        { label: "New people", value: "0", meta: "nobody new", change: null },
        { label: "Yeses won", value: "0", meta: "nobody said yes in this period", change: null },
        { label: "Stops", value: "0", meta: "nobody asked to stop in this period", change: null },
      ],
      channels: { empty: "Nobody reached you in this period." },
      first_came: { empty: "Nobody new reached you in this period." },
      yeses: { empty: "Nobody said yes in this period." },
      stops: { empty: "Nobody asked to stop in this period." },
      steps_done: { empty: "No step was done in this period." },
      email_stopped: { empty: "No address stopped working in this period." },
    },
    book: BOOK_SAID,
  });
  assert.equal(JSON.stringify(quiet.said.people).includes("NaN"), false);

  // A book with nobody in it says its words, not a zero share; a book of four says no share of yes in the head.
  const empty = await run({ people_list: () => [] });
  assert.deepEqual(empty.said.people.book.wires, { empty: "Nobody is in your book yet." });
  assert.deepEqual(empty.said.people.book.fresh, { empty: "Nobody is in your book yet.", quiet: null });
  assert.deepEqual(empty.said.people.book.stand[0], {
    label: "Said yes to messages",
    value: "0",
    meta: "nobody is in your book yet",
    change: null,
  });
  assert.equal(empty.said.people.head, "40 people reached you, 12 new (8 the 7 days before).");
  const four = await run({ people_list: () => BOOK.slice(0, 4) });
  assert.equal(
    four.said.people.head,
    "40 people reached you, 12 new (8 the 7 days before).",
    "of fewer than five: no share",
  );
  assert.equal(four.said.people.book.stand[0].meta, "of 4 people");
  assert.equal(four.said.people.book.stuck[0].value, "4");
});

test("report withholds only a share of fewer than five: a count of fewer is said as it is, with the count it stands against in its meta", async () => {
  // A book of three people: the page greys nothing that is a count, and so does Ask (the book's figures carry n = 3 and minN = 5,
  // as the shares do, but their values are counts of people).
  const ctx = ctxFor(tables(), {
    ...RPCS,
    report_series: (a) => ({
      timezone: TZ,
      days: a.p_days,
      span_days: a.p_days * 2,
      today: "2026-09-14",
      series: [],
      reasons: {},
      reply_seconds: [],
      sentiments: {},
      voicemail: 0,
    }),
    people_list: () => BOOK.slice(0, 3),
    people_series: (a) => peopleSeriesFor(a),
  });
  const out = await runTool(newToolContext(ctx, A, "owner", TZ, NOW), { name: "report", input: { period: "7d" } });
  assert.equal(out.isError, false, out.result);
  const { stand } = JSON.parse(out.result).people.book;
  assert.deepEqual(
    stand.map((f) => [f.label, typeof f.value, f.meta]),
    [
      ["Said yes to messages", "string", "of 3 people"],
      ["Can receive offers", "string", "of 3 people"],
      ["Opted out", "string", "of 3 people"],
      ["Quiet 30+ days", "string", "of 3 people"],
    ],
  );
});
