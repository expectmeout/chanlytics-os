/**
 * The Ads view's examples (MOCKUP): ten fixtures of `AdsRead`, each the base of sample.ts bent to one state the page can be in,
 * picked only by the demo store (store.ts) and chosen from the Example menu. The model knows no example: it reads an `AdsRead`,
 * and each of these is one a reader could return. A state the model already draws is data here; a state a feature lane draws
 * is data too, so the lane starts from something to look at.
 *
 *   running      the default: four ads, and one the owner made on the platform itself (read-only here)
 *   needs-you    a turned-down ad, a declined card, an ad paused in its platform, a price Services changed, a lapsing permission
 *   finished     an ad ended two days ago (still settling) and one that spent its total and stopped twenty days ago
 *   no-calendar  running, but no calendar link: nobody can be counted as booked
 *   setting-up   running, and one ad being made on its platform and one that could not be finished
 *   no-ads       Meta connected with no payment method yet, and no ad
 *   choose       Meta has three accounts to choose from; nothing else is connected
 *   v0           nothing connected: how new people first reached the business
 *   reading      running, while Meta's and Google's numbers are being read
 *   failed       running, but Meta's numbers could not be read since yesterday evening
 */
import type { AdAccountRead, AdPersonRead, AdRead, AdsRead } from "@chanlytics/contracts";
import type { AdsExample } from "@chanlytics/contracts/ads-page";
import {
  BUSINESS,
  NEAR_ME,
  NEAR_ME_ROWS,
  SATURDAY,
  SPRING,
  SPRING_ROWS,
  SVC_FIRST,
  WEEKEND,
  baseRead,
  accountChecks,
  connected,
  copyOf,
  dailyRows,
  notConnected,
} from "./sample";

// ---------------------------------------------------------------------------------------------------------------------
// Bending the base

const withAd = (read: AdsRead, id: string, patch: Partial<AdRead>): AdsRead => ({
  ...read,
  ads: read.ads.map((ad) => (ad.id === id ? { ...ad, ...patch } : ad)),
});

export const withAccount = (
  read: AdsRead,
  platform: AdAccountRead["platform"],
  patch: Partial<AdAccountRead>,
): AdsRead => ({
  ...read,
  accounts: read.accounts.map((a) => (a.platform === platform ? { ...a, ...patch } : a)),
});

const NO_CAME_BACK: AdsRead["cameBack"] = { ahead: 0, kept: 0, missed: 0, past: 0, unmatched: 0 };

/** The workspace with no ad: no spend, no people an ad brought. */
const withoutAds = (read: AdsRead): AdsRead => ({ ...read, ads: [], people: [], cameBack: NO_CAME_BACK });

// ---------------------------------------------------------------------------------------------------------------------
// The examples

function needsYou(): AdsRead {
  const rejected = {
    code: "rejected",
    platformWords: "Ads can't make health claims about results",
    was: null,
    now: null,
  } as const;
  const payment = { code: "payment", platformWords: null, was: null, now: null } as const;
  const paused = { code: "paused-in-platform", platformWords: null, was: null, now: null } as const;
  const price = { code: "price-changed", platformWords: null, was: "from $45", now: "from $50" } as const;
  let read = baseRead();
  read = withAd(read, WEEKEND, { state: "needs-you", needs: rejected, sentAt: "2026-10-10T16:30:00-04:00" });
  read = withAd(read, SPRING, { state: "needs-you", needs: payment });
  read = withAd(read, SATURDAY, { state: "needs-you", needs: paused });
  read = withAd(read, NEAR_ME, { needs: price });
  read = withAccount(read, "meta", { checks: accountChecks("meta", ["payment"]) });
  read = withAccount(read, "tiktok", { permissionEnd: "2026-10-14" });
  return { ...read, services: read.services.map((s) => (s.id === SVC_FIRST ? { ...s, note: "from $50" } : s)) };
}

function finished(): AdsRead {
  let read = baseRead();
  read = withAd(read, SPRING, {
    state: "ended",
    endDay: "2026-10-09",
    todaySoFar: 0,
    days: dailyRows("2026-09-14", SPRING_ROWS.slice(0, 26)),
  });
  return withAd(read, NEAR_ME, {
    state: "finished",
    endDay: "2026-09-21",
    endsAt: "11:59 pm",
    budget: { mode: "total", amountMinor: 9400 },
    todaySoFar: 0,
    days: dailyRows("2026-09-13", NEAR_ME_ROWS.slice(0, 9)),
  });
}

