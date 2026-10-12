/**
 * Where a page's time goes (decision 0053): the back office's card over the shell's own measures (READY, SETTLED) and
 * the browser's where it names an element (INP, LCP, CLS), read through page_speed() and page_spots() (00412).
 *
 * vitals.ts says what one report is and which page it is of; this says what the reports come to: each page as it
 * opens and as a move reaches it, the parts of a page that are drawn last, and the taps, paints and shifts that cost
 * the most, each by the element's test id. Pure: the rows in, the card's words out.
 */
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
  taps: PageSpeedSpotVM[];
  paints: PageSpeedSpotVM[];
  shifts: PageSpeedSpotVM[];
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
  const said = [
    load ? `opened ${msWords(load.p75)}` : null,
    move ? `moved to ${msWords(move.p75)}${held ? `, ${share(held.samples, move.samples)} from held rows` : ""}` : null,
    read ? `${msWords(read.p75)} when it had to read` : null,
    settled ? `all in ${msWords(settled.p75)}` : null,
    waits ? `waits on ${waits}` : null,
    phone ? `on a phone ${msWords(phone.p75)}` : null,
  ].filter(Boolean);
  const text = said.join(" · ");
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
        r.how === "all" &&
        r.device === "all" &&
        r.warm === "all" &&
        r.samples >= PAGE_SPEED_MIN,
    )
    .sort((a, b) => b.p75 - a.p75 || `${a.page}.${a.part}`.localeCompare(`${b.page}.${b.part}`))
    .slice(0, shown)
    .map((r) => {
      const page = r.page ?? "";
      const verdict = speedVerdict(r.part === "thread" || r.part === "call" ? "within" : "move", r.p75);
      return {
        key: `${page}.${r.part}`,
        label: `${pageSpeedLabel(page)} · ${partLabel(r.part)}`,
        value: msWords(r.p75),
        tone: VERDICT_TONES[verdict],
        hint: `${msWords(r.p75)} · ${countWords(r.samples, "time")} drawn${r.waits_on ? ` · waits on ${r.waits_on}` : ""}`,
      };
    });
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
    .map((s) => {
      const value = vitalValueWords(metric, s.p75);
      const verdict: PageVitalVerdict = s.p75 <= band[0] ? "good" : s.p75 <= band[1] ? "needs work" : "poor";
      const phase = s.phase ? PHASE_WORDS[s.phase] : undefined;
      return {
        key: `${metric}.${s.page}.${s.el}`,
        label: `${s.el} on ${pageSpeedLabel(s.page)}`,
        value,
        tone: VERDICT_TONES[verdict],
        hint: `${value} · ${countWords(s.samples, noun)}${phase ? ` · mostly ${phase}` : ""}`,
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
    taps: [],
    paints: [],
    shifts: [],
    partsSentence: PARTS_SAID,
    spotsSentence: SPOTS_SAID,
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
    taps: spotLines(speed.spots, "INP", 6, "tap"),
    paints: spotLines(speed.spots, "LCP", 4, "paint"),
    shifts: spotLines(speed.spots, "CLS", 4, "shift"),
  };
}
