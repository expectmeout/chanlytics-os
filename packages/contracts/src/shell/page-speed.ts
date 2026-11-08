/**
 * Where a page's time goes (decision 0053): the back office's card over the shell's own measures (READY, SETTLED) and
 * the browser's where it names an element (INP, LCP, CLS), read through page_speed() and page_spots() (00412).
 *
 * vitals.ts says what one report is and which page it is of; this says what the reports come to: each page as it
 * opens and as a move reaches it, the parts of a page that are drawn last, and the taps, paints and shifts that cost
 * the most, each by the element's test id. Pure: the rows in, the card's words out.
 */
import {
  FIRST_ROWS_ENDS,
  FIRST_ROWS_MISSES,
  FIRST_ROWS_PAGES,
  FIRST_ROWS_PART,
  firstRowsEndPart,
  firstRowsMissPart,
  type FirstRowsEnd,
  type FirstRowsMiss,
} from "./first-rows";
import { PAGE_VITAL_BANDS, vitalValueWords, type PageVitalVerdict } from "./vitals";
import type { Tone } from "./tone";

/** How much of the table the card reads: the latest `most` reports of the last `days` (page_speed, page_spots). */
export const PAGE_SPEED_READ = { days: 7, most: 50_000 } as const;
/** A page, a part or an element is named on its own once this many reports say it; fewer is an anecdote. */
export const PAGE_SPEED_MIN = 20;
/** An element is named once this many taps, paints or shifts say it. */
const SPOT_MIN = 10;

/** How a report's page was reached: the document loaded on it, a move from another page, or a move inside it. */
export type PageSpeedHow = "load" | "move" | "within";

/** One row of page_speed(): a metric's 75th percentile over a page, a part, a way in, a device and a cache state. */
export interface PageSpeedRowDto {
  metric: string;
  /** Null: every page. */
  page: string | null;
  /** "": the page itself. */
  part: string;
  how: PageSpeedHow | "all";
  device: "all" | "desk" | "phone" | "unknown";
  /** "held": drawn from rows the tab already held; "read": it had to wait for a read. */
  warm: "all" | "held" | "read" | "unknown";
  samples: number;
  p75: number;
  /** The read the page waited on most often (detail.wait), where it waited on one. */
  waits_on: string | null;
}

/** One row of page_spots(): a metric's 75th percentile at one element of one page, and the phase it went on most. */
export interface PageSpotRowDto {
  metric: string;
  page: string;
  el: string;
  samples: number;
  p75: number;
  phase: string | null;
}

/**
 * How long is good and how long is poor for a page or a part, at the 75th percentile, by how it was reached: a page
 * opened cold has its document, its code and its reads to wait for; a move has the reads alone, or nothing when the
 * rows are held; a move inside a page (a thread opened) is a tap's worth, judged as INP is.
 */
const PAGE_SPEED_BANDS: Readonly<Record<PageSpeedHow, readonly [good: number, poor: number]>> = {
  load: [1500, 3000],
  move: [500, 1200],
  within: PAGE_VITAL_BANDS.INP,
};

/** Each page's name on the card, by the name the table keeps (vitals.ts vitalsPageOf). */
const PAGE_LABELS: Readonly<Record<string, string>> = {
  today: "Today",
  inbox: "Inbox",
  conversations: "Conversations",
  live: "Live",
  people: "People",
  leads: "Leads",
  pipeline: "Pipeline",
  person: "A person's page",
  lists: "Lists",
  calendar: "Calendar",
  reports: "Reports",
  campaigns: "Campaigns",
  broadcasts: "Sent",
  playbooks: "Playbooks",
  templates: "Templates",
  settings: "Settings",
  start: "Getting started",
  other: "Other pages",
};

/** Each part's name on the card, by the name its page gives it (usePartShown). */
const PART_LABELS: Readonly<Record<string, string>> = {
  queue: "the queue",
  setup: "what is left to set up",
  strip: "the strip",
  card: "the day's card",
  look: "Worth a look",
  list: "the list",
  thread: "a thread opened",
  call: "a call opened",
  table: "the table",
  board: "the board",
  hero: "the person",
  [FIRST_ROWS_PART]: "the first paint",
};