/** Nobody can be counted as booked without a calendar to read: the rows and the people say none has. */
function noCalendar(): AdsRead {
  const base = baseRead();
  const unbooked = (p: AdPersonRead): AdPersonRead => ({ ...p, cal: { kind: "none" } });
  return {
    ...base,
    calendar: { linked: false, readAt: null },
    ads: base.ads.map((ad) => ({ ...ad, days: ad.days.map((d) => ({ ...d, booked: 0 })) })),
    people: base.people.map(unbooked),
    cameBack: NO_CAME_BACK,
  };
}

function settingUp(): AdsRead {
  const base = baseRead();
  const template = base.ads.find((ad) => ad.id === WEEKEND);
  if (!template) return base;
  const making: AdRead = {
    ...template,
    id: "6f9a1b2c-3d4e-4f50-8a61-7b8c9d0e1f23",
    externalId: null,
    name: "First appointment · 12 Oct",
    offer: "First appointment",
    serviceId: SVC_FIRST,
    platform: "meta",
    door: "whatsapp",
    state: "setting-up",
    sentAt: "2026-10-11T09:18:00-04:00",
    copy: copyOf(SVC_FIRST, "whatsapp"),
  };
  const stuck: AdRead = {
    ...making,
    id: "8a1b2c3d-4e5f-4061-9b72-8c9d0e1f2a34",
    externalId: "21000000002",
    name: "Call ad · 12 Oct",
    platform: "google",
    door: "call",
    state: "couldnt-finish",
    endsAt: "11:59 pm",
    shownAs: { name: BUSINESS.name, handle: null },
    media: { kind: "none" },
    opensUrl: BUSINESS.page,
    theirs: { platform: "google", impressions: null, clicks: null, calls: null, longCalls: null },
    copy: copyOf(SVC_FIRST, "call"),
  };
  return { ...base, ads: [...base.ads, making, stuck] };
}

/** Meta is connected and has no payment method yet: the first ad's card says so. */
function noAds(): AdsRead {
  const read = withoutAds(baseRead());
  return {
    ...read,
    accounts: [
      { ...connected("meta"), checks: accountChecks("meta", ["payment"]) },
      notConnected("google"),
      notConnected("tiktok"),
    ],
  };
}

/** Meta has three accounts to choose from, two in dollars and one in pounds; nothing else is connected. */
function choose(): AdsRead {
  const meta: AdAccountRead = {
    ...notConnected("meta"),
    status: "choose",
    choices: [
      { externalId: "act_120200000000002", name: "Harbor Studio ad account", currency: "USD" },
      { externalId: "act_120200000000003", name: "Harbor Studio second account", currency: "USD" },
      { externalId: "act_120200000000004", name: "Harbor Studio UK", currency: "GBP" },
    ],
  };
  return { ...withoutAds(baseRead()), accounts: [meta, notConnected("google"), notConnected("tiktok")] };
}

/** Nothing is connected: the page says only what People already reads, how new people first reached the business. */
function v0(): AdsRead {
  return {
    ...withoutAds(baseRead()),
    accounts: [notConnected("meta"), notConnected("google"), notConnected("tiktok")],
    firstTouch: {
      since: "2026-10-03",
      rows: [
        { label: "An ad", n: 5, own: true },
        { label: "WhatsApp", n: 3, own: false },
        { label: "Phone", n: 2, own: false },
        { label: "Text", n: 2, own: false },
        { label: "Not recorded", n: 2, own: false },
      ],
    },
  };
}

function reading(): AdsRead {
  const read = withAccount(baseRead(), "meta", { read: "reading", readAt: null });
  return withAccount(read, "google", { read: "reading" });
}

function readFailed(): AdsRead {
  return withAccount(baseRead(), "meta", { read: "failed", readAt: "2026-10-10T18:00:00-04:00" });
}

/** The fixture of each example, made fresh each time it is asked for. */
export const EXAMPLE_READS: Record<AdsExample, () => AdsRead> = {
  running: baseRead,
  "needs-you": needsYou,
  finished,
  "no-calendar": noCalendar,
  "setting-up": settingUp,
  "no-ads": noAds,
  choose,
  v0,
  reading,
  failed: readFailed,
};
