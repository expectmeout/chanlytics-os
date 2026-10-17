/**
 * Field data: how fast the pages people use are, from their own browsers (plan 2026-09-27, Performance; decision 0053).
 *
 * The bundle's budget says what the workspace route ships; this says what people then see. The shell hears the
 * browser's five numbers for each page load and for each move inside the app the browser counts as a navigation
 * (web-vitals, src/client/field-data-reporter.ts), and measures two of its own (src/client/page-speed.ts): a page, or a
 * part of one, drawn with its rows (READY), and everything the page draws read (SETTLED). It sends them when the page
 * is hidden, and POST /api/v1/vitals keeps each under the id it was given (00255, 00412). The back office reads the
 * 75th percentile of each. A report names a page, a part of it, a metric, a number and what the time went on (a read's
 * route, an element's test id): nobody's person, nobody's workspace.
 */
// First, before this module builds a schema: zod-config.ts says why. A page's bundle takes this module alone
// (contracts-browser.mjs), never the entry that imports the setting first.
import "../zod-config";
import * as z from "zod/mini";
import { MIN_MS } from "../shared/time";
import { ROUTE_WORDS } from "./address";
import type { Tone } from "./tone";

/** The browser's five, in the order the back office says them (web-vitals). */
export const PAGE_VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type PageVital = (typeof PAGE_VITALS)[number];
/**
 * The shell's own two (decision 0053): a page or a part of one drawn with its rows, from the press that asked for it
 * (or the document's start), and every surface the page draws read. What a person waits for, which the browser's five
 * cannot say: a paint of "Reading…" is a contentful paint.
 */
const PAGE_SPEED = ["READY", "SETTLED"] as const;
export type PageSpeedMetric = (typeof PAGE_SPEED)[number];
/** Every metric the table keeps. Held to page_vitals.metric (shared/schema-sets.ts). */
export const PAGE_METRICS = [...PAGE_VITALS, ...PAGE_SPEED] as const;
export type PageMetric = (typeof PAGE_METRICS)[number];
/** The two shapes of screen a report is from: the kit's one phone width (kit.css, 900px) and under is a phone. Held to page_vitals.device. */
export const PAGE_DEVICES = ["desk", "phone"] as const;
export type PageDevice = (typeof PAGE_DEVICES)[number];
/** The media query the shell reads a phone by: the kit's one phone width. */
export const PAGE_PHONE_QUERY = "(max-width: 900px)";

/**
 * Each metric's thresholds at the 75th percentile, as web.dev states them: good at or under the first, poor over the
 * second. Milliseconds, except CLS, which is a share of the page that moved.
 */
export const PAGE_VITAL_BANDS: Readonly<Record<PageVital, readonly [good: number, poor: number]>> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

/** What each says, for a person who does not know the acronym. */
export const PAGE_VITAL_WORDS: Readonly<Record<PageVital, string>> = {
  LCP: "Drawn",
  INP: "Answers a tap",
  CLS: "Holds still",
  FCP: "First paint",
  TTFB: "First byte",
};

/** A page's name as the table keeps it (page_vitals.page), and a part's (page_vitals.part): a word in lower case. */
export const PAGE_NAME = /^[a-z][a-z0-9-]{0,31}$/;
/** The browser's id for one metric of one load (web-vitals: "v6-1727430000000-8123456789012"), or the shell's own. */
const VITAL_ID = /^[A-Za-z0-9-]{1,64}$/;
/** The deploy a report came from (NEXT_PUBLIC_BUILD_SHA, its first twelve), or "dev" (page_vitals.build). */
export const PAGE_BUILD = /^[0-9a-z]{3,40}$/;
/** No report is larger: ten minutes, in milliseconds (page_vitals.value). */
const VITAL_CEILING = 10 * MIN_MS;
/** The most reports one beacon carries: a tab that moved all morning sends its moves in several. */
export const PAGE_VITALS_PER_BEACON = 100;