function pageSpeedLabel(page: string): string {
  return PAGE_LABELS[page] ?? page.charAt(0).toUpperCase() + page.slice(1);
}

function partLabel(part: string): string {
  return PART_LABELS[part] ?? part;
}

const VERDICT_TONES: Readonly<Record<PageVitalVerdict, Tone>> = { good: "ok", "needs work": "warn", poor: "danger" };

function speedVerdict(how: PageSpeedHow, p75: number): PageVitalVerdict {
  const [good, poor] = PAGE_SPEED_BANDS[how];
  if (p75 <= good) return "good";
  return p75 <= poor ? "needs work" : "poor";
}

/** A duration as a person reads it: "180 ms", "2.4 s". */
const msWords = (v: number): string => vitalValueWords("LCP", v);
const countWords = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export interface PageSpeedPageVM {
  page: string;
  label: string;
  /** The page's number: a move to it, three in four, else its loads'. */
  value: string;
  tone: Tone;
  /** "Opened 1.2 s · moved to 0.4 s, 7 in 10 from held rows · 0.9 s when it had to read · all in 2.1 s · waits on calendar · on a phone 0.8 s". */
  hint: string;
}

export interface PageSpeedPartVM {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  hint: string;
}

export interface PageSpeedSpotVM {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  hint: string;
}

export interface PageSpeedVM {
  sentence: string;
  pages: PageSpeedPageVM[];
  /** What the parts' card says above its lines. */
  partsSentence: string;
  /** What the elements' card says above its lines. */
  spotsSentence: string;
  parts: PageSpeedPartVM[];
  /** What the card of a phone's first paint says above its lines. */
  firstRowsSentence: string;
  /** Each page that keeps a copy: how often a phone opened on it, and why not. */
  firstRows: PageSpeedPartVM[];
  taps: PageSpeedSpotVM[];
  paints: PageSpeedSpotVM[];
  shifts: PageSpeedSpotVM[];
  /** What the card of the steps put off says above its lines. */
  deferredSentence: string;
  /** Each step of decision 0053 put off on the numbers: its number against the line that takes it. */
  deferred: PageSpeedPartVM[];
}

/**
 * The steps of decision 0053 put off on the numbers, each with the page's moves that take it past a line (16 Oct 2026:
 * step 3 waited on a number nobody read). Step 3, People and Pipeline as projections, is taken when People's moves pass
 * 500 ms three in four, or a workspace passes 500 people, which no read here holds: 0053 keeps that one.
 */
const DEFERRED_STEPS = [
  {
    key: "people-projection",
    label: "Step 3, People without everyone",
    page: "people",
    line: 500,
    also: "or when a workspace passes 500 people (decision 0053)",
  },
] as const;

const DEFERRED_SAID = "A speed step put off until its number passes its line: each number against its line.";

/** Each step put off: its page's moves three in four against its line, warn once past it, and not yet where too few. */
function deferredLines(at: Lookup): PageSpeedPartVM[] {
  return DEFERRED_STEPS.map((dEFERREDSTEPS) => {
    const move = at("READY", dEFERREDSTEPS.page, "", "move");
    const taken = `Taken when ${pageSpeedLabel(dEFERREDSTEPS.page)}'s moves pass ${msWords(dEFERREDSTEPS.line)}, three in four, ${dEFERREDSTEPS.also}`;
    if (!move)
      return {
        key: dEFERREDSTEPS.key,
        label: dEFERREDSTEPS.label,
        value: "too few moves",
        tone: "ok",
        hint: `${taken}. Too few moves to say yet.`,
      };
    const past = move.p75 > dEFERREDSTEPS.line;
    return {
      key: dEFERREDSTEPS.key,
      label: dEFERREDSTEPS.label,
      value: `${msWords(move.p75)} of ${msWords(dEFERREDSTEPS.line)}`,
      tone: past ? "warn" : "ok",
      hint: past ? `${taken}. Past its line: take it.` : `${taken}.`,
    };
  });
}

