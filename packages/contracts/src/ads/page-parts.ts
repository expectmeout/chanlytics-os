/**
 * The Ads page's folds that are not the ledger (page-only): the page's totals, the three tiles (Waiting on you, Coming, What
 * came back), the phone page's lines, "nothing connected" (v0), "connected, no ads yet" (and the account to choose), and the
 * Ask line's one proposal. Apart from page.ts only for the file limit; page.ts hands every name a page needs on. Pure, like
 * the rest of the models.
 */
import { appointmentWords } from "../journey/appointment-word";
import { joinWords } from "../shared/words";
import type { AdDoor, AdPlatform, AdRead, AdsConfig, AdsRead } from "./ads";
import { addDays, daysBetween } from "./ads";
import { ADS_DEFAULT_CURRENCY, moneyOf, perDayOf, sumMoney, sumsOf } from "./money";
import type { MoneyItem } from "./money";
import type { AskVM } from "./page";
import {
  ADS_ASK_MIN,
  ADS_ASK_MIN_CALLS,
  ADS_ASK_SOON_DAYS,
  ADS_CHANCE_Z,
  ADS_EXTEND_MAX_DAYS,
  ADS_MOVE_DAYS,
  ADS_MOVE_STEP_MINOR,
  BUDGET_RULES,
} from "./rules";
import {
  PLATFORMS,
  adAccountOf,
  adPersonWho,
  costEach,
  countCtx,
  counted,
  dayOfIso,
  doorNeeds,
  endsWhenOf,
  firstMissing,
  firstReadyDoor,
  leftOfAd,
  needsSecond,
  platformsFor,
  smallestPreset,
  started,
  sum,
  totalOf,
  totalsOf,
  viewState,
} from "./vm-base";
import type { DoorVM, StandRowVM, Totals } from "./vm-base";
import {
  ADS_DOORS,
  DOOR,
  PLATFORM_OWNER,
  PLATFORM_WORD,
  SETTINGS_DOOR,
  STATE,
  checkFix,
  dayLines,
  dayShort,
  dayWord,
  daysWord,
} from "./words";
import { ASK, CHOOSE, FIGURES, LEDGER, NO_ADS, PHONE, STANDING, TILES, V0, askWhy } from "./words-page";

// ---------------------------------------------------------------------------------------------------------------------
// The page's totals

/** What the page adds up over the window, from the same rows every ad's own numbers come from. */
export interface PageTotals {
  /** What each ad spent, in its currency: summed by currency, never converted. */
  spent: MoneyItem[];
  /** Ads that have spent anything. */
  spentAds: number;
  /** People Chanlytics can count: calls are left out. */
  touch: number;
  wrote: number;
  left: number;
  booked: number;
  /** What the ads whose people Chanlytics counts spent: the cost for each person divides this. */
  eachSpend: MoneyItem[];
  /** The cost for each person who booked, where the counted ads share one currency and enough booked; else null. */
  each: MoneyItem | null;
}

/** The platforms whose account is connected and in a read state: being read now, or the last read failed. */
export const platformsRead = (read: AdsRead, how: "reading" | "failed"): AdPlatform[] =>
  PLATFORMS.filter((p) => {
    const acct = adAccountOf(read, p);
    return acct !== undefined && acct.status === "connected" && acct.read === how;
  });

/** Platforms as the owner says them where an account is meant: `Meta and Google`. */
export const ownersOf = (platforms: readonly AdPlatform[]): string =>
  joinWords(platforms.map((p) => PLATFORM_OWNER[p]));

/** An amount divided among `n`, where the amounts are in one currency; null where they are in several or `n` is nothing. */
function perHead(items: readonly MoneyItem[], n: number, enough: (n: number) => boolean): MoneyItem | null {
  const sums = sumsOf(items);
  const one = sums.length === 1 ? sums[0] : undefined;
  if (!one || n <= 0 || !enough(n)) return null;
  return { minor: one.minor / n, currency: one.currency };
}

