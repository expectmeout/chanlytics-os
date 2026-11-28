/**
 * The Ads page once an account is connected, as a model (the Ads plan's 4.4, 4.5, 4.8 and 4.9): every sentence the
 * page and an ad's drawer say, worked out from the page's read (contracts AdsLiveDto) and nothing else. Pure: the
 * read and the zone are handed in.
 *
 * Two halves, never one number (decision 0049, call 3): who an ad brought and who booked are Chanlytics' count; what
 * it spent is Meta's. The cost for each person who booked is Meta's spend on the ads whose people Chanlytics can
 * count, over the people who booked from them, shown from five booked and said "so far" while Meta's days still move
 * (contracts adCostRule). People from an ad Chanlytics cannot name, and people from an ad of an ad account connected
 * before this one, are in the head's total and each on one quiet line, so the page always reconciles with Reports ›
 * People.
 */
import { AD_PAGE_DAYS, AD_WARN_STATES, adCostRule, adRoute, daysBetween, fileViewOf } from "@chanlytics/contracts";
import type { AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";
import { aboutMoneyOf, moneyOf, ADS_DEFAULT_CURRENCY } from "../model/money";
import { dayOfIso, timeOf } from "../model/vm-base";
import { dayWord } from "../model/words";
import { over, quiet, shown } from "./listed";
import { LIVE } from "./words";
import {
  aiLineOf,
  counted,
  firstReadOf,
  needsYouLineOf,
  type AiLineVM,
  type LiveClock,
  type NeedsYouLineVM,
} from "./ai-line";

/** The standings a drawer says in its row's own line alone: nothing is running yet that money or an end would describe. */
export const LINE_ALONE: readonly AdLiveDto["state"][] = ["review", "setting-up", "couldnt-finish", "unconfirmed"];

/** A day as an ad's lines say it: today, tomorrow or yesterday where it is one of those, its weekday and date otherwise. */
export const adDayOf = (iso: string | null, said: LiveClock): string | null => {
  const day = iso === null ? "" : dayOfIso(iso, said.timezone);
  if (day === "") return null;
  const today = dayOfIso(new Date(said.nowMs).toISOString(), said.timezone);
  const apart = daysBetween(today, day);
  return apart === 0 ? LIVE.today : apart === 1 ? LIVE.tomorrow : apart === -1 ? LIVE.yesterday : dayWord(day);
};

/**
 * The ads as they stand now: one Meta still calls on, whose last moment has passed, has ended. Meta is read once an hour and
 * says an ad that ran its days is still active (seen 25 Nov 2026: the $5 boost "On · ends today" an hour after it ended).
 */
export function standingNow(dto: AdsLiveDto, nowMs: number): AdsLiveDto {
  const past = (ad: AdLiveDto) => ad.state === "on" && ad.ends_at !== null && Date.parse(ad.ends_at) <= nowMs;
  if (!dto.ads.some(past)) return dto;
  return { ...dto, ads: dto.ads.map((ad) => (past(ad) ? { ...ad, state: "ended" as const } : ad)) };
}

/**
 * Where an ad stands in the list, the order an owner reads it in (Ruben, 25 Nov 2026: a long list reads as People's and the
 * Inbox's do): what needs the owner (Meta refused it, it couldn't finish or be confirmed, or it has a need of its own, as
 * ads/needs-you.ts counts them), what runs or is on its way to (checked by Meta, being set up), what is paused, and what has
 * ended.
 */
export type AdGroup = "needs" | "on" | "paused" | "ended";
export const AD_GROUPS: readonly AdGroup[] = ["needs", "on", "paused", "ended"];

function adGroupOf(ad: Pick<AdLiveDto, "state" | "needs">): AdGroup {
  if (AD_WARN_STATES.includes(ad.state) || ad.needs !== null) return "needs";
  if (ad.state === "paused") return "paused";
  return over(ad) ? "ended" : "on";
}

/**
 * The list's order: by group, then what spent most first, and the ended by when they ended, the latest first. Stable, so
 * two alike keep the read's order.
 */
function inListOrder(a: AdLiveDto, b: AdLiveDto): number {
  const group = AD_GROUPS.indexOf(adGroupOf(a)) - AD_GROUPS.indexOf(adGroupOf(b));
  if (group !== 0) return group;
  if (adGroupOf(a) !== "ended") return b.spend_minor - a.spend_minor;
  const endOf = (ad: AdLiveDto) => (ad.ends_at === null ? 0 : Date.parse(ad.ends_at));
  return endOf(b) - endOf(a);
}

/** One row of the list. */
export interface LiveRowVM {
  id: string;
  name: string;
  /** The group it stands under (adGroupOf). */
  group: AdGroup;
  /**
   * Over, with nothing to show over the page's days (listed.ts `quiet`): kept under Ended, folded, so the list reads as
   * it did and the ad can still be found.
   */
  quiet: boolean;
  /** Its address, which opens its drawer. */
  open: string;
  line: string;
  /** The line's first word, where the ad stands, said in its tone; the rest of the line after it, quiet. */
  state: string;
  facts: string | null;
  /** What it shows people, small: so an owner sees which ad is which. Null where nothing of it was read. */
  picture: string | null;
  /** A badge where the line alone does not say where it stands (In review). */
  badge: string | null;
  tone: "ok" | "warn" | "plain";
  /** The row's end: what it brought, or what it spent where its people are not counted. */
  endTop: string | null;
  endSub: string | null;
}

/** The amber notice at the top: signed out, or an ad left running after a disconnect. */
export interface LiveNoticeVM {
  title: string;
  body: string;
  /** Meta's own page, where the notice's one act is there. */
  door: string | null;
}

export interface LiveVM {
  head: { strong: string | null; rest: string };
  /**
   * The page's figures, a compact strip under its tabs where the account's ads are read (LIVE.figures); null where the
   * page says a state instead (reading, nothing read yet, no ads), which the head's sentence says.
   */
  figures: FigureVM[] | null;
  /**
   * Under the head, the page's one quiet line: that it is paid, and what was spent over its days and what each booked
   * person cost, or who is charged where nothing was spent yet.
   */
  line: string;
  /** AI's one line, where its rules have something to propose; null where they do not. */
  ai: AiLineVM | null;
  /** Who an ad brought and needs you now; null where nobody does. */
  needsYou: NeedsYouLineVM | null;
  notice: LiveNoticeVM | null;
  /** A read that failed, said quietly: the numbers are the last good ones. */
  stale: string | null;
  rows: LiveRowVM[];
  notes: string[];
  /** After a disconnect: what Connect would bring back. */
  again: string | null;
  /**
   * Connected and read, with no ad in the account: that Meta shows none, beside New ad, where the ads would be (a
   * desk draws no head sentence, so the page says it here; a phone says it once, here and not under the head).
   */
  empty: string | null;
}

/** The cost for each person who booked, across the ads whose people are counted; null under five booked. */
export function eachOf(
  ads: readonly AdLiveDto[],
  dto: AdsLiveDto,
  currency: string,
): { each: string; soFar: boolean } | null {
  const mine = ads.filter(counted);
  const cost = adCostRule({
    spentMinor: mine.reduce((sum, ad) => sum + ad.spend_minor, 0),
    booked: mine.reduce((sum, ad) => sum + ad.booked, 0),
    // The rule reads days; a figure with a day still moving in it is the window's last one.
    days: mine.some((ad) => ad.settling) ? [dto.window.to] : [],
    today: dto.today,
  });
  return cost.eachMinor === null ? null : { each: aboutMoneyOf(cost.eachMinor, currency), soFar: cost.soFar };
}

/**
 * Whether an ad may be on with nobody here able to say: made here, its last switch sent and Meta's word for it never
 * read (the page follows it as setting up, then says it couldn't confirm it). Where its account is still read, a read
 * settles it; where the account was let go first, it stays so, and is said as that.
 */
const mayBeOnOf = (ad: AdLiveDto): boolean =>
  ad.state === "unconfirmed" || (ad.state === "setting-up" && ad.launch?.sending === false);

/**
 * A row's line where the account is no longer read (signed out by Meta, or let go): what the ad was doing when it last
 * was. An ad Meta was still checking was neither on nor paused, and is said as what it was; one whose last switch Meta
 * had not answered may be on, and is never said to have been paused.
 */
function stoppedLineOf(ad: AdLiveDto, dto: AdsLiveDto, said: LiveClock): string {
  const checking = ad.state === "review";
  const unsure = mayBeOnOf(ad);
  if (dto.account.status === "disconnected") {
    const day = adDayOf(dto.account.disconnected_at, said) ?? "";
    const phrase = ad.state === "on" ? LIVE.leftWasOn(day).trim() : unsure ? LIVE.leftMayBeOn : LIVE.leftWasPaused;
    return `${LIVE.leftInMeta} · ${checking ? LIVE.wasChecking : phrase}`;
  }
  const updated = adDayOf(dto.account.read_at, said);
  const phrase = ad.state === "on" ? LIVE.wasOn : unsure ? LIVE.mayBeOn : LIVE.wasPaused;
  return [checking ? LIVE.wasChecking : phrase, updated ? LIVE.updated(updated) : null].filter(Boolean).join(" · ");
}

/** The line a row says: where the ad stands, then what the owner needs to know of it. */
export function lineOf(ad: AdLiveDto, dto: AdsLiveDto, said: LiveClock, currency: string): string {
  const ends = adDayOf(ad.ends_at, said);
  if (dto.account.status !== "connected") return stoppedLineOf(ad, dto, said);
  if (ad.state === "setting-up") return ad.launch?.cancelling ? LIVE.cancelling : LIVE.settingUp;
  if (ad.state === "couldnt-finish") return LIVE.couldntFinish(LIVE.stoppedWhy[ad.launch?.stopped ?? "unanswered"]);
  if (ad.state === "unconfirmed") return LIVE.unconfirmed;
  if (ad.pending === "pausing") return LIVE.pausing;
  if (ad.pending === "resuming") return LIVE.resuming;
  if (ad.state === "review") return LIVE.checking;
  if (ad.state === "needs-you" && ad.needs) return LIVE.needs[ad.needs];
  if (ad.state === "ended") return ends ? LIVE.ended(ends) : LIVE.state.ended;
  if (ad.state === "finished") return LIVE.finished;
  const left =
    ad.budget?.kind === "total" && ad.budget.left_minor !== null && !ad.budget.shared
      ? LIVE.left(moneyOf(ad.budget.left_minor, currency))
      : null;
  // When it ends and what is left, wherever it was made: what an owner reads a row for (who made it is its drawer's).
  return [LIVE.state[ad.state], ends ? LIVE.ends(ends) : null, left].filter(Boolean).join(" · ");
}

/** A row's line in its two parts: where the ad stands, said in its tone, and the rest, quiet after it. */
export function stateAndFacts(line: string): Pick<LiveRowVM, "state" | "facts"> {
  const [state = line, ...rest] = line.split(" · ");
  return { state, facts: rest.length > 0 ? rest.join(" · ") : null };
}

/**
 * What an ad shows people, as an address an image draws: the piece of Content it was made from (the business's own file, at
 * the size it is drawn), else Meta's own small picture of it, as the read kept it. Null where neither is known.
 */
export function adPictureOf(ad: Pick<AdLiveDto, "picture">, size: "small" | "large"): string | null {
  const picture = ad.picture ?? null;
  if (picture === null) return null;
  return "file_id" in picture ? `${fileViewOf(picture.file_id)}?w=${size === "small" ? 160 : 720}` : picture.url;
}

/** An ad's tone, in its row and its drawer: amber where it needs the owner, green while it runs, none where it is not read. */
export function toneOf(ad: AdLiveDto, dto: AdsLiveDto): LiveRowVM["tone"] {
  if (dto.account.status !== "connected") return "plain";
  return AD_WARN_STATES.includes(ad.state) ? "warn" : ad.state === "on" ? "ok" : "plain";
}

function liveRowOf(
  ad: AdLiveDto,
  dto: AdsLiveDto,
  said: LiveClock,
  at: { currency: string; quiet: boolean },
): LiveRowVM {
  const { currency } = at;
  const each = ad.booked > 0 ? eachOf([ad], dto, currency) : null;
  const stopped = dto.account.status !== "connected";
  const line = lineOf(ad, dto, said, currency);
  return {
    id: ad.id,
    name: ad.name,
    group: adGroupOf(ad),
    quiet: at.quiet,
    open: adRoute(ad.id),
    line,
    ...stateAndFacts(line),
    picture: adPictureOf(ad, "small"),
    badge: !stopped && ad.pending === null && ad.state === "review" ? LIVE.state.review : null,
    tone: toneOf(ad, dto),
    // The row's one number: who booked where its people are counted, else what Meta spent. Why its people are not
    // counted is its drawer's to say, never the row's end.
    endTop: counted(ad)
      ? LIVE.bookedCell(ad.booked)
      : ad.spend_minor > 0
        ? LIVE.spent(moneyOf(ad.spend_minor, currency))
        : null,
    // Under what it spent, who commented on it where anyone did: the people an ad that opens no chat can name (00719).
    endSub: counted(ad)
      ? each
        ? LIVE.eachCell(each.each)
        : null
      : (ad.commenters?.count ?? 0) > 0
        ? LIVE.commentedCell(ad.commenters?.count ?? 0)
        : null,
  };
}

const namesOf = (ads: readonly AdLiveDto[]): string => {
  const names = ads.map((ad) => ad.name);
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
};

/** The notice at the top, where the account is no longer connected. */
function liveNoticeOf(dto: AdsLiveDto, said: LiveClock): LiveNoticeVM | null {
  const on = dto.ads.filter((ad) => ad.state === "on");
  if (dto.account.status === "revoked") {
    const day = adDayOf(dto.account.revoked_at, said) ?? "";
    const names = namesOf(on);
    const unsure = dto.ads.filter(mayBeOnOf);
    return {
      title: LIVE.signedOut.title(day),
      body:
        on.length === 0
          ? unsure.length > 0
            ? LIVE.signedOut.mayBeOn(namesOf(unsure))
            : LIVE.signedOut.none
          : on.length === 1
            ? LIVE.signedOut.wasOn(names)
            : LIVE.signedOut.wereOn(names),
      door: null,
    };
  }
  if (dto.account.status === "disconnected") return leftOnNotice(dto, said);
  return null;
}

/** After a disconnect: the ads left on, each as what it was. An ad Meta was checking starts once it is approved. */
function leftOnNotice(dto: AdsLiveDto, said: LiveClock): LiveNoticeVM | null {
  const on = dto.ads.filter((ad) => ad.state === "on");
  const checking = dto.ads.filter((ad) => ad.state === "review");
  const left = [...on, ...checking];
  const day = adDayOf(dto.account.disconnected_at, said) ?? "";
  const door = LIVE.disconnected.openMeta;
  const words = LIVE.disconnected;
  if (left.length === 0) {
    // None known to be on. One whose last switch Meta had not answered may be: said, with Meta as where to look.
    const unsure = dto.ads.filter(mayBeOnOf);
    if (unsure.length === 0) return null;
    return { title: words.unsureTitle(namesOf(unsure)), body: words.unsureBody(day, unsure.length > 1), door };
  }
  if (checking.length === 0)
    return { title: words.title(namesOf(on), on.length > 1), body: words.body(day, on.length > 1), door };
  if (on.length === 0)
    return { title: words.checkingTitle(namesOf(checking)), body: words.checkingBody(day, checking.length > 1), door };
  return { title: words.bothTitle(namesOf(left)), body: words.bothBody(day), door };
}

/** The people no listed ad holds, each a quiet line: an ad Chanlytics can't name yet, and an ad account before this one. */
export function besideOf(dto: AdsLiveDto): string[] {
  return [
    dto.unnamed.people > 0 ? LIVE.unnamed(dto.unnamed.people, dto.unnamed.booked) : null,
    dto.elsewhere.people > 0 ? LIVE.elsewhere(dto.elsewhere.people, dto.elsewhere.booked) : null,
  ].flatMap((note) => note ?? []);
}

/** Everyone an ad brought in the window, and who of them booked: the listed ads', the unnamed and the ones elsewhere. */
export function allBroughtOf(dto: AdsLiveDto): { came: number; booked: number } {
  const beside = [dto.unnamed, dto.elsewhere];
  return {
    came: [...dto.ads.map((ad) => ad.people), ...beside.map((one) => one.people)].reduce((sum, n) => sum + n, 0),
    booked: [...dto.ads.map((ad) => ad.booked), ...beside.map((one) => one.booked)].reduce((sum, n) => sum + n, 0),
  };
}

/** The page's head: who booked, else how many ads, else what is known of the account's ads. */
function liveHeadOf(dto: AdsLiveDto, brought: { came: number; booked: number }, listed: number): LiveVM["head"] {
  if (brought.came > 0) return LIVE.booked(brought.booked, brought.came);
  if (dto.ads.length > 0) return LIVE.inAccount(listed);
  const first = firstReadOf(dto.account);
  if (first === "reading") return LIVE.reading;
  return first === "failed" ? LIVE.notReadYet : LIVE.noAds;
}

/**
 * The page's figures: what was spent over its days (the day it was last read where Chanlytics no longer reads it), who
 * booked of who came from an ad and what each cost where anyone came, and who commented on an ad that opens no chat.
 */
function figuresOf(
  dto: AdsLiveDto,
  at: {
    came: number;
    booked: number;
    spent: string;
    each: { each: string; soFar: boolean } | null;
    updated: string | null;
  },
): FigureVM[] | null {
  if (dto.ads.length === 0) return null;
  const commented = dto.ads.filter((ad) => !counted(ad)).reduce((n, ad) => n + (ad.commenters?.count ?? 0), 0);
  const said = LIVE.figures;
  return [
    { label: said.spent(AD_PAGE_DAYS), value: at.spent, meta: at.updated },
    ...(at.came > 0 ? [{ label: said.booked, value: String(at.booked), meta: said.of(at.came) }] : []),
    ...(at.each ? [{ label: said.each, value: at.each.each, meta: at.each.soFar ? said.soFar : null }] : []),
    ...(commented > 0 ? [{ label: said.commented, value: String(commented) }] : []),
  ];
}

/** The page. */
export function liveModel(read: AdsLiveDto, said: LiveClock): LiveVM {
  const dto = standingNow(read, said.nowMs);
  const currency = dto.account.currency ?? ADS_DEFAULT_CURRENCY;
  const ads = shown(dto);
  const { came, booked } = allBroughtOf(dto);
  const spent = dto.ads.reduce((sum, ad) => sum + ad.spend_minor, 0);
  const each = eachOf(dto.ads, dto, currency);
  const connected = dto.account.status === "connected";
  // The day it was last read, said where Chanlytics no longer reads it (signed out, or let go).
  const updatedDay = connected ? null : adDayOf(dto.account.read_at, said);
  const updated = updatedDay ? LIVE.updated(updatedDay) : null;
  const after = updated ?? (each ? LIVE.each(each.each, each.soFar) : null);
  const spentSaid = moneyOf(spent, currency);
  return {
    head: liveHeadOf(dto, { came, booked }, ads.length),
    figures: figuresOf(dto, { came, booked, spent: spentSaid, each, updated }),
    line: came === 0 && spent === 0 ? LIVE.paidNothing : LIVE.paid([LIVE.spentIn(spentSaid, AD_PAGE_DAYS), after]),
    ai: aiLineOf(dto, said),
    needsYou: needsYouLineOf(dto, said),
    notice: liveNoticeOf(dto, said),
    stale:
      connected && dto.account.read_failed && dto.account.read_at
        ? LIVE.couldntUpdate(timeOf(dto.account.read_at, said.timezone))
        : null,
    // The list as it shows without a press, then the ads that are over with nothing to show, each latest first: the
    // page keeps those under Ended, folded (ad-list.ts).
    rows: [
      ...[...ads].sort(inListOrder).map((ad) => liveRowOf(ad, dto, said, { currency, quiet: false })),
      ...quiet(dto)
        .sort(inListOrder)
        .map((ad) => liveRowOf(ad, dto, said, { currency, quiet: true })),
    ],
    notes: besideOf(dto),
    again: dto.account.status === "disconnected" ? LIVE.disconnected.again : null,
    empty: connected && firstReadOf(dto.account) === null && dto.ads.length === 0 ? LIVE.noAds.rest : null,
  };
}

/** One figure of the drawer or the page: its label, what it says, and a word beside it where it has one. */
export interface FigureVM {
  label: string;
  value: string;
  meta?: string | null;
}