/**
 * A word of what the time went on: a read's route (`contacts`, `reports/campaigns`), an element's test id
 * (`inbox-approve`, `button.kit-btn`), a phase's name. Never an id, a name or anything a person wrote: the shell
 * makes these from the code's own words (page-speed.ts readKeyOf, field-data-reporter.ts targetOf).
 */
const DETAIL_WORD = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;
const detailWord = () => z.optional(z.string().check(z.regex(DETAIL_WORD)));
const detailMs = () => z.optional(z.number().check(z.minimum(0), z.maximum(VITAL_CEILING)));

/**
 * What a report's time went on, where the shell could tell (page_vitals.detail). For READY and SETTLED: the read that
 * landed last before the page was drawn (`wait`, its route), how long it took and how much of that the server said
 * was its own (`server_ms`, from Server-Timing, and its database calls, `db_ms` over `db_n`), a script chunk that had to
 * arrive (`chunk_ms`), and what was left for drawing (`render_ms`). For the browser's: the element (`el`), the
 * interaction's type and its three phases, the longest script's share, the largest paint's four parts, the largest
 * shift's score, the document's state, and the phase the time went on most (`phase`).
 */
const PageVitalDetail = z.object({
  wait: detailWord(),
  wait_ms: detailMs(),
  server_ms: detailMs(),
  db_ms: detailMs(),
  db_n: z.optional(z.int().check(z.minimum(0), z.maximum(10_000))),
  chunk_ms: detailMs(),
  render_ms: detailMs(),
  el: detailWord(),
  type: z.optional(z.enum(["pointer", "keyboard"])),
  input_ms: detailMs(),
  processing_ms: detailMs(),
  presentation_ms: detailMs(),
  script_ms: detailMs(),
  ttfb_ms: detailMs(),
  load_delay_ms: detailMs(),
  load_ms: detailMs(),
  render_delay_ms: detailMs(),
  shift: z.optional(z.number().check(z.minimum(0), z.maximum(100))),
  state: z.optional(z.enum(["loading", "dom-interactive", "dom-content-loaded", "complete"])),
  phase: detailWord(),
});
export type PageVitalDetailDto = z.infer<typeof PageVitalDetail>;

/**
 * One metric of one load or move, as the browser or the shell measured it. The shell drops a report this refuses
 * before it sends (a background tab's LCP can outlast the ceiling), so one odd number never costs the load its other
 * reports; the route reads the same report inside what the shell sends (vitals-schema.ts PageVitalsInput).
 *
 * `page` is the page the report is of, where it is not the one the load landed on (a move's); `part` the part of it
 * (`queue`), absent for the page itself; `from` the page a move left, absent for a load, and the page itself for a move
 * inside it (a thread opened); `warm` whether what it drew was already held when it began (the tab's cache, a view
 * held); `detail` what the time went on.
 *
 * In zod/mini, which the browser's contracts carry (decision 0024, the browser's entry): every page reports its load,
 * so this check is on every page, and the classic API it was written in was 89 KB of every page's script.
 */
export const PageVitalReport = z.object({
  id: z.string().check(z.regex(VITAL_ID, { error: "A report needs the browser's id." })),
  name: z.enum(PAGE_METRICS, { error: "A report names one of the seven." }),
  value: z.number().check(z.minimum(0), z.maximum(VITAL_CEILING)),
  page: z.optional(z.string().check(z.regex(PAGE_NAME))),
  part: z.optional(z.string().check(z.regex(PAGE_NAME))),
  from: z.optional(z.string().check(z.regex(PAGE_NAME))),
  warm: z.optional(z.boolean()),
  detail: z.optional(PageVitalDetail),
});
export type PageVitalReportDto = z.infer<typeof PageVitalReport>;

/**
 * People's scopes, each a page of its own in the field data (decision 0053): what is drawn differs, and so does its time.
 * A person's page is theirs on every tab (`clients/<id>/history`): a tab's press was counted as a visit to the People list
 * (the wiring's second audit, S5-2).
 */
