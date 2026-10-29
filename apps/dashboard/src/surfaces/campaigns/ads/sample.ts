/**
 * The Ads view's sample (MOCKUP): a made-up studio's ads, as FIXTURES of the DTO a reader will return (`AdsRead`, `AdsConfig`),
 * drawn in a demo session until the wiring lane reads real ones. Nothing here is a real business, number or person (555-01xx
 * numbers, example.com links). Read Sun 11 Oct 2026, 9:19 AM, in the studio's zone (America/New_York); the window is the last
 * 30 days, Fri 11 Sep to Sat 10 Oct (spend and people end yesterday; today is drawn as an outline). Money is cents.
 *
 * ONE table of daily rows per ad ([spend, in touch, booked since] a day): every total, ratio, bar and aria-label on the page is
 * computed from them by the models in contracts, so none can disagree. Nothing a page says is typed here as a total. The
 * people carry the ids the demo People and Inbox samples use, so a door from Ads lands on a real demo page.
 *
 * This file is the base (the "running" example); examples.ts bends it into the others. Only the demo store (store.ts) imports
 * either: the route chunk reads crumb-names.ts alone.
 */
import { addDays } from "@chanlytics/contracts";
import type {
  AdAccountRead,
  AdCheck,
  AdCheckId,
  AdDay,
  AdDoor,
  AdPersonRead,
  AdPlatform,
  AdRead,
  AdsConfig,
  AdsRead,
} from "@chanlytics/contracts";
import { starterCopy } from "@chanlytics/contracts/ads-page";
import { DEMO_ZONE } from "../../demo-zone";

// ---------------------------------------------------------------------------------------------------------------------
// Ids: Chanlytics' own (a uuid, fixed) beside the platform's

export const SPRING = "5b0e8c1a-3f2d-4c1e-9a7b-1d2e3f4a5b6c";
export const NEAR_ME = "7c3a9d52-8e41-4b6f-a2d0-6f1b8c9e0d34";
export const SATURDAY = "2d8f4e67-1a93-4c05-b8e2-9a7d3c5f1e08";
export const WEEKEND = "9e1b6a30-5c7d-4f82-8a14-0b3e6d9c2f57";
export const OLD_BOOST = "4a6c2e81-9b0d-4e73-a5f9-3d8b1c7e6a20";

export const SVC_FIRST = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f";
const SVC_SPRING = "d2e3f4a5-b6c7-4d8e-9fa0-1b2c3d4e5f60";
const SVC_WEEKEND = "e3f4a5b6-c7d8-4e9f-a0b1-2c3d4e5f6071";
const SVC_SKIN = "f4a5b6c7-d8e9-4fa0-b1c2-3d4e5f607182";

const TODAY = "2026-10-11";
const READ_AT = "2026-10-11T09:19:00-04:00";

// ---------------------------------------------------------------------------------------------------------------------
// The business, its Services, its posts

export const BUSINESS: AdsRead["business"] = {
  name: "Harbor Studio",
  address: "12 Harbor St",
  street: "Harbor St",
  line: "(555) 013-0042",
  site: "example.com",
  page: "chanlytics.com/b/harbor-studio",
  hours: "Mon to Sat, 9 AM to 6 PM",
};

const SERVICES: AdsRead["services"] = [
  { id: SVC_FIRST, name: "First appointment", note: "from $45" },
  { id: SVC_SPRING, name: "Spring offer", note: "from $60" },
  { id: SVC_WEEKEND, name: "Weekend offer", note: "from $35" },
  { id: SVC_SKIN, name: "Skin consultation", note: "from $80", cosmetic: true },
];

const POSTS: AdsRead["posts"] = [
  {
    id: "17900000000000001",
    platform: "meta",
    kind: "photo",
    label: "Instagram post",
    day: "2026-10-06",
    caption: "First appointments this week, from $45. Message us and we'll send you open times.",
  },
  {
    id: "17900000000000002",
    platform: "meta",
    kind: "photo",
    label: "Instagram post",
    day: "2026-10-01",
    caption: "A quiet Thursday at Harbor Studio. Come and see us.",
  },
  {
    id: "17900000000000004",
    platform: "meta",
    kind: "video",
    label: "Instagram reel",
    day: "2026-09-28",
    caption: "A walk round Harbor Studio before we open.",
  },
  {
    id: "7100000000000000003",
    platform: "tiktok",
    kind: "video",
    label: "TikTok video",
    day: "2026-10-03",
    caption: "Saturday at Harbor Studio, start to finish.",
  },
];

