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
import { AD_PAGE_DAYS, AD_WARN_STATES, adChatsKeptRule, adCostRule, adRoute, daysBetween } from "@chanlytics/contracts";
import { AD_WAY_IN_SAID, contentRouteOf, fileViewOf } from "@chanlytics/contracts";
import type { AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";
import { aboutMoneyOf, moneyOf, ADS_DEFAULT_CURRENCY } from "../model/money";
import { dayOfIso, timeOf } from "../model/vm-base";
import { dayShort, dayWord, peopleWord } from "../model/words";
import { changeSentenceOf, endsAlone, maySpend, type ChangeSentenceVM } from "./change-model";
import { FIX } from "./change-words";
import { over, shown } from "./listed";
import { ADS_MANAGER, LIVE, SHEET } from "./words";
import {
  aiLineOf,
  counted,
  firstReadOf,
  needsYouLineOf,
  type AiLineVM,
  type LiveClock,
  type NeedsYouLineVM,
} from "./ai-line";
import { worthOf, type WorthVM } from "./worth-model";

/** The standings a drawer says in its row's own line alone: nothing is running yet that money or an end would describe. */
const LINE_ALONE: readonly AdLiveDto["state"][] = ["review", "setting-up", "couldnt-finish", "unconfirmed"];

/** A day as an ad's lines say it: today, tomorrow or yesterday where it is one of those, its weekday and date otherwise. */
const adDayOf = (iso: string | null, said: LiveClock): string | null => {
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
function standingNow(dto: AdsLiveDto, nowMs: number): AdsLiveDto {
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
function lineOf(ad: AdLiveDto, dto: AdsLiveDto, said: LiveClock, currency: string): string {
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
function stateAndFacts(line: string): Pick<LiveRowVM, "state" | "facts"> {
  const [state = line, ...rest] = line.split(" · ");
  return { state, facts: rest.length > 0 ? rest.join(" · ") : null };
}

/**
 * What an ad shows people, as an address an image draws: the piece of Content it was made from (the business's own file, at
 * the size it is drawn), else Meta's own small picture of it, as the read kept it. Null where neither is known.
 */
function adPictureOf(ad: Pick<AdLiveDto, "picture">, size: "small" | "large"): string | null {
  const picture = ad.picture ?? null;
  if (picture === null) return null;
  return "file_id" in picture ? `${fileViewOf(picture.file_id)}?w=${size === "small" ? 160 : 720}` : picture.url;
}

/** An ad's tone, in its row and its drawer: amber where it needs the owner, green while it runs, none where it is not read. */
function toneOf(ad: AdLiveDto, dto: AdsLiveDto): LiveRowVM["tone"] {
  if (dto.account.status !== "connected") return "plain";
  return AD_WARN_STATES.includes(ad.state) ? "warn" : ad.state === "on" ? "ok" : "plain";
}

function liveRowOf(ad: AdLiveDto, dto: AdsLiveDto, said: LiveClock, currency: string): LiveRowVM {
  const each = ad.booked > 0 ? eachOf([ad], dto, currency) : null;
  const stopped = dto.account.status !== "connected";
  const line = lineOf(ad, dto, said, currency);
  return {
    id: ad.id,
    name: ad.name,
    group: adGroupOf(ad),
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
    rows: [...ads].sort(inListOrder).map((ad) => liveRowOf(ad, dto, said, currency)),
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

/** What the drawer's foot offers: one press, a question with its press, a door into Meta, or a line and nothing to press. */
export type SheetFootVM =
  | { kind: "pause"; body: string }
  | { kind: "resume"; ask: string; body: string; press: string }
  | { kind: "in-meta"; head: string; body: string }
  | { kind: "check"; line: string }
  | { kind: "left"; line: string }
  /** An ad made here that Meta turned down: Fix it, and a door to ask Meta to look again (the plan's C8). */
  | { kind: "fix"; body: string }
  /** An ad made here being set up: its owner's Cancel (the plan's 4.7, point 8). */
  | { kind: "cancel"; body: string }
  /** Paused, and not to be turned back on from here or in Meta: why, and what to do instead. */
  | { kind: "held"; head: string; body: string }
  /** Nothing to press here (why, in one line), and the ad in Meta, where it is paused or changed. */
  | { kind: "meta"; line: string }
  | { kind: "none"; line: string | null };

export interface SheetVM {
  id: string;
  version: number;
  /**
   * Where it shows, then what a tap opens where that is a place of its own: `Shows on Facebook · Opens WhatsApp`; a post's
   * ad opens its post, which is what it shows, so it says where alone (Ruben, 25 Nov 2026: "Opens another page" said nothing).
   */
  where: string;
  name: string;
  line: string;
  /** The line in its two parts, as a row says it: where the ad stands in its tone, and the rest quiet after it. */
  state: string;
  facts: string | null;
  tone: LiveRowVM["tone"];
  /** What it shows people: its picture, large where it is the business's own and Meta's small one otherwise, and its words. */
  seen: { picture: string | null; small: boolean; words: string | null };
  /** What its total has spent of it, said and as a share; null for an ad with no total of its own (a day's amount, shared). */
  spent: { said: string; share: number } | null;
  /** Its days: "24 Nov – today", "since 24 Nov"; null where neither end is known. */
  days: string | null;
  /** The days Meta's numbers cover: since it started, where that is inside the page's window; the window's otherwise. */
  theirsLabel: string;
  /** The ad in Meta Ads Manager: the foot's door where nothing can be pressed here. */
  metaPage: string;
  /** Its Instagram post, where it runs one: what people see, one press away. */
  postUrl: string | null;
  /** Who commented on it over the page's days (00719): how many, and the latest by name; null where none did. */
  commenters: { count: number; people: { id: string; name: string; at: string }[] } | null;
  /**
   * The piece of Content it was made from (Campaigns in three tabs): its name and the address that opens it in Made, or no
   * name and no address once it is gone from Made; null for an ad that shows no file of the business's.
   */
  from: { name: string; route: string } | { name: null; route: null } | null;
  /** Meta's own words for why it will not run, in quotes. */
  reason: { label: string; words: string; note: string | null } | null;
  ours: FigureVM[];
  theirs: FigureVM[];
  /**
   * Meta's count beside the messages that reached Chanlytics (the tracking plan's T2), under Meta's numbers, and when the
   * two part what that means for the owner; null under ten of Meta's, or with no day Meta has settled.
   */
  chats: { line: string; parted: string | null } | null;
  /** The people it brought back (T3), on a line of its own under Chanlytics' count; null for nobody. */
  back: string | null;
  /** What its bookings are worth beside what it spent (T6), on a line of its own; null with nothing to say. */
  worth: WorthVM | null;
  /** Whether its people are counted: the list is drawn only where they are. */
  counted: boolean;
  /** An ad made here: the sentence its owner changes by tapping its words; null for any other, or none to change. */
  change: ChangeSentenceVM | null;
  /** Whether End is offered: an ad made here, its owner's, not ending already. */
  ends: boolean;
  foot: SheetFootVM;
}

/** The drawer's first line: where the ad stands, when it ends, and what is left or what it may spend a day. */
function sheetLineOf(ad: AdLiveDto, dto: AdsLiveDto, said: LiveClock, currency: string): string {
  if (dto.account.status !== "connected" || ad.pending !== null || over(ad) || LINE_ALONE.includes(ad.state))
    return lineOf(ad, dto, said, currency);
  const ends = adDayOf(ad.ends_at, said);
  const budget = ad.budget;
  // A day's amount is said here; a total's spent and its whole are the drawer's own line, with its bar (sheetSeenOf).
  const money = budget?.kind === "daily" ? LIVE.aDay(moneyOf(budget.minor, currency)) : null;
  const word = ad.state === "needs-you" && ad.needs ? LIVE.needs[ad.needs] : LIVE.state[ad.state];
  const end = ends ? (ad.state === "paused" ? LIVE.stillEnds(ends) : LIVE.ends(ends)) : budget ? LIVE.noEnd : null;
  // An amount a day reads before its end ("$20 a day, no end date"); what is left reads after it.
  return budget?.kind === "daily"
    ? [word, [money, end].filter(Boolean).join(", ")].filter(Boolean).join(" · ")
    : [word, end, money].filter(Boolean).join(" · ");
}

/**
 * The foot of an ad made here while Turn on's job has it, or after it stopped part way; null for any other. Its owner may
 * cancel it while the job is still making it, and is told it is stopping once they have.
 */
function launchFootOf(ad: AdLiveDto, owner: boolean): SheetFootVM | null {
  if (ad.state === "setting-up") {
    if (ad.launch?.cancelling) return { kind: "none", line: SHEET.cancelling };
    return owner && ad.launch?.sending
      ? { kind: "cancel", body: SHEET.cancelBody }
      : { kind: "none", line: SHEET.settingUp };
  }
  if (ad.state !== "couldnt-finish") return null;
  const left = ad.launch?.left ?? [];
  return left.length > 0
    ? { kind: "left", line: SHEET.couldntFinish(left) }
    : { kind: "none", line: SHEET.couldntFinish(left) };
}

/** What the drawer's foot offers this member for this ad. */
function footOf(ad: AdLiveDto, dto: AdsLiveDto, said: LiveClock, currency: string): SheetFootVM {
  if (dto.account.status === "revoked") return { kind: "none", line: SHEET.signedOut };
  if (dto.account.status === "disconnected") return { kind: "none", line: SHEET.leftInMeta };
  const launching = launchFootOf(ad, dto.can_press);
  if (launching) return launching;
  // An ad made in Meta that ran its course is run again there: its door, with nothing to explain.
  if (over(ad) && ad.made_in_platform) return { kind: "meta", line: "" };
  if (over(ad) || ad.pending !== null) return { kind: "none", line: null };
  // Nothing to press here: the true reason (Ruben, 25 Nov 2026: an owner was told only an owner could), and the ad in Meta.
  if (!dto.can_press) return { kind: "meta", line: SHEET.pressOff[dto.press_off ?? "role"] };
  // An ad made here that Meta turned down is fixed here, or asked about again in Meta (the plan's 4.5 and C8).
  if (ad.made_here && ad.needs === "refused") return { kind: "fix", body: FIX.body };
  // Its last switch went unanswered: nothing is sent again, and Check asks Meta what stands (the plan's 4.7, 7).
  if (ad.state === "unconfirmed") return { kind: "check", line: SHEET.unconfirmed };
  // On, and AI can't answer the people it brings (call 11): why, and the press that stops the spend.
  if (ad.needs === "way_in" && ad.way_in) return { kind: "pause", body: SHEET.wayIn(AD_WAY_IN_SAID[ad.way_in]) };
  if (ad.state !== "paused") return { kind: "pause", body: SHEET.pauseBody };
  // Paused by a remediation of its picture (00676, G16): it runs again only with another picture, here or in Meta.
  if (!ad.resume.ok && ad.resume.why === "picture") return { kind: "held", ...SHEET.cant.picture };
  if (!ad.resume.ok) return { kind: "in-meta", ...SHEET.cant[ad.resume.why] };
  // While AI is stopped no ad is turned on from here (the Ads plan's G17).
  if (dto.stopped_at) return { kind: "none", line: SHEET.stopped };
  // What can spend is switched off here: an ad is paused and ended from here, and turned back on in Meta.
  if (!maySpend(dto)) return { kind: "meta", line: SHEET.spendOff };
  const left = moneyOf(ad.resume.left_minor, currency);
  const day = adDayOf(ad.resume.ends_at, said) ?? "";
  return {
    kind: "resume",
    ask: SHEET.resumeAsk(ad.name),
    body: SHEET.resumeBody({ total: moneyOf(ad.budget?.minor ?? ad.resume.left_minor, currency), left, day }),
    press: SHEET.resume({ left, day: day.replace(/^\S+\s/, "") }),
  };
}

/** Where an ad shows, as Meta holds it: "Facebook", "Facebook and Instagram"; "Meta" where that is not known yet. */
function shownOnOf(shownOn: readonly string[] | null): string {
  const named = (shownOn ?? []).map((place) => SHEET.places[place]).filter((word) => word !== undefined);
  if (named.length === 0) return SHEET.platform;
  return named.length === 1
    ? (named[0] ?? SHEET.platform)
    : `${named.slice(0, -1).join(", ")} and ${named.at(-1) ?? ""}`;
}

/** Meta's own words where it turned down a step of an ad made here, in quotes in the drawer. */
function launchReasonOf(ad: AdLiveDto): SheetVM["reason"] {
  const quoted = ad.state === "couldnt-finish" ? (ad.launch?.said ?? null) : null;
  return quoted ? { label: SHEET.metasReason, words: quoted, note: SHEET.neverRan } : null;
}

/**
 * Meta's count beside the messages from the ad that reached Chanlytics, over the days Meta has settled (contracts
 * adChatsKeptRule): said from ten of Meta's, and when the two part, that the ad and AI's replies are not affected. Only
 * for an ad whose people are counted: one that opens a website or Messenger brings nobody who could reach Chanlytics.
 */
function chatsLineOf(ad: AdLiveDto): SheetVM["chats"] {
  if (!counted(ad) || !ad.chats) return null;
  const rule = adChatsKeptRule(ad.chats);
  if (!rule.said) return null;
  const line = SHEET.chatsKept({ meta: ad.chats.meta, kept: ad.chats.kept, through: dayShort(ad.chats.through) });
  return { line, parted: rule.parted ? SHEET.chatsParted : null };
}

/** The people an ad brought back, as one line (T3): never added to who came, who booked, or what each booked cost. */
export const backLineOf = (
  back: { people: number; booked: number } | undefined,
  from: "this ad" | "an ad",
): string | null =>
  back && back.people > 0 ? SHEET.back({ people: peopleWord(back.people), booked: back.booked, from }) : null;

/** The piece an ad was made from, as its sheet says it: opened in Made by its file, or gone from it (none from a server before). */
const sheetFromOf = ({ made_from: from = null }: AdLiveDto): SheetVM["from"] =>
  from === null
    ? null
    : from.name === null
      ? { name: null, route: null }
      : { name: from.name, route: contentRouteOf({ list: "made", view: "all", open: from.file_id }) };

/**
 * What the drawer shows of the ad before it says anything (Ruben, 25 Nov 2026: "show rather than explain"): what people see,
 * its total and how much of it is spent, its days, the days Meta's numbers cover, and its page in Meta.
 */
function sheetSeenOf(
  ad: AdLiveDto,
  dto: AdsLiveDto,
  said: LiveClock,
  currency: string,
): Pick<SheetVM, "seen" | "spent" | "days" | "theirsLabel" | "metaPage" | "postUrl" | "commenters"> {
  const large = adPictureOf(ad, "large");
  // Meta's 64px picture is drawn as a tile beside the ad's words; a whole image, the business's own or Meta's, large.
  const small = ad.picture !== undefined && ad.picture !== null && "url" in ad.picture && ad.picture.small === true;
  const budget = ad.budget;
  const total = budget?.kind === "total" && budget.left_minor !== null && !budget.shared ? budget : null;
  const used = total ? Math.max(0, total.minor - (total.left_minor ?? 0)) : 0;
  // Its first day said as a date ("24 Nov"), its last as near as it is ("today"): "24 Nov – today".
  const startDay = ad.starts_at ? dayOfIso(ad.starts_at, said.timezone) : "";
  const start = startDay === "" ? null : dayShort(startDay);
  const end = adDayOf(ad.ends_at, said);
  // Meta's numbers are the page's window's: an ad that started inside it has them for all its days, which its days say.
  const inside = start !== null && startDay >= dto.window.from;
  return {
    seen: { picture: large, small, words: ad.words ?? null },
    spent:
      total && total.minor > 0
        ? { said: SHEET.spentOf(moneyOf(used, currency), moneyOf(total.minor, currency)), share: used / total.minor }
        : null,
    days: start && end ? SHEET.days(start, end) : start ? SHEET.since(start) : null,
    theirsLabel: inside ? SHEET.theirsAll : SHEET.theirs,
    metaPage: ad.meta_page ?? ADS_MANAGER,
    postUrl: ad.post_url ?? null,
    commenters: ad.commenters && ad.commenters.count > 0 ? ad.commenters : null,
  };
}

/**
 * Meta's numbers for an ad: times shown, then what its post did where Meta counted it (plays of a video, engagement with
 * the post), then taps, and the chats or forms it started where it opens one; what it spent where its total's bar does
 * not say it already. Theirs, labelled as theirs (decision 0049, call 3).
 */
function metaFiguresOf(ad: AdLiveDto, currency: string, spentSaid: boolean): FigureVM[] {
  const engaged = ad.engaged ?? {};
  const results = ad.theirs.results;
  const whole = (n: number) => n.toLocaleString("en-US");
  return [
    ...(spentSaid ? [] : [{ label: SHEET.spentLabel, value: moneyOf(ad.spend_minor, currency) }]),
    { label: SHEET.shownLabel, value: whole(ad.theirs.impressions) },
    ...(engaged.plays ? [{ label: SHEET.playsLabel, value: whole(engaged.plays) }] : []),
    ...(engaged.engaged ? [{ label: SHEET.engagedLabel, value: whole(engaged.engaged) }] : []),
    // Taps open what an ad leads to: a post's ad leads nowhere past its post, so it says none it never had.
    ...(ad.opens === "other" && ad.theirs.clicks === 0
      ? []
      : [{ label: SHEET.tapsLabel, value: whole(ad.theirs.clicks) }]),
    ...(results === null
      ? []
      : [{ label: ad.opens === "form" ? SHEET.formsLabel : SHEET.chatsLabel, value: String(results) }]),
  ];
}

/** An ad's drawer; null where the page holds no ad of that id. */
export function sheetModel(read: AdsLiveDto, adId: string | null, said: LiveClock): SheetVM | null {
  const dto = standingNow(read, said.nowMs);
  const ad = adId === null ? undefined : dto.ads.find((one) => one.id === adId);
  if (!ad) return null;
  const currency = dto.account.currency ?? ADS_DEFAULT_CURRENCY;
  const each = eachOf([ad], dto, currency);
  const line = sheetLineOf(ad, dto, said, currency);
  const seen = sheetSeenOf(ad, dto, said, currency);
  return {
    id: ad.id,
    version: ad.version,
    where: SHEET.where(shownOnOf(ad.shown_on), ad.opens === "other" ? null : LIVE.opens[ad.opens]),
    name: ad.name,
    line,
    ...stateAndFacts(line),
    tone: toneOf(ad, dto),
    ...seen,
    from: sheetFromOf(ad),
    reason:
      launchReasonOf(ad) ??
      (ad.needs === "refused" && ad.issue
        ? { label: SHEET.metasReason, words: ad.issue, note: ad.spend_minor === 0 ? SHEET.neverRan : null }
        : ad.issue && ad.state === "needs-you"
          ? { label: SHEET.metasReason, words: ad.issue, note: null }
          : null),
    ours: counted(ad)
      ? [
          { label: SHEET.cameLabel, value: String(ad.people) },
          { label: SHEET.bookedLabel, value: String(ad.booked) },
          {
            label: SHEET.eachLabel,
            value: each ? `${each.each}${each.soFar ? " so far" : ""}` : ad.booked > 0 ? SHEET.only(ad.booked) : "—",
          },
        ]
      : [],
    // What it spent is said once: over its total's bar where it has one, among Meta's numbers otherwise.
    theirs: metaFiguresOf(ad, currency, seen.spent !== null),
    chats: chatsLineOf(ad),
    back: counted(ad) ? backLineOf(ad.back, "this ad") : null,
    worth: worthOf([ad], dto, said.word),
    counted: counted(ad),
    ...sheetChangeOf(ad, dto, said),
    foot: footOf(ad, dto, said, currency),
  };
}

/** What an ad made here's drawer changes: its sentence where it runs, and whether End is offered. */
function sheetChangeOf(ad: AdLiveDto, dto: AdsLiveDto, at: LiveClock): Pick<SheetVM, "change" | "ends"> {
  const change = changeSentenceOf(ad, dto, at.nowMs);
  return { change, ends: change?.ends ?? endsAlone(ad, dto) };
}
