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
import {
  AD_DOORS_COUNTED,
  AD_WARN_STATES,
  adChatsKeptRule,
  adCostRule,
  addressOf,
  adRoute,
  daysBetween,
  newAdRoute,
  waitedSince,
} from "@chanlytics/contracts";
import { AD_WAY_IN_SAID, contentRouteOf } from "@chanlytics/contracts";
import type { AdLiveDto, AdsLiveDto, AppointmentWord } from "@chanlytics/contracts";
import { aboutMoneyOf, moneyOf, ADS_DEFAULT_CURRENCY } from "../model/money";
import { dayOfIso, timeOf } from "../model/vm-base";
import { dayShort, dayWord, peopleWord } from "../model/words";
import { changeSentenceOf, endsAlone, type ChangeSentenceVM } from "./change-model";
import { FIX } from "./change-words";
import { ADS_MANAGER, AI_LINE, LENS, LIVE, NEEDS_YOU_LINE, SHEET } from "./words";
import { worthOf, type WorthVM } from "./worth-model";

/** Whether Chanlytics counts the people of an ad: the tap ends in a message it receives. */
const counted = (ad: Pick<AdLiveDto, "opens">): boolean => AD_DOORS_COUNTED.includes(ad.opens);

/** The standings a drawer says in its row's own line alone: nothing is running yet that money or an end would describe. */
const LINE_ALONE: readonly AdLiveDto["state"][] = ["review", "setting-up", "couldnt-finish", "unconfirmed"];

/** Whether an ad's run is over. */
const over = (ad: Pick<AdLiveDto, "state">): boolean => ad.state === "ended" || ad.state === "finished";

/** What the model reads beside the page's read: the zone its days are said in, and the moment a wait is said at. */
interface Said {
  timezone: string;
  nowMs: number;
  /** What this workspace calls a booking (surfaces/workspace-word.ts): an appointment where the page hands none. */
  word?: AppointmentWord;
}

const adDayOf = (iso: string | null, said: Said): string | null => {
  const day = iso === null ? "" : dayOfIso(iso, said.timezone);
  return day === "" ? null : dayWord(day);
};

