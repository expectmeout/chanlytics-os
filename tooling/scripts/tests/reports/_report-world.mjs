/**
 * The world Reports' tests draw: a week that has everything, Sat Aug 29 to Fri Sep 4, 2026, after a quieter week, as the
 * bridge's contracts functions make its view models (the fixtures every Reports test shares; nothing here is a real
 * business: Harbor Studio's numbers are made up).
 */
import { toReportVM, toCampaignReportVM, toBookingReportVM, toDealReportVM, reportFacts } from "@chanlytics/contracts";

/* ------------- a week that has everything: Sat Aug 29 to Fri Sep 4, 2026, after a quieter week ------------- */

export const rday = (d, over = {}) => ({
  day: d,
  messages_in: 0,
  conversations: 0,
  answered_ai: 0,
  answered_you: 0,
  unanswered: 0,
  out_ai: 0,
  out_you: 0,
  escalations: 0,
  calls: 0,
  call_seconds: 0,
  new_contacts: 0,
  ...over,
});
const BEFORE = ["2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28"];
const ZEROS = { whatsapp: 0, voice: 0, email: 0, sms: 0, instagram: 0 };
/** Messages and calls by weekday (Monday first) and hour: twenty, as the week holds. */
const grid = () => {
  const g = Array.from({ length: 7 }, () => Array(24).fill(0));
  g[5][10] = 3;
  g[5][11] = 2;
  g[6][12] = 2;
  g[1][10] = 4;
  g[1][17] = 3;
  g[2][9] = 1;
  g[3][14] = 3;
  g[4][21] = 2;
  return g;
};
export const reportDto = (over = {}) => ({
  timezone: "America/New_York",
  days: 7,
  span_days: 14,
  today: "2026-09-04",
  series: [
    ...BEFORE.map((d, i) =>
      rday(d, { messages_in: 1, answered_ai: 1, conversations: 1, new_contacts: i % 3 === 0 ? 1 : 0 }),
    ),
    rday("2026-08-29", {
      messages_in: 4,
      conversations: 2,
      answered_ai: 3,
      answered_you: 1,
      calls: 1,
      call_seconds: 90,
      new_contacts: 1,
    }),
    rday("2026-08-30", { messages_in: 2, conversations: 1, answered_ai: 2 }),
    rday("2026-08-31"),
    rday("2026-09-01", {
      messages_in: 5,
      conversations: 3,
      answered_ai: 3,
      answered_you: 1,
      unanswered: 1,
      escalations: 2,
      calls: 2,
      call_seconds: 300,
    }),
    rday("2026-09-02", { messages_in: 1, conversations: 1, answered_you: 1, new_contacts: 1 }),
    rday("2026-09-03", { messages_in: 3, conversations: 2, answered_ai: 3, escalations: 1 }),
    rday("2026-09-04", { messages_in: 2, conversations: 1, answered_ai: 2 }),
  ],
  reasons: { human_token: 2, policy_block: 1 },
  reply_seconds: [4, 8, 12, 15, 40, 70, 400, 2000],
  sentiments: { Positive: 2, Neutral: 1 },
  voicemail: 1,
  replies: [
    ["2026-08-29", 12],
    ["2026-08-29", 40],
    ["2026-08-29", 8],
    ["2026-08-30", 15],
    ["2026-08-30", 4],
    ["2026-09-01", 70],
    ["2026-09-03", 400],
    ["2026-09-04", 2000],
  ].map(([day, s]) => ({ day, s })),
  channels: {
    current: { whatsapp: 12, voice: 3, email: 4, sms: 1, instagram: 0 },
    previous: { ...ZEROS, whatsapp: 7 },
  },
  hours: grid(),
  ...over,
});
/** Nobody wrote or called, this week or the one before. */
export const quiet = () => ({
  series: reportDto().series.map((d) => rday(d.day)),
  reasons: {},
  reply_seconds: [],
  sentiments: {},
  voicemail: 0,
  replies: [],
  channels: { current: ZEROS, previous: ZEROS },
  hours: Array.from({ length: 7 }, () => Array(24).fill(0)),
});
export const cday = (d, over = {}) => ({
  day: d,
  sent: 0,
  delivered: 0,
  read: 0,
  replied: 0,
  opt_ins: 0,
  opt_outs: 0,
  ...over,
});
export const campaignDto = () => ({
  timezone: "America/New_York",
  days: 7,
  span_days: 14,
  today: "2026-09-04",
  series: [
    ...BEFORE.map((d, i) => cday(d, i === 2 ? { sent: 4, delivered: 4, read: 2, replied: 2, opt_ins: 1 } : {})),
    cday("2026-08-29", { sent: 10, delivered: 9, read: 6, replied: 2, opt_ins: 2 }),
    cday("2026-08-30"),
    cday("2026-08-31", { opt_ins: 1, opt_outs: 1 }),
    cday("2026-09-01", { sent: 6, delivered: 3, read: 1, replied: 1 }),
    cday("2026-09-02"),
    cday("2026-09-03", { sent: 4, delivered: 4, read: 4, replied: 1, opt_outs: 1 }),
    cday("2026-09-04"),
  ],
  sources: [
    {
      id: "p1",
      kind: "playbook",
      name: "Win-back",
      template_name: "winback_offer",
      runs: 2,
      sent: 14,
      delivered: 12,
      read: 7,
      replied: 3,
      last_at: "2026-09-03T14:05:00Z",
    },
    {
      id: "b1",
      kind: "broadcast",
      name: "A quick note · Sep 1",
      template_name: "quick_note",
      runs: 1,
      sent: 6,
      delivered: 4,
      read: 4,
      replied: 1,
      last_at: "2026-09-01T15:00:00Z",
    },
  ],
});
export const CALENDAR = { calendar: "ok", days: 7, asked: 8, booked: 3 };