/** What the platforms return as choices and estimates; the same in every example. */
export const CONFIG: AdsConfig = {
  presets: [
    { id: "try", label: "Try it", perDayMinor: 1000, days: 7, estimate: [14, 30] },
    { id: "steady", label: "Steady", perDayMinor: 1500, days: 20, estimate: [40, 90] },
    { id: "more", label: "More", perDayMinor: 2500, days: 20, estimate: [70, 150] },
  ],
  areas: [
    { miles: 3, people: [12000, 25000] },
    { miles: 5, people: [30000, 55000] },
    { miles: 8, people: [70000, 130000] },
    { miles: 15, people: null },
  ],
  googleEstimate: { clicks: [90, 140], perClickMinor: [100, 300] },
  minPerDayMinor: { meta: 500, google: null, tiktok: 2000 },
};

/** An ad's words, drafted from a Service and the business (a new ad drafts its own the same way). */
export const copyOf = (serviceId: string, door: AdDoor): AdRead["copy"] => {
  const s = SERVICES.find((x) => x.id === serviceId);
  return starterCopy({
    service: s ? s.name : "",
    price: s ? s.note : "",
    business: BUSINESS,
    door,
    word: "appointment",
  });
};

// ---------------------------------------------------------------------------------------------------------------------
// The daily rows: [spend in dollars, in touch, booked since], one per day from the ad's first day.

type Row = readonly [spend: number, inTouch: number, booked: number];

export const dailyRows = (start: string, table: readonly Row[]): AdDay[] =>
  table.map(([spend, inTouch, booked], i) => ({
    day: addDays(start, i),
    spendMinor: spend * 100,
    inTouch,
    booked,
  }));

/** Spring offer, Mon 14 Sep to Sat 10 Oct (27 days). */
export const SPRING_ROWS: readonly Row[] = [
  [14, 4, 1],
  [16, 3, 1],
  [15, 5, 2],
  [13, 2, 0],
  [17, 4, 1],
  [15, 3, 1],
  [16, 4, 1],
  [15, 5, 2],
  [14, 3, 1],
  [19, 2, 0],
  [15, 4, 1],
  [16, 3, 1],
  [14, 5, 1],
  [15, 4, 1],
  [17, 3, 1],
  [15, 2, 0],
  [14, 4, 1],
  [16, 5, 1],
  [15, 3, 1],
  [14, 4, 0],
  [16, 3, 1],
  [15, 4, 1],
  [17, 2, 0],
  [13, 5, 1],
  [15, 3, 0],
  [16, 4, 1],
  [15, 3, 1],
];

/** Appointments near me, Sun 13 Sep to Sat 10 Oct (28 days). Calls are Google's count, so nothing is booked from them. */
export const NEAR_ME_ROWS: readonly Row[] = [
  [10, 1, 0],
  [11, 2, 0],
  [9, 1, 0],
  [12, 2, 0],
  [10, 1, 0],
  [8, 1, 0],
  [11, 2, 0],
  [10, 1, 0],
  [13, 2, 0],
  [9, 1, 0],
  [10, 1, 0],
  [11, 2, 0],
  [10, 1, 0],
  [9, 2, 0],
  [12, 1, 0],
  [10, 1, 0],
  [11, 2, 0],
  [8, 1, 0],
  [10, 2, 0],
  [12, 1, 0],
  [9, 1, 0],
  [11, 2, 0],
  [10, 1, 0],
  [10, 2, 0],
  [12, 2, 0],
  [9, 1, 0],
  [9, 2, 0],
  [11, 2, 0],
];

/** Saturday video, Mon 5 Oct to Sat 10 Oct (6 days). */
const SATURDAY_ROWS: readonly Row[] = [
  [23, 2, 1],
  [26, 4, 1],
  [25, 3, 0],
  [24, 3, 1],
  [27, 4, 0],
  [23, 2, 0],
];

