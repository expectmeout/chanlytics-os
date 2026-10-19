import "../zod-config.js";
import * as z from "zod/mini";
import { MIN_MS } from "../shared/time.js";
import { PAGE_METRICS, PAGE_NAME, PAGE_VITALS } from "./vitals-pages.js";
export const PAGE_VITAL_BANDS = {
  LCP: [2500, 4e3],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3e3],
  TTFB: [800, 1800]
};
export const PAGE_VITAL_WORDS = {
  LCP: "Drawn",
  INP: "Answers a tap",
  CLS: "Holds still",
  FCP: "First paint",
  TTFB: "First byte"
};
const VITAL_ID = /^[A-Za-z0-9-]{1,64}$/;
export const PAGE_BUILD = /^[0-9a-z]{3,40}$/;
const VITAL_CEILING = 10 * MIN_MS;
const DETAIL_WORD = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;
const detailWord = () => z.optional(z.string().check(z.regex(DETAIL_WORD)));
const detailMs = () => z.optional(z.number().check(z.minimum(0), z.maximum(VITAL_CEILING)));
const PageVitalDetail = z.object({
  wait: detailWord(),
  wait_ms: detailMs(),
  server_ms: detailMs(),
  db_ms: detailMs(),
  db_n: z.optional(z.int().check(z.minimum(0), z.maximum(1e4))),
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
  phase: detailWord()
});
export const PageVitalReport = z.object({
  id: z.string().check(z.regex(VITAL_ID, { error: "A report needs the browser's id." })),
  name: z.enum(PAGE_METRICS, { error: "A report names one of the seven." }),
  value: z.number().check(z.minimum(0), z.maximum(VITAL_CEILING)),
  page: z.optional(z.string().check(z.regex(PAGE_NAME))),
  part: z.optional(z.string().check(z.regex(PAGE_NAME))),
  from: z.optional(z.string().check(z.regex(PAGE_NAME))),
  warm: z.optional(z.boolean()),
  detail: z.optional(PageVitalDetail)
});
export const PAGE_VITALS_READ = { days: 7, most: 25e3 };
export const PAGE_VITALS_MIN_LOADS = 20;
const PAGES_SHOWN = 8;
const VERDICT_TONES = { good: "ok", "needs work": "warn", poor: "danger" };
function isVital(m) {
  return PAGE_VITALS.includes(m);
}
function loadsWords(n) {
  return `${n.toLocaleString("en-US")} load${n === 1 ? "" : "s"}`;
}
export function vitalValueWords(metric, value) {
  if (metric === "CLS") return value.toFixed(2);
  if (value < 1e3) return `${Math.round(value)} ms`;
  return `${(value / 1e3).toFixed(1)} s`;
}
export function vitalVerdict(metric, p75) {
  const [good, poor] = PAGE_VITAL_BANDS[metric];
  if (p75 <= good) return "good";
  return p75 <= poor ? "needs work" : "poor";
}
function vitalLinesOf(overall) {
  return PAGE_VITALS.flatMap((metric) => {
    const r = overall.get(metric);
    if (!r) return [];
    const verdict = vitalVerdict(metric, r.p75);
    const value = vitalValueWords(metric, r.p75);
    const counted = `${loadsWords(r.samples)}${metric === "INP" ? " with a tap" : ""}`;
    return [
      {
        metric,
        label: `${PAGE_VITAL_WORDS[metric]} (${metric})`,
        value,
        verdict,
        tone: VERDICT_TONES[verdict],
        samples: r.samples,
        hint: `${value} \xB7 ${verdict} \xB7 ${counted}`
      }
    ];
  });
}
function sentenceOf(overall) {
  const loads = Math.max(...[...overall.values()].map((r) => r.samples));
  const counted = `${loads.toLocaleString("en-US")} page load${loads === 1 ? "" : "s"} in the last ${PAGE_VITALS_READ.days} days`;
  const drawn = overall.get("LCP");
  const tap = overall.get("INP");
  const said = [
    drawn ? `drew the page within ${vitalValueWords("LCP", drawn.p75)}` : null,
    tap ? `answered a tap within ${vitalValueWords("INP", tap.p75)}` : null
  ].filter(Boolean);
  return said.length ? `Of ${counted}, three in four ${said.join(" and ")}.` : `${counted}; none has drawn its page yet.`;
}
function pagesOf(rows) {
  const byPage = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.page === null || r.metric !== "LCP" && r.metric !== "INP") continue;
    const held = byPage.get(r.page) ?? {};
    if (r.metric === "LCP") held.drawn = r;
    else held.tap = r;
    byPage.set(r.page, held);
  }
  return [...byPage.entries()].flatMap(
    ([page, h]) => h.drawn && h.drawn.samples >= PAGE_VITALS_MIN_LOADS ? [{ page, ...h, drawn: h.drawn }] : []
  ).sort((a, b) => b.drawn.p75 - a.drawn.p75 || a.page.localeCompare(b.page)).slice(0, PAGES_SHOWN).map((p) => {
    const drawn = vitalValueWords("LCP", p.drawn.p75);
    const tap = p.tap ? vitalValueWords("INP", p.tap.p75) : null;
    const said = `Drawn within ${drawn}${tap ? `, a tap answered within ${tap}` : ""}`;
    return { page: p.page, loads: p.drawn.samples, drawn, tap, hint: `${said} \xB7 ${loadsWords(p.drawn.samples)}` };
  });
}
export function pageVitalsWords(rows) {
  if (rows === null) return { sentence: "Page timings could not be read just now.", lines: [], pages: [] };
  const overall = /* @__PURE__ */ new Map();
  for (const r of rows) if (r.page === null && isVital(r.metric)) overall.set(r.metric, r);
  if (overall.size === 0) {
    return {
      sentence: `No page has sent its timings in the last ${PAGE_VITALS_READ.days} days.`,
      lines: [],
      pages: []
    };
  }
  return { sentence: sentenceOf(overall), lines: vitalLinesOf(overall), pages: pagesOf(rows) };
}