const PEOPLE_SCOPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^leads(:|$)/, "leads"],
  [/^pipeline(:|$)/, "pipeline"],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/|$)/i, "person"],
];

/**
 * The page a report is of, from the shell's route (address.ts routeOfAddress): its first segment in the product's
 * word (contracts ROUTE_WORDS: "settings" for "admin", "people" for "clients"), People's scopes by their own names
 * ("leads", "pipeline", "person" for "clients/<id>"), Today for the workspace's own address, and "other" for a route
 * the table would refuse.
 */
export function vitalsPageOf(route: string): string {
  const path = (route ?? "").split("?")[0] ?? "";
  const at = path.indexOf("/");
  const head = at < 0 ? path : path.slice(0, at);
  const rest = at < 0 ? "" : path.slice(at + 1);
  if (head === "") return "today";
  if (head === "clients") return PEOPLE_SCOPES.find(([test]) => test.test(rest))?.[1] ?? "people";
  const word = ROUTE_WORDS[head] ?? head;
  return PAGE_NAME.test(word) ? word : "other";
}

/**
 * Each page's first part (decision 0053): the one its READY is said by, a page drawn with the rows a person came for.
 * A page not named here is READY when the frame's gate opens on it and the page is painted.
 */
export const PRIMARY_PART: Readonly<Record<string, string>> = {
  today: "queue",
  inbox: "list",
  conversations: "list",
  live: "list",
  people: "table",
  leads: "table",
  pipeline: "board",
  person: "hero",
  calendar: "board",
};

/**
 * How much of the table the back office reads: the latest `most` reports of the last `days`, so the read costs the
 * same however busy the platform is (page_vitals_p75, 00255). About five reports make a load.
 */
export const PAGE_VITALS_READ = { days: 7, most: 25_000 } as const;
/** A page is named on its own once this many loads landed on it; fewer is an anecdote. */
export const PAGE_VITALS_MIN_LOADS = 20;
/** The pages named on their own, slowest drawn first. */
const PAGES_SHOWN = 8;

/** One row of page_vitals_p75(): a metric over every page (`page` null) or over one. */
export interface PageVitalsRowDto {
  metric: string;
  page: string | null;
  samples: number;
  p75: number;
}

export type PageVitalVerdict = "good" | "needs work" | "poor";

export interface PageVitalLineVM {
  metric: PageVital;
  label: string;
  value: string;
  verdict: PageVitalVerdict;
  tone: Tone;
  samples: number;
  /** "2.4 s · good · 812 loads": the line's words, as the card prints them. */
  hint: string;
}

export interface PageVitalsPageVM {
  page: string;
  loads: number;
  drawn: string;
  tap: string | null;
  /** "Drawn within 3.1 s, a tap answered within 240 ms · 40 loads". */
  hint: string;
}

export interface PageVitalsVM {
  sentence: string;
  lines: PageVitalLineVM[];
  pages: PageVitalsPageVM[];
}

const VERDICT_TONES: Readonly<Record<PageVitalVerdict, Tone>> = { good: "ok", "needs work": "warn", poor: "danger" };

function isVital(m: string): m is PageVital {
  return (PAGE_VITALS as readonly string[]).includes(m);
}

/** "1 load", "812 loads", "25,000 loads". */
function loadsWords(n: number): string {
  return `${n.toLocaleString("en-US")} load${n === 1 ? "" : "s"}`;
}