/** The old boosted post, Wed 16 Sep to Sun 20 Sep (5 days), paused after: the owner made it on the platform. */
const OLD_BOOST_ROWS: readonly Row[] = [
  [4, 0, 0],
  [4, 0, 0],
  [4, 0, 0],
  [4, 0, 0],
  [4, 0, 0],
];

// ---------------------------------------------------------------------------------------------------------------------
// The ads

/** What every ad has before it says anything of its own. */
const AD: Omit<
  AdRead,
  "id" | "externalId" | "name" | "offer" | "serviceId" | "platform" | "door" | "startDay" | "endDay" | "budget" | "copy"
> = {
  version: 1,
  state: "on",
  needs: null,
  madeHere: true,
  endsAt: null,
  currency: "USD",
  aboutADayMinor: 1500,
  area: { kind: "radius", miles: 5 },
  schedule: "always",
  shownAs: { name: BUSINESS.name, handle: null },
  media: { kind: "none" },
  opensUrl: null,
  searchThemes: [],
  leftOut: [],
  approvedDay: null,
  sentAt: null,
  theirs: { platform: "meta", impressions: null, reach: null, taps: null, chats: null, leads: null },
  reply: null,
  todaySoFar: 0,
  lastArrivalAt: null,
  days: [],
};

const springOffer: AdRead = {
  ...AD,
  id: SPRING,
  externalId: "120210000000000001",
  name: "Spring offer",
  offer: "Spring offer",
  serviceId: SVC_SPRING,
  platform: "meta",
  door: "whatsapp",
  startDay: "2026-09-14",
  endDay: "2026-10-31",
  budget: { mode: "total", amountMinor: 72000 },
  aboutADayMinor: 1500,
  shownAs: { name: BUSINESS.name, handle: "@harborstudio" },
  media: { kind: "photo", label: "Studio photo" },
  approvedDay: "2026-09-14",
  theirs: { platform: "meta", impressions: null, reach: 31500, taps: 1284, chats: null, leads: null },
  reply: { medianSeconds: 12, n: 96 },
  todaySoFar: 1,
  lastArrivalAt: "2026-10-11T08:41:00-04:00",
  copy: copyOf(SVC_SPRING, "whatsapp"),
  days: dailyRows("2026-09-14", SPRING_ROWS),
};

const appointmentsNearMe: AdRead = {
  ...AD,
  id: NEAR_ME,
  externalId: "21000000001",
  name: "Appointments near me",
  offer: "Appointments near me",
  serviceId: SVC_FIRST,
  platform: "google",
  door: "call",
  startDay: "2026-09-13",
  endDay: "2026-10-12",
  endsAt: "11:59 pm",
  budget: { mode: "total", amountMinor: 30000 },
  aboutADayMinor: 1000,
  opensUrl: BUSINESS.page,
  searchThemes: ["appointments near me", "book a first appointment", "open times this week"],
  leftOut: ["jobs", "courses", "free", "diy"],
  approvedDay: "2026-09-13",
  theirs: { platform: "google", impressions: null, clicks: 214, calls: 41, longCalls: 38 },
  copy: copyOf(SVC_FIRST, "call"),
  days: dailyRows("2026-09-13", NEAR_ME_ROWS),
};

const saturdayVideo: AdRead = {
  ...AD,
  id: SATURDAY,
  externalId: "1810000000000001",
  name: "Saturday video",
  offer: "Saturday video",
  serviceId: SVC_WEEKEND,
  platform: "tiktok",
  door: "form",
  startDay: "2026-10-05",
  endDay: "2026-10-18",
  budget: { mode: "total", amountMinor: 35000 },
  aboutADayMinor: 2500,
  area: { kind: "zips", zips: ["10001", "10003"] },
  media: { kind: "post", postId: "7100000000000000003" },
  approvedDay: "2026-10-05",
  // The amount was changed yesterday: TikTok lets it change again two days after, so the wait shows.
  budgetChangedDay: "2026-10-10",
  theirs: { platform: "tiktok", impressions: null, reach: 9400, clicks: 612, leads: null },
  todaySoFar: 1,
  lastArrivalAt: "2026-10-11T09:02:00-04:00",
  copy: copyOf(SVC_WEEKEND, "form"),
  days: dailyRows("2026-10-05", SATURDAY_ROWS),
};

