/**
 * What the ads brought over some days (page-only): ONE fold, `adsResultsOf(read, config, { from, to, scope })`, that the Results
 * sheet (`campaigns/ads:results`, the last 30 days of every ad) and Reports › Ads (any days, narrowed to a platform or an ad) both
 * draw, so the two never disagree. It builds nothing a page does not already show by its own rule: the four figures are the
 * page's (`adsModel`) over the same ads and the same days, an ad's row is the page's ledger row, and the platform and door
 * rows add up the page's own folds (`pageTotals`); the sheet's and the page's figures are equal to the dollar for the same 30
 * days (the test holds it).
 *
 * The rules it keeps, each the page's: a person is counted once, for the ad they first got in touch through; a Google ad's calls
 * are Google's count and are left out of every people number, but its spend is in Spent; a cost is said from REPORT_MIN_N
 * booked and says `so far` while the last 14 days settle; money of two currencies is two sums, side by side, never converted
 * and never charted as one. And two of its own: days end yesterday (a platform has no today yet), and a number that is only
 * read for the page's 30 days (the first reply, what came of the appointments, the platforms' own counts) is a dash with its reason
 * for any other days, or for one platform or one ad where it is not split that way, never a guess.
 */
import { appointmentWords } from "../../journey/appointment-word";
import { lensEmpty } from "../../reports/lenses";
import type { AdDoor, AdPlatform, AdRead, AdTheirs, AdsConfig, AdsRead } from "../ads";
import { addDays, daysBetween } from "../ads";
import { ADS_SCOPE_ALL, adsScopeKey } from "../address";
import type { AdsScope } from "../address";
import { moneyOf, sumMoney } from "../money";
import { adsModel } from "../page";
import type { AdRowVM } from "../page";
import { pageTotals, tilesOf } from "../page-parts";
import type { TilesVM } from "../page-parts";
import { ADS_SETTLE_DAYS } from "../rules";
import { DASH, PLATFORMS, adAccountOf, counted, readTime, started, sum, timeOf, totalsOf } from "../vm-base";
import type { CellVM, FigureVM } from "../vm-base";
import { DOOR, DOOR_ORDER, PLATFORM_OWNER, PLATFORM_WORD, dayShort, dayWord } from "../words";
import { NO_AD } from "../words-drawer";
import { FIGURES, LEDGER } from "../words-page";
import { RESULTS } from "./words-results";

// ---------------------------------------------------------------------------------------------------------------------
// The view model

/** The days a fold is of, and what it is narrowed to. */
export interface ResultsAt {
  from: string;
  to: string;
  scope: AdsScope;
}

/** One choice of the scope list: the word the address and the list keep, what it is called, and what it narrows to. */
export interface ResultsScopeVM {
  key: string;
  kind: AdsScope["kind"];
  scope: AdsScope;
  label: string;
}

/** One day of the two lanes. */
export interface ResultsDayVM {
  day: string;
  /** `Mon 5 Oct`. */
  label: string;
  /** `5`. */
  short: string;
  /** Whole units of the one currency; null where the ads are paid in several. */
  spent: number | null;
  /** What the ads spent that day, as money is said (each currency its own). */
  spentWords: string;
  inTouch: number;
  booked: number;
  /** In touch and not booked (yet). */
  waiting: number;
  /** Google's count, not people. */
  calls: number;
  /** One of the last 14 days: a person can still book. */
  settling: boolean;
}

/** By day: the spend lane above, the people lane below with the booked part filled. */
export interface ResultsDaysVM {
  rows: ResultsDayVM[];
  /** The one currency the spend lane is drawn in, null where the ads are paid in several. */
  currency: string | null;
  spentAria: string;
  peopleAria: string;
  /** Under the lanes: the days still settling, the calls left out, the currencies not drawn as one. */
  notes: string[];
}

export interface ResultsStepVM {
  id: "touch" | "reply" | "booked";
  label: string;
  /** Null where it is not read. */
  n: number | null;
  display: string;
  why: string | null;
}

/** A row of the platform and door tables: the page's cells, over the ads of one platform or one door. */
export interface ResultsRowVM {
  id: string;
  label: string;
  ads: number;
  spent: string;
  inTouch: CellVM;
  booked: CellVM;
  each: CellVM;
}