export function pageTotals(read: AdsRead): PageTotals {
  const rows = read.ads.map((ad) => ({ ad, t: totalsOf(ad, read) }));
  const mine = rows.filter((r) => counted(r.ad));
  const byDoor = (door: AdDoor) => sum(mine.filter((r) => r.ad.door === door).map((r) => r.t.inTouch));
  const booked = sum(mine.map((r) => r.t.booked));
  const eachSpend = mine.map((r) => ({ minor: r.t.spentMinor, currency: r.ad.currency }));
  const cost = costEach(sum(eachSpend.map((i) => i.minor)), booked);
  return {
    spent: rows.map((r) => ({ minor: r.t.spentMinor, currency: r.ad.currency })),
    spentAds: rows.filter((r) => r.t.spentMinor > 0).length,
    touch: sum(mine.map((r) => r.t.inTouch)),
    wrote: byDoor("whatsapp"),
    left: byDoor("form"),
    booked,
    eachSpend,
    each: cost === null ? null : perHead(eachSpend, booked, () => true),
  };
}

/** The cost for each person in touch, where no calendar says who booked: the same spend over the people counted. */
export const eachInTouch = (p: PageTotals): MoneyItem | null => perHead(p.eachSpend, p.touch, () => true);

// ---------------------------------------------------------------------------------------------------------------------
// Tiles

export interface AdWaitingRowVM {
  personId: string;
  /** Their conversation, where there is one: `inbox/<threadId>`. */
  threadId: string | null;
  adId: string;
  name: string;
  initials: string;
  /** `Spring offer · wrote Mon 5 Oct`. */
  line: string;
  /** The amber days: `6 days`. */
  since: string;
  /** Where the row goes: their conversation where there is one (`inbox/<threadId>`), else their page (`clients/<personId>`). */
  open: string;
  /** Where it goes, said as the row's tip. */
  tip: string;
}

export interface ComingRowVM {
  adId: string;
  /** `Mon 12 Oct` as its lines (the weekday, then the date), or `Today`. */
  when: string[];
  name: string;
  /** `ends that evening`; empty where the row says only why. */
  said: string;
  why: string;
}

interface CameBackRowVM {
  id: "ahead" | "kept" | "missed" | "past";
  label: string;
  n: number;
  /** `marked by your team`. */
  note: string | null;
}

export interface TilesVM {
  waiting: { title: string; rows: AdWaitingRowVM[]; empty: string };
  coming: { title: string; rows: ComingRowVM[]; total: string; plus: string | null };
  cameBack: {
    title: string;
    window: string;
    /** Whether a calendar link is set. Without one nobody can be counted as booked: the headline's number is not a count (draw a dash). */
    linked: boolean;
    /** The word and the number it counts, which stands large: `Booked`, 26. */
    headline: { label: string; n: number };
    rows: CameBackRowVM[];
    /** What to do next; with no calendar link, why there is nothing to count. */
    nudge: string;
    unmatched: string | null;
    /** The phone's one line: `Ahead 5 · Kept 14 · Missed 2 · Past 5`; none where there is nothing to count. */
    line: string | null;
  };
}

function waitingRows(read: AdsRead): AdWaitingRowVM[] {
  const byId = new Map(read.ads.map((ad) => [ad.id, ad]));
  return read.people
    .filter((p) => (p.talk === "waiting" || p.talk === "call") && byId.has(p.adId))
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((p): AdWaitingRowVM => {
      const ad = byId.get(p.adId);
      const day = dayWord(p.day);
      const what = p.how === "wrote" ? TILES.waiting.wrote(day) : TILES.waiting.number(day);
      return {
        personId: p.personId,
        threadId: p.threadId,
        adId: p.adId,
        ...adPersonWho(p.name),
        line: TILES.waiting.line({
          ad: ad ? ad.name : "",
          what,
          note: p.talk === "call" ? TILES.waiting.callNote : null,
        }),
        since: daysWord(daysBetween(p.day, read.today)),
        open: p.threadId ? `inbox/${p.threadId}` : `clients/${p.personId}`,
        tip: p.threadId ? TILES.waiting.toThread : TILES.waiting.toPerson,
      };
    });
}

/** The row of an ad that has not run yet: the day it was sent or would start, and why it waits. */
function startingRow(ad: AdRead, read: AdsRead): ComingRowVM {
  const sentToday = ad.sentAt !== null && dayOfIso(ad.sentAt, read.timezone) === read.today;
  const why =
    ad.state === "setting-up"
      ? STATE.settingUpSecond(ad.platform)
      : ad.state === "couldnt-finish"
        ? STATE.couldntSecond(ad.platform)
        : ad.state === "needs-you"
          ? needsSecond(ad)
          : STATE.reviewSecond(ad.platform);
  return { adId: ad.id, when: sentToday ? [TILES.coming.today] : dayLines(ad.startDay), name: ad.name, said: "", why };
}

