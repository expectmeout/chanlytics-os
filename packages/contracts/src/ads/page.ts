/**
 * The Ads page's model (page-only): a pure function from what a reader returns (`AdsRead`, `AdsConfig`) to what the page
 * draws. Every total, ratio, bar and sentence is computed from ONE table of daily rows per ad, so no figure can disagree with
 * another; every word comes from words*.ts. Nothing here reads a clock, a store or the network.
 *
 *   adsModel(read, config)   the page: head, pane line, standing, figures, Ask line, ledger groups, tiles, phone, v0, none yet
 *   adModel(ad, read, config)  one ad's drawer (drawer.ts)
 *   sentenceParts(input)     the one sentence, also New ad's (vm-base.ts)
 *
 * The rules, each a test rather than a mood: a person is counted once, for the ad they first got in touch through; a Google
 * ad's calls are Google's count and nothing more (left out of Got in touch, Booked and the cost for each person; its spend is
 * the owner's money and stays in Spent); a ratio under REPORT_MIN_N booked is a dash that says `only N`; from there it is
 * whole units, and while the last 14 days settle it says `so far`; a count not read is a dash with its reason, never a zero.
 * While an account is read the spend and the cost for each person wait (a dash that says it is reading, a Google ad's calls
 * with them); while its last read failed they hold the last numbers, said as of when. What it says to do about money obeys
 * the platform's rules (BUDGET_RULES). The page's folds that are not the ledger are page-parts.ts; what every model shares
 * is vm-base.ts.
 */
import { REPORT_MIN_N } from "../reports/report-tiles";
import { CALENDAR_SETTING_ROUTE } from "../setup/calendar-source";
import type { AdAccountRead, AdPlatform, AdRead, AdsConfig, AdsRead } from "./ads";
import { daysBetween } from "./ads";
import { adRoute } from "./address";
import { moneyOf, perDayOf, sumMoney } from "./money";
import {
  noAdsOf,
  ownersOf,
  pageAsk,
  pageTotals,
  phoneOf,
  platformsRead,
  tilesOf,
  v0Of,
  eachInTouch,
} from "./page-parts";
import type { NoAdsVM, PageTotals, PhoneVM, TilesVM, V0VM } from "./page-parts";
import { ADS_ASK_MIN, ADS_GROUP_FROM } from "./rules";
import {
  DASH,
  PLATFORMS,
  adAccountOf,
  adStateOf,
  costEach,
  countCtx,
  counted,
  dayOfIso,
  leadOf,
  needsSecond,
  accountRows,
  readTime,
  settling,
  started,
  sum,
  timeOf,
  totalsOf,
  viewState,
} from "./vm-base";
import type { AdTone, CellVM, DoorVM, FigureVM, StandingVM, StateVM, Totals } from "./vm-base";
import { ADS_DOORS, DOOR, DOOR_ORDER, PLATFORM_OWNER, PLATFORM_WORD, dayLines, dayShort, dayWord } from "./words";
import {
  COUNTED,
  FIGURES,
  GROUP,
  HEAD,
  LEDGER,
  PHONE,
  ADS_READ,
  STANDING,
  figureWords,
  groupMeta,
  platformMeta,
} from "./words-page";
import type { Glyph } from "./words";

// ---------------------------------------------------------------------------------------------------------------------
// The page's view-model types

export interface HeadVM {
  /** The bold part of the sentence: `26 of 114`. Empty where the sentence has none. */
  strong: string;
  rest: string;
  /** The money-calm line under the head (desk and phone). Null where nothing is spent. */
  money: string | null;
}

/** The popover under "How this is counted ›": the four definitions, then the fee and the calls sentences. */
export interface CountedVM {
  quiet: string;
  door: string;
  title: string;
  items: { label: string | null; text: string }[];
}

/**
 * What a press on the Ask line changes (the store's answerAsk): a longer run and a bigger total, or an amount a day moved
 * from one ad to another until the day the second ends.
 */
