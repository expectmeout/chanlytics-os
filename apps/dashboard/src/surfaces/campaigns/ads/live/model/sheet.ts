/**
 * One ad's drawer, as a model (the Ads plan's 4.5 and 4.9): every sentence the drawer says of an ad, its figures, its
 * foot and what its owner may press, worked out from the page's read (contracts AdsLiveDto) and nothing else. Pure:
 * the read and the zone are handed in. It stands on the list's own lines (../model.ts), so a row and its drawer say
 * the same thing of the same ad, and the list reads nothing of the drawer.
 */
import { AD_WAY_IN_SAID, adChatsKeptRule, contentRouteOf } from "@chanlytics/contracts";
import type { AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";
import { moneyOf, ADS_DEFAULT_CURRENCY } from "../../model/money";
import { dayOfIso } from "../../model/vm-base";
import { dayShort, peopleWord } from "../../model/words";
import { changeSentenceOf, endsAlone, maySpend, type ChangeSentenceVM } from "../change-model";
import { FIX } from "../change-words";
import { over } from "../listed";
import { ADS_MANAGER, LIVE, SHEET } from "../words";
import { counted, type LiveClock } from "../ai-line";
import { worthOf, type WorthVM } from "../worth-model";
import {
  LINE_ALONE,
  adDayOf,
  adPictureOf,
  eachOf,
  lineOf,
  standingNow,
  stateAndFacts,
  toneOf,
  type FigureVM,
  type LiveRowVM,
} from "../model";

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
