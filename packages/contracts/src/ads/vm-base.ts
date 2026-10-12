/**
 * What the Ads page's models share (page-only): the view-model types every page of the view draws, one ad's totals over the
 * window, its state and how it ends, what a platform stands on, what a door needs before Turn on, and the sentence an ad is
 * read back as. Pure, like the rest of the models: it reads a `AdsRead` and the rules (rules.ts), says nothing a word of
 * words*.ts does not, and reads no clock, store or network. page.ts, drawer.ts and new-ad.ts build on it.
 */
import { appointmentWords } from "../journey/appointment-word";
import { REPORT_MIN_N } from "../reports/report-tiles";
import { clockTime, zoneDayKey } from "../shared/clock";
import { isoMs } from "../shared/time";
import type {
  AdAccountRead,
  AdBudget,
  AdCheckId,
  AdCopy,
  AdDoor,
  AdPlatform,
  AdRead,
  AdArea,
  AdsConfig,
  AdsRead,
} from "./ads";
import { addDays, daysBetween } from "./ads";
import { leftOfMoney, moneyOf, perDayOf } from "./money";
import {
  ADS_PERMISSION_WARN_DAYS,
  ADS_SETTLE_DAYS,
  DOOR_NEEDS,
  STANDING_CHECKS,
  TOO_EARLY_DAYS,
  countedDoor,
} from "./rules";
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
  dayWord,
} from "./words";
import { LEDGER, STANDING } from "./words-page";
import type { CountCtx } from "./words-page";
import { NEW_AD } from "./words-new";

// ---------------------------------------------------------------------------------------------------------------------
// The types every page of the view draws

/** A tone for a dot or a line: green only for `ok`, amber only for `warn` (Needs you), red only for a failed account. */
export type AdTone = "ok" | "warn" | "plain" | "fail";

/** A ledger number, the short unit line under it where the unit is not obvious, and the reason it is a dash. */
export interface CellVM {
  value: string;
  unit: string | null;
  why: string | null;
}

/** A state as the ledger and the drawer say it: a dot, one word, a dim second line. */
export interface StateVM {
  word: string;
  tone: AdTone;
  second: string | null;
}

/** One of the figures (kit Figure's props, field for field). */
export interface FigureVM {
  id: "spent" | "touch" | "booked" | "each";
  label: string;
  value: string;
  /** Beside the number in plain ink: `so far`. */
  change: string | null;
  meta: string | null;
  definition: string;
  n: number | null;
  minN: number;
}

/** A door: the words, and where it goes. */
export interface DoorVM {
  words: string;
  to: string;
}

/** One dot row of what a platform, or a door, stands on. */
export interface StandRowVM {
  text: string;
  tone: "ok" | "warn";
  door: DoorVM | null;
  /** A dim line after the words, where one helps (New ad: who puts the number on the page the ad opens). */
  note?: string | null;
  /** What to do about a row that is not met, said as a step (`Add a payment method in Meta`). */
  fix?: string | null;
}

/** A platform's standing: a word and a 7px dot (filled ok, amber ring warn, hollow ring off), and its rows. */
export interface StandingVM {
  id: AdPlatform;
  name: string;
  state: "ok" | "warn" | "off";
  word: string;
  /** `Harbor Studio ad account · read 9:19 AM`; null where nothing is connected. */
  account: string | null;
  rows: StandRowVM[];
  /** `Charged to your card by Meta. Chanlytics never holds your ad money.` */
  note: string;
  door: DoorVM;
}

/** A word of the sentence that can be tapped; `blank` is a dashed blank in New ad's unfinished sentence. */
export type ChipId = "offer" | "area" | "amount" | "end" | "door" | "platform";

export type SentencePart = { text: string } | { chip: string; id: ChipId; value: string; blank: boolean };

/** What a sentence is made of. A null leaves its clause out (New ad's sentence grows a step at a time). */
export interface SentenceInput {
  /** Null is the dashed blank. */
  offer: string | null;
  platform: AdPlatform | null;
  door: AdDoor;
  /** The area chip's word: `5 miles`, `these ZIP codes`. */
  area: string | null;
  /** The street Google's sentence names: `Harbor St`. */
  street: string;
  budget: AdBudget | null;
  /** The currency the amount is in. */
  currency: string;
  /** The end day of a total; null with a daily amount. */
  endDay: string | null;
  /** New ad: the platform and the door are words that open their step. A running ad's are plain text. */
  chips: "new" | "running";
  /** An ad that has ended reads in the past: `Showed … so they messaged you on WhatsApp, up to $720 in all until …`. */
  past?: boolean;
}

