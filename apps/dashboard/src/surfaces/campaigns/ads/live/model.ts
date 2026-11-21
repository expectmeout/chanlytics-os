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
import { AD_DOORS_COUNTED, adCostRule, adRoute } from "@chanlytics/contracts";
import type { AdLiveDto, AdsLiveDto } from "@chanlytics/contracts";
import { aboutMoneyOf, moneyOf, ADS_DEFAULT_CURRENCY } from "../model/money";
import { dayOfIso, timeOf } from "../model/vm-base";
import { dayWord } from "../model/words";
import { LENS, LIVE, SHEET } from "./words";

/** Whether Chanlytics counts the people of an ad: the tap ends in a message it receives. */
const counted = (ad: Pick<AdLiveDto, "opens">): boolean => AD_DOORS_COUNTED.includes(ad.opens);

/** The standings a row is drawn in amber for: each needs the owner to know it, or to do one thing. */
const WARN_STATES: readonly AdLiveDto["state"][] = ["needs-you", "couldnt-finish", "unconfirmed"];

/** The standings a drawer says in its row's own line alone: nothing is running yet that money or an end would describe. */
const LINE_ALONE: readonly AdLiveDto["state"][] = ["review", "setting-up", "couldnt-finish", "unconfirmed"];

/** Whether an ad's run is over. */
const over = (ad: Pick<AdLiveDto, "state">): boolean => ad.state === "ended" || ad.state === "finished";

/** What the model reads beside the page's read: the zone its days are said in. */
interface Said {
  timezone: string;
}

const dayOf = (iso: string | null, said: Said): string | null => {
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

export interface LiveVM {
  head: { strong: string | null; rest: string };
  /** Under the head: who is charged, or what was spent and what each booked person cost. */
  line: string;
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
    const day = dayOf(dto.account.disconnected_at, said) ?? "";
    const phrase = ad.state === "on" ? LIVE.leftWasOn(day).trim() : LIVE.leftWasPaused;
    return `${LIVE.leftInMeta} · ${checking ? LIVE.wasChecking : phrase}`;
  }
  const updated = dayOf(dto.account.read_at, said);
  const phrase = ad.state === "on" ? LIVE.wasOn : LIVE.wasPaused;
  return [checking ? LIVE.wasChecking : phrase, updated ? LIVE.updated(updated) : null].filter(Boolean).join(" · ");
}

/** The line a row says: where the ad stands, then what the owner needs to know of it. */
function lineOf(ad: AdLiveDto, dto: AdsLiveDto, said: Said, currency: string): string {
  const ends = dayOf(ad.ends_at, said);
  if (dto.account.status !== "connected") return stoppedLineOf(ad, dto, said);
  if (ad.state === "setting-up") return LIVE.settingUp;
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

function rowOf(ad: AdLiveDto, dto: AdsLiveDto, said: Said, currency: string): LiveRowVM {
  const each = ad.booked > 0 ? eachOf([ad], dto, currency) : null;
  const stopped = dto.account.status !== "connected";
  return {
    id: ad.id,
    name: ad.name,
    open: adRoute(ad.id),
    line: lineOf(ad, dto, said, currency),
    badge: !stopped && ad.pending === null && ad.state === "review" ? LIVE.state.review : null,
    tone: WARN_STATES.includes(ad.state) && !stopped ? "warn" : ad.state === "on" && !stopped ? "ok" : "plain",
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
function noticeOf(dto: AdsLiveDto, said: Said): LiveNoticeVM | null {
  const on = dto.ads.filter((ad) => ad.state === "on");
  if (dto.account.status === "revoked") {
    const day = dayOf(dto.account.revoked_at, said) ?? "";
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
  const day = dayOf(dto.account.disconnected_at, said) ?? "";
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
  const updatedDay = dayOf(dto.account.read_at, said);
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
    notice: noticeOf(dto, said),
    stale:
      connected && dto.account.read_failed && dto.account.read_at
        ? LIVE.couldntUpdate(timeOf(dto.account.read_at, said.timezone))
        : null,
    rows: ads.map((ad) => rowOf(ad, dto, said, currency)),
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
  /** Meta's own words for why it will not run, in quotes. */
  reason: { label: string; words: string; note: string | null } | null;
  ours: FigureVM[];
  theirs: FigureVM[];
  /** Whether its people are counted: the list is drawn only where they are. */
  counted: boolean;
  foot: SheetFootVM;
}

/** The drawer's first line: where the ad stands, when it ends, and what is left or what it may spend a day. */
function sheetLineOf(ad: AdLiveDto, dto: AdsLiveDto, said: Said, currency: string): string {
  if (dto.account.status !== "connected" || ad.pending !== null || over(ad) || LINE_ALONE.includes(ad.state))
    return lineOf(ad, dto, said, currency);
  const ends = dayOf(ad.ends_at, said);
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

/** The foot of an ad made here while Turn on's job has it, or after it stopped part way; null for any other. */
function launchFootOf(ad: AdLiveDto): SheetFootVM | null {
  if (ad.state === "setting-up") return { kind: "none", line: SHEET.settingUp };
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
  const launching = launchFootOf(ad);
  if (launching) return launching;
  if (over(ad) || ad.pending !== null) return { kind: "none", line: null };
  if (!dto.can_press) return { kind: "none", line: SHEET.ownerOnly };
  // Its last switch went unanswered: nothing is sent again, and Check asks Meta what stands (the plan's 4.7, 7).
  if (ad.state === "unconfirmed") return { kind: "check", line: SHEET.unconfirmed };
  if (ad.state !== "paused") return { kind: "pause", body: SHEET.pauseBody };
  if (!ad.resume.ok) return { kind: "in-meta", ...SHEET.cant[ad.resume.why] };
  // While AI is stopped no ad is turned on from here (the Ads plan's G17).
  if (dto.stopped_at) return { kind: "none", line: SHEET.stopped };
  const left = moneyOf(ad.resume.left_minor, currency);
  const day = dayOf(ad.resume.ends_at, said) ?? "";
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
    counted: counted(ad),
    foot: footOf(ad, dto, said, currency),
  };
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