/** What an ad that runs has left, in words: of its total, or that it has no end; unsaid while its platform is read. */
function leftWhy(ad: AdRead, read: AdsRead, waits: boolean): string {
  const left = leftOfAd(ad, totalsOf(ad, read));
  const total = totalOf(ad);
  if (left === null || total === null) return STATE.daily(perDayOf(ad.aboutADayMinor, ad.currency));
  if (waits) return TILES.coming.reading(PLATFORM_OWNER[ad.platform]);
  return `${moneyOf(left, ad.currency)} left of ${moneyOf(total, ad.currency)}`;
}

/** The row of an ad that runs: when it ends, and what is left of its total (or that it has no end). */
function endingRow(ad: AdRead, read: AdsRead, waits: boolean): ComingRowVM {
  const evening = ad.endsAt !== null && daysBetween(read.today, ad.endDay) <= 1;
  const why = leftWhy(ad, read, waits);
  return {
    adId: ad.id,
    when: dayLines(ad.endDay),
    name: ad.name,
    said: evening ? TILES.coming.endsEvening : TILES.coming.ends,
    why,
  };
}

/**
 * What an ad has coming: its end, or for one not yet running the day it would start; a total set at a platform is its
 * ceiling. What is left of a total is the platform's number: while its platform is read (`reading`), it is not said.
 */