/** Deals as the bridge publishes them where deals are off or none was ever recorded: the section is not drawn. */
export const NO_DEALS = toDealReportVM(null, "7 days");
/** A report as the route answers it (dealReport, 0008), for the bridge's own view model: the round trip. */
export const dealsDto = (over = {}) => ({
  any: true,
  sent: 0,
  won: 0,
  lost: 0,
  waiting: 0,
  clients: 0,
  monthly_cents: 0,
  median_days_to_yes: null,
  open: { count: 0, amounts: [] },
  sources: [],
  reasons: [],
  ...over,
});
/** A week with five proposals out, three yeses, one pass with its reason and one still waiting, and more open. */
export const DEALS = toDealReportVM(
  dealsDto({
    sent: 5,
    won: 3,
    lost: 1,
    waiting: 1,
    clients: 4,
    monthly_cents: 750_000,
    median_days_to_yes: 9,
    open: { count: 3, amounts: [{ amount_cents: 425_000, per: "once", currency: "USD" }] },
    sources: [
      { came_from: "lead", count: 2 },
      { came_from: "sms", count: 1 },
    ],
    reasons: [{ reason: "price", count: 1 }],
  }),
  "7 days",
);
/** `profile` is the workspace's hours as the surface reads them: null could not be read, `{}` was read and holds none. */
export const surface = ({
  report = {},
  campaigns = campaignDto(),
  booking = CALENDAR,
  deals = NO_DEALS,
  profile = null,
} = {}) => {
  const vm = toReportVM(reportDto(report), { profile });
  const cm = campaigns ? toCampaignReportVM(campaigns) : null;
  return {
    vm,
    campaigns: cm,
    booking: toBookingReportVM(booking),
    deals,
    facts: reportFacts(vm, cm),
    period: "7d",
    days: 7,
    fetchedAt: 1,
  };
};

/* ------------- Reviews: Harbor Studio on Google, the Business Profile synced, Fri Sep 4, 2026, New York ------------- */

/** The workspace's day when the reviews were read, and an instant on it (11:00 there). */
export const REVIEWS_TODAY = "2026-09-04";
export const REVIEWS_NOW = Date.parse("2026-09-04T15:00:00Z");

export const googleListing = (over = {}) => ({
  place_id: "place-1",
  name: "Harbor Studio",
  address: "1 Dock Street",
  maps_uri: "https://maps.example.com/harbor",
  business_status: "OPERATIONAL",
  rating: 4.8,
  review_count: 213,
  linked_at: "2026-08-01T12:00:00Z",
  checked_at: "2026-09-04T12:00:00Z",
  check_error: null,
  ...over,
});
export const googleConnection = (over = {}) => ({
  google_email: "owner@example.com",
  account_title: "Harbor Studio",
  location_name: "locations/1",
  location_title: "Harbor Studio",
  connected_at: "2026-08-01T12:00:00Z",
  last_synced_at: "2026-09-04T12:00:00Z",
  sync_error: null,
  ...over,
});
/** A review as the page's read holds it (GoogleReviewDto): through the profile unless `origin` says it is one of the five public. */
export const googleReview = (id, published, over = {}) => ({
  id,
  review_id: `g-${id}`,
  origin: "profile",
  rating: 5,
  author: "Ana P.",
  author_uri: null,
  author_photo_uri: null,
  body: "Fast, careful, and on time.",
  language_code: null,
  published_at: published,
  reply_text: null,
  replied_at: null,
  maps_uri: null,
  first_seen_at: published,
  ...over,
});
/** A review as the counts read it: its stars, the day Google dates it, and when it was answered (null: it was not). */
export const writtenReview = (id, published, rating, repliedAt = null, over = {}) => ({
  id,
  rating,
  published_at: published,
  has_reply: repliedAt !== null,
  replied_at: repliedAt,
  ...over,
});

