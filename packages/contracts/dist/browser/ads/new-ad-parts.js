import { appointmentWords } from "../journey/appointment-word.js";
import { newAdFromRoute } from "./address.js";
import { moneyOf } from "./money.js";
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
  SCHEDULE_NEEDS_TOTAL
} from "./rules.js";
import { adAccountOf, adQuotes, adServiceOf } from "./vm-base.js";
import { ADS_DOORS, PLATFORM_OWNER, SETTINGS_DOOR, dayShort } from "./words.js";
import { CHIPS } from "./words-drawer.js";
import { CHECKS, GOOGLE_SEARCH, NEW_AD, SET_FOR_YOU, ratingLine } from "./words-new.js";
const settingsDoor = () => ({ words: SETTINGS_DOOR, to: ADS_DOORS.accounts });
const NAME_MAX = {
  meta: null,
  google: ADS_GOOGLE_NAME_MAX,
  tiktok: ADS_DISPLAY_NAME_MAX
};
export function shownAsFor(read, platform) {
  const last = read.ads.filter((a) => a.platform === platform && a.madeHere).sort((a, b) => b.startDay.localeCompare(a.startDay)).at(0);
  const max = NAME_MAX[platform];
  const name = last ? last.shownAs.name : read.business.name;
  return {
    name: max === null ? name : name.slice(0, max).trimEnd(),
    handle: platform === "meta" && last ? last.shownAs.handle : null
  };
}
export function shownAsOf(read, platform) {
  const s = shownAsFor(read, platform);
  const max = NAME_MAX[platform];
  const w = NEW_AD.step2.shownAs;
  return {
    label: w.label,
    line: w.line(s.name, s.handle),
    limit: max === null ? null : w.limit(max),
    door: { words: w.door, to: ADS_DOORS.accounts }
  };
}
export const opensUrlOf = (read, opens) => opens === "page" ? read.business.page : read.business.site;
const hostOf = (url) => url.replace(/^[a-z]+:\/\//i, "").split("/")[0] ?? url;
export const pathOf = (url) => NEW_AD.opens.path(hostOf(url));
export function opensOf(draft, read) {
  if (draft.platform !== "google") return null;
  const w = NEW_AD.opens;
  return {
    label: w.label,
    group: w.group,
    picked: draft.opens,
    choices: [
      { id: "page", label: w.page, address: read.business.page },
      { id: "site", label: w.site, address: read.business.site }
    ],
    note: draft.opens === "page" ? w.pageNote : w.siteNote
  };
}
export const searchThemesFor = (offer, word) => GOOGLE_SEARCH.themes({ offer, a: appointmentWords(word).a });
export function searchOf(ad, platform) {
  if (platform !== "google") return null;
  const w = NEW_AD.step2.search;
  return { label: w.label, themes: ad.searchThemes, leftOut: w.leftOut(ad.leftOut), note: w.note };
}
const scheduleAllowed = (draft) => !SCHEDULE_NEEDS_TOTAL[draft.platform] || draft.mode === "total";
export const scheduleOf = (draft) => draft.platform !== "google" && scheduleAllowed(draft) ? draft.schedule : "always";
export function scheduleVM(draft, read) {
  if (draft.platform === "google") return { kind: "line", text: NEW_AD.step4.openOnlyGoogle };
  const allowed = scheduleAllowed(draft);
  const on = scheduleOf(draft) === "open-hours";
  const hint = !allowed ? NEW_AD.step4.openOnlyMeta : on ? NEW_AD.step4.openOnlyOn : NEW_AD.step4.openOnlyOff;
  return { kind: "switch", label: NEW_AD.step4.openOnly(read.business.hours), hint, on, locked: !allowed };
}
export function budgetLines(draft, config, o) {
  const p = draft.platform;
  const rule = BUDGET_RULES[p];
  const floor = config.minPerDayMinor[p];
  const floorSaid = CHIPS.floor(p, floor === null ? null : moneyOf(floor, o.currency), rule.totalMaxDays);
  const lines = [];
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
const COSMETIC = /\bcosmetic/i;
const isCosmetic = (service) => service !== void 0 && (service.cosmetic === true || COSMETIC.test(service.name));
export function agesOf(draft, service) {
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
export function setForOf(o) {
  const { draft, ad, read } = o;
  const age = o.ages ? o.ages.floor : ADS_AGE_FLOOR;
  const hours = ad.schedule === "open-hours" ? read.business.hours : null;
  let rows;
  if (draft.platform === "google") {
    const more = NEW_AD.step2.googleMore({
      offer: ad.offer,
      business: read.business.name,
      price: adServiceOf(read, ad.serviceId)?.note ?? ""
    });
    rows = SET_FOR_YOU.google({
      headlines: ad.copy.headlines.length + more.headlines.length,
      descriptions: ad.copy.lines.length + more.descriptions.length,
      hours: read.business.hours,
      seconds: ADS_CALL_SECONDS,
      leftOut: ad.leftOut
    });
  } else if (draft.platform === "tiktok") {
    rows = SET_FOR_YOU.tiktok({ age, confirm: draft.doubleCheck, days: ADS_LEAD_DAYS, hours });
  } else {
    rows = SET_FOR_YOU.meta({ age, result: NEW_AD.step5.result[draft.door], hours, adjust: draft.adjust });
  }
  return { label: NEW_AD.step5.setFor, rows };
}
const plainRow = (text, tone = "ok") => ({
  text,
  tone,
  note: null,
  door: null,
  block: null
});
const AD_NOT_READY = { "not-connected": "notConnected", choose: "choose", lapsed: "lapsed" };
function needRow(r) {
  const unmet = r.tone === "warn" && r.door !== null;
  return {
    text: r.text,
    tone: unmet ? "fail" : r.tone,
    note: r.note ?? null,
    door: r.door,
    block: unmet ? NEW_AD.blocked.need(r.fix ?? r.text) : null
  };
}
function accountRowsOf(draft, read, needs) {
  const status = adAccountOf(read, draft.platform)?.status ?? "not-connected";
  if (status === "connected") return needs.map(needRow);
  const owner = PLATFORM_OWNER[draft.platform];
  return [
    {
      text: CHECKS.account[status](owner),
      tone: "fail",
      note: null,
      door: settingsDoor(),
      block: NEW_AD.blocked[AD_NOT_READY[status]](owner)
    }
  ];
}
const PRICE = /[$£€]\s?\d+(?:,\d{3})*(?:\.\d+)?/g;
const pricesIn = (text) => text.match(PRICE) ?? [];
function fitRows(ad, read) {
  const w = NEW_AD.step2.where;
  const rows = [];
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
    if (longHead !== void 0) {
      const o = { n: longHead.length, max: ADS_GOOGLE_HEADLINE_MAX, what: "headline" };
      rows.push(plainRow(CHECKS.googleLong(o), "warn"));
    }
    if (longDesc !== void 0) {
      const o = { n: longDesc.length, max: ADS_GOOGLE_DESCRIPTION_MAX, what: "description" };
      rows.push(plainRow(CHECKS.googleLong(o), "warn"));
    }
  }
  return rows.length > 0 ? rows : [plainRow(CHECKS.fits)];
}
function priceRows(ad, read) {
  const note = adServiceOf(read, ad.serviceId)?.note ?? "";
  const known = pricesIn(note);
  const wrong = pricesIn(`${ad.copy.headline} ${ad.copy.text}`).filter((p) => !known.includes(p));
  const rows = [];
  if (read.neverQuotePrices && adQuotes(ad.copy, note)) rows.push(plainRow(CHECKS.priceQuote, "warn"));
  const first = wrong.at(0);
  if (first !== void 0) {
    rows.push(plainRow(CHECKS.priceDiffers({ said: first, note: note || NEW_AD.step2.quoted }), "warn"));
  }
  return rows.length > 0 ? rows : [plainRow(CHECKS.price)];
}
function adRowsOf(draft, ad, read) {
  const rows = [plainRow(CHECKS.words), plainRow(CHECKS.promises)];
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
export function checkedOf(o) {
  const rows = [...accountRowsOf(o.draft, o.read, o.needs), ...adRowsOf(o.draft, o.ad, o.read)];
  const met = rows.filter((r) => r.tone === "ok").length;
  return { said: NEW_AD.step5.count(met, rows.length), met, of: rows.length, rows };
}
export function blockedFrom(rows) {
  const bad = rows.find((r) => r.tone === "fail");
  return bad && bad.block !== null && bad.door !== null ? { text: bad.block, door: bad.door } : null;
}
export const adFollowOn = (draft, id) => draft.alsoGoogle && draft.platform === "meta" ? newAdFromRoute("google", id) : null;