export type AskApply =
  | { kind: "extend"; adId: string; endDay: string; totalMinor: number }
  | { kind: "move"; fromId: string; toId: string; perDayMinor: number; untilDay: string };

/** The Ask line: one proposal, one sentence, two presses. It exists only when it can say something true. */
export interface AskVM {
  kind: "fix" | "extend" | "move";
  adId: string;
  text: string;
  /** The phone's last row. */
  short: string;
  press: string;
  dismiss: string;
  /** The whole consequence, said before the press is final; null where the press only opens the ad. */
  confirm: string | null;
  toast: string;
  apply: AskApply | null;
}

/** One ad as a ledger row (desk) and a phone row. */
export interface AdRowVM {
  id: string;
  name: string;
  /** `Facebook and Instagram · about $15 a day · since 14 Sep`. */
  hint: string;
  door: AdRead["door"];
  glyph: Glyph;
  /** The dot's tone beside the name. */
  tone: AdTone;
  spent: CellVM;
  inTouch: CellVM;
  booked: CellVM;
  each: CellVM;
  state: StateVM;
  /** An ad that runs and has something to say to the owner: its second line is that, not its end. */
  alert: boolean;
  /** Under the name below 1000px of page: `96` and `wrote`. */
  fold: { value: string; unit: string } | null;
  /** The ad's address, for the row's door. */
  open: string;
  phone: { line: string; endTop: string; endSub: string | null };
}

/** How the ledger's ads are grouped: by what they ask people to do, or by the platform they run on. */
export type AdsGroupBy = "door" | "platform";

/** The ring's glyph of a group: a door's own, or a plain one for a platform (never its logo). */
export type GroupGlyph = Glyph | "users" | "search" | "video";

export interface GroupVM {
  /** What the group is: a door (`whatsapp`) or a platform (`meta`). */
  key: string;
  glyph: GroupGlyph;
  /** `Message you on WhatsApp` (the head sets it in caps). */
  caps: string;
  /** `1 ad · 96 new people wrote`. */
  meta: string;
  rows: AdRowVM[];
}

/** An account whose last read failed: the line under the pane line, and the press that reads it again. */
export interface FailedVM {
  platform: AdPlatform;
  /** `Meta's numbers could not be read · as of Sat 6 PM`. */
  line: string;
  again: string;
}

/** The quiet choice of how to group the ledger, offered from ADS_GROUP_FROM ads. */
export interface GroupByVM {
  label: string;
  value: AdsGroupBy;
  options: { value: AdsGroupBy; label: string }[];
}

