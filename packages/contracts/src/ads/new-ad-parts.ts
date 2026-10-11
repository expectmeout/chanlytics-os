/**
 * New ad's derived parts (page-only): what a step says that is read from the account, the Services, the business and the
 * platform's rules rather than chosen. Who the ad is shown as, where a Google ad opens and what people search, whether it may
 * keep to the business's hours, the age floor, the budget's quiet lines, "Checked before turning on" (a red row stops Turn on)
 * and what Chanlytics set. new-ad.ts builds the draft and the model around them. Pure; nothing is sent, and no sentence is
 * typed here: words-new.ts holds them.
 */
import { appointmentWords } from "../journey/appointment-word";
import type { AppointmentWord } from "../journey/appointment-word";
import type { AdPlatform, AdRead, AdSchedule, AdShownAs, AdsConfig, AdsRead } from "./ads";
import { newAdFromRoute } from "./address";
import { moneyOf } from "./money";
import {
  ADS_AGE_FLOOR,
  ADS_AGE_FLOOR_COSMETIC,
  ADS_CALL_SECONDS,
  ADS_COPY_LIMITS,
  ADS_DISPLAY_NAME_MAX,
  ADS_GOOGLE_DAILY,
  ADS_GOOGLE_DESCRIPTION_MAX,
  ADS_GOOGLE_HEADLINE_MAX,
  ADS_GOOGLE_NAME_MAX,
  ADS_LEAD_DAYS,
  BUDGET_RULES,
  SCHEDULE_NEEDS_TOTAL,
} from "./rules";
import { adAccountOf, adQuotes, adServiceOf } from "./vm-base";
import type { DoorVM, StandRowVM } from "./vm-base";
import { ADS_DOORS, PLATFORM_OWNER, SETTINGS_DOOR, dayShort } from "./words";
import { CHIPS } from "./words-drawer";
import { CHECKS, GOOGLE_SEARCH, NEW_AD, SET_FOR_YOU, ratingLine } from "./words-new";
import type { AdDraft } from "./new-ad";

type Service = AdsRead["services"][number];

const settingsDoor = (): DoorVM => ({ words: SETTINGS_DOOR, to: ADS_DOORS.accounts });

// ---------------------------------------------------------------------------------------------------------------------
// Who the ad is shown as

/** The most characters of a name each platform shows; Meta shows the Page's own name. */
const NAME_MAX: Record<AdPlatform, number | null> = {
  meta: null,
  google: ADS_GOOGLE_NAME_MAX,
  tiktok: ADS_DISPLAY_NAME_MAX,
};

/**
 * Who an ad on a platform is shown as: the name and handle the last ad made here on it carried (the connection's own identity is
 * Settings', and has no field of its own yet), else the business's name; clipped to what the platform shows. Only Meta has a handle.
 */
export function shownAsFor(read: AdsRead, platform: AdPlatform): AdShownAs {
  const last = read.ads
    .filter((a) => a.platform === platform && a.madeHere)
    .sort((a, b) => b.startDay.localeCompare(a.startDay))
    .at(0);
  const max = NAME_MAX[platform];
  const name = last ? last.shownAs.name : read.business.name;
  return {
    name: max === null ? name : name.slice(0, max).trimEnd(),
    handle: platform === "meta" && last ? last.shownAs.handle : null,
  };
}

export interface ShownAsVM {
  label: string;
  /** `Harbor Studio · @harborstudio`. */
  line: string;
  /** `Up to 25 characters`, where the platform limits the name. */
  limit: string | null;
  /** Read-only here: the door is Settings › Connections. */
  door: DoorVM;
}