/** The rows by what they are of, for the card's lookups. */
function indexOf(rows: readonly PageSpeedRowDto[]) {
  const by = new Map<string, PageSpeedRowDto>();
  for (const r of rows) by.set(`${r.metric}|${r.page ?? "*"}|${r.part}|${r.how}|${r.device}|${r.warm}`, r);
  return (
    metric: string,
    page: string | null,
    part: string,
    how: PageSpeedHow | "all",
    device: PageSpeedRowDto["device"] = "all",
    warm: PageSpeedRowDto["warm"] = "all",
  ): PageSpeedRowDto | null => {
    const r = by.get(`${metric}|${page ?? "*"}|${part}|${how}|${device}|${warm}`);
    return r && r.samples >= PAGE_SPEED_MIN ? r : null;
  };
}
type Lookup = ReturnType<typeof indexOf>;

/** "7 in 10": a share, in tens, as the card says it. */
function share(part: number, whole: number): string {
  return `${Math.round((part / whole) * 10)} in 10`;
}

/** One page's line: how it opens, how a move reaches it, held and read, all in, what it waits on, and on a phone. */
function pageLine(at: Lookup, page: string): PageSpeedPageVM | null {
  const load = at("READY", page, "", "load");
  const move = at("READY", page, "", "move");
  const lead = move ?? load;
  if (!lead) return null;
  const how: PageSpeedHow = move ? "move" : "load";
  const held = at("READY", page, "", "move", "all", "held");
  const read = at("READY", page, "", "move", "all", "read");
  const settled = at("SETTLED", page, "", "load");
  const phone = at("READY", page, "", how, "phone");
  const waits = read?.waits_on ?? load?.waits_on ?? null;
  const phrases = [
    load ? `opened ${msWords(load.p75)}` : null,
    move ? `moved to ${msWords(move.p75)}${held ? `, ${share(held.samples, move.samples)} from held rows` : ""}` : null,
    read ? `${msWords(read.p75)} when it had to read` : null,
    settled ? `all in ${msWords(settled.p75)}` : null,
    waits ? `waits on ${waits}` : null,
    phone ? `on a phone ${msWords(phone.p75)}` : null,
  ].filter(Boolean);
  const text = phrases.join(" · ");
  const verdict = speedVerdict(how, lead.p75);
  return {
    page,
    label: pageSpeedLabel(page),
    value: msWords(lead.p75),
    tone: VERDICT_TONES[verdict],
    hint: `${text.charAt(0).toUpperCase()}${text.slice(1)} · ${countWords(lead.samples, how === "move" ? "move" : "load")}`,
  };
}

/** The parts drawn last: each part's 75th percentile over every way in, slowest first. */
function partLines(rows: readonly PageSpeedRowDto[], shown: number): PageSpeedPartVM[] {
  return rows
    .filter(
      (r) =>
        r.metric === "READY" &&
        r.page !== null &&
        r.part !== "" &&
        !r.part.startsWith(`${FIRST_ROWS_PART}-`) &&
        r.how === "all" &&
        r.device === "all" &&
        r.warm === "all" &&
        r.samples >= PAGE_SPEED_MIN,
    )
    .sort((a, b) => b.p75 - a.p75 || `${a.page}.${a.part}`.localeCompare(`${b.page}.${b.part}`))
    .slice(0, shown)
    .map((item) => {
      const page = item.page ?? "";
      const verdict = speedVerdict(item.part === "thread" || item.part === "call" ? "within" : "move", item.p75);
      return {
        key: `${page}.${item.part}`,
        label: `${pageSpeedLabel(page)} · ${partLabel(item.part)}`,
        value: msWords(item.p75),
        tone: VERDICT_TONES[verdict],
        hint: `${msWords(item.p75)} · ${countWords(item.samples, "time")} drawn${item.waits_on ? ` · waits on ${item.waits_on}` : ""}`,
      };
    });
}

