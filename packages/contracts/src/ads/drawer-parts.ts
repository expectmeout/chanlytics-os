/**
 * The folds of an ad's drawer that are lists and blocks (page-only): what it brought and the bar a day, the quiet lines, the
 * platform's own numbers and what people typed, the preview and what happens when a person taps, calls or sends the form, and
 * the people it brought. What the tapped words' lists are made of is drawer-edit.ts's. Apart from drawer.ts only for the file
 * limit; drawer.ts hands every name a page needs on. Pure, like the rest of the models.
 */
import { appointmentWords } from "../journey/appointment-word";
import { REPORT_MIN_N } from "../reports/report-tiles";
import { durationWords } from "../shared/clock";
import type { AdDoor, AdPersonRead, AdPlatform, AdRead, AdTheirs, AdsRead } from "./ads";
import { addDays, daysBetween } from "./ads";
import { moneyOf } from "./money";
import { ADS_FRESH_DAYS, ADS_WINDOW_DAYS } from "./rules";
import {
  DASH,
  adPersonWho,
  adQuotes,
  costEach,
  countCtx,
  counted,
  adServiceOf,
  settling,
  started,
  timeOf,
} from "./vm-base";
import type { FigureVM, Totals } from "./vm-base";
import { DOOR, PLATFORM_OWNER, dayShort, dayWord, daysWord } from "./words";
import { DRAWER, PREVIEW } from "./words-drawer";
import { FIGURES, LEDGER, figureWords } from "./words-page";

// ---------------------------------------------------------------------------------------------------------------------
// What it brought, and the bar a day

/** The sentence behind `Too early to judge`: its word opens what each platform says about it. */
export interface JudgeVM {
  /** The first words, which open the sheet; null where the line is plain. */
  word: string | null;
  rest: string;
  /** The sheet behind the word; null otherwise. */
  sheet: string | null;
}

export interface ResultsVM {
  header: string;
  /** `96 wrote · 23 booked`. */
  count: string;
  all: { words: string; to: string } | null;
  facts: FigureVM[];
  /** A counted zero, a quiet start, or too early to judge, said in words. */
  line: JudgeVM | null;
}

/** One column of the bar a day. */
export interface DayVM {
  day: string;
  /** `Sun 27 Sep`. */
  label: string;
  inTouch: number;
  booked: number;
  /** Before the ad existed: a hairline only. */
  before: boolean;
  /** One of the newest three days: drawn lighter. */
  fresh: boolean;
  today: boolean;
  /** The bar's height, 0 to 1, against the busiest day. */
  h: number;
  /** The filled inner part: the share booked since, 0 to 1. */
  f: number;
}

const FACT_LABEL: Record<AdDoor, string> = {
  whatsapp: DRAWER.results.wrote,
  call: DRAWER.results.calls,
  form: DRAWER.results.leftNumber,
};

const FACT_DEF: Record<AdDoor, string> = {
  whatsapp: DRAWER.results.defWrote,
  call: DRAWER.results.defCalls,
  form: DRAWER.results.defNumber,
};

function drawerFacts(ad: AdRead, t: Totals, read: AdsRead): FigureVM[] {
  const w = figureWords(countCtx(read));
  const cost = counted(ad) ? costEach(t.spentMinor, t.booked) : null;
  const dash = (id: FigureVM["id"], label: string, def: string, meta: string | null = null): FigureVM => ({
    id,
    label,
    value: DASH,
    change: null,
    meta,
    definition: def,
    n: null,
    minN: REPORT_MIN_N,
  });
  if (!started(ad)) {
    return [
      dash("spent", w.spent.label, w.spent.def),
      dash("touch", FACT_LABEL[ad.door], FACT_DEF[ad.door]),
      dash("booked", w.booked.label, w.booked.def),
      dash("each", w.each.label, w.each.def),
    ];
  }
  const spent: FigureVM = { ...dash("spent", w.spent.label, w.spent.def), value: moneyOf(t.spentMinor, ad.currency) };
  const touch: FigureVM = {
    ...dash("touch", FACT_LABEL[ad.door], FACT_DEF[ad.door], counted(ad) ? null : LEDGER.googleCount),
    value: String(t.inTouch),
  };
  if (!counted(ad)) {
    return [
      spent,
      touch,
      dash("booked", w.booked.label, w.booked.def, FIGURES.callsNotMatched),
      dash("each", w.each.label, w.each.def, FIGURES.callsNotMatched),
    ];
  }
  const each: FigureVM = {
    ...dash("each", w.each.label, w.each.def),
    value: cost === null ? DASH : moneyOf(cost, ad.currency),
    change: cost !== null && settling([ad], read.today) ? FIGURES.soFar : null,
    meta: cost === null ? null : DRAWER.results.perPerson(moneyOf(t.spentMinor, ad.currency), t.booked),
    n: t.booked,
  };
  return [spent, touch, { ...dash("booked", w.booked.label, w.booked.def), value: String(t.booked) }, each];
}

