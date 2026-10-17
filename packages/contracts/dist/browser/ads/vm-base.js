import { appointmentWords } from "../journey/appointment-word.js";
import { REPORT_MIN_N } from "../reports/report-tiles.js";
import { clockTime, zoneDayKey } from "../shared/clock.js";
import { isoMs } from "../shared/time.js";
import { addDays, daysBetween } from "./ads.js";
import { leftOfMoney, moneyOf, perDayOf } from "./money.js";
import {
  ADS_PERMISSION_WARN_DAYS,
  ADS_SETTLE_DAYS,
  DOOR_NEEDS,
  STANDING_CHECKS,
  TOO_EARLY_DAYS,
  countedDoor
} from "./rules.js";
import {
  ADS_DOORS,
  DOOR,
  DOOR_ORDER,
  PLATFORM_SURFACE,
  PLATFORM_WORD,
  REACH_NOTE,
  SENTENCE,
  SETTINGS_DOOR,
  STATE,
  STATE_WORD,
  adPersonInitials,
  checkFix,
  checkWords,
  dayWord
} from "./words.js";
import { LEDGER, STANDING } from "./words-page.js";
import { NEW_AD } from "./words-new.js";
export const DASH = LEDGER.none;
export const PLATFORMS = ["meta", "google", "tiktok"];
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const adAccountOf = (read, platform) => read.accounts.find((a) => a.platform === platform);
export const isConnected = (read, platform) => adAccountOf(read, platform)?.status === "connected";
export const checkOk = (acct, id) => acct !== void 0 && acct.checks.some((c) => c.id === id && c.ok);
export const counted = (ad) => countedDoor(ad.door);
export const started = (ad) => ad.approvedDay !== null;
export function viewState(ad, today) {
  return ad.state === "on" && daysBetween(ad.startDay, today) < TOO_EARLY_DAYS ? "too-early" : ad.state;
}
const plainSpaces = (text) => text.replace(/\s/g, " ");
export function timeOf(iso, timezone) {
  const ms = isoMs(iso);
  return ms === null ? "" : plainSpaces(clockTime(ms, timezone));
}
export function dayOfIso(iso, timezone) {
  const ms = isoMs(iso);
  return ms === null ? "" : zoneDayKey(ms, timezone);
}
export const readTime = (read) => timeOf(read.readAt, read.timezone);
export const adPersonWho = (name) => ({
  name,
  initials: adPersonInitials(name)
});
export const adServiceOf = (read, id) => read.services.find((s) => s.id === id);
export const areaWord = (area) => area.kind === "radius" ? NEW_AD.miles(area.miles) : NEW_AD.zip;
export const platformsFor = (door) => door === "whatsapp" ? ["meta"] : door === "call" ? ["google"] : ["meta", "tiktok"];
export function leadOf(o) {
  if (o.platform === "google") return `${PLATFORM_SURFACE.google} within ${areaWord(o.area)}`;
  const form = o.door === "form" ? ` \xB7 ${DOOR.form.short}` : "";
  return `${PLATFORM_WORD[o.platform]}${form}`;
}
export const totalOf = (ad) => ad.budget.mode === "total" ? ad.budget.amountMinor : null;
export const costEach = (spentMinor, booked) => booked >= REPORT_MIN_N ? spentMinor / booked : null;
export function totalsOf(ad, read) {
  const { from, to } = read.window;
  const rows = ad.days.filter((d) => d.day >= from && d.day <= to);
  return {
    spentMinor: sum(rows.map((d) => d.spendMinor)),
    inTouch: sum(rows.map((d) => d.inTouch)),
    booked: counted(ad) ? sum(rows.map((d) => d.booked)) : 0,
    days: rows.length,
    lifetimeMinor: sum(ad.days.filter((d) => d.day < read.today).map((d) => d.spendMinor))
  };
}
export const leftOfAd = (ad, t) => {
  const total = totalOf(ad);
  return total === null ? null : Math.max(0, total - t.lifetimeMinor);
};
export const settling = (ads, today) => ads.some((ad) => ad.days.some((d) => d.day >= addDays(today, -ADS_SETTLE_DAYS)));
function endsKind(ad, today) {
  const d = daysBetween(today, ad.endDay);
  if (d <= 0) return "today";
  return d === 1 ? "tomorrow" : "later";
}
export const endsWhenOf = (ad, today) => STATE.endsWhen({ kind: endsKind(ad, today), evening: ad.endsAt !== null, day: dayWord(ad.endDay) });
function endsLine(ad, t, today) {
  const left = leftOfAd(ad, t);
  const total = totalOf(ad);
  if (left === null || total === null) return STATE.daily(perDayOf(ad.aboutADayMinor, ad.currency));
  return `${STATE.ends(endsWhenOf(ad, today))} \xB7 ${leftOfMoney(left, total, ad.currency)}`;
}
export function needsSecond(ad) {
  const code = ad.needs ? ad.needs.code : null;
  if (code === "payment") return STATE.needsPayment(ad.platform);
  if (code === "paused-in-platform") return STATE.needsPaused(ad.platform);
  if (code === "price-changed") return STATE.needsPrice;
  if (code === "permission-lapsing") return STATE.needsPermission(ad.platform);
  return code === "rejected" ? STATE.needsRejected(ad.platform) : STATE.needsDefault(ad.platform);
}
function secondOf(ad, t, read) {
  switch (ad.state) {
    case "setting-up":
      return STATE.settingUpSecond(ad.platform);
    case "couldnt-finish":
      return STATE.couldntSecond(ad.platform);
    case "review":
      return STATE.reviewSecond(ad.platform);
    case "needs-you":
      return needsSecond(ad);
    case "ended": {
      const cost = counted(ad) ? costEach(t.spentMinor, t.booked) : null;
      return STATE.endedSecond(dayWord(ad.endDay), t.booked, cost === null ? null : moneyOf(cost, ad.currency));
    }
    case "finished":
      return STATE.finishedSecond(moneyOf(totalOf(ad) ?? t.lifetimeMinor, ad.currency));
    default:
      return endsLine(ad, t, read.today);
  }
}
export function adStateOf(ad, t, read) {
  const state = viewState(ad, read.today);
  const warn = state === "needs-you" || state === "couldnt-finish";
  return {
    word: STATE_WORD[state],
    tone: state === "on" ? "ok" : warn ? "warn" : "plain",
    second: secondOf(ad, t, read)
  };
}
export function countCtx(read) {
  const w = appointmentWords(read.appointmentWord);
  const calendarRead = read.calendar.readAt ? timeOf(read.calendar.readAt, read.timezone) : "";
  return { readAt: readTime(read), calendarRead, a: w.a, one: w.one, many: w.many };
}
const fixDoor = () => ({ words: SETTINGS_DOOR, to: ADS_DOORS.accounts });
function checkRow(acct, id, platform) {
  const ok = checkOk(acct, id);
  return {
    text: checkWords(id, platform),
    tone: ok ? "ok" : "warn",
    door: ok ? null : fixDoor(),
    fix: ok ? null : checkFix(id, platform)
  };
}
function permissionRow(acct, today) {
  if (!acct || !acct.permissionEnd) return null;
  const soon = daysBetween(today, acct.permissionEnd) <= ADS_PERMISSION_WARN_DAYS;
  return { text: STANDING.permission(dayWord(acct.permissionEnd)), tone: soon ? "warn" : "ok", door: null };
}
export function accountRows(read, platform) {
  const acct = adAccountOf(read, platform);
  if (!acct || acct.status !== "connected") return [];
  const rows = STANDING_CHECKS[platform].map((id) => checkRow(acct, id, platform));
  const permission = permissionRow(acct, read.today);
  return permission ? [...rows, permission] : rows;
}
function needIds(door, platform, choice) {
  const ids = [...DOOR_NEEDS[door][platform] ?? []];
  if (!choice.post || platform !== "tiktok" || ids.includes("post-permission")) return ids;
  const at = ids.indexOf("identity");
  ids.splice(at < 0 ? ids.length : at + 1, 0, "post-permission");
  return ids;
}
function numberRow(acct, opens) {
  const text = NEW_AD.opens.numberOnPage;
  if (opens === "page") return { text, tone: "ok", door: null, note: NEW_AD.opens.hostedNote };
  const ok = checkOk(acct, "number-on-page");
  return {
    text,
    tone: ok ? "ok" : "warn",
    door: ok ? null : fixDoor(),
    fix: ok ? null : checkFix("number-on-page", "google")
  };
}
export function doorNeeds(read, door, platform, choice = {}) {
  const acct = adAccountOf(read, platform);
  const opens = choice.opens;
  const rows = needIds(door, platform, choice).map(
    (id) => id === "number-on-page" && opens !== void 0 ? numberRow(acct, opens) : checkRow(acct, id, platform)
  );
  const permission = door === "form" && platform === "tiktok" && choice.post !== false ? permissionRow(acct, read.today) : null;
  return permission ? [...rows, permission] : rows;
}
export function firstMissing(acct, door, platform) {
  return (DOOR_NEEDS[door][platform] ?? []).find((id) => !checkOk(acct, id)) ?? null;
}
const doorReady = (read, door) => platformsFor(door).some((p) => isConnected(read, p) && firstMissing(adAccountOf(read, p), door, p) === null);
export const firstReadyDoor = (read) => DOOR_ORDER.find((d) => doorReady(read, d)) ?? "whatsapp";
export const smallestPreset = (config) => [...config.presets].sort((a, b) => a.perDayMinor * a.days - b.perDayMinor * b.days).at(0);
export function reachNoteOf(ad, read) {
  if (ad.door === "call") return ad.state === "review" ? REACH_NOTE.callChecking : REACH_NOTE.callApproved;
  const at = ad.lastArrivalAt;
  const day = at === null ? "" : dayOfIso(at, read.timezone);
  const when = at === null || day === "" ? null : day === read.today ? `${timeOf(at, read.timezone)} today` : dayWord(day);
  if (ad.door === "whatsapp") return when === null ? REACH_NOTE.whatsapp : REACH_NOTE.lastMessage(when);
  return when === null ? REACH_NOTE.form[ad.platform] : REACH_NOTE.lastNumber(when);
}
export const quotesPrice = (text) => /[$£€]\s?\d/.test(text);
export function adQuotes(copy, priceNote) {
  const named = priceNote !== "" && (copy.headline.includes(priceNote) || copy.text.includes(priceNote));
  return named || quotesPrice(copy.headline);
}
const chipOf = (chip, id, value) => ({ chip, id, value, blank: false });
function platformParts(i) {
  if (i.platform === null) return [];
  if (i.chips === "running") return [{ text: SENTENCE.on + PLATFORM_SURFACE[i.platform] }];
  return [{ text: SENTENCE.on }, chipOf(PLATFORM_SURFACE[i.platform], "platform", i.platform)];
}
function areaParts(i) {
  if (i.platform === null || i.area === null) return [];
  const parts = [{ text: SENTENCE.reach[i.platform] }, chipOf(i.area, "area", i.area)];
  return i.platform === "google" ? [...parts, { text: SENTENCE.of(i.street) }] : parts;
}
function doorParts(i) {
  const lead = { text: `${i.platform === null ? " " : ", "}${SENTENCE.so}` };
  const word = i.past === true ? SENTENCE.soPast[i.door] : DOOR[i.door].chip;
  return [lead, i.chips === "running" ? { text: word } : chipOf(word, "door", i.door)];
}
function budgetParts(i) {
  const b = i.budget;
  if (b === null) return [{ text: "." }];
  const amount = String(b.amountMinor);
  if (b.mode === "daily") {
    return [
      { text: `, ${SENTENCE.about}` },
      chipOf(perDayOf(b.amountMinor, i.currency), "amount", amount),
      { text: i.past === true ? "." : `${SENTENCE.untilStop}.` }
    ];
  }
  const parts = [
    { text: `, ${SENTENCE.upTo}` },
    chipOf(moneyOf(b.amountMinor, i.currency), "amount", amount)
  ];
  if (i.endDay === null) return [...parts, { text: "." }];
  return [...parts, { text: SENTENCE.inAllUntil }, chipOf(dayWord(i.endDay), "end", i.endDay), { text: "." }];
}
export function sentenceParts(i) {
  const offer = i.offer === null ? { chip: SENTENCE.blank, id: "offer", value: "", blank: true } : chipOf(i.offer, "offer", i.offer);
  const show = { text: i.past === true ? SENTENCE.showed : SENTENCE.show };
  return [show, offer, ...platformParts(i), ...areaParts(i), ...doorParts(i), ...budgetParts(i)];
}