// ---------------------------------------------------------------------------------------------------------------------
// Small folds of a read

export const DASH = LEDGER.none;

export const PLATFORMS: readonly AdPlatform[] = ["meta", "google", "tiktok"];

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** The account of a platform, if the workspace has one. */
export const adAccountOf = (read: AdsRead, platform: AdPlatform): AdAccountRead | undefined =>
  read.accounts.find((a) => a.platform === platform);

/** Whether a platform's account is connected and chosen. */
export const isConnected = (read: AdsRead, platform: AdPlatform): boolean =>
  adAccountOf(read, platform)?.status === "connected";

/** Whether a check of an account is met. A check the account does not list is not met. */
export const checkOk = (acct: AdAccountRead | undefined, id: AdCheckId): boolean =>
  acct !== undefined && acct.checks.some((c) => c.id === id && c.ok);

/** Whether Chanlytics can count an ad's people: a Google ad's calls are Google's count, not matched to anyone. */
export const counted = (ad: AdRead): boolean => countedDoor(ad.door);

/** Whether the platform has approved an ad at least once: until then nothing is spent and nothing is counted. */
export const started = (ad: AdRead): boolean => ad.approvedDay !== null;

/** The state an ad is read as: its own, or `too-early` where it is on and started fewer than a week ago. */
export function viewState(ad: AdRead, today: string): AdRead["state"] | "too-early" {
  return ad.state === "on" && daysBetween(ad.startDay, today) < TOO_EARLY_DAYS ? "too-early" : ad.state;
}

/** A time said with plain spaces: the formatter puts a narrow no-break one before AM and PM. */
const plainSpaces = (text: string): string => text.replace(/\s/g, " ");

/** `9:19 AM`, by the workspace's clock, from an ISO timestamp; empty for text that is no time. */
export function timeOf(iso: string, timezone: string): string {
  const ms = isoMs(iso);
  return ms === null ? "" : plainSpaces(clockTime(ms, timezone));
}

/** The workspace's day of an ISO timestamp: `2026-10-11`; empty for text that is no time. */
export function dayOfIso(iso: string, timezone: string): string {
  const ms = isoMs(iso);
  return ms === null ? "" : zoneDayKey(ms, timezone);
}

/** When the page was read, as the pane line says it: `9:19 AM`. */
export const readTime = (read: AdsRead): string => timeOf(read.readAt, read.timezone);

/** A person as the page names them: the name, and the initials of their face. */
export const adPersonWho = (name: string): { name: string; initials: string } => ({
  name,
  initials: adPersonInitials(name),
});

/** The Service an ad is about, by id. */
export const adServiceOf = (read: AdsRead, id: string): AdsRead["services"][number] | undefined =>
  read.services.find((s) => s.id === id);

/** `5 miles`, `these ZIP codes`: the word the area is in the sentence and the lists. */
export const areaWord = (area: AdArea): string => (area.kind === "radius" ? NEW_AD.miles(area.miles) : NEW_AD.zip);

/** The platforms a door runs on: WhatsApp on Meta, calls on Google, a form on Meta or TikTok. */
export const platformsFor = (door: AdDoor): readonly AdPlatform[] =>
  door === "whatsapp" ? ["meta"] : door === "call" ? ["google"] : ["meta", "tiktok"];