function drawerCount(ad: AdRead, t: Totals): string {
  if (ad.door === "call") return DRAWER.results.countCalls(t.inTouch);
  return ad.door === "form"
    ? DRAWER.results.countNumber(t.inTouch, t.booked)
    : DRAWER.results.countWrote(t.inTouch, t.booked);
}

/** A counted zero, a quiet start, or too early to judge, said in words; the last opens what each platform says. */
function judgeOf(ad: AdRead, t: Totals, o: { tooEarly: boolean; many: string }): JudgeVM | null {
  if (!started(ad)) return null;
  if (o.tooEarly) {
    const line = DRAWER.results.tooEarly(o.many);
    return { word: line.word, rest: line.rest, sheet: DRAWER.results.tooEarlySheet[ad.platform] };
  }
  const plain = (rest: string): JudgeVM => ({ word: null, rest, sheet: null });
  if (ad.state === "on" && t.spentMinor > 0 && t.inTouch === 0) {
    return plain(DRAWER.results.quietStart(moneyOf(t.spentMinor, ad.currency)));
  }
  if (counted(ad) && t.inTouch > 0 && t.booked === 0) {
    return plain(
      DRAWER.results.zero({ inTouch: t.inTouch, did: DOOR[ad.door].did, spent: moneyOf(t.spentMinor, ad.currency) }),
    );
  }
  return null;
}

export function resultsOf(ad: AdRead, t: Totals, o: { read: AdsRead; tooEarly: boolean; reportTo: string }): ResultsVM {
  const on = started(ad);
  return {
    header: DRAWER.results.header,
    count: on ? drawerCount(ad, t) : "",
    // The door to this ad's numbers in Reports: nothing has been counted until the platform has approved it.
    all: on ? { words: DRAWER.results.report, to: o.reportTo } : null,
    facts: drawerFacts(ad, t, o.read),
    line: judgeOf(ad, t, { tooEarly: o.tooEarly, many: appointmentWords(o.read.appointmentWord).many }),
  };
}

/** The 30 days of the window, then today: one column each, heights against the busiest day. */
function drawerDays(ad: AdRead, today: string): DayVM[] {
  const first = addDays(today, -ADS_WINDOW_DAYS);
  const byDay = new Map(ad.days.map((d) => [d.day, d]));
  const cols = Array.from({ length: ADS_WINDOW_DAYS + 1 }, (_, i) => addDays(first, i));
  const busiest = Math.max(1, ad.todaySoFar, ...ad.days.map((d) => d.inTouch));
  return cols.map((day): DayVM => {
    const row = byDay.get(day);
    const isToday = day === today;
    const inTouch = isToday ? ad.todaySoFar : row ? row.inTouch : 0;
    const booked = row && counted(ad) ? row.booked : 0;
    return {
      day,
      label: dayWord(day),
      inTouch,
      booked,
      before: day < ad.startDay,
      fresh: !isToday && day >= addDays(today, -ADS_FRESH_DAYS),
      today: isToday,
      h: inTouch / busiest,
      f: inTouch > 0 ? booked / inTouch : 0,
    };
  });
}

export interface BarsVM {
  /** The 30 days of the window, then today (an outline, marked `so far today`). */
  days: DayVM[];
  legend: string;
  aria: string;
  todayNote: string;
}