/** What one platform says of its ads: a row each, in the platform's own columns. Never added together. */
export interface ResultsTheirsVM {
  platform: AdPlatform;
  title: string;
  columns: string[];
  rows: { id: string; name: string; cells: string[] }[];
  /** `Read 9:19 AM.` where the account says when it was read. */
  read: string | null;
}

export interface AdsResultsVM {
  scope: AdsScope;
  /** The scope as the list keeps it (`all`, `platform:meta`, `ad:<id>`). */
  scopeKey: string;
  scopeWord: string;
  scopes: ResultsScopeVM[];
  /** The days counted: the days asked for, ending yesterday at the latest. */
  window: { from: string; to: string; days: number };
  /** Nothing to draw: the words for why, and the sections below are empty. */
  empty: { title: string; body: string } | null;
  /** The sentence at the head; null where there is nothing to draw. */
  head: { strong: string; rest: string } | null;
  /** `11 Sep – 10 Oct · 30 days · read 9:19 AM`. */
  pane: string;
  /** The page's four figures over these days. */
  figures: FigureVM[];
  /** The quiet line under them: spend is as each platform reports it. */
  quiet: string | null;
  /** The head's numbers, for the Overview's one fact. */
  totals: { spent: string; spentAny: boolean; touch: number; booked: number | null; calls: number };
  days: ResultsDaysVM | null;
  funnel: ResultsStepVM[] | null;
  /** What came of the appointments: the page's tile for the same people, or the reason it is not read for these. */
  cameBack: ({ title: string } & ({ tile: TilesVM["cameBack"] } | { why: string })) | null;
  byPlatform: ResultsRowVM[];
  byDoor: ResultsRowVM[];
  byAd: AdRowVM[];
  theirs: { cards: ResultsTheirsVM[]; why: string | null };
}

// ---------------------------------------------------------------------------------------------------------------------
// What the results are of

/** The ads a scope names; null where it names an ad this read does not have. */
function adsOf(read: AdsRead, scope: AdsScope): AdRead[] | null {
  if (scope.kind === "all") return read.ads;
  if (scope.kind === "platform") return read.ads.filter((ad) => ad.platform === scope.platform);
  const one = read.ads.find((ad) => ad.id === scope.id);
  return one ? [one] : null;
}

/** The choices of the scope list: every ad, each platform that has an ad, and each ad. */
function scopesOf(read: AdsRead): ResultsScopeVM[] {
  const choice = (scope: AdsScope, label: string): ResultsScopeVM => ({
    key: adsScopeKey(scope),
    kind: scope.kind,
    scope,
    label,
  });
  return [
    choice(ADS_SCOPE_ALL, RESULTS.scope.all),
    ...PLATFORMS.filter((p) => read.ads.some((ad) => ad.platform === p)).map((p) =>
      choice({ kind: "platform", platform: p }, PLATFORM_WORD[p]),
    ),
    ...read.ads.map((ad) => choice({ kind: "ad", id: ad.id }, ad.name)),
  ];
}

/** The scope as the head's sentence says it: `your ads`, `your Google ads`, an ad's own name. */
function ofWords(scope: AdsScope, ads: readonly AdRead[]): string {
  if (scope.kind === "all") return RESULTS.of.all;
  return scope.kind === "platform"
    ? RESULTS.of.platform(PLATFORM_WORD[scope.platform])
    : RESULTS.of.ad(ads[0]?.name ?? "");
}

/** The scope as the list says it. */
function scopeWordOf(scope: AdsScope, ads: readonly AdRead[]): string {
  if (scope.kind === "all") return RESULTS.scope.all;
  return scope.kind === "platform" ? PLATFORM_WORD[scope.platform] : (ads[0]?.name ?? NO_AD.title);
}

// ---------------------------------------------------------------------------------------------------------------------
// By day

const unitsOf = (minor: number): number => minor / 100;