/** The platform and where it shows, as a ledger's hint leads with: `Facebook and Instagram · a form`. */
export function leadOf(o: { platform: AdPlatform; door: AdDoor; area: AdArea }): string {
  if (o.platform === "google") return `${PLATFORM_SURFACE.google} within ${areaWord(o.area)}`;
  const form = o.door === "form" ? ` · ${DOOR.form.short}` : "";
  return `${PLATFORM_WORD[o.platform]}${form}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// One ad's totals over the window, its state, how it ends

export const totalOf = (ad: AdRead): number | null => (ad.budget.mode === "total" ? ad.budget.amountMinor : null);

/** The cost for each person who booked, in minor units: from REPORT_MIN_N booked, else none. */
export const costEach = (spentMinor: number, booked: number): number | null =>
  booked >= REPORT_MIN_N ? spentMinor / booked : null;

/** One ad's numbers over the window, and what it has spent in all. */
export interface Totals {
  spentMinor: number;
  inTouch: number;
  booked: number;
  days: number;
  lifetimeMinor: number;
}

export function totalsOf(ad: AdRead, read: AdsRead): Totals {
  const { from, to } = read.window;
  const rows = ad.days.filter((d) => d.day >= from && d.day <= to);
  return {
    spentMinor: sum(rows.map((d) => d.spendMinor)),
    inTouch: sum(rows.map((d) => d.inTouch)),
    booked: counted(ad) ? sum(rows.map((d) => d.booked)) : 0,
    days: rows.length,
    lifetimeMinor: sum(ad.days.filter((d) => d.day < read.today).map((d) => d.spendMinor)),
  };
}

export const leftOfAd = (ad: AdRead, t: Totals): number | null => {
  const total = totalOf(ad);
  return total === null ? null : Math.max(0, total - t.lifetimeMinor);
};

/** Whether the last two weeks are still settling in what these ads have: a cost is `so far` until they are not. */
export const settling = (ads: readonly AdRead[], today: string): boolean =>
  ads.some((ad) => ad.days.some((d) => d.day >= addDays(today, -ADS_SETTLE_DAYS)));

function endsKind(ad: AdRead, today: string): "today" | "tomorrow" | "later" {
  const d = daysBetween(today, ad.endDay);
  if (d <= 0) return "today";
  return d === 1 ? "tomorrow" : "later";
}

export const endsWhenOf = (ad: AdRead, today: string): string =>
  STATE.endsWhen({ kind: endsKind(ad, today), evening: ad.endsAt !== null, day: dayWord(ad.endDay) });

function endsLine(ad: AdRead, t: Totals, today: string): string {
  const left = leftOfAd(ad, t);
  const total = totalOf(ad);
  if (left === null || total === null) return STATE.daily(perDayOf(ad.aboutADayMinor, ad.currency));
  return `${STATE.ends(endsWhenOf(ad, today))} · ${leftOfMoney(left, total, ad.currency)}`;
}

/** The dim line of an ad that needs the owner: what it is. */
export function needsSecond(ad: AdRead): string {
  const code = ad.needs ? ad.needs.code : null;
  if (code === "payment") return STATE.needsPayment(ad.platform);
  if (code === "paused-in-platform") return STATE.needsPaused(ad.platform);
  if (code === "price-changed") return STATE.needsPrice;
  if (code === "permission-lapsing") return STATE.needsPermission(ad.platform);
  return code === "rejected" ? STATE.needsRejected(ad.platform) : STATE.needsDefault(ad.platform);
}

function secondOf(ad: AdRead, t: Totals, read: AdsRead): string {
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

export function adStateOf(ad: AdRead, t: Totals, read: AdsRead): StateVM {
  const state = viewState(ad, read.today);
  const warn = state === "needs-you" || state === "couldnt-finish";
  return {
    word: STATE_WORD[state],
    tone: state === "on" ? "ok" : warn ? "warn" : "plain",
    second: secondOf(ad, t, read),
  };
}

export function countCtx(read: AdsRead): CountCtx {
  const w = appointmentWords(read.appointmentWord);
  const calendarRead = read.calendar.readAt ? timeOf(read.calendar.readAt, read.timezone) : "";
  return { readAt: readTime(read), calendarRead, a: w.a, one: w.one, many: w.many };
}

// ---------------------------------------------------------------------------------------------------------------------
// What a platform stands on, and what a door needs

const fixDoor = (): DoorVM => ({ words: SETTINGS_DOOR, to: ADS_DOORS.accounts });

function checkRow(acct: AdAccountRead | undefined, id: AdCheckId, platform: AdPlatform): StandRowVM {
  const ok = checkOk(acct, id);
  return {
    text: checkWords(id, platform),
    tone: ok ? "ok" : "warn",
    door: ok ? null : fixDoor(),
    fix: ok ? null : checkFix(id, platform),
  };
}

/** The post permission's row, amber in the last week before it lapses. */
function permissionRow(acct: AdAccountRead | undefined, today: string): StandRowVM | null {
  if (!acct || !acct.permissionEnd) return null;
  const soon = daysBetween(today, acct.permissionEnd) <= ADS_PERMISSION_WARN_DAYS;
  return { text: STANDING.permission(dayWord(acct.permissionEnd)), tone: soon ? "warn" : "ok", door: null };
}

/** What one platform stands on (its dot rows), as the standing popover and an ad's reach line draw them. */
export function accountRows(read: AdsRead, platform: AdPlatform): StandRowVM[] {
  const acct = adAccountOf(read, platform);
  if (!acct || acct.status !== "connected") return [];
  const rows = STANDING_CHECKS[platform].map((id) => checkRow(acct, id, platform));
  const permission = permissionRow(acct, read.today);
  return permission ? [...rows, permission] : rows;
}

/** What the ad itself changes about what its door needs: where a Google ad opens, and whether TikTok's is made from a post. */
interface NeedsChoice {
  /** Google: the page the ad opens. Chanlytics puts the number on its own page; on the owner's site it must already be there. */
  opens?: "page" | "site";
  /** TikTok: whether the ad is made from a post, which needs the post permission (left out, the account's own row stands). */
  post?: boolean;
}

/** The checks a door needs for this ad: the door's own, and the post permission where TikTok's ad is made from a post. */
function needIds(door: AdDoor, platform: AdPlatform, choice: NeedsChoice): AdCheckId[] {
  const ids = [...(DOOR_NEEDS[door][platform] ?? [])];
  if (!choice.post || platform !== "tiktok" || ids.includes("post-permission")) return ids;
  const at = ids.indexOf("identity");
  ids.splice(at < 0 ? ids.length : at + 1, 0, "post-permission");
  return ids;
}

/** The number's row where the page the ad opens is chosen: Chanlytics' own page always has it, the owner's site as read. */
function numberRow(acct: AdAccountRead | undefined, opens: "page" | "site"): StandRowVM {
  const text = NEW_AD.opens.numberOnPage;
  if (opens === "page") return { text, tone: "ok", door: null, note: NEW_AD.opens.hostedNote };
  const ok = checkOk(acct, "number-on-page");
  return {
    text,
    tone: ok ? "ok" : "warn",
    door: ok ? null : fixDoor(),
    fix: ok ? null : checkFix("number-on-page", "google"),
  };
}

/** What a door needs on a platform, as dot rows: an amber one has the door that mends it. */
export function doorNeeds(read: AdsRead, door: AdDoor, platform: AdPlatform, choice: NeedsChoice = {}): StandRowVM[] {
  const acct = adAccountOf(read, platform);
  const opens = choice.opens;
  const rows = needIds(door, platform, choice).map((id) =>
    id === "number-on-page" && opens !== undefined ? numberRow(acct, opens) : checkRow(acct, id, platform),
  );
  const permission =
    door === "form" && platform === "tiktok" && choice.post !== false ? permissionRow(acct, read.today) : null;
  return permission ? [...rows, permission] : rows;
}

/** The first check a door needs that an account does not meet, or null where it meets them all. */
export function firstMissing(acct: AdAccountRead | undefined, door: AdDoor, platform: AdPlatform): AdCheckId | null {
  return (DOOR_NEEDS[door][platform] ?? []).find((id) => !checkOk(acct, id)) ?? null;
}

/** Whether a door can be turned on from some platform it runs on: an account connected, every need met. */
const doorReady = (read: AdsRead, door: AdDoor): boolean =>
  platformsFor(door).some((p) => isConnected(read, p) && firstMissing(adAccountOf(read, p), door, p) === null);

/** The first door whose needs are all met, else the first door. */
export const firstReadyDoor = (read: AdsRead): AdDoor => DOOR_ORDER.find((d) => doorReady(read, d)) ?? "whatsapp";

/** The smallest preset: the one a first ad starts on. */
export const smallestPreset = (config: AdsConfig): AdsConfig["presets"][number] | undefined =>
  [...config.presets].sort((a, b) => a.perDayMinor * a.days - b.perDayMinor * b.days).at(0);

// ---------------------------------------------------------------------------------------------------------------------
// What the reach line says last, and the words that quote a price

/** What the reach line says last: what the ad stands on, or for a form when the last number arrived. */
export function reachNoteOf(ad: AdRead, read: AdsRead): string {
  if (ad.door === "call") return ad.state === "review" ? REACH_NOTE.callChecking : REACH_NOTE.callApproved;
  // When the last person got in touch, said by its day: derived from the ad's own record, never typed.
  const at = ad.lastArrivalAt;
  const day = at === null ? "" : dayOfIso(at, read.timezone);
  const when =
    at === null || day === "" ? null : day === read.today ? `${timeOf(at, read.timezone)} today` : dayWord(day);
  if (ad.door === "whatsapp") return when === null ? REACH_NOTE.whatsapp : REACH_NOTE.lastMessage(when);
  return when === null ? REACH_NOTE.form[ad.platform] : REACH_NOTE.lastNumber(when);
}

/** Whether words quote a price (a currency sign and a digit): the one pattern, for the warning that the receptionist never quotes one. */
export const quotesPrice = (text: string): boolean => /[$£€]\s?\d/.test(text);

/** Whether an ad's words quote a price: the Service's own note, or any price in the headline. */
export function adQuotes(copy: AdCopy, priceNote: string): boolean {
  const named = priceNote !== "" && (copy.headline.includes(priceNote) || copy.text.includes(priceNote));
  return named || quotesPrice(copy.headline);
}

// ---------------------------------------------------------------------------------------------------------------------
// The sentence an ad is read back as

const chipOf = (chip: string, id: ChipId, value: string): SentencePart => ({ chip, id, value, blank: false });

function platformParts(i: SentenceInput): SentencePart[] {
  if (i.platform === null) return [];
  if (i.chips === "running") return [{ text: SENTENCE.on + PLATFORM_SURFACE[i.platform] }];
  return [{ text: SENTENCE.on }, chipOf(PLATFORM_SURFACE[i.platform], "platform", i.platform)];
}

function areaParts(i: SentenceInput): SentencePart[] {
  if (i.platform === null || i.area === null) return [];
  const parts: SentencePart[] = [{ text: SENTENCE.reach[i.platform] }, chipOf(i.area, "area", i.area)];
  return i.platform === "google" ? [...parts, { text: SENTENCE.of(i.street) }] : parts;
}

function doorParts(i: SentenceInput): SentencePart[] {
  const lead = { text: `${i.platform === null ? " " : ", "}${SENTENCE.so}` };
  const word = i.past === true ? SENTENCE.soPast[i.door] : DOOR[i.door].chip;
  return [lead, i.chips === "running" ? { text: word } : chipOf(word, "door", i.door)];
}

function budgetParts(i: SentenceInput): SentencePart[] {
  const b = i.budget;
  if (b === null) return [{ text: "." }];
  const amount = String(b.amountMinor);
  if (b.mode === "daily") {
    return [
      { text: `, ${SENTENCE.about}` },
      chipOf(perDayOf(b.amountMinor, i.currency), "amount", amount),
      { text: i.past === true ? "." : `${SENTENCE.untilStop}.` },
    ];
  }
  const parts: SentencePart[] = [
    { text: `, ${SENTENCE.upTo}` },
    chipOf(moneyOf(b.amountMinor, i.currency), "amount", amount),
  ];
  if (i.endDay === null) return [...parts, { text: "." }];
  return [...parts, { text: SENTENCE.inAllUntil }, chipOf(dayWord(i.endDay), "end", i.endDay), { text: "." }];
}

/**
 * The one sentence an ad is read back as: `Show [Spring offer] on Facebook and Instagram to people within [5 miles], so
 * they message you on WhatsApp, up to [$720] in all until [Sat 31 Oct].` A word that can change is a chip; on a running ad
 * the platform and the door are plain text (they cannot change). New ad leaves a clause out until its step is done.
 */
export function sentenceParts(i: SentenceInput): SentencePart[] {
  const offer: SentencePart =
    i.offer === null
      ? { chip: SENTENCE.blank, id: "offer", value: "", blank: true }
      : chipOf(i.offer, "offer", i.offer);
  const show = { text: i.past === true ? SENTENCE.showed : SENTENCE.show };
  return [show, offer, ...platformParts(i), ...areaParts(i), ...doorParts(i), ...budgetParts(i)];
}