export function adBarsOf(ad: AdRead, t: Totals, read: AdsRead): BarsVM {
  const did = DOOR[ad.door].did;
  let aria: string = DRAWER.bars.ariaNone;
  if (started(ad)) {
    aria =
      ad.door === "call"
        ? DRAWER.bars.ariaCalls({ n: t.inTouch, days: t.days })
        : DRAWER.bars.aria({ n: t.inTouch, did, days: t.days, booked: t.booked });
  }
  return {
    days: drawerDays(ad, read.today),
    legend: ad.door === "call" ? DRAWER.bars.legendCalls : DRAWER.bars.legend(did),
    aria,
    todayNote: DRAWER.results.soFarToday(timeOf(read.readAt, read.timezone)),
  };
}

const drawerGrouped = (n: number): string => n.toLocaleString("en-US");

/** One of the platform's own numbers: what it is called, and the number, or that it was not read. */
export interface TheirsRowVM {
  label: string;
  value: string;
  known: boolean;
}

/** The platform's own numbers, by name, never summed with ours; the line says whose count they are. */
export interface TheirsVM {
  /** The quiet door's words: `Meta's numbers`. */
  door: string;
  rows: TheirsRowVM[];
  note: string;
}

type Counted = readonly [label: string, n: number | null];

/** The numbers each platform returns, in the order an owner asks for them; null is not read. */
function theirCounts(ad: AdRead): Counted[] {
  const x: AdTheirs = ad.theirs;
  const L = DRAWER.quiet.theirs;
  switch (x.platform) {
    case "meta":
      return [[L.saw, x.reach], [L.taps, x.taps], ad.door === "form" ? [L.numbers, x.leads] : [L.chats, x.chats]];
    case "google":
      return [
        [L.impressions, x.impressions],
        [L.clicks, x.clicks],
        [L.calls, x.calls],
        [L.longCalls, x.longCalls],
      ];
    default:
      return [
        [L.impressions, x.impressions],
        [L.reached, x.reach],
        [L.clicks, x.clicks],
        [L.numbers, x.leads],
      ];
  }
}

/** The platform's own numbers: nothing exists to read until the platform has approved the ad. */
function drawerTheirsOf(ad: AdRead): TheirsVM | null {
  if (!started(ad)) return null;
  const owner = PLATFORM_OWNER[ad.platform];
  return {
    door: DRAWER.quiet.theirsDoor(owner),
    rows: theirCounts(ad).map(([label, n]) => ({
      label,
      value: n === null ? DRAWER.quiet.notRead : drawerGrouped(n),
      known: n !== null,
    })),
    note: DRAWER.quiet.theirsNote(owner),
  };
}

/** What people searched on Google, as it groups them, and the searches left out for the owner: read, never changed here. */
export interface TypedVM {
  door: string;
  themes: string[];
  note: string;
  left: { title: string; terms: string[]; note: string } | null;
}

function typedOf(ad: AdRead): TypedVM | null {
  if (ad.platform !== "google" || !started(ad) || ad.searchThemes.length === 0) return null;
  const out = DRAWER.quiet.leftOut;
  return {
    door: DRAWER.quiet.typedDoor,
    themes: [...ad.searchThemes],
    note: DRAWER.quiet.typedNote,
    left: ad.leftOut.length > 0 ? { title: out.title, terms: [...ad.leftOut], note: out.note } : null,
  };
}

/** `12 seconds`, `2 minutes`: how long the median first reply took. */
function replyTime(seconds: number): string {
  return seconds < 60 ? `${seconds} seconds` : durationWords(seconds);
}

export interface QuietVM {
  reply: string | null;
  replyGrey: boolean;
  provenance: string;
  /** The platform's own numbers, a press away; null before it has approved the ad. */
  theirs: TheirsVM | null;
  /** Google: what people typed; null for the others and before anything ran. */
  typed: TypedVM | null;
  extra: string | null;
}