const weekendOffer: AdRead = {
  ...AD,
  id: WEEKEND,
  externalId: "120210000000000004",
  name: "Weekend offer",
  offer: "Weekend offer",
  serviceId: SVC_WEEKEND,
  platform: "meta",
  door: "form",
  state: "review",
  startDay: "2026-10-12",
  endDay: "2026-10-25",
  budget: { mode: "total", amountMinor: 21000 },
  aboutADayMinor: 1500,
  shownAs: { name: BUSINESS.name, handle: "@harborstudio" },
  media: { kind: "post", postId: "17900000000000001" },
  sentAt: "2026-10-11T09:02:00-04:00",
  copy: copyOf(SVC_WEEKEND, "form"),
};

/** An ad the owner made on the platform itself, adopted read-only: only Pause and Resume are here. */
const oldBoostedPost: AdRead = {
  ...AD,
  id: OLD_BOOST,
  externalId: "120210000000000009",
  name: "Old boosted post",
  offer: "Old boosted post",
  serviceId: "",
  platform: "meta",
  door: "whatsapp",
  state: "paused",
  madeHere: false,
  startDay: "2026-09-16",
  endDay: "2026-10-14",
  budget: { mode: "total", amountMinor: 12000 },
  aboutADayMinor: 400,
  media: { kind: "post", postId: "17900000000000002" },
  approvedDay: "2026-09-16",
  copy: {
    ...copyOf(SVC_FIRST, "whatsapp"),
    headline: "A quiet Thursday",
    text: "A quiet Thursday at Harbor Studio. Come and see us.",
  },
  days: dailyRows("2026-09-16", OLD_BOOST_ROWS),
};

const BASE_ADS: readonly AdRead[] = [springOffer, appointmentsNearMe, saturdayVideo, weekendOffer, oldBoostedPost];

// ---------------------------------------------------------------------------------------------------------------------
// The people the ads brought (the first few of each ad, not all 96), with the ids the demo People and Inbox use

type PersonInput = Omit<AdPersonRead, "at" | "said" | "quietSince" | "threadId"> &
  Partial<Pick<AdPersonRead, "at" | "said" | "quietSince" | "threadId">>;

const personRead = (p: PersonInput): AdPersonRead => ({ threadId: null, at: null, said: null, quietSince: null, ...p });

const BASE_PEOPLE: readonly AdPersonRead[] = [
  personRead({
    personId: "c-jordan",
    threadId: "th-jordan-discount",
    adId: SPRING,
    name: "Jordan P.",
    how: "wrote",
    day: "2026-10-05",
    said: "Do you have anything this week?",
    talk: "waiting",
    cal: { kind: "none" },
  }),
  personRead({
    personId: "c-maya",
    threadId: "th-maya-recovery",
    adId: SPRING,
    name: "Maya R.",
    how: "wrote",
    day: "2026-10-08",
    said: "Do you have Saturday?",
    talk: "talking",
    cal: { kind: "ahead", day: "2026-10-17", time: "11:00" },
  }),
  personRead({
    personId: "c-priya",
    adId: SPRING,
    name: "Priya S.",
    how: "wrote",
    day: "2026-10-02",
    said: "Hi! Saw your ad, can I book?",
    talk: "talking",
    cal: { kind: "kept", day: "2026-10-06" },
  }),
  personRead({
    personId: "c-amelia",
    adId: SPRING,
    name: "Amelia B.",
    how: "wrote",
    day: "2026-10-11",
    at: "2026-10-11T08:41:00-04:00",
    said: "What are your hours on Sunday?",
    talk: "talking",
    cal: { kind: "none" },
  }),
  personRead({
    personId: "c-rashid",
    adId: SPRING,
    name: "Rashid A.",
    how: "wrote",
    day: "2026-09-28",
    said: "Is this still on?",
    talk: "quiet",
    quietSince: "2026-09-28",
    cal: { kind: "none" },
  }),
  personRead({
    personId: "c-amy",
    adId: SATURDAY,
    name: "Amy G.",
    how: "number",
    day: "2026-10-09",
    talk: "call",
    cal: { kind: "none" },
  }),
  personRead({
    personId: "c-david",
    adId: SATURDAY,
    name: "David O.",
    how: "number",
    day: "2026-10-05",
    talk: "talking",
    cal: { kind: "ahead", day: "2026-10-15", time: "10:30" },
  }),
  personRead({
    personId: "c-marcus",
    adId: SATURDAY,
    name: "Marcus L.",
    how: "number",
    day: "2026-10-06",
    talk: "talking",
    cal: { kind: "kept", day: "2026-10-10" },
  }),
  personRead({
    personId: "c-david-chen",
    threadId: "th-david-complaint",
    adId: SATURDAY,
    name: "David C.",
    how: "number",
    day: "2026-10-11",
    at: "2026-10-11T09:02:00-04:00",
    talk: "talking",
    cal: { kind: "none" },
  }),
  personRead({
    personId: "c-aisha",
    threadId: "th-aisha-refund",
    adId: SATURDAY,
    name: "Aisha K.",
    how: "number",
    day: "2026-10-08",
    talk: "quiet",
    quietSince: "2026-10-09",
    cal: { kind: "none" },
  }),
];