export function shownAsOf(read: AdsRead, platform: AdPlatform): ShownAsVM {
  const s = shownAsFor(read, platform);
  const max = NAME_MAX[platform];
  const w = NEW_AD.step2.shownAs;
  return {
    label: w.label,
    line: w.line(s.name, s.handle),
    limit: max === null ? null : w.limit(max),
    door: { words: w.door, to: ADS_DOORS.accounts },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Google: where the ad opens, and what people search

/** The page a Google ad opens: the business's Chanlytics page, or its own website. */
export const opensUrlOf = (read: AdsRead, opens: AdDraft["opens"]): string =>
  opens === "page" ? read.business.page : read.business.site;

const hostOf = (url: string): string => url.replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? url;

/** The display path under a Google headline, from the page the ad opens: `chanlytics.com › book`. */
export const pathOf = (url: string): string => NEW_AD.opens.path(hostOf(url));

export interface OpensVM {
  label: string;
  group: string;
  picked: AdDraft["opens"];
  choices: { id: AdDraft["opens"]; label: string; address: string }[];
  note: string;
}

/** Step 2 on the Call door: the one quiet row "The ad opens". */
export function opensOf(draft: AdDraft, read: AdsRead): OpensVM | null {
  if (draft.platform !== "google") return null;
  const w = NEW_AD.opens;
  return {
    label: w.label,
    group: w.group,
    picked: draft.opens,
    choices: [
      { id: "page", label: w.page, address: read.business.page },
      { id: "site", label: w.site, address: read.business.site },
    ],
    note: draft.opens === "page" ? w.pageNote : w.siteNote,
  };
}

/** What Google groups the draft's searches into: the Service with "near me", asking for an appointment, and the open times. */
export const searchThemesFor = (offer: string, word: AppointmentWord): string[] =>
  GOOGLE_SEARCH.themes({ offer, a: appointmentWords(word).a });

export interface SearchVM {
  label: string;
  themes: string[];
  leftOut: string;
  note: string;
}

export function searchOf(ad: AdRead, platform: AdPlatform): SearchVM | null {
  if (platform !== "google") return null;
  const w = NEW_AD.step2.search;
  return { label: w.label, themes: ad.searchThemes, leftOut: w.leftOut(ad.leftOut), note: w.note };
}

// ---------------------------------------------------------------------------------------------------------------------
// Only while you're open

/** Whether the platform can keep an ad to the business's hours at this budget: Meta only with a total. */
const scheduleAllowed = (draft: Pick<AdDraft, "platform" | "mode">): boolean =>
  !SCHEDULE_NEEDS_TOTAL[draft.platform] || draft.mode === "total";

/** What the ad is set to: the owner's choice where the platform allows it. A Google call button follows the hours on its own. */
export const scheduleOf = (draft: AdDraft): AdSchedule =>
  draft.platform !== "google" && scheduleAllowed(draft) ? draft.schedule : "always";

export type ScheduleVM =
  { kind: "switch"; label: string; hint: string; on: boolean; locked: boolean } | { kind: "line"; text: string };

export function scheduleVM(draft: AdDraft, read: AdsRead): ScheduleVM {
  if (draft.platform === "google") return { kind: "line", text: NEW_AD.step4.openOnlyGoogle };
  const allowed = scheduleAllowed(draft);
  const on = scheduleOf(draft) === "open-hours";
  const hint = !allowed ? NEW_AD.step4.openOnlyMeta : on ? NEW_AD.step4.openOnlyOn : NEW_AD.step4.openOnlyOff;
  return { kind: "switch", label: NEW_AD.step4.openOnly(read.business.hours), hint, on, locked: !allowed };
}

// ---------------------------------------------------------------------------------------------------------------------
// The budget's quiet lines

/** The lines under the amounts: the platform's floor, what stops it, how a change behaves once it is on. */
export function budgetLines(draft: AdDraft, config: AdsConfig, o: { perDay: string; currency: string }): string[] {
  const p = draft.platform;
  const rule = BUDGET_RULES[p];
  const floor = config.minPerDayMinor[p];
  const floorSaid = CHIPS.floor(p, floor === null ? null : moneyOf(floor, o.currency), rule.totalMaxDays);
  const lines: string[] = [];
  if (draft.mode === "total") {
    lines.push(floorSaid, CHIPS.stops(p));
  } else {
    lines.push(NEW_AD.step4.dailyAbout(o.perDay));
    if (floor !== null) lines.push(floorSaid);
    if (p === "meta") lines.push(CHIPS.dailyOver);
    if (p === "google" && rule.dailyIsAverage) lines.push(NEW_AD.step4.googleAverage(ADS_GOOGLE_DAILY));
  }
  if (p === "meta" && rule.changeRelearns) lines.push(NEW_AD.step4.relearn);
  if (rule.maxStep !== null) lines.push(NEW_AD.step4.tiktokChange(rule.maxStep, rule.waitDays));
  if (draft.door === "whatsapp") lines.push(NEW_AD.step4.fees);
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------------
// Ages

const COSMETIC = /\bcosmetic/i;

/** Whether a Service is a cosmetic one: its record says so, else its name does. */
const isCosmetic = (service: Pick<Service, "name" | "cosmetic"> | undefined): boolean =>
  service !== undefined && (service.cosmetic === true || COSMETIC.test(service.name));

export interface AgesVM {
  label: string;
  /** `18 and over`, locked: nobody chooses it here. */
  line: string;
  why: string;
  floor: number;
}

/** The age floor a platform sets: 18 everywhere; TikTok 25 for a cosmetic Service. Google targets no ages. */
export function agesOf(draft: AdDraft, service: Service | undefined): AgesVM | null {
  const p = draft.platform;
  if (p === "google") return null;
  const cosmetic = p === "tiktok" && isCosmetic(service);
  const w = NEW_AD.step3;
  let why = w.agesWhyDefault(PLATFORM_OWNER[p]);
  if (cosmetic) why = w.agesWhyCosmetic;
  else if (draft.special && p === "meta") why = w.agesWhy;
  const floor = cosmetic ? ADS_AGE_FLOOR_COSMETIC : ADS_AGE_FLOOR;
  return { label: w.agesLabel, line: w.ageLine(floor), why, floor };
}

// ---------------------------------------------------------------------------------------------------------------------
// What Chanlytics set for you

export interface SetForVM {
  label: string;
  rows: string[];
}

/** The read-only list of what Chanlytics set on this platform, in owner words, from what the draft chose. */
export function setForOf(o: { draft: AdDraft; ad: AdRead; read: AdsRead; ages: AgesVM | null }): SetForVM {
  const { draft, ad, read } = o;
  const age = o.ages ? o.ages.floor : ADS_AGE_FLOOR;
  const hours = ad.schedule === "open-hours" ? read.business.hours : null;
  let rows: string[];
  if (draft.platform === "google") {
    const more = NEW_AD.step2.googleMore({
      offer: ad.offer,
      business: read.business.name,
      price: adServiceOf(read, ad.serviceId)?.note ?? "",
    });
    rows = SET_FOR_YOU.google({
      headlines: ad.copy.headlines.length + more.headlines.length,
      descriptions: ad.copy.lines.length + more.descriptions.length,
      hours: read.business.hours,
      seconds: ADS_CALL_SECONDS,
      leftOut: ad.leftOut,
    });
  } else if (draft.platform === "tiktok") {
    rows = SET_FOR_YOU.tiktok({ age, confirm: draft.doubleCheck, days: ADS_LEAD_DAYS, hours });
  } else {
    rows = SET_FOR_YOU.meta({ age, result: NEW_AD.step5.result[draft.door], hours, adjust: draft.adjust });
  }
  return { label: NEW_AD.step5.setFor, rows };
}

// ---------------------------------------------------------------------------------------------------------------------
// Checked before turning on

/** One row of "Checked before turning on": a red one stops Turn on and says what to do about it, with its door. */
export interface CheckRowVM {
  text: string;
  tone: "ok" | "warn" | "fail";
  note: string | null;
  door: DoorVM | null;
  /** What a red row says to do, as the press's reason: `Add a payment method in Meta to continue`. */
  block: string | null;
}

export interface CheckedVM {
  /** `7 of 7 ready`. */
  said: string;
  met: number;
  of: number;
  rows: CheckRowVM[];
}

const plainRow = (text: string, tone: "ok" | "warn" = "ok"): CheckRowVM => ({
  text,
  tone,
  note: null,
  door: null,
  block: null,
});

/** The key of what stops Turn on when the platform's account is not ready, by its status. */
const AD_NOT_READY = { "not-connected": "notConnected", choose: "choose", lapsed: "lapsed" } as const;

/** A need of the door, as a row: one that is not met is red and stops Turn on; an amber one (a permission about to lapse) does not. */
function needRow(r: StandRowVM): CheckRowVM {
  const unmet = r.tone === "warn" && r.door !== null;
  return {
    text: r.text,
    tone: unmet ? "fail" : r.tone,
    note: r.note ?? null,
    door: r.door,
    block: unmet ? NEW_AD.blocked.need(r.fix ?? r.text) : null,
  };
}

/** The platform's account and what the door needs of it: an account not ready is one red row, else a row for each need. */
function accountRowsOf(draft: AdDraft, read: AdsRead, needs: readonly StandRowVM[]): CheckRowVM[] {
  const status = adAccountOf(read, draft.platform)?.status ?? "not-connected";
  if (status === "connected") return needs.map(needRow);
  const owner = PLATFORM_OWNER[draft.platform];
  return [
    {
      text: CHECKS.account[status](owner),
      tone: "fail",
      note: null,
      door: settingsDoor(),
      block: NEW_AD.blocked[AD_NOT_READY[status]](owner),
    },
  ];
}

const PRICE = /[$£€]\s?\d+(?:,\d{3})*(?:\.\d+)?/g;

/** The prices a text says (`$45`), by the pattern that decides whether words quote a price. */
const pricesIn = (text: string): string[] => text.match(PRICE) ?? [];

/** Whether the words fit: Meta's limits are soft (the first one a headline or text goes over), Google's are hard ones. */
function fitRows(ad: AdRead, read: AdsRead): CheckRowVM[] {
  const w = NEW_AD.step2.where;
  const rows: CheckRowVM[] = [];
  if (ad.platform === "meta") {
    const { headline, text } = ad.copy;
    if (headline.length > ADS_COPY_LIMITS.headlineFacebook) {
      const n = headline.length;
      rows.push(plainRow(CHECKS.headlineLong({ n, max: ADS_COPY_LIMITS.headlineFacebook, where: w.facebook }), "warn"));
    }
    if (text.length > ADS_COPY_LIMITS.textInstagram) {
      const n = text.length;
      rows.push(plainRow(CHECKS.textLong({ n, max: ADS_COPY_LIMITS.textInstagram, where: w.instagram }), "warn"));
    }
  }
  if (ad.platform === "google") {
    const price = adServiceOf(read, ad.serviceId)?.note ?? "";
    const more = NEW_AD.step2.googleMore({ offer: ad.offer, business: read.business.name, price });
    const heads = [...ad.copy.headlines, ...more.headlines];
    const descs = [...ad.copy.lines, ...more.descriptions];
    const longHead = heads.find((h) => h.length > ADS_GOOGLE_HEADLINE_MAX);
    const longDesc = descs.find((d) => d.length > ADS_GOOGLE_DESCRIPTION_MAX);
    if (longHead !== undefined) {
      const o = { n: longHead.length, max: ADS_GOOGLE_HEADLINE_MAX, what: "headline" };
      rows.push(plainRow(CHECKS.googleLong(o), "warn"));
    }
    if (longDesc !== undefined) {
      const o = { n: longDesc.length, max: ADS_GOOGLE_DESCRIPTION_MAX, what: "description" };
      rows.push(plainRow(CHECKS.googleLong(o), "warn"));
    }
  }
  return rows.length > 0 ? rows : [plainRow(CHECKS.fits)];
}

/** The price rows: the ad quotes one the receptionist never will, or says one Services does not, else it matches. */
function priceRows(ad: AdRead, read: AdsRead): CheckRowVM[] {
  const note = adServiceOf(read, ad.serviceId)?.note ?? "";
  const known = pricesIn(note);
  const wrong = pricesIn(`${ad.copy.headline} ${ad.copy.text}`).filter((p) => !known.includes(p));
  const rows: CheckRowVM[] = [];
  if (read.neverQuotePrices && adQuotes(ad.copy, note)) rows.push(plainRow(CHECKS.priceQuote, "warn"));
  const first = wrong.at(0);
  if (first !== undefined) {
    rows.push(plainRow(CHECKS.priceDiffers({ said: first, note: note || NEW_AD.step2.quoted }), "warn"));
  }
  return rows.length > 0 ? rows : [plainRow(CHECKS.price)];
}

/** The rows that apply to this ad, in owner words: amber with the reason where the ad needs a look. */
function adRowsOf(draft: AdDraft, ad: AdRead, read: AdsRead): CheckRowVM[] {
  const rows: CheckRowVM[] = [plainRow(CHECKS.words), plainRow(CHECKS.promises)];
  rows.push(...fitRows(ad, read), ...priceRows(ad, read));
  if (read.rating && draft.door === "whatsapp") {
    const r = read.rating;
    rows.push(plainRow(CHECKS.rating(ratingLine({ stars: r.stars, reviews: r.reviews, day: dayShort(r.asOf) }))));
  }
  if (draft.postId !== null && draft.postMode === "as-is") rows.push(plainRow(CHECKS.post));
  if (!draft.special) rows.push(plainRow(CHECKS.special));
  if (draft.door === "form") rows.push(plainRow(CHECKS.privacy), plainRow(CHECKS.yes), plainRow(CHECKS.noHealth));
  if (draft.door === "call") rows.push(plainRow(CHECKS.businessName));
  return rows;
}

/** "Checked before turning on": the account and the door's needs, then the ad's own checks, counted. */
export function checkedOf(o: { draft: AdDraft; ad: AdRead; read: AdsRead; needs: readonly StandRowVM[] }): CheckedVM {
  const rows = [...accountRowsOf(o.draft, o.read, o.needs), ...adRowsOf(o.draft, o.ad, o.read)];
  const met = rows.filter((r) => r.tone === "ok").length;
  return { said: NEW_AD.step5.count(met, rows.length), met, of: rows.length, rows };
}

/** What stops Turn on: the first red row's words, and the door that mends it. */
export function blockedFrom(rows: readonly CheckRowVM[]): { text: string; door: DoorVM } | null {
  const bad = rows.find((r) => r.tone === "fail");
  return bad && bad.block !== null && bad.door !== null ? { text: bad.block, door: bad.door } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// After Turn on

/** Where the page goes once an ad is on: the Google one, from the new ad, where "Also run on Google" was pressed. */
export const adFollowOn = (draft: AdDraft, id: string): string | null =>
  draft.alsoGoogle && draft.platform === "meta" ? newAdFromRoute("google", id) : null;