export function quietOf(ad: AdRead): QuietVM {
  const owner = PLATFORM_OWNER[ad.platform];
  return {
    reply: ad.reply ? DRAWER.quiet.reply(replyTime(ad.reply.medianSeconds), ad.reply.n) : null,
    replyGrey: ad.reply !== null && ad.reply.n < REPORT_MIN_N,
    provenance: ad.door === "call" ? DRAWER.quiet.provenanceCalls : DRAWER.quiet.provenance(owner),
    theirs: drawerTheirsOf(ad),
    typed: typedOf(ad),
    extra: ad.platform === "google" ? DRAWER.quiet.googleExtra : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The preview, and what happens when a person taps

export type ThreadVM =
  | {
      kind: "chat";
      title: string;
      greeting: string;
      ready: string | null;
      questions: string[];
      reply: string;
      replyLabel: string;
      note: string;
    }
  | { kind: "call"; title: string; line: string }
  | {
      kind: "form";
      title: string;
      fields: { label: string; note: string }[];
      consent: { title: string; text: string };
      privacy: string;
      notice: string;
      layout: string | null;
      thanks: string;
    };

export interface PreviewVM {
  frame: "feed" | "search" | "video";
  platform: AdPlatform;
  door: AdDoor;
  /** `How it reads`. */
  fold: string;
  /** The closed fold's two-line excerpt. */
  excerpt: string;
  /** Who the ad is shown as. */
  business: string;
  /** A feed ad's headline; Google's three joined ` | `. */
  headline: string;
  headlines: string[];
  text: string;
  /** Google's two description lines. */
  lines: string[];
  path: string;
  /** The capsule under the ad. */
  cta: string;
  caption: string;
  /** Feed | Story | Reel; none where the frame is one shape. */
  frames: string[];
  thread: ThreadVM;
  /** The amber line where the ad quotes a price and the receptionist never does. */
  warn: string | null;
}

function adThreadOf(ad: AdRead, read: AdsRead): ThreadVM {
  const b = read.business;
  const c = ad.copy;
  if (ad.door === "call") return { kind: "call", title: PREVIEW.call, line: PREVIEW.answers(b.name) };
  if (ad.door === "whatsapp") {
    const asks = c.startWith === "questions";
    return {
      kind: "chat",
      title: PREVIEW.tap,
      greeting: c.greeting,
      ready: asks ? null : c.ready,
      questions: asks ? c.questions : [],
      reply: c.reply,
      replyLabel: PREVIEW.replyLabel,
      note: PREVIEW.receptionistWrites,
    };
  }
  return {
    kind: "form",
    title: PREVIEW.form,
    fields: [
      { label: PREVIEW.formName, note: PREVIEW.formFilled },
      { label: PREVIEW.formPhone, note: PREVIEW.formFilled },
    ],
    consent: { title: PREVIEW.consentTitle, text: PREVIEW.consent(b.name) },
    privacy: PREVIEW.privacy(b.site),
    notice: PREVIEW.formNotice,
    layout: ad.platform === "tiktok" ? PREVIEW.layout : null,
    thanks: c.thanks,
  };
}

export function adPreviewOf(ad: AdRead, read: AdsRead): PreviewVM {
  const b = read.business;
  const c = ad.copy;
  const cta = PREVIEW.cta[ad.door];
  const search = ad.platform === "google";
  const frame = search ? "search" : ad.platform === "tiktok" ? "video" : "feed";
  const headline = search ? c.headlines.join(" | ") : c.headline;
  const note = adServiceOf(read, ad.serviceId)?.note ?? "";
  return {
    frame,
    platform: ad.platform,
    door: ad.door,
    fold: PREVIEW.fold,
    excerpt: PREVIEW.excerpt(search ? (c.lines.at(0) ?? headline) : c.text, cta),
    business: ad.shownAs.name,
    headline,
    headlines: c.headlines,
    text: c.text,
    lines: c.lines,
    path: c.path,
    cta,
    caption: search ? PREVIEW.googleCaption(b.line) : PREVIEW.drawn(PLATFORM_OWNER[ad.platform]),
    frames: frame === "feed" ? [...PREVIEW.frames] : [],
    thread: adThreadOf(ad, read),
    warn: read.neverQuotePrices && adQuotes({ ...c, headline }, note) ? PREVIEW.neverQuote : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The people it brought

export interface AdPersonRowVM {
  /** The person's id in People: their page is `clients/<personId>`. */
  personId: string;
  /** Their conversation, where there is one: `inbox/<threadId>`. */
  threadId: string | null;
  name: string;
  initials: string;
  /** `Wrote Mon 5 Oct`. */
  when: string;
  said: string | null;
  /** The conversation's fact, shown only where there is no appointment. */
  talk: { text: string; tone: "warn" | "plain" } | null;
  cal: { text: string; tone: "plain"; note: string | null };
  booked: boolean;
  /** Where the row goes, and what its tip says of it: the conversation that waits on the owner, else the person's page. */
  door: { to: string; tip: string };
}

export interface PeopleVM {
  title: string;
  total: number;
  filters: { id: "booked" | "not-yet"; label: string; n: number }[];
  /** All of those shown, in the order: waiting for you, booked, talking, quiet. */
  rows: AdPersonRowVM[];
  all: { words: string; to: string } | null;
  empty: string | null;
}

/** Waiting for the owner first, then booked, then talking, then quiet. */
function personRank(p: AdPersonRead): number {
  if (p.talk === "waiting" || p.talk === "call") return 0;
  if (p.cal.kind !== "none") return 1;
  return p.talk === "talking" ? 2 : 3;
}

function talkOf(p: AdPersonRead, today: string): AdPersonRowVM["talk"] {
  switch (p.talk) {
    case "waiting":
      return { text: DRAWER.people.waiting(daysWord(daysBetween(p.day, today))), tone: "warn" };
    case "call":
      return { text: DRAWER.people.callNumber, tone: "warn" };
    case "talking":
      return { text: DRAWER.people.talking, tone: "plain" };
    default:
      return { text: DRAWER.people.quietSince(dayShort(p.quietSince ?? p.day)), tone: "plain" };
  }
}

function calOf(p: AdPersonRead): AdPersonRowVM["cal"] {
  const c = p.cal;
  switch (c.kind) {
    case "ahead":
      return { text: DRAWER.people.ahead(dayWord(c.day), c.time), tone: "plain", note: null };
    case "kept":
      return { text: DRAWER.people.kept(dayWord(c.day)), tone: "plain", note: DRAWER.people.marked };
    case "missed":
      return { text: DRAWER.people.missed(dayWord(c.day)), tone: "plain", note: DRAWER.people.marked };
    case "past":
      return { text: DRAWER.people.past(dayWord(c.day)), tone: "plain", note: DRAWER.people.notMarked };
    default:
      return { text: DRAWER.people.nothing, tone: "plain", note: null };
  }
}

/** A row opens the conversation when the move is the owner's and there is one (`inbox/<threadId>`), else the person (`clients/<id>`). */
function drawerDoorOf(p: AdPersonRead): AdPersonRowVM["door"] {
  const waits = p.talk === "waiting" || p.talk === "call";
  if (waits && p.threadId !== null) return { to: `inbox/${p.threadId}`, tip: DRAWER.people.tipConversation(p.name) };
  return { to: `clients/${p.personId}`, tip: DRAWER.people.tipPerson(p.name) };
}

function personRow(p: AdPersonRead, read: AdsRead): AdPersonRowVM {
  const booked = p.cal.kind !== "none";
  const wrote = p.at !== null && p.day === read.today ? DRAWER.people.wroteToday(timeOf(p.at, read.timezone)) : null;
  const day = dayWord(p.day);
  return {
    personId: p.personId,
    threadId: p.threadId,
    ...adPersonWho(p.name),
    when: wrote ?? (p.how === "wrote" ? DRAWER.people.wrote(day) : DRAWER.people.number(day)),
    said: p.said,
    talk: booked ? null : talkOf(p, read.today),
    cal: calOf(p),
    booked,
    door: drawerDoorOf(p),
  };
}

export function adPeopleOf(ad: AdRead, t: Totals, o: { read: AdsRead; peopleTo: string }): PeopleVM {
  const mine = o.read.people.filter((p) => p.adId === ad.id);
  const rows = mine
    .map((p, i) => ({ p, i }))
    .sort((a, b) => personRank(a.p) - personRank(b.p) || a.i - b.i)
    .map(({ p }) => personRow(p, o.read));
  const total = counted(ad) ? t.inTouch : 0;
  let empty: string | null = null;
  if (!counted(ad)) empty = DRAWER.people.emptyCalls;
  else if (!started(ad)) empty = DRAWER.people.emptyReview;
  else if (rows.length === 0) empty = DRAWER.people.emptyQuiet;
  return {
    title: DRAWER.people.title,
    total,
    filters: [
      { id: "booked", label: DRAWER.people.booked, n: t.booked },
      { id: "not-yet", label: DRAWER.people.notYet, n: Math.max(0, total - t.booked) },
    ],
    rows,
    all: total > 0 ? { words: DRAWER.people.all(total), to: o.peopleTo } : null,
    empty,
  };
}
