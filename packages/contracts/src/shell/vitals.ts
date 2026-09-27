/**
 * Field data: how fast the pages people use are, from their own browsers (plan 2026-09-27, Performance).
 *
 * The bundle's budget says what the workspace route ships; this says what people then see. The shell hears five
 * numbers for each page load from Next's web-vitals hook, sends them when the page is hidden (legacy-bridge
 * LegacyHost, src/client/field-data.ts), and POST /api/v1/vitals keeps each under the id the browser gave it
 * (00225). The back office reads the 75th percentile of each, over every page and over each page a load landed on.
 * A report names a page, a metric and a number: nobody's person, nobody's workspace.
 */
import { z } from "zod";
import { MIN_MS } from "../shared/time";
import type { Tone } from "./tone";

/** The five, in the order the back office says them. Held to page_vitals.metric (shared/schema-sets.ts). */
export const PAGE_VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type PageVital = (typeof PAGE_VITALS)[number];

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

/** A page's name as the table keeps it (page_vitals.page): a route's first segment, in lower case. */
const PAGE_NAME = /^[a-z][a-z0-9-]{0,31}$/;
/** The browser's id for one metric of one load (web-vitals: "v4-1727430000000-8123456789012"). */
const VITAL_ID = /^[A-Za-z0-9-]{1,64}$/;
/** No report is larger: ten minutes, in milliseconds (page_vitals.value). */
const VITAL_CEILING = 10 * MIN_MS;

/**
 * The page a load landed on, from the shell's hash route (legacy-bridge hashRoute): "clients" for
 * "clients/<id>", and "other" for a route the table would refuse.
 */
export function vitalsPageOf(route: string): string {
  const first = (route ?? "").split(/[/?]/)[0] ?? "";
  return PAGE_NAME.test(first) ? first : "other";
}

/**
 * One metric of one load, as the browser reported it. The shell drops a report this refuses before it sends (a
 * background tab's LCP can outlast the ceiling), so one odd number never costs the load its other four.
 */
export const PageVitalReport = z.object({
  id: z.string().regex(VITAL_ID, { error: "A report needs the browser's id." }),
  name: z.enum(PAGE_VITALS, { error: "A report names one of the five." }),
  value: z.number().min(0).max(VITAL_CEILING),
});

/** What the shell sends: the page a load landed on, and what its metrics came to so far, each at most once. */
export const PageVitalsInput = z.object({
  page: z.string().regex(PAGE_NAME, { error: "A page's name is a word in lower case." }),
  vitals: z.array(PageVitalReport).min(1).max(PAGE_VITALS.length),
});
export type PageVitalsInputDto = z.infer<typeof PageVitalsInput>;

/**
 * How much of the table the back office reads: the latest `most` reports of the last `days`, so the read costs the
 * same however busy the platform is (page_vitals_p75, 00225). About five reports make a load.
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
function linesOf(overall: ReadonlyMap<PageVital, PageVitalsRowDto>): PageVitalLineVM[] {
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
  return { sentence: sentenceOf(overall), lines: linesOf(overall), pages: pagesOf(rows) };
}