/** Why a phone drew no copy, as the card says it. */
const MISS_WORDS: Readonly<Record<FirstRowsMiss, string>> = {
  none: "none kept",
  address: "a longer address",
  width: "another width",
  sheets: "styles changed",
  aged: "too old",
};
/** How a copy went before its page's rows came, as the card says it. */
const END_WORDS: Readonly<Record<Exclude<FirstRowsEnd, "page">, string>> = {
  "other-route": "another page",
  unavailable: "page unavailable",
  "held-8s": "held 8 s",
  "held-20s": "held 20 s",
  "no-frame": "no page",
};

/** "styles changed 6, none kept 2": what each word's reports came to, the most first, those with none left out. */
function saidMostFirst(wordSamples: readonly (readonly [words: string, samples: number])[]): string {
  return wordSamples
    .filter(([, samples]) => samples > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([words, samples]) => `${words} ${samples.toLocaleString("en-US")}`)
    .join(", ");
}

/** A phone's opens of one page, those with a copy and those without: its reports by their part, a miss's and an end's counted. */
function firstRowsLine(rows: readonly PageSpeedRowDto[], page: string): PageSpeedPartVM | null {
  const ofPart = (part: string): PageSpeedRowDto | undefined =>
    rows.find(
      (r) =>
        r.metric === "READY" &&
        r.page === page &&
        r.part === part &&
        r.how === "all" &&
        r.device === "all" &&
        r.warm === "all",
    );
  const samplesOf = (part: string): number => ofPart(part)?.samples ?? 0;
  const drawn = samplesOf(FIRST_ROWS_PART);
  const missed = FIRST_ROWS_MISSES.map((reason) => [MISS_WORDS[reason], samplesOf(firstRowsMissPart(reason))] as const);
  const opens = missed.reduce((sum, [, samples]) => sum + samples, drawn);
  if (opens < PAGE_SPEED_MIN) return null;
  const painted = drawn > 0 ? ofPart(FIRST_ROWS_PART) : undefined;
  const stood = ofPart(firstRowsEndPart("page"));
  const notDrawn = saidMostFirst(missed);
  const early = saidMostFirst(
    FIRST_ROWS_ENDS.filter((how) => how !== "page").map(
      (how) => [END_WORDS[how], samplesOf(firstRowsEndPart(how))] as const,
    ),
  );
  const text = [
    painted ? `drew it in ${msWords(painted.p75)}` : null,
    stood ? `stood ${msWords(stood.p75)}` : null,
    notDrawn ? `not drawn: ${notDrawn}` : null,
    early ? `let go early: ${early}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const value = share(drawn, opens);
  return {
    key: `${FIRST_ROWS_PART}.${page}`,
    label: `${pageSpeedLabel(page)} · ${value}`,
    value,
    tone: drawn / opens >= FIRST_ROWS_WELL ? "ok" : "warn",
    hint: `${text.charAt(0).toUpperCase()}${text.slice(1)} · ${countWords(opens, "open")}`,
  };
}

/** The phase the time went on most, as a person reads it. */
const PHASE_WORDS: Readonly<Record<string, string>> = {
  input: "waiting for the page to be free",
  processing: "in the page's own handlers",
  presentation: "drawing what changed",
  ttfb: "waiting for the server",
  load_delay: "before its file was asked for",
  load: "loading its file",
  render_delay: "waiting to be drawn",
};

/** The elements that cost the most for one metric, slowest first. */
function spotLines(
  spots: readonly PageSpotRowDto[],
  metric: "INP" | "LCP" | "CLS",
  shown: number,
  noun: string,
): PageSpeedSpotVM[] {
  const band = PAGE_VITAL_BANDS[metric];
  return spots
    .filter((s) => s.metric === metric && s.samples >= SPOT_MIN && (metric !== "CLS" || s.p75 > band[0] / 2))
    .sort((a, b) => b.p75 - a.p75 || `${a.page}.${a.el}`.localeCompare(`${b.page}.${b.el}`))
    .slice(0, shown)
    .map((spot) => {
      const value = vitalValueWords(metric, spot.p75);
      const verdict: PageVitalVerdict = spot.p75 <= band[0] ? "good" : spot.p75 <= band[1] ? "needs work" : "poor";
      const phase = spot.phase ? PHASE_WORDS[spot.phase] : undefined;
      return {
        key: `${metric}.${spot.page}.${spot.el}`,
        label: `${spot.el} on ${pageSpeedLabel(spot.page)}`,
        value,
        tone: VERDICT_TONES[verdict],
        hint: `${value} · ${countWords(spot.samples, noun)}${phase ? ` · mostly ${phase}` : ""}`,
      };
    });
}

/** "Of 640 moves in the last 7 days, three in four drew their page within 0.3 s; of 120 page loads, within 1.2 s." */
function speedSentence(at: Lookup): string {
  const move = at("READY", null, "", "move");
  const load = at("READY", null, "", "load");
  const days = PAGE_SPEED_READ.days;
  if (move && load)
    return `Of ${countWords(move.samples, "move")} in the last ${days} days, three in four drew their page within ${msWords(move.p75)}; of ${countWords(load.samples, "page load")}, within ${msWords(load.p75)}.`;
  if (move)
    return `Of ${countWords(move.samples, "move")} in the last ${days} days, three in four drew their page within ${msWords(move.p75)}.`;
  if (load)
    return `Of ${countWords(load.samples, "page load")} in the last ${days} days, three in four drew their page within ${msWords(load.p75)}.`;
  return `Not enough pages have said where their time went in the last ${days} days.`;
}

const PARTS_SAID =
  "The parts of a page drawn last, three in four times, from the page's start or from the press that opened them.";
const SPOTS_SAID =
  "The taps that waited longest, the paints drawn last and what moved under a person's eye, each by the element's test id.";
const FIRST_ROWS_SAID = "How often a phone opened on the rows it last showed, and why not when it did not.";
/** The share of a phone's opens drawn from a copy that is as it should be: fewer has a reason to read on the line. */
const FIRST_ROWS_WELL = 0.8;

/** The pages on the card, slowest first: a page enough moves or loads reached. */
const PAGES_SHOWN = 12;
const PARTS_SHOWN = 10;

/**
 * The card: one sentence, a line for each page slowest first, the parts drawn last, and the taps, paints and shifts
 * that cost the most. Null is a read that failed, and says so.
 */
export function pageSpeedWords(
  speed: { rows: readonly PageSpeedRowDto[]; spots: readonly PageSpotRowDto[] } | null,
): PageSpeedVM {
  const none = {
    pages: [],
    parts: [],
    firstRows: [],
    taps: [],
    paints: [],
    shifts: [],
    partsSentence: PARTS_SAID,
    firstRowsSentence: FIRST_ROWS_SAID,
    spotsSentence: SPOTS_SAID,
    deferredSentence: DEFERRED_SAID,
    deferred: [],
  };
  if (speed === null) return { sentence: "Where the pages' time goes could not be read just now.", ...none };
  const at = indexOf(speed.rows);
  const named = [...new Set(speed.rows.map((r) => r.page).filter((p): p is string => p !== null))];
  const pages = named
    .map((p) => pageLine(at, p))
    .filter((p): p is PageSpeedPageVM => p !== null)
    .sort((a, b) => {
      const pa = at("READY", a.page, "", "move") ?? at("READY", a.page, "", "load");
      const pb = at("READY", b.page, "", "move") ?? at("READY", b.page, "", "load");
      return (pb?.p75 ?? 0) - (pa?.p75 ?? 0) || a.page.localeCompare(b.page);
    })
    .slice(0, PAGES_SHOWN);
  return {
    sentence: speedSentence(at),
    pages,
    partsSentence: PARTS_SAID,
    spotsSentence: SPOTS_SAID,
    parts: partLines(speed.rows, PARTS_SHOWN),
    firstRowsSentence: FIRST_ROWS_SAID,
    firstRows: Object.values(FIRST_ROWS_PAGES)
      .map((p) => firstRowsLine(speed.rows, p.page))
      .filter((l): l is PageSpeedPartVM => l !== null),
    taps: spotLines(speed.spots, "INP", 6, "tap"),
    paints: spotLines(speed.spots, "LCP", 4, "paint"),
    shifts: spotLines(speed.spots, "CLS", 4, "shift"),
    deferredSentence: DEFERRED_SAID,
    deferred: deferredLines(at),
  };
}