// ---------------------------------------------------------------------------------------------------------------------
// The accounts

/** Every check an account of a platform is read for, by id. */
const CHECK_IDS: Record<AdPlatform, readonly AdCheckId[]> = {
  meta: [
    "account-active",
    "payment",
    "page-linked",
    "whatsapp-linked",
    "instagram-linked",
    "chanlytics-whatsapp",
    "lead-terms",
    "privacy-link",
    "yes-line",
  ],
  google: ["account-active", "payment", "number-on-page", "call-reporting", "verification", "manager-link"],
  tiktok: ["tiktok-linked", "payment", "identity", "privacy-link", "yes-line", "post-permission"],
};

/** The checks of a platform, each met except those named. */
export const accountChecks = (platform: AdPlatform, notMet: readonly AdCheckId[] = []): AdCheck[] =>
  CHECK_IDS[platform].map((id) => ({ id, ok: !notMet.includes(id) }));

const ACCOUNT_NAMES: Record<AdPlatform, string> = {
  meta: "Harbor Studio ad account",
  google: "Harbor Studio Google Ads account",
  tiktok: "Harbor Studio TikTok account",
};

const ACCOUNT_IDS: Record<AdPlatform, string> = {
  meta: "act_120200000000001",
  google: "2100000001",
  tiktok: "7000000000000000001",
};

/** A connected account, read this morning with every check met. */
export const connected = (platform: AdPlatform): AdAccountRead => ({
  platform,
  status: "connected",
  name: ACCOUNT_NAMES[platform],
  externalId: ACCOUNT_IDS[platform],
  currency: "USD",
  timezone: DEMO_ZONE,
  checks: accountChecks(platform),
  permissionEnd: platform === "tiktok" ? "2026-11-04" : null,
  choices: [],
  readAt: READ_AT,
  read: "ok",
});

/** An account that is not connected yet. */
export const notConnected = (platform: AdPlatform): AdAccountRead => ({
  platform,
  status: "not-connected",
  name: null,
  externalId: null,
  currency: "USD",
  timezone: DEMO_ZONE,
  checks: [],
  permissionEnd: null,
  choices: [],
  readAt: null,
  read: "ok",
});

// ---------------------------------------------------------------------------------------------------------------------

/** The page as it is with ads running (the default example): four ads and one the owner made on the platform itself. */
export function baseRead(): AdsRead {
  return {
    business: BUSINESS,
    today: TODAY,
    readAt: READ_AT,
    timezone: DEMO_ZONE,
    window: { from: "2026-09-11", to: "2026-10-10" },
    appointmentWord: "appointment",
    calendar: { linked: true, readAt: "2026-10-11T09:12:00-04:00" },
    accounts: [connected("meta"), connected("google"), connected("tiktok")],
    ads: [...BASE_ADS],
    people: [...BASE_PEOPLE],
    cameBack: { ahead: 5, kept: 14, missed: 2, past: 5, unmatched: 4 },
    services: SERVICES,
    posts: POSTS,
    rating: { stars: "4.9", reviews: 128, asOf: "2026-10-11" },
    neverQuotePrices: false,
    firstTouch: null,
  };
}