function daysOf(ads: readonly AdRead[], o: { from: string; to: string; today: string; a: string }): ResultsDaysVM {
  const currencies = [...new Set(ads.map((ad) => ad.currency))];
  const one = currencies.length === 1 ? (currencies[0] ?? null) : null;
  const settleFrom = addDays(o.today, -ADS_SETTLE_DAYS);
  const rows: ResultsDayVM[] = [];
  for (let day = o.from; day <= o.to; day = addDays(day, 1)) {
    const mine = ads.flatMap((ad) =>
      ad.days
        .filter((d) => d.day === day)
        .map((d) => ({ ad, spendMinor: d.spendMinor, inTouch: d.inTouch, booked: d.booked })),
    );
    const people = mine.filter((r) => counted(r.ad));
    const inTouch = sum(people.map((r) => r.inTouch));
    const booked = sum(people.map((r) => r.booked));
    rows.push({
      day,
      label: dayWord(day),
      short: String(Number(day.slice(8, 10))),
      spent: one === null ? null : unitsOf(sum(mine.map((r) => r.spendMinor))),
      spentWords: sumMoney(mine.map((r) => ({ minor: r.spendMinor, currency: r.ad.currency }))),
      inTouch,
      booked,
      waiting: Math.max(0, inTouch - booked),
      calls: sum(mine.filter((r) => !counted(r.ad)).map((r) => r.inTouch)),
      settling: day >= settleFrom,
    });
  }
  const calls = sum(rows.map((r) => r.calls));
  const settles = rows.some((r) => r.settling);
  const spent = sumMoney(
    ads.flatMap((ad) =>
      ad.days
        .filter((d) => d.day >= o.from && d.day <= o.to)
        .map((d) => ({ minor: d.spendMinor, currency: ad.currency })),
    ),
  );
  const people = sum(rows.map((r) => r.inTouch));
  return {
    rows,
    currency: one,
    spentAria: RESULTS.days.spentAria({ total: spent, days: rows.length }),
    peopleAria: RESULTS.days.peopleAria({ people, booked: sum(rows.map((r) => r.booked)), days: rows.length }),
    notes: [
      ...(settles ? [RESULTS.days.settling(ADS_SETTLE_DAYS, o.a)] : []),
      ...(calls > 0 ? [RESULTS.days.callsNote(calls)] : []),
      ...(one === null ? [RESULTS.days.severalCurrencies] : []),
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The funnel, and what came of the appointments

/** The first reply is read for the page's 30 days only, and only for the ads that were written to. */
function funnelOf(o: { scoped: AdsRead; touch: number; booked: number; windowRead: boolean }): ResultsStepVM[] {
  const { scoped } = o;
  const written = scoped.ads.filter((ad) => counted(ad) && ad.reply !== null);
  const replied = sum(written.map((ad) => ad.reply?.n ?? 0));
  const linked = scoped.calendar.linked;
  const step = (id: ResultsStepVM["id"], label: string, n: number | null, why: string | null): ResultsStepVM => ({
    id,
    label,
    n,
    display: n === null ? DASH : String(n),
    why,
  });
  return [
    step("touch", RESULTS.funnel.touch, o.touch, null),
    ...(written.length === 0
      ? []
      : [
          o.windowRead
            ? step("reply", RESULTS.funnel.reply, replied, RESULTS.funnel.replyOf)
            : step("reply", RESULTS.funnel.reply, null, RESULTS.funnel.replyWindow),
        ]),
    linked
      ? step("booked", RESULTS.funnel.booked, o.booked, null)
      : step("booked", RESULTS.funnel.booked, null, FIGURES.needsLink),
  ];
}

/** What came of the appointments is the page's own tile, kept for all ads over the page's window: anything else is not read that way. */
function cameBackOf(o: { read: AdsRead; scope: AdsScope; windowRead: boolean }): AdsResultsVM["cameBack"] {
  const { read } = o;
  const title = RESULTS.cameBack.title(appointmentWords(read.appointmentWord).many);
  if (!read.calendar.linked) return { title, why: FIGURES.needsLink };
  if (o.scope.kind !== "all") return { title, why: RESULTS.cameBack.forAll };
  return o.windowRead ? { title, tile: tilesOf(read).cameBack } : { title, why: RESULTS.cameBack.forThirty };
}

// ---------------------------------------------------------------------------------------------------------------------
// The platform and door tables: the page's cells, over the ads of one platform or one door

const cell = (value: string, unit: string | null = null, why: string | null = null): CellVM => ({ value, unit, why });

/** The unit under a count of people, where the ads agree on how they got in touch. */
function unitOf(ads: readonly AdRead[]): string | null {
  const doors = new Set<AdDoor>(ads.map((ad) => ad.door));
  const only = doors.size === 1 ? [...doors][0] : undefined;
  return only ? DOOR[only].unit : null;
}

function rowOf(subset: readonly AdRead[], scoped: AdsRead, id: string, label: string): ResultsRowVM {
  const here: AdsRead = { ...scoped, ads: [...subset] };
  const p = pageTotals(here);
  const people = subset.filter(counted);
  const calls = sum(subset.filter((ad) => !counted(ad)).map((ad) => totalsOf(ad, here).inTouch));
  const base = { id, label, ads: subset.length, spent: sumMoney(p.spent) };
  if (!subset.some(started)) {
    const none = cell(DASH, null, LEDGER.notStarted);
    return { ...base, inTouch: none, booked: none, each: none };
  }
  const inTouch = people.length === 0 ? cell(String(calls), DOOR.call.unit) : cell(String(p.touch), unitOf(people));
  if (people.length === 0) {
    return {
      ...base,
      inTouch,
      booked: cell(DASH, LEDGER.notMatched, FIGURES.callsNotMatched),
      each: cell(DASH, null, FIGURES.callsNotMatched),
    };
  }
  if (!scoped.calendar.linked) {
    const why = FIGURES.needsLink;
    return { ...base, inTouch, booked: cell(DASH, null, why), each: cell(DASH, null, why) };
  }
  const each =
    p.each === null
      ? cell(DASH, p.booked === 0 ? LEDGER.noneYet : LEDGER.only(p.booked), LEDGER.tooFew)
      : cell(moneyOf(p.each.minor, p.each.currency));
  return { ...base, inTouch, booked: cell(String(p.booked)), each };
}

const byPlatformOf = (ads: readonly AdRead[], scoped: AdsRead): ResultsRowVM[] =>
  PLATFORMS.flatMap((p) => {
    const mine = ads.filter((ad) => ad.platform === p);
    return mine.length === 0 ? [] : [rowOf(mine, scoped, p, PLATFORM_WORD[p])];
  });

const byDoorOf = (ads: readonly AdRead[], scoped: AdsRead): ResultsRowVM[] =>
  DOOR_ORDER.flatMap((d) => {
    const mine = ads.filter((ad) => ad.door === d);
    return mine.length === 0 ? [] : [rowOf(mine, scoped, d, DOOR[d].label)];
  });

// ---------------------------------------------------------------------------------------------------------------------
// What the platforms say

const grouped = (n: number | null): string => (n === null ? DASH : n.toLocaleString("en-US"));

/** An ad's own numbers in the platform's columns (RESULTS.theirs.columns, in their order). */
function theirsCells(t: AdTheirs): string[] {
  if (t.platform === "meta") return [grouped(t.reach), grouped(t.taps), grouped(t.chats), grouped(t.leads)];
  if (t.platform === "google") return [grouped(t.clicks), grouped(t.calls), grouped(t.longCalls)];
  return [grouped(t.reach), grouped(t.clicks), grouped(t.leads)];
}

const theirsColumns = (platform: AdPlatform): string[] => Object.values(RESULTS.theirs.columns[platform]);

function theirsOf(ads: readonly AdRead[], read: AdsRead): ResultsTheirsVM[] {
  return PLATFORMS.flatMap((platform) => {
    const mine = ads.filter((ad) => ad.platform === platform && started(ad));
    if (mine.length === 0) return [];
    const acct = adAccountOf(read, platform);
    return [
      {
        platform,
        title: RESULTS.theirs.card(PLATFORM_OWNER[platform]),
        columns: theirsColumns(platform),
        rows: mine.map((ad) => ({ id: ad.id, name: ad.name, cells: theirsCells(ad.theirs) })),
        read: acct?.readAt ? RESULTS.theirs.read(timeOf(acct.readAt, acct.timezone)) : null,
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The fold

/** The head's sentence, said of whatever the results are narrowed to. */
function headOf(o: { of: string; touch: number; booked: number; calls: number; peopleAds: number; linked: boolean }) {
  if (o.peopleAds === 0 && o.calls > 0) return RESULTS.head.calls({ calls: o.calls, of: o.of });
  if (o.touch === 0) return RESULTS.head.quiet({ of: o.of });
  return o.linked
    ? RESULTS.head.booked({ booked: o.booked, touch: o.touch, of: o.of })
    : RESULTS.head.touchOnly({ touch: o.touch, of: o.of });
}

const NOTHING: Pick<
  AdsResultsVM,
  "days" | "funnel" | "cameBack" | "byPlatform" | "byDoor" | "byAd" | "figures" | "quiet"
> = {
  days: null,
  funnel: null,
  cameBack: null,
  byPlatform: [],
  byDoor: [],
  byAd: [],
  figures: [],
  quiet: null,
};

/** The days asked for, ending yesterday at the latest: a platform has no today yet. */
function windowOf(read: AdsRead, at: ResultsAt): AdsResultsVM["window"] {
  const to = at.to < read.today ? at.to : addDays(read.today, -1);
  return { from: at.from, to, days: Math.max(0, daysBetween(at.from, to) + 1) };
}

function emptyOf(o: { read: AdsRead; ads: readonly AdRead[] | null; window: AdsResultsVM["window"]; quiet: boolean }) {
  if (o.read.ads.length === 0) return RESULTS.empty.noAds;
  if (o.ads === null) return { title: NO_AD.title, body: NO_AD.body };
  if (!o.quiet && o.window.days > 0) return null;
  const words = lensEmpty("ads", { since: dayShort(o.window.from), until: dayShort(o.window.to) });
  return { title: words.title, body: words.body };
}

/**
 * The results of some of an owner's ads over some days: the head, the four figures, by day, the funnel, what came of the
 * appointments, the platform, door and ad tables, and what each platform says. A scope that names an ad this read does not have, a
 * workspace with no ad, and days with nothing spent or counted each say so in `empty` and leave the sections out.
 */
export function adsResultsOf(read: AdsRead, config: AdsConfig, at: ResultsAt): AdsResultsVM {
  const window = windowOf(read, at);
  const ads = adsOf(read, at.scope);
  const scoped: AdsRead = {
    ...read,
    ads: ads ?? [],
    people: read.people.filter((p) => ads?.some((ad) => ad.id === p.adId)),
    window: { from: window.from, to: window.to },
  };
  const p = pageTotals(scoped);
  const people = scoped.ads.filter(counted);
  const calls = sum(scoped.ads.filter((ad) => !counted(ad)).map((ad) => totalsOf(ad, scoped).inTouch));
  const linked = read.calendar.linked;
  const quiet = p.touch === 0 && calls === 0 && sum(p.spent.map((m) => m.minor)) === 0;
  const windowRead = window.from === read.window.from && window.to === read.window.to;
  const unread = windowRead ? null : RESULTS.theirs.window;
  const base = {
    scope: at.scope,
    scopeKey: adsScopeKey(at.scope),
    scopeWord: scopeWordOf(at.scope, ads ?? []),
    scopes: scopesOf(read),
    window,
    pane: RESULTS.pane({
      dates: `${dayShort(window.from)} – ${dayShort(window.to)}`,
      days: window.days,
      readAt: readTime(read),
    }),
    totals: {
      spent: sumMoney(p.spent),
      spentAny: p.spent.some((m) => m.minor > 0),
      touch: p.touch,
      booked: linked ? p.booked : null,
      calls,
    },
  };
  const empty = emptyOf({ read, ads, window, quiet });
  if (empty) return { ...base, ...NOTHING, empty, head: null, theirs: { cards: [], why: null } };
  const model = adsModel(scoped, config);
  return {
    ...base,
    empty: null,
    head: headOf({
      of: ofWords(at.scope, scoped.ads),
      touch: p.touch,
      booked: p.booked,
      calls,
      peopleAds: people.length,
      linked,
    }),
    figures: model.figures,
    quiet: model.counted?.quiet ?? null,
    days: daysOf(scoped.ads, {
      from: window.from,
      to: window.to,
      today: read.today,
      a: appointmentWords(read.appointmentWord).a,
    }),
    funnel: p.touch === 0 ? null : funnelOf({ scoped, touch: p.touch, booked: p.booked, windowRead }),
    cameBack: cameBackOf({ read, scope: at.scope, windowRead }),
    byPlatform: byPlatformOf(scoped.ads, scoped),
    byDoor: byDoorOf(scoped.ads, scoped),
    byAd: model.groups.flatMap((g) => g.rows),
    theirs: { cards: windowRead ? theirsOf(scoped.ads, read) : [], why: unread },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The Overview's one fact

/** The Overview's Worth-knowing line over these days: what the ads brought. Null where there is nothing to say. */
export function adsFactOf(vm: AdsResultsVM): { text: string; sub: string } | null {
  const t = vm.totals;
  if (vm.empty !== null || (t.touch === 0 && !t.spentAny)) return null;
  return {
    text: t.touch === 0 ? RESULTS.fact.nobody : RESULTS.fact.brought(t.touch),
    sub: RESULTS.fact.sub({ booked: t.touch === 0 ? null : t.booked, spent: t.spent }),
  };
}