function comingOf(read: AdsRead, reading: readonly AdPlatform[]): TilesVM["coming"] {
  const waits = (ad: AdRead): boolean => reading.includes(ad.platform);
  const live = read.ads.filter((ad) => ad.state !== "ended" && ad.state !== "finished");
  const rows = live
    .map((ad, i) => ({ ad, i, key: started(ad) ? ad.endDay : ad.startDay }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.i - b.i)
    .map(({ ad }) => (started(ad) ? endingRow(ad, read, waits(ad)) : startingRow(ad, read)));
  const capped = live.filter((ad) => totalOf(ad) !== null);
  const left = capped.map((ad) => ({
    minor: leftOfAd(ad, totalsOf(ad, read)) ?? 0,
    currency: ad.currency,
  }));
  const daily = live
    .filter((ad) => totalOf(ad) === null)
    .map((ad) => ({ minor: ad.aboutADayMinor, currency: ad.currency }));
  return {
    title: TILES.coming.title,
    rows,
    total: capped.some(waits)
      ? TILES.coming.totalReading
      : TILES.coming.total({ sum: sumMoney(left), ads: capped.length }),
    plus: daily.length > 0 ? TILES.coming.plus(`${sumMoney(daily)} a day`) : null,
  };
}

function cameBackOf(read: AdsRead): TilesVM["cameBack"] {
  const c = read.cameBack;
  const w = appointmentWords(read.appointmentWord);
  const marked = TILES.cameBack.marked;
  const head = { title: TILES.cameBack.title, window: TILES.cameBack.window };
  // With no calendar link nobody can be counted as booked: no number is said, never a zero, and the tile says what is missing.
  if (!read.calendar.linked) {
    return {
      ...head,
      linked: false,
      headline: { label: TILES.cameBack.headline, n: 0 },
      rows: [],
      nudge: FIGURES.needsLink,
      unmatched: null,
      line: null,
    };
  }
  return {
    ...head,
    linked: true,
    headline: { label: TILES.cameBack.headline, n: c.ahead + c.kept + c.missed + c.past },
    rows: [
      { id: "ahead", label: TILES.cameBack.ahead, n: c.ahead, note: null },
      { id: "kept", label: TILES.cameBack.kept, n: c.kept, note: marked },
      { id: "missed", label: TILES.cameBack.missed, n: c.missed, note: marked },
      { id: "past", label: TILES.cameBack.past, n: c.past, note: null },
    ],
    nudge: TILES.cameBack.nudge(w.one),
    unmatched: c.unmatched > 0 ? TILES.cameBack.unmatched(c.unmatched, w.many) : null,
    line: TILES.cameBack.line(c),
  };
}

/** The three tiles; `reading` is the platforms being read, whose numbers wait. */
export function tilesOf(read: AdsRead, reading: readonly AdPlatform[] = []): TilesVM {
  return {
    waiting: { title: TILES.waiting.title, rows: waitingRows(read), empty: TILES.waiting.empty },
    coming: comingOf(read, reading),
    cameBack: cameBackOf(read),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The phone page

export interface PhoneVM {
  line1: string;
  /** `2 people from your ads are waiting on you`; null where nobody is. */
  needs: string | null;
  /** Who waits, by name: `Jordan P. · Amy G.`; null where nobody does. */
  names: string | null;
  /** The longest wait, in amber: `6 days`. */
  since: string | null;
  footnote: string;
}

/** The phone page's lines. `reading` is the platforms being read: the muted line says so instead of a spend it does not know. */
export function phoneOf(
  p: PageTotals,
  read: AdsRead,
  waiting: readonly AdWaitingRowVM[],
  reading: readonly AdPlatform[] = [],
): PhoneVM {
  const spent = sumMoney(p.spent);
  const each = p.each === null ? null : moneyOf(p.each.minor, p.each.currency);
  const line1 =
    reading.length > 0
      ? PHONE.line1Reading(p.touch, ownersOf(reading))
      : read.calendar.linked
        ? PHONE.line1(spent, each)
        : PHONE.line1NoCalendar(p.touch, spent);
  const first = waiting.at(0);
  return {
    line1,
    needs: first ? LEDGER.waiting(waiting.length) : null,
    names: first ? PHONE.names(waiting.map((w) => w.name)) : null,
    since: first ? first.since : null,
    footnote: PHONE.footnote,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// v0 (nothing connected), and connected with no ads yet

export interface V0VM {
  /** The lead line (bold part, rest); null where there is nothing to say yet. */
  lead: { strong: string; rest: string } | null;
  muted: string | null;
  /** The empty workspace's two lines, instead of the lead. */
  empty: { lead: string; line: string } | null;
  /** BarList rows; `own` is the one in ink, the rest in one quiet hue. */
  rows: { label: string; n: number; own: boolean }[];
  notes: string[];
  door: DoorVM;
  platforms: { id: AdPlatform; name: string; line: string; word: string }[];
  next: string;
}

export function v0Of(read: AdsRead): V0VM {
  const rows = read.firstTouch ? read.firstTouch.rows : [];
  const unrecorded = rows.at(-1);
  const recorded = sum(rows.slice(0, -1).map((r) => r.n));
  const own = sum(rows.filter((r) => r.own).map((r) => r.n));
  const nobody = own === 0;
  return {
    lead: nobody ? null : V0.lead(own, recorded),
    muted: unrecorded && unrecorded.n > 0 && !nobody ? V0.more(unrecorded.n) : null,
    empty: nobody ? { lead: V0.emptyLead, line: V0.emptyLine } : null,
    rows: nobody ? [] : rows,
    notes: V0.notes,
    door: { words: V0.door, to: ADS_DOORS.people },
    platforms: PLATFORMS.map((id) => ({
      id,
      name: PLATFORM_WORD[id],
      line: V0.platforms[id],
      word: STANDING.off,
    })),
    next: V0.next,
  };
}

/** What stops the first ad: the step, and the door that mends it. The press waits for it. */
export interface BlockedVM {
  text: string;
  door: DoorVM;
}

/** An account that has to be chosen: its choices, each with the currency it is charged in. */
export interface ChooseVM {
  platform: AdPlatform;
  title: string;
  line: string;
  use: string;
  choices: { externalId: string; label: string; name: string }[];
}

export interface NoAdsVM {
  title: string;
  line: string;
  press: string;
  checklist: StandRowVM[];
  /** The first need the door's account does not meet, else null: the press is stopped while it stands. */
  blocked: BlockedVM | null;
  /** The accounts waiting to be chosen; while there is one, the card for the first ad is not drawn. */
  choose: ChooseVM[];
}

/** What stops the first ad on a door's platform, as a step: an account to connect, or the first need it does not meet. */
function blockedOf(read: AdsRead, door: AdDoor, platform: AdPlatform): BlockedVM | null {
  const acct = adAccountOf(read, platform);
  const owner = PLATFORM_OWNER[platform];
  const mend: DoorVM = { words: SETTINGS_DOOR, to: ADS_DOORS.accounts };
  if (acct?.status === "choose") return null;
  if (!acct || acct.status === "not-connected") return { text: NO_ADS.connect(owner), door: mend };
  if (acct.status === "lapsed") return { text: NO_ADS.lapsed(owner), door: mend };
  const missing = firstMissing(acct, door, platform);
  return missing === null ? null : { text: NO_ADS.needs(checkFix(missing, platform)), door: mend };
}

/** The accounts to choose from, one card each: the account's name and currency, which is fixed for the account. */
function chooseOf(read: AdsRead): ChooseVM[] {
  return read.accounts
    .filter((a) => a.status === "choose")
    .map((a) => ({
      platform: a.platform,
      title: CHOOSE.title(PLATFORM_OWNER[a.platform]),
      line: CHOOSE.line,
      use: CHOOSE.use,
      choices: a.choices.map((c) => ({
        externalId: c.externalId,
        label: CHOOSE.choice(c.name, c.currency),
        name: c.name,
      })),
    }));
}

/** The first ad's card: the door it would start on, what that door needs, and the smallest amount it would run on. */
export function noAdsOf(read: AdsRead, config: AdsConfig): NoAdsVM {
  const door = firstReadyDoor(read);
  const platform = platformsFor(door).at(0) ?? "meta";
  const preset = smallestPreset(config);
  const currency = read.accounts.find((a) => a.platform === platform)?.currency ?? ADS_DEFAULT_CURRENCY;
  const line = preset
    ? NO_ADS.line({
        door: DOOR[door].label,
        perDay: perDayOf(preset.perDayMinor, currency),
        days: preset.days,
        total: moneyOf(preset.perDayMinor * preset.days, currency),
      })
    : "";
  return {
    title: NO_ADS.title,
    line,
    press: NO_ADS.press,
    checklist: doorNeeds(read, door, platform),
    blocked: blockedOf(read, door, platform),
    choose: chooseOf(read),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The Ask line: one proposal, the first that is true

const runDays = (ad: AdRead): number => daysBetween(ad.startDay, ad.endDay) + 1;

/** An ad has brought enough people to be worth extending: 10 booked, or for a call ad 20 calls Google counted. */
function broughtEnough(ad: AdRead, t: Totals): boolean {
  return counted(ad) ? t.booked >= ADS_ASK_MIN : t.inTouch >= ADS_ASK_MIN_CALLS;
}

const running = (ad: AdRead, today: string): boolean => {
  const state = viewState(ad, today);
  return ad.madeHere && (state === "on" || state === "too-early");
};

/**
 * How many days an extension runs and what it adds, under the platform's own rules (BUDGET_RULES): a total may cover at most
 * so many days (Google's 90), and may change by at most a share of itself at a time (TikTok's 30%). Null where none is allowed.
 */
function extendPlan(ad: AdRead, total: number): { days: number; more: number } | null {
  const rule = BUDGET_RULES[ad.platform];
  let days = Math.min(ADS_EXTEND_MAX_DAYS, runDays(ad));
  if (rule.totalMaxDays !== null) days = Math.min(days, rule.totalMaxDays - runDays(ad));
  if (rule.maxStep !== null && ad.aboutADayMinor > 0) {
    days = Math.min(days, Math.floor((total * rule.maxStep) / ad.aboutADayMinor));
  }
  return days >= 1 ? { days, more: ad.aboutADayMinor * days } : null;
}

function extendAsk(ad: AdRead, t: Totals, read: AdsRead): AskVM | null {
  const total = totalOf(ad);
  if (total === null) return null;
  const soon = daysBetween(read.today, ad.endDay);
  const plan = extendPlan(ad, total);
  if (soon < 0 || soon > ADS_ASK_SOON_DAYS || !broughtEnough(ad, t) || plan === null) return null;
  const end = addDays(ad.endDay, plan.days);
  const more = plan.more;
  const to = total + more;
  const owner = PLATFORM_OWNER[ad.platform];
  const when = endsWhenOf(ad, read.today);
  const brought = counted(ad) ? ASK.broughtPeople(t.booked) : ASK.broughtCalls(t.inTouch);
  const say = (minor: number) => moneyOf(minor, ad.currency);
  return {
    kind: "extend",
    adId: ad.id,
    text: ASK.extend({ name: ad.name, when, brought, end: dayWord(end), owner, from: say(total), to: say(to) }),
    short: ASK.extendShort(ad.name, when),
    press: ASK.extendPress(say(more)),
    dismiss: ASK.not,
    confirm: ASK.extendConfirm({
      name: ad.name,
      end: dayWord(end),
      perDay: perDayOf(ad.aboutADayMinor, ad.currency),
      owner,
      from: say(total),
      to: say(to),
      more: say(to - t.lifetimeMinor),
    }),
    toast: ASK.extendToast(ad.name, dayWord(end)),
    apply: { kind: "extend", adId: ad.id, endDay: end, totalMinor: to },
  };
}

/** The proposal for an ad that needs the owner: what is wrong with it, said by why, and a press that opens it. */
function fixAsk(ad: AdRead): AskVM {
  const why = askWhy(ad.needs ? ad.needs.code : null, PLATFORM_OWNER[ad.platform]);
  return {
    kind: "fix",
    adId: ad.id,
    text: ASK.fix(ad.name, why),
    short: ASK.fixShort(ad.name, why),
    press: ASK.open,
    dismiss: ASK.not,
    confirm: null,
    toast: "",
    apply: null,
  };
}

/** Whether the platform lets an ad's amount a day change by the move's step (TikTok: by at most 30% at a time). */
function stepAllowed(ad: AdRead): boolean {
  const { maxStep } = BUDGET_RULES[ad.platform];
  return maxStep === null || ADS_MOVE_STEP_MINOR <= ad.aboutADayMinor * maxStep;
}

/** Two ads whose cost for each person who booked differs by more than chance, each with 10 booked and 14 days. */
function moveAsk(read: AdsRead): AskVM | null {
  const pool = read.ads
    .filter((ad) => counted(ad) && running(ad, read.today) && runDays(ad) >= ADS_MOVE_DAYS)
    .map((ad) => ({ ad, t: totalsOf(ad, read) }))
    .filter((r) => r.t.booked >= ADS_ASK_MIN)
    .map((r) => ({ ...r, cost: r.t.spentMinor / r.t.booked }))
    .sort((a, b) => a.cost - b.cost);
  const cheap = pool.at(0);
  const dear = pool.at(-1);
  if (!cheap || !dear || cheap.ad.id === dear.ad.id || cheap.ad.currency !== dear.ad.currency) return null;
  const gap = Math.log(dear.cost / cheap.cost);
  if (gap <= ADS_CHANCE_Z * Math.sqrt(1 / cheap.t.booked + 1 / dear.t.booked)) return null;
  // Each platform's own rule on how far an amount may move, and the dearer ad must have the step to give.
  if (!stepAllowed(cheap.ad) || !stepAllowed(dear.ad) || dear.ad.aboutADayMinor <= ADS_MOVE_STEP_MINOR) return null;
  const currency = cheap.ad.currency;
  const say = (minor: number) => moneyOf(minor, currency);
  const amount = say(ADS_MOVE_STEP_MINOR);
  const end = dayShort(cheap.ad.endDay);
  return {
    kind: "move",
    adId: cheap.ad.id,
    text: ASK.move({
      cheap: cheap.ad.name,
      cheapEach: say(cheap.cost),
      cheapN: cheap.t.booked,
      dear: dear.ad.name,
      dearEach: say(dear.cost),
      dearN: dear.t.booked,
      amount,
      end,
      all: say(cheap.ad.aboutADayMinor + dear.ad.aboutADayMinor),
    }),
    short: ASK.moveShort(cheap.ad.name, countCtx(read).one),
    press: ASK.movePress(amount),
    dismiss: ASK.not,
    confirm: ASK.moveConfirm({ amount, dear: dear.ad.name, cheap: cheap.ad.name, end }),
    toast: ASK.moveToast(cheap.ad.name, amount),
    apply: {
      kind: "move",
      fromId: dear.ad.id,
      toId: cheap.ad.id,
      perDayMinor: ADS_MOVE_STEP_MINOR,
      untilDay: cheap.ad.endDay,
    },
  };
}

/**
 * One proposal, the first that is true: fix a blocked ad, then extend one that ends within 3 days, then move money. What an
 * extension or a move says of money rests on what was spent, so while a platform is read (`reading`) only a fix is offered.
 */
export function pageAsk(read: AdsRead, reading: boolean): AskVM | null {
  const blocked = read.ads.find((ad) => ad.state === "needs-you");
  if (blocked) return fixAsk(blocked);
  if (reading) return null;
  const soon = read.ads
    .filter((ad) => running(ad, read.today))
    .map((ad) => extendAsk(ad, totalsOf(ad, read), read))
    .filter((a): a is AskVM => a !== null);
  return soon.at(0) ?? moveAsk(read);
}