/** One row of the list. */
export interface LiveRowVM {
  id: string;
  name: string;
  /** Its address, which opens its drawer. */
  open: string;
  line: string;
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

/**
 * AI's one line (the Ads plan's 6.3): what it proposes, as a question its press answers. `first` opens New ad by its
 * address, where AI writes the ad and nothing runs until the owner turns it on; `extend` opens Meta's own page, where an
 * ad made there is kept going.
 */
export type AiLineVM =
  | { kind: "first"; text: string; route: string }
  | { kind: "extend"; text: string; href: string }
  /** An ad on whose chat AI can't answer: the line is its Pause, with the version it was drawn from. */
  | { kind: "way_in"; text: string; ad: { id: string; version: number } };

/** Who an ad brought and needs you now, as one amber line: how many, then who, and the press that opens them. */
export interface NeedsYouLineVM {
  title: string;
  who: string;
  /** The longest wait's conversation, which the Inbox opens in Needs you beside the rest. */
  open: string;
}

export interface LiveVM {
  head: { strong: string | null; rest: string };
  /** Under the head: who is charged, or what was spent and what each booked person cost. */
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

/** The ads a page lists: every one still running or waiting, and a finished one only while it has numbers to show. */
const shown = (dto: AdsLiveDto): AdLiveDto[] =>
  dto.ads.filter((ad) => !over(ad) || ad.people > 0 || ad.spend_minor > 0);

/** The cost for each person who booked, across the ads whose people are counted; null under five booked. */
function eachOf(ads: readonly AdLiveDto[], dto: AdsLiveDto, currency: string): { each: string; soFar: boolean } | null {
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
 * A row's line where the account is no longer read (signed out by Meta, or let go): what the ad was doing when it last
 * was. An ad Meta was still checking was neither on nor paused, and is said as what it was.
 */
function stoppedLineOf(ad: AdLiveDto, dto: AdsLiveDto, said: Said): string {
  const checking = ad.state === "review";
  if (dto.account.status === "disconnected") {
    const day = adDayOf(dto.account.disconnected_at, said) ?? "";
    const phrase = ad.state === "on" ? LIVE.leftWasOn(day).trim() : LIVE.leftWasPaused;
    return `${LIVE.leftInMeta} · ${checking ? LIVE.wasChecking : phrase}`;
  }
  const updated = adDayOf(dto.account.read_at, said);
  const phrase = ad.state === "on" ? LIVE.wasOn : LIVE.wasPaused;
  return [checking ? LIVE.wasChecking : phrase, updated ? LIVE.updated(updated) : null].filter(Boolean).join(" · ");
}

/** The line a row says: where the ad stands, then what the owner needs to know of it. */
function lineOf(ad: AdLiveDto, dto: AdsLiveDto, said: Said, currency: string): string {
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
  const parts = ad.made_in_platform
    ? [LIVE.madeInMeta, counted(ad) ? null : LIVE.opensWord(LIVE.opens[ad.opens])]
    : [ends ? LIVE.ends(ends) : null, left];
  return [LIVE.state[ad.state], ...parts].filter(Boolean).join(" · ");
}

function liveRowOf(ad: AdLiveDto, dto: AdsLiveDto, said: Said, currency: string): LiveRowVM {
  const each = ad.booked > 0 ? eachOf([ad], dto, currency) : null;
  const stopped = dto.account.status !== "connected";
  return {
    id: ad.id,
    name: ad.name,
    open: adRoute(ad.id),
    line: lineOf(ad, dto, said, currency),
    badge: !stopped && ad.pending === null && ad.state === "review" ? LIVE.state.review : null,
    tone: AD_WARN_STATES.includes(ad.state) && !stopped ? "warn" : ad.state === "on" && !stopped ? "ok" : "plain",
    endTop: counted(ad)
      ? LIVE.bookedCell(ad.booked)
      : ad.spend_minor > 0
        ? LIVE.spent(moneyOf(ad.spend_minor, currency))
        : null,
    endSub: counted(ad) ? (each ? LIVE.eachCell(each.each) : null) : LIVE.notCounted,
  };
}

const namesOf = (ads: readonly AdLiveDto[]): string => {
  const names = ads.map((ad) => ad.name);
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
};

/** The notice at the top, where the account is no longer connected. */
function liveNoticeOf(dto: AdsLiveDto, said: Said): LiveNoticeVM | null {
  const on = dto.ads.filter((ad) => ad.state === "on");
  if (dto.account.status === "revoked") {
    const day = adDayOf(dto.account.revoked_at, said) ?? "";
    const names = namesOf(on);
    return {
      title: LIVE.signedOut.title(day),
      body:
        on.length === 0
          ? LIVE.signedOut.none
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
function leftOnNotice(dto: AdsLiveDto, said: Said): LiveNoticeVM | null {
  const on = dto.ads.filter((ad) => ad.state === "on");
  const checking = dto.ads.filter((ad) => ad.state === "review");
  const left = [...on, ...checking];
  if (left.length === 0) return null;
  const day = adDayOf(dto.account.disconnected_at, said) ?? "";
  const door = LIVE.disconnected.openMeta;
  const words = LIVE.disconnected;
  if (checking.length === 0)
    return { title: words.title(namesOf(on), on.length > 1), body: words.body(day, on.length > 1), door };
  if (on.length === 0)
    return { title: words.checkingTitle(namesOf(checking)), body: words.checkingBody(day, checking.length > 1), door };
  return { title: words.bothTitle(namesOf(left)), body: words.bothBody(day), door };
}

/** The notes under the list: what an ad made in Meta can do here, whose people are not counted, and the unnamed. */
function notesOf(dto: AdsLiveDto, rows: readonly AdLiveDto[]): string[] {
  const connected = dto.account.status === "connected";
  const uncounted = [...new Set(rows.filter((ad) => !counted(ad)).map((ad) => LIVE.opens[ad.opens]))];
  return [
    connected && rows.some((ad) => ad.made_in_platform) ? LIVE.adoptedNote : null,
    ...uncounted.map((what) => LIVE.notCountedNote(what)),
    dto.unnamed.people > 0 ? LIVE.unnamed(dto.unnamed.people, dto.unnamed.booked) : null,
    dto.elsewhere.people > 0 ? LIVE.elsewhere(dto.elsewhere.people, dto.elsewhere.booked) : null,
  ].flatMap((note) => note ?? []);
}

/** Everyone an ad brought in the window, and who of them booked: the listed ads', the unnamed and the ones elsewhere. */
function allBroughtOf(dto: AdsLiveDto): { came: number; booked: number } {
  const beside = [dto.unnamed, dto.elsewhere];
  return {
    came: [...dto.ads.map((ad) => ad.people), ...beside.map((one) => one.people)].reduce((sum, n) => sum + n, 0),
    booked: [...dto.ads.map((ad) => ad.booked), ...beside.map((one) => one.booked)].reduce((sum, n) => sum + n, 0),
  };
}

/**
 * Where an account's first read stands: `reading` while one just connected has not been read, `failed` where its first
 * read failed, null once it has been read (or where it is not connected). Until then nothing is known of its ads, and
 * the page never says Meta shows none.
 */
export function firstReadOf(account: AdsLiveDto["account"]): "reading" | "failed" | null {
  if (account.status !== "connected" || account.read_at !== null) return null;
  return account.read_failed ? "failed" : "reading";
}

/** AI offers to keep an ad going that ends within this many days and brought at least this many people (0050, call 12). */
const EXTEND_WHEN = { days: 3, people: 10 } as const;

/**
 * The ad AI offers to keep going: on, ending within days, having brought people; the soonest to end, then the most.
 * Only one made in Meta, which Meta's own page keeps going: an ad made here keeps going from its drawer (the plan's 4.5),
 * and until that press is there the line would offer what no press can do.
 */
function endingSoonOf(dto: AdsLiveDto, clock: Said): { ad: AdLiveDto; day: string } | null {
  const soon = dto.ads.flatMap((ad) => {
    if (!ad.made_in_platform || ad.state !== "on" || ad.pending !== null) return [];
    if (!counted(ad) || ad.people < EXTEND_WHEN.people || ad.ends_at === null) return [];
    const end = dayOfIso(ad.ends_at, clock.timezone);
    const left = end === "" ? -1 : daysBetween(dto.today, end);
    return left >= 0 && left <= EXTEND_WHEN.days ? [{ ad, end }] : [];
  });
  const [first] = soon.sort((one, other) => one.end.localeCompare(other.end) || other.ad.people - one.ad.people);
  return first ? { ad: first.ad, day: dayWord(first.end) } : null;
}

/**
 * AI's one line (the Ads plan's 6.3; decision 0050, call 12): rules in code, no model asked, and it only proposes. It
 * speaks only on a connected account that has been read, and never while AI is stopped, when no ad is turned on and no
 * draft is written. First an ad spending while AI can't answer the people it brings (decision 0050, call 11), since
 * that money buys nothing, with its Pause, for the owner; then an ad worth keeping going, since its days run out; then,
 * on an account whose card is ready where no ad was made here yet, the first one. An ad Meta stopped is its own row's amber line, with Meta's
 * reason in its drawer, so AI does not say it again. A full calendar's pause waits for a read of the calendar the page
 * does not make.
 */
function aiLineOf(dto: AdsLiveDto, clock: Said): AiLineVM | null {
  if (dto.account.status !== "connected" || firstReadOf(dto.account) !== null || dto.stopped_at !== null) return null;
  const closed = dto.can_press ? dto.ads.find((ad) => ad.needs === "way_in" && ad.pending === null) : undefined;
  if (closed)
    return { kind: "way_in", text: AI_LINE.wayIn(closed.name), ad: { id: closed.id, version: closed.version } };
  const ending = endingSoonOf(dto, clock);
  if (ending)
    return {
      kind: "extend",
      text: AI_LINE.extend({ name: ending.ad.name, people: ending.ad.people, day: ending.day }),
      href: ADS_MANAGER,
    };
  if (!dto.account.ready || dto.ads.some((ad) => !ad.made_in_platform)) return null;
  return { kind: "first", text: AI_LINE.first(dto.ads.length > 0), route: newAdRoute() };
}

/** How long a person has waited, in the house's short form ("6d"); null where their wait has no moment kept. */
function waitedOf(since: string | null, nowMs: number): string | null {
  const at = since === null ? Number.NaN : Date.parse(since);
  return Number.isFinite(at) ? waitedSince(at, nowMs) : null;
}

/**
 * Who an ad brought and needs you now (the Ads plan's 4.4): how many, then each the read names (the longest waiting)
 * with how long, and how many more. The press opens the longest wait's conversation: the Inbox opens it in Needs you,
 * where the others are listed beside it, whichever list it last showed.
 */
function needsYouLineOf(dto: AdsLiveDto, clock: Said): NeedsYouLineVM | null {
  const { count, people } = dto.needs_you;
  const [longest] = people;
  if (count === 0 || !longest) return null;
  const rest = count - people.length;
  return {
    title: NEEDS_YOU_LINE.title(count),
    who: [
      ...people.map((person) => NEEDS_YOU_LINE.person(person.name, waitedOf(person.since, clock.nowMs))),
      ...(rest > 0 ? [NEEDS_YOU_LINE.more(rest)] : []),
    ].join(" · "),
    open: addressOf({ kind: "conversation", id: longest.conversation_id }),
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

/** The page. */
export function liveModel(dto: AdsLiveDto, said: Said): LiveVM {
  const currency = dto.account.currency ?? ADS_DEFAULT_CURRENCY;
  const ads = shown(dto);
  const { came, booked } = allBroughtOf(dto);
  const spent = dto.ads.reduce((sum, ad) => sum + ad.spend_minor, 0);
  const each = eachOf(dto.ads, dto, currency);
  const connected = dto.account.status === "connected";
  const updatedDay = adDayOf(dto.account.read_at, said);
  const spentWords = LIVE.spent(moneyOf(spent, currency));
  const line =
    came === 0 && spent === 0
      ? LIVE.money
      : !connected && updatedDay
        ? `${spentWords} · ${LIVE.updated(updatedDay)}`
        : each
          ? `${spentWords} · ${LIVE.each(each.each, each.soFar)}`
          : spentWords;
  return {
    head: liveHeadOf(dto, { came, booked }, ads.length),
    line,
    ai: aiLineOf(dto, said),
    needsYou: needsYouLineOf(dto, said),
    notice: liveNoticeOf(dto, said),
    stale:
      connected && dto.account.read_failed && dto.account.read_at
        ? LIVE.couldntUpdate(timeOf(dto.account.read_at, said.timezone))
        : null,
    rows: ads.map((ad) => liveRowOf(ad, dto, said, currency)),
    notes: notesOf(dto, ads),
    again: dto.account.status === "disconnected" ? LIVE.disconnected.again : null,
    empty: connected && firstReadOf(dto.account) === null && dto.ads.length === 0 ? LIVE.noAds.rest : null,
  };
}

/** One figure of the drawer: its label and what it says. */
export interface FigureVM {
  label: string;
  value: string;
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
  | { kind: "none"; line: string | null };

export interface SheetVM {
  id: string;
  version: number;
  /** Where it shows, then what a tap opens: `Facebook · WhatsApp`. */
  over: string;
  name: string;
  line: string;
  /** That it was made in Meta, where it was. */
  made: string | null;
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
function sheetLineOf(ad: AdLiveDto, dto: AdsLiveDto, said: Said, currency: string): string {
  if (dto.account.status !== "connected" || ad.pending !== null || over(ad) || LINE_ALONE.includes(ad.state))
    return lineOf(ad, dto, said, currency);
  const ends = adDayOf(ad.ends_at, said);
  const budget = ad.budget;
  const money =
    budget === null
      ? null
      : budget.kind === "daily"
        ? LIVE.aDay(moneyOf(budget.minor, currency))
        : budget.left_minor !== null && !budget.shared
          ? LIVE.left(moneyOf(budget.left_minor, currency))
          : null;
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
function footOf(ad: AdLiveDto, dto: AdsLiveDto, said: Said, currency: string): SheetFootVM {
  if (dto.account.status === "revoked") return { kind: "none", line: SHEET.signedOut };
  if (dto.account.status === "disconnected") return { kind: "none", line: SHEET.leftInMeta };
  const launching = launchFootOf(ad, dto.can_press);
  if (launching) return launching;
  if (over(ad) || ad.pending !== null) return { kind: "none", line: null };
  if (!dto.can_press) return { kind: "none", line: SHEET.ownerOnly };
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
const backLineOf = (back: { people: number; booked: number } | undefined, from: "this ad" | "an ad"): string | null =>
  back && back.people > 0 ? SHEET.back({ people: peopleWord(back.people), booked: back.booked, from }) : null;

/** The piece an ad was made from, as its sheet says it: opened in Made by its file, or gone from it (none from a server before). */
const sheetFromOf = ({ made_from: from = null }: AdLiveDto): SheetVM["from"] =>
  from === null
    ? null
    : from.name === null
      ? { name: null, route: null }
      : { name: from.name, route: contentRouteOf({ list: "made", view: "all", open: from.file_id }) };

/** An ad's drawer; null where the page holds no ad of that id. */
export function sheetModel(dto: AdsLiveDto, adId: string | null, said: Said): SheetVM | null {
  const ad = adId === null ? undefined : dto.ads.find((one) => one.id === adId);
  if (!ad) return null;
  const currency = dto.account.currency ?? ADS_DEFAULT_CURRENCY;
  const each = eachOf([ad], dto, currency);
  const results = ad.theirs.results;
  return {
    id: ad.id,
    version: ad.version,
    over: `${shownOnOf(ad.shown_on)} · ${LIVE.opens[ad.opens].replace(/^[a-z]/, (first) => first.toUpperCase())}`,
    name: ad.name,
    line: sheetLineOf(ad, dto, said, currency),
    made: ad.made_in_platform ? SHEET.madeInMeta : null,
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
    theirs: [
      { label: SHEET.spentLabel, value: moneyOf(ad.spend_minor, currency) },
      { label: SHEET.shownLabel, value: ad.theirs.impressions.toLocaleString("en-US") },
      { label: SHEET.tapsLabel, value: ad.theirs.clicks.toLocaleString("en-US") },
      ...(results === null
        ? []
        : [{ label: ad.opens === "form" ? SHEET.formsLabel : SHEET.chatsLabel, value: String(results) }]),
    ],
    chats: chatsLineOf(ad),
    back: counted(ad) ? backLineOf(ad.back, "this ad") : null,
    worth: worthOf([ad], dto, said.word),
    counted: counted(ad),
    ...sheetChangeOf(ad, dto, said),
    foot: footOf(ad, dto, said, currency),
  };
}

/** What an ad made here's drawer changes: its sentence where it runs, and whether End is offered. */
function sheetChangeOf(ad: AdLiveDto, dto: AdsLiveDto, at: Said): Pick<SheetVM, "change" | "ends"> {
  const change = changeSentenceOf(ad, dto, at.nowMs);
  return { change, ends: change?.ends ?? endsAlone(ad, dto) };
}

/** One ad as Reports › Ads lists it: Chanlytics' count, then Meta's spend, each a column of its own. */
interface LensRowVM {
  id: string;
  name: string;
  /** Who wrote to AI from it, and who of them booked; a dash where its people are not counted. */
  came: string;
  booked: string;
  each: string;
  /** Meta's number. */
  spent: string;
}

interface LensVM {
  head: string;
  figures: FigureVM[];
  /** Everyone an ad brought back, on a line of its own under the figures (T3); null for nobody. */
  back: string | null;
  /** What the counted ads' bookings are worth beside what those ads spent (T6); null with nothing to say. */
  worth: WorthVM | null;
  rows: LensRowVM[];
  notes: string[];
}

const DASH = "—";

/** Reports › Ads in its first form: the page's own numbers as figures and a table, over the same thirty days. */
export function lensModel(dto: AdsLiveDto, said: Said): LensVM {
  const currency = dto.account.currency ?? ADS_DEFAULT_CURRENCY;
  const page = liveModel(dto, said);
  const { came, booked } = allBroughtOf(dto);
  const spent = dto.ads.reduce((sum, ad) => sum + ad.spend_minor, 0);
  const each = eachOf(dto.ads, dto, currency);
  const rows = shown(dto).map((ad): LensRowVM => {
    const one = eachOf([ad], dto, currency);
    return {
      id: ad.id,
      name: ad.name,
      came: counted(ad) ? String(ad.people) : DASH,
      booked: counted(ad) ? String(ad.booked) : DASH,
      each: one ? one.each : counted(ad) && ad.booked > 0 ? SHEET.only(ad.booked) : DASH,
      spent: moneyOf(ad.spend_minor, currency),
    };
  });
  // The people no listed ad holds, a row each: counted, with no spend of Meta's to set beside them.
  const beside = (id: string, name: string, one: { people: number; booked: number }): LensRowVM[] =>
    one.people > 0 ? [{ id, name, came: String(one.people), booked: String(one.booked), each: DASH, spent: DASH }] : [];
  const unnamed = [
    ...beside("unnamed", LENS.unnamed, dto.unnamed),
    ...beside("elsewhere", LENS.elsewhere, dto.elsewhere),
  ];
  return {
    head: `${page.head.strong ?? ""}${page.head.rest}`,
    figures: [
      { label: LENS.came, value: String(came) },
      { label: LENS.booked, value: String(booked) },
      {
        label: LENS.each,
        value: each ? `${each.each}${each.soFar ? " so far" : ""}` : booked > 0 ? SHEET.only(booked) : DASH,
      },
      { label: LENS.spent, value: moneyOf(spent, currency) },
    ],
    back: backLineOf(dto.back, "an ad"),
    worth: worthOf(dto.ads, dto, said.word),
    rows: [...rows, ...unnamed],
    // The two quiet lines are rows of the table here, so they are not said twice.
    notes: [
      LENS.counted,
      ...page.notes.filter(
        (note) => note !== LIVE.adoptedNote && note !== LIVE.elsewhere(dto.elsewhere.people, dto.elsewhere.booked),
      ),
    ],
  };
}