export interface AdsVM {
  /** Nothing connected (v0), a connected account with no ad yet, or ads. */
  mode: "v0" | "none" | "ads";
  head: HeadVM;
  /** The pane line: `Last 30 days · read 9:19 AM`. */
  pane: string;
  standing: StandingVM[];
  /** The four figures; none in v0 or with no ads. */
  figures: FigureVM[];
  counted: CountedVM | null;
  ask: AskVM | null;
  /** Accounts whose last read failed, a line each under the pane line. */
  failed: FailedVM[];
  /** Whether an account is being read: its spend, and the cost for each person, wait. */
  reading: boolean;
  /** The door to the calendar link, while none is set. */
  link: DoorVM | null;
  /** The choice of how to group the ledger, once there are ads enough to need one. */
  groupBy: GroupByVM | null;
  groups: GroupVM[];
  tiles: TilesVM | null;
  phone: PhoneVM | null;
  v0: V0VM | null;
  noAds: NoAdsVM | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The ledger

const cell = (value: string, unit: string | null = null, why: string | null = null): CellVM => ({ value, unit, why });

function eachCell(t: Totals, ad: AdRead): CellVM {
  const cost = costEach(t.spentMinor, t.booked);
  if (cost !== null) return cell(moneyOf(cost, ad.currency));
  return cell(DASH, t.booked === 0 ? LEDGER.noneYet : LEDGER.only(t.booked), LEDGER.tooFew);
}

/**
 * What the page knows of how each platform was read: those being read now, whose spend waits (and a Google ad's calls, which
 * are Google's count), and those whose last read failed, whose numbers are the last ones, said as of when.
 */
interface ReadView {
  reading: readonly AdPlatform[];
  /** Those whose last read failed, and the stamp of the read before it (null if there was none). */
  failed: readonly AdPlatform[];
  asOf: Partial<Record<AdPlatform, string | null>>;
}

/** When an account was last read, as a short stamp: `Sat 6 PM`; the weekday within a week, else the day; null if never. */
function stampOf(acct: AdAccountRead, today: string): string | null {
  if (acct.readAt === null) return null;
  const day = dayOfIso(acct.readAt, acct.timezone);
  const time = timeOf(acct.readAt, acct.timezone).replace(/:00(?= [AP]M$)/, "");
  const ago = daysBetween(day, today);
  const when = ago <= 0 ? "today" : ago < 7 ? (dayLines(day).at(0) ?? day) : dayShort(day);
  return `${when} ${time}`;
}

function readViewOf(read: AdsRead): ReadView {
  const failed = platformsRead(read, "failed");
  const asOf: ReadView["asOf"] = {};
  for (const platform of failed) {
    const acct = adAccountOf(read, platform);
    asOf[platform] = acct ? stampOf(acct, read.today) : null;
  }
  return { reading: platformsRead(read, "reading"), failed, asOf };
}

/** The platforms being read that some ad of `only` runs on: what the page cannot say of them yet. */
const waitingOn = (read: AdsRead, rv: ReadView, only: (ad: AdRead) => boolean = () => true): AdPlatform[] =>
  rv.reading.filter((platform) => read.ads.some((ad) => ad.platform === platform && only(ad)));

function cellsOf(
  ad: AdRead,
  t: Totals,
  read: AdsRead,
  rv: ReadView,
): Pick<AdRowVM, "spent" | "inTouch" | "booked" | "each"> {
  if (!started(ad)) {
    const none = cell(DASH, null, LEDGER.notStarted);
    return { spent: none, inTouch: none, booked: none, each: none };
  }
  const waits = cell(DASH, LEDGER.readingUnit, LEDGER.reading(PLATFORM_OWNER[ad.platform]));
  const reading = rv.reading.includes(ad.platform);
  const stamp = rv.asOf[ad.platform];
  const spent = reading ? waits : cell(moneyOf(t.spentMinor, ad.currency), stamp ? LEDGER.asOf(stamp) : null);
  if (!counted(ad)) {
    const why = FIGURES.callsNotMatched;
    const calls = reading ? waits : cell(String(t.inTouch), DOOR[ad.door].unit);
    return { spent, inTouch: calls, booked: cell(DASH, LEDGER.notMatched, why), each: cell(DASH, null, why) };
  }
  const inTouch = cell(String(t.inTouch), DOOR[ad.door].unit);
  if (!read.calendar.linked) {
    const why = FIGURES.needsLink;
    return { spent, inTouch, booked: cell(DASH, null, why), each: cell(DASH, null, why) };
  }
  // The cost for each person is spend over people: only a cost waits for the read; "only 3" does not.
  const costWaits = reading && costEach(t.spentMinor, t.booked) !== null;
  return { spent, inTouch, booked: cell(String(t.booked)), each: costWaits ? waits : eachCell(t, ad) };
}

function phoneEndOf(ad: AdRead, t: Totals, read: AdsRead, rv: ReadView): { endTop: string; endSub: string | null } {
  if (!started(ad) || (counted(ad) && !read.calendar.linked)) return { endTop: DASH, endSub: null };
  const reading = rv.reading.includes(ad.platform);
  if (!counted(ad)) {
    return reading
      ? { endTop: DASH, endSub: LEDGER.readingUnit }
      : { endTop: LEDGER.calls(t.inTouch), endSub: LEDGER.googleCount };
  }
  const cost = costEach(t.spentMinor, t.booked);
  const sub =
    cost !== null ? LEDGER.each(moneyOf(cost, ad.currency)) : t.booked === 0 ? LEDGER.noneYet : LEDGER.only(t.booked);
  return { endTop: LEDGER.booked(t.booked), endSub: reading && cost !== null ? LEDGER.readingUnit : sub };
}

/** What an ad's hint ends with: since when it runs, to whom it was sent while it waits to be checked, or when it would start. */
function hintTail(ad: AdRead, read: AdsRead): string {
  if (started(ad)) return LEDGER.since(dayShort(ad.startDay));
  const waiting = ad.state === "review" || ad.state === "needs-you";
  if (!waiting || ad.sentAt === null) return LEDGER.starts(dayShort(ad.startDay));
  const day = dayOfIso(ad.sentAt, read.timezone);
  return LEDGER.sentTo(PLATFORM_OWNER[ad.platform], day === read.today ? "today" : dayShort(day));
}

/** An ad the owner made on the platform itself says so where its platform and door would be: it is not Chanlytics' to change. */
const leadFor = (ad: AdRead): string =>
  ad.madeHere ? leadOf({ platform: ad.platform, door: ad.door, area: ad.area }) : LEDGER.madeIn[ad.platform];

function hintOf(ad: AdRead, read: AdsRead): string {
  const tail = hintTail(ad, read);
  return LEDGER.hint({ lead: leadFor(ad), perDay: perDayOf(ad.aboutADayMinor, ad.currency), tail });
}

/** The phone row's line: where it runs and what it asks, and when its numbers were last read if the platform could not be. */
function phoneLineOf(ad: AdRead, rv: ReadView): string {
  const where = ad.madeHere ? PLATFORM_WORD[ad.platform] : LEDGER.madeIn[ad.platform];
  // An ad the platform has not approved has no numbers to be as of.
  const stamp = started(ad) ? rv.asOf[ad.platform] : null;
  return stamp ? PHONE.rowAsOf(where, DOOR[ad.door].short, stamp) : PHONE.row(where, DOOR[ad.door].short);
}

function adRowOf(ad: AdRead, read: AdsRead, rv: ReadView): AdRowVM {
  const t = totalsOf(ad, read);
  const base = adStateOf(ad, t, read);
  // A running ad with a need that does not stop it (a price that changed) says it where it would say when it ends.
  const alert = ad.state === "on" && ad.needs !== null;
  const state = alert ? { ...base, second: needsSecond(ad) } : base;
  const cells = cellsOf(ad, t, read, rv);
  const end = phoneEndOf(ad, t, read, rv);
  return {
    id: ad.id,
    name: ad.name,
    hint: hintOf(ad, read),
    door: ad.door,
    glyph: DOOR[ad.door].glyph,
    tone: state.tone,
    ...cells,
    state,
    alert,
    fold: cells.inTouch.unit ? { value: cells.inTouch.value, unit: cells.inTouch.unit } : null,
    open: adRoute(ad.id),
    phone: { line: phoneLineOf(ad, rv), ...end },
  };
}

/** The ledger's order within a group: what needs you, then what is on (most spent first), being made or in review, paused, finished, ended. */
const RANK: Record<ReturnType<typeof viewState>, number> = {
  "couldnt-finish": 0,
  "needs-you": 0,
  on: 1,
  "too-early": 1,
  "setting-up": 2,
  review: 2,
  paused: 3,
  finished: 4,
  ended: 5,
};

/** A platform's ring is a plain glyph, never its logo. */
const PLATFORM_GLYPH: Record<AdPlatform, GroupGlyph> = { meta: "users", google: "search", tiktok: "video" };

interface Entry {
  ad: AdRead;
  t: Totals;
}

/** The people a group brought, as it says them; none said while a Google ad's calls (Google's count) are being read. */
function peopleIn(list: readonly Entry[], rv: ReadView): number | null {
  if (list.some((e) => !counted(e.ad) && rv.reading.includes(e.ad.platform))) return null;
  return sum(list.map((e) => e.t.inTouch));
}

/** The ledger's groups, in the order they are drawn: by the door an ad asks people to use, or by the platform it runs on. */
function groupsOf(read: AdsRead, by: AdsGroupBy, rv: ReadView): GroupVM[] {
  const entries = read.ads
    .map((ad): Entry => ({ ad, t: totalsOf(ad, read) }))
    .sort(
      (a, b) =>
        RANK[viewState(a.ad, read.today)] - RANK[viewState(b.ad, read.today)] || b.t.spentMinor - a.t.spentMinor,
    );
  const rowsOf = (list: readonly Entry[]) => list.map((e) => adRowOf(e.ad, read, rv));
  if (by === "platform") {
    return PLATFORMS.flatMap((platform): GroupVM[] => {
      const mine = entries.filter((e) => e.ad.platform === platform);
      if (mine.length === 0) return [];
      const people = peopleIn(mine, rv);
      const meta = platformMeta({ platform, ads: mine.length, people });
      return [
        { key: platform, glyph: PLATFORM_GLYPH[platform], caps: PLATFORM_WORD[platform], meta, rows: rowsOf(mine) },
      ];
    });
  }
  return DOOR_ORDER.flatMap((door): GroupVM[] => {
    const mine = entries.filter((e) => e.ad.door === door);
    if (mine.length === 0) return [];
    const meta = groupMeta({ door, ads: mine.length, people: peopleIn(mine, rv) });
    return [{ key: door, glyph: DOOR[door].glyph, caps: DOOR[door].label, meta, rows: rowsOf(mine) }];
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The four figures, and how they are counted

/** A cost that waits for a read: a dash that says what it waits for, never a zero. */
function waitingFigure(id: FigureVM["id"], label: string, def: string, waits: readonly AdPlatform[]): FigureVM {
  return {
    id,
    label,
    value: DASH,
    change: null,
    meta: FIGURES.reading(ownersOf(waits)),
    definition: def,
    n: null,
    minN: REPORT_MIN_N,
  };
}

function eachFigure(p: PageTotals, read: AdsRead, def: string, waits: readonly AdPlatform[]): FigureVM {
  const so = settling(read.ads, read.today);
  if (!read.calendar.linked) {
    const cost = eachInTouch(p);
    if (cost !== null && waits.length > 0) return waitingFigure("each", FIGURES.eachInTouchLabel, def, waits);
    return {
      id: "each",
      label: FIGURES.eachInTouchLabel,
      value: cost === null ? DASH : moneyOf(cost.minor, cost.currency),
      change: so ? FIGURES.soFar : null,
      meta: FIGURES.eachInTouchMeta(sumMoney(p.eachSpend), p.touch),
      definition: def,
      n: p.touch,
      minN: REPORT_MIN_N,
    };
  }
  const label = figureWords(countCtx(read)).each.label;
  if (p.each !== null && waits.length > 0) return waitingFigure("each", label, def, waits);
  return {
    id: "each",
    label,
    value: p.each === null ? DASH : moneyOf(p.each.minor, p.each.currency),
    change: p.each !== null && so ? FIGURES.soFar : null,
    meta: p.each === null ? null : FIGURES.eachMeta(sumMoney(p.eachSpend), p.booked),
    definition: def,
    n: p.booked,
    minN: REPORT_MIN_N,
  };
}

/** The Spent figure: the sum, or a dash while a platform is read, or the sum with the platform whose numbers are the last read. */
function spentFigure(p: PageTotals, read: AdsRead, rv: ReadView, def: { label: string; def: string }): FigureVM {
  const waits = waitingOn(read, rv);
  if (waits.length > 0) return waitingFigure("spent", def.label, def.def, waits);
  const stale = rv.failed.find((platform) => read.ads.some((ad) => ad.platform === platform));
  return {
    id: "spent",
    label: def.label,
    value: sumMoney(p.spent),
    change: null,
    meta:
      stale === undefined
        ? FIGURES.spentMeta(p.spentAds)
        : FIGURES.spentMetaStale(p.spentAds, PLATFORM_OWNER[stale], rv.asOf[stale] ?? null),
    definition: def.def,
    n: null,
    minN: REPORT_MIN_N,
  };
}

function figuresOf(p: PageTotals, read: AdsRead, rv: ReadView): FigureVM[] {
  const w = figureWords(countCtx(read));
  const linked = read.calendar.linked;
  const plain = { change: null, n: null, minN: REPORT_MIN_N };
  return [
    spentFigure(p, read, rv, w.spent),
    {
      ...plain,
      id: "touch",
      label: w.touch.label,
      value: String(p.touch),
      meta: FIGURES.touchMeta(p.wrote, p.left),
      definition: w.touch.def,
    },
    {
      ...plain,
      id: "booked",
      label: w.booked.label,
      value: linked ? String(p.booked) : DASH,
      meta: linked ? FIGURES.bookedMeta(p.touch) : FIGURES.needsLink,
      definition: w.booked.def,
    },
    eachFigure(p, read, w.each.def, waitingOn(read, rv, counted)),
  ];
}

function countedOf(read: AdsRead, reading: boolean): CountedVM {
  const w = figureWords(countCtx(read));
  return {
    quiet: reading ? COUNTED.reading : COUNTED.quiet(readTime(read)),
    door: COUNTED.door,
    title: COUNTED.title,
    items: [
      { label: w.spent.label, text: w.spent.def },
      { label: w.touch.label, text: w.touch.def },
      { label: w.booked.label, text: w.booked.def },
      { label: w.each.label, text: w.each.def },
      { label: null, text: COUNTED.fees },
      { label: null, text: COUNTED.calls },
      { label: null, text: COUNTED.kept },
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Head, pane line, standing

function pageModeOf(read: AdsRead): AdsVM["mode"] {
  if (read.ads.length > 0) return "ads";
  return read.accounts.some((a) => a.status !== "not-connected") ? "none" : "v0";
}

function pageHead(mode: AdsVM["mode"], p: PageTotals, read: AdsRead): HeadVM {
  if (mode === "v0") return { strong: HEAD.v0Strong, rest: HEAD.v0Rest, money: null };
  if (mode === "none") return { strong: "", rest: HEAD.noAds, money: HEAD.money };
  const said = read.calendar.linked ? HEAD.booked(p.booked, p.touch) : HEAD.touchOnly(p.touch);
  return { ...said, money: HEAD.money };
}

/** `Harbor Studio ad account · read 9:19 AM`, or how the account is being read; null where there is no account to name. */
function accountLine(read: AdsRead, platform: AdPlatform): string | null {
  const acct = adAccountOf(read, platform);
  if (!acct || acct.name === null || acct.status === "not-connected" || acct.status === "choose") return null;
  const at = acct.readAt
    ? `${dayWord(dayOfIso(acct.readAt, acct.timezone))}, ${timeOf(acct.readAt, acct.timezone)}`
    : "";
  if (acct.read === "reading") return STANDING.reading(acct.name);
  if (acct.read === "failed") return STANDING.failed(acct.name, at);
  return acct.readAt ? STANDING.account(acct.name, timeOf(acct.readAt, acct.timezone)) : acct.name;
}

function standingState(read: AdsRead, platform: AdPlatform, rows: StandingVM["rows"]): StandingVM["state"] {
  const acct = adAccountOf(read, platform);
  const status = acct?.status ?? "not-connected";
  if (status === "not-connected") return "off";
  if (status !== "connected" || acct?.read === "failed") return "warn";
  return rows.some((r) => r.tone === "warn") ? "warn" : "ok";
}

/** An account that is connected, whose last read failed, says so; its dot is amber with the rest that need the owner. */
function standingWord(acct: AdAccountRead | undefined, state: StandingVM["state"]): string {
  const status = acct?.status ?? "not-connected";
  if (status === "choose") return STANDING.choose;
  if (status === "lapsed") return STANDING.lapsed;
  if (status === "connected" && acct?.read === "failed") return STANDING.unread;
  return state === "off" ? STANDING.off : state === "warn" ? STANDING.needsYou : STANDING.connected;
}

function pageStanding(read: AdsRead): StandingVM[] {
  return PLATFORMS.map((id): StandingVM => {
    const rows = accountRows(read, id);
    const state = standingState(read, id, rows);
    const door: DoorVM = { words: STANDING.door, to: ADS_DOORS.accounts };
    return {
      id,
      name: PLATFORM_WORD[id],
      state,
      word: standingWord(adAccountOf(read, id), state),
      account: accountLine(read, id),
      rows,
      note: STANDING.charged(id),
      door,
    };
  });
}

/** What the ads so far cost for each person who booked, where 10 or more booked: New ad says it under the budget. */
export function earlierCost(read: AdsRead): { each: string; people: number } | null {
  const p = pageTotals(read);
  return p.each !== null && p.booked >= ADS_ASK_MIN
    ? { each: moneyOf(p.each.minor, p.each.currency), people: p.booked }
    : null;
}

// ---------------------------------------------------------------------------------------------------------------------

/** The line under the pane line for each account whose last read failed, with the press that reads it again. */
const failedOf = (rv: ReadView): FailedVM[] =>
  rv.failed.map((platform) => ({
    platform,
    line: ADS_READ.failed(PLATFORM_OWNER[platform], rv.asOf[platform] ?? null),
    again: ADS_READ.again,
  }));

/** The choice of how to group the ledger: offered, and honoured, from ADS_GROUP_FROM ads. */
const groupByOf = (read: AdsRead, by: AdsGroupBy): GroupByVM | null =>
  read.ads.length < ADS_GROUP_FROM
    ? null
    : {
        label: GROUP.label,
        value: by,
        options: [
          { value: "door", label: GROUP.door },
          { value: "platform", label: GROUP.platform },
        ],
      };

/**
 * The page: v0 (nothing connected), the first ad's card (connected, no ads yet), or the ads. `by` is how the ledger groups
 * its ads; before ADS_GROUP_FROM ads they are grouped by what they ask.
 */
export function adsModel(read: AdsRead, config: AdsConfig, by: AdsGroupBy = "door"): AdsVM {
  const mode = pageModeOf(read);
  const p = pageTotals(read);
  const rv = readViewOf(read);
  const reading = rv.reading.length > 0;
  const since = read.firstTouch ? dayShort(read.firstTouch.since) : null;
  const groupBy = groupByOf(read, by);
  const base: AdsVM = {
    mode,
    head: pageHead(mode, p, read),
    pane: reading
      ? HEAD.reading(ownersOf(rv.reading))
      : mode === "v0" && since !== null
        ? HEAD.v0Read(since)
        : HEAD.read(readTime(read)),
    standing: pageStanding(read),
    figures: [],
    counted: null,
    ask: null,
    failed: failedOf(rv),
    reading,
    link: null,
    groupBy: null,
    groups: [],
    tiles: null,
    phone: null,
    v0: null,
    noAds: null,
  };
  if (mode === "v0") return { ...base, v0: v0Of(read) };
  if (mode === "none") return { ...base, noAds: noAdsOf(read, config) };
  const tiles = tilesOf(read, rv.reading);
  return {
    ...base,
    figures: figuresOf(p, read, rv),
    counted: countedOf(read, reading),
    ask: pageAsk(read, reading),
    link: read.calendar.linked ? null : { words: FIGURES.linkDoor, to: CALENDAR_SETTING_ROUTE },
    groupBy,
    groups: groupsOf(read, groupBy ? by : "door", rv),
    tiles,
    phone: phoneOf(p, read, tiles.waiting.rows, rv.reading),
  };
}