/** A metric's value as a person reads it: "180 ms", "2.4 s", or a layout shift's "0.02". */
export function vitalValueWords(metric: PageVital, value: number): string {
  if (metric === "CLS") return value.toFixed(2);
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export function vitalVerdict(metric: PageVital, p75: number): PageVitalVerdict {
  const [good, poor] = PAGE_VITAL_BANDS[metric];
  if (p75 <= good) return "good";
  return p75 <= poor ? "needs work" : "poor";
}

/** The line for each metric reported over every page, in the order of PAGE_VITALS. */
function vitalLinesOf(overall: ReadonlyMap<PageVital, PageVitalsRowDto>): PageVitalLineVM[] {
  return PAGE_VITALS.flatMap((metric) => {
    const r = overall.get(metric);
    if (!r) return [];
    const verdict = vitalVerdict(metric, r.p75);
    const value = vitalValueWords(metric, r.p75);
    // A load reports INP only once somebody tapped, clicked or typed.
    const counted = `${loadsWords(r.samples)}${metric === "INP" ? " with a tap" : ""}`;
    return [
      {
        metric,
        label: `${PAGE_VITAL_WORDS[metric]} (${metric})`,
        value,
        verdict,
        tone: VERDICT_TONES[verdict],
        samples: r.samples,
        hint: `${value} · ${verdict} · ${counted}`,
      },
    ];
  });
}

/** "Of 812 page loads in the last 7 days, three in four drew the page within 2.4 s and answered a tap within 180 ms." */
function sentenceOf(overall: ReadonlyMap<PageVital, PageVitalsRowDto>): string {
  const loads = Math.max(...[...overall.values()].map((r) => r.samples));
  const counted = `${loads.toLocaleString("en-US")} page load${loads === 1 ? "" : "s"} in the last ${PAGE_VITALS_READ.days} days`;
  const drawn = overall.get("LCP");
  const tap = overall.get("INP");
  const said = [
    drawn ? `drew the page within ${vitalValueWords("LCP", drawn.p75)}` : null,
    tap ? `answered a tap within ${vitalValueWords("INP", tap.p75)}` : null,
  ].filter(Boolean);
  return said.length
    ? `Of ${counted}, three in four ${said.join(" and ")}.`
    : `${counted}; none has drawn its page yet.`;
}

/** The pages enough loads landed on, slowest drawn first, with how fast each answered a tap. */
function pagesOf(rows: readonly PageVitalsRowDto[]): PageVitalsPageVM[] {
  const byPage = new Map<string, { drawn?: PageVitalsRowDto; tap?: PageVitalsRowDto }>();
  for (const r of rows) {
    if (r.page === null || (r.metric !== "LCP" && r.metric !== "INP")) continue;
    const held = byPage.get(r.page) ?? {};
    if (r.metric === "LCP") held.drawn = r;
    else held.tap = r;
    byPage.set(r.page, held);
  }
  return [...byPage.entries()]
    .flatMap(([page, h]) =>
      h.drawn && h.drawn.samples >= PAGE_VITALS_MIN_LOADS ? [{ page, ...h, drawn: h.drawn }] : [],
    )
    .sort((a, b) => b.drawn.p75 - a.drawn.p75 || a.page.localeCompare(b.page))
    .slice(0, PAGES_SHOWN)
    .map((p) => {
      const drawn = vitalValueWords("LCP", p.drawn.p75);
      const tap = p.tap ? vitalValueWords("INP", p.tap.p75) : null;
      const said = `Drawn within ${drawn}${tap ? `, a tap answered within ${tap}` : ""}`;
      return { page: p.page, loads: p.drawn.samples, drawn, tap, hint: `${said} · ${loadsWords(p.drawn.samples)}` };
    });
}

/**
 * The back office's card: one sentence, a line for each metric reported, and the pages that took enough loads to
 * say something, slowest drawn first. Null is a read that failed, and says so; no rows is a week nobody used the
 * app, and says that.
 */
export function pageVitalsWords(rows: readonly PageVitalsRowDto[] | null): PageVitalsVM {
  if (rows === null) return { sentence: "Page timings could not be read just now.", lines: [], pages: [] };
  const overall = new Map<PageVital, PageVitalsRowDto>();
  for (const r of rows) if (r.page === null && isVital(r.metric)) overall.set(r.metric, r);
  if (overall.size === 0) {
    return {
      sentence: `No page has sent its timings in the last ${PAGE_VITALS_READ.days} days.`,
      lines: [],
      pages: [],
    };
  }
  return { sentence: sentenceOf(overall), lines: vitalLinesOf(overall), pages: pagesOf(rows) };
}