/**
 * Six reviews written in the last 30 days (Aug 6 to Sep 4), three of them answered, 5 of 6 at four or five stars; three in
 * the 30 before (Jul 7 to Aug 5); and one on each side of a day's edge in New York, which is four hours behind UTC.
 * a (answered by the receptionist, 6h), b (by the owner here, 10m), c (by the owner on Google, 24h), d (held: it named a
 * price), e, f unanswered; g, h, i the period before; j just before it.
 */
const REVIEWS_WRITTEN = [
  writtenReview("a", "2026-09-03T14:00:00Z", 5, "2026-09-03T20:00:00Z"),
  writtenReview("b", "2026-09-01T14:00:00Z", 5, "2026-09-01T14:10:00Z"),
  writtenReview("c", "2026-08-20T10:00:00Z", 4, "2026-08-21T10:00:00Z"),
  writtenReview("d", "2026-08-14T12:00:00Z", 2),
  writtenReview("e", "2026-08-12T12:00:00Z", 5),
  writtenReview("f", "2026-08-06T04:00:00Z", 4),
  writtenReview("g", "2026-08-06T03:59:00Z", 5, "2026-08-06T09:00:00Z"),
  writtenReview("h", "2026-07-20T12:00:00Z", 3, "2026-07-20T13:00:00Z"),
  writtenReview("i", "2026-07-07T04:00:00Z", 4),
  writtenReview("j", "2026-07-07T03:59:00Z", 5),
];
/** The reviews with no reply, oldest first, as the page's read holds them (GoogleReviewDto). */
const UNANSWERED = [
  googleReview("old", "2026-06-01T12:00:00Z", { rating: 3 }),
  googleReview("f", "2026-08-06T04:00:00Z", { rating: 4 }),
  googleReview("e", "2026-08-12T12:00:00Z"),
  googleReview("d", "2026-08-14T12:00:00Z", { rating: 2 }),
];

/** `GET reports/reviews`'s `google`: the listing, the profile connected and synced, the newest reviews and three days' counts. */
export const reviewsGoogle = (over = {}) => ({
  ready: { places: true, profile: true },
  listing: googleListing(),
  connection: googleConnection(),
  reviews: [
    googleReview("a", "2026-09-03T14:00:00Z", { reply_text: "Thank you, Ana!", replied_at: "2026-09-03T20:00:00Z" }),
    googleReview("b", "2026-09-01T14:00:00Z", { reply_text: "Glad to hear it.", replied_at: "2026-09-01T14:10:00Z" }),
    googleReview("c", "2026-08-20T10:00:00Z", {
      rating: 4,
      reply_text: "Thanks for coming in.",
      replied_at: "2026-08-21T10:00:00Z",
    }),
    ...UNANSWERED,
  ],
  days: [
    { day: "2026-07-06", rating: 4.6, review_count: 190 },
    { day: "2026-08-05", rating: 4.7, review_count: 205 },
    { day: "2026-09-04", rating: 4.8, review_count: 213 },
  ],
  reply_mode: "ask",
  ...over,
});

/** The ledger the one bounded read returns (reviewsReadSince): the whole record is on hand, 213 of 213. */
export const reviewsLedger = (over = {}) => ({
  written: REVIEWS_WRITTEN,
  on_record: { profile: 213, places: 0, oldest_at: "2019-05-02T12:00:00Z" },
  waiting_total: UNANSWERED.length,
  waiting: UNANSWERED,
  replies: [
    { review_id: "a", by: "receptionist", at: "2026-09-03T20:00:00Z" },
    { review_id: "b", by: null, at: "2026-09-01T14:10:00Z" },
  ],
  held: [{ review_id: "d", why: "price" }],
  ...over,
});

/** What `GET reports/reviews` answers for a period of 30 days, the profile synced. */
export const reviewsDto = (over = {}) => ({
  timezone: "America/New_York",
  today: REVIEWS_TODAY,
  days: 30,
  google: reviewsGoogle(),
  ledger: reviewsLedger(),
  ...over,
});
