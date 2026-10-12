/**
 * The browser's five (field data, 00255, 00412): web-vitals' attribution build, fed to this load's collector
 * (field-data.ts, made by page-speed.ts installPageSpeed), which sends when the page is put away.
 *
 * LegacyHost loads this module once the page has loaded, as a chunk of its own, so nobody waits for it and the
 * workspace route's budget does not carry it. The library's observers read the entries the browser buffered, so a late
 * start still reports the whole load: its first paint, its largest, its layout shifts, its slow interactions.
 *
 * It was Next's hook (next/web-vitals), which in the App Router loads the library's plain build: a number with nothing
 * to say about why (decision 0053). Each report now says what it was of:
 *
 *   - the page: the one the load landed on; for a move the browser counts as a navigation (Chromium's soft
 *     navigations, `reportSoftNavs`), the page that move reached, and the page it left (`from`); for a tap or a shift
 *     a browser without soft navigations counts over the whole document, the page on screen when it happened;
 *   - the element (`el`): its nearest test id, the code's own word for it, never an id, a class made of data, or text;
 *   - the phases: an interaction's three (waiting for the page, its handlers, drawing what changed) and its longest
 *     script; the largest paint's four (the server, before its file, its file, waiting to be drawn); the largest shift.
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type MetricWithAttribution } from "web-vitals/attribution";
import { routeOfAddress, vitalsPageOf, type PageVitalDetailDto } from "@chanlytics/contracts";
import type { SpeedHost } from "./page-speed";

/** How far up from the element a test id is looked for: the button, its row, the row's list. */
const TARGET_DEPTH = 8;
/** A word the table keeps (contracts PageVitalDetail): letters, digits and `._:-`, under eighty. */
const WORD = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

/** A name with what could be a row's id taken out of it: `ld-row-5f0c9a3e-…` is `ld-row-x`, `th-1234` is `th-x`. */
function codeWordOf(name: string): string | undefined {
  const plain = name
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "x")
    .replace(/\d{3,}/g, "x")
    .slice(0, 80);
  return WORD.test(plain) ? plain : undefined;
}

/**
 * The element a metric names, by the code's own words: its nearest test id (`inbox-approve`), else its tag and first
 * class (`button.kit-btn`). The library's own selector names ids, which can be a person's row.
 */
function elementNameOf(node: Node | null): string | undefined {
  const start = node instanceof Element ? node : (node?.parentElement ?? null);
  let el: Element | null = start;
  for (let i = 0; el && i < TARGET_DEPTH; i += 1, el = el.parentElement) {
    const id = el.getAttribute("data-testid");
    const word = id ? codeWordOf(id) : undefined;
    if (word) return word;
  }
  if (!start) return undefined;
  const tag = start.tagName.toLowerCase();
  const cls = [...start.classList].find((c) => /^[a-z][a-z0-9_-]{1,40}$/i.test(c));
  return codeWordOf(cls ? `${tag}.${cls}` : tag);
}

/** The page an address is of, as the table names it (contracts vitalsPageOf). */
function pageOfUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return vitalsPageOf(routeOfAddress({ pathname: u.pathname, search: u.search, hash: u.hash }));
  } catch {
    return null;
  }
}

const rounded = (v: number | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : undefined;

/** The phase of a few that took the longest, by its name. */
function longest(phases: Record<string, number | undefined>): string | undefined {
  let best: [string, number] | null = null;
  for (const [name, v] of Object.entries(phases)) if (typeof v === "number" && (!best || v > best[1])) best = [name, v];
  return best?.[0];
}

/** What a metric's time went on, from its attribution; none for the two that name nothing. */
export function detailOf(m: MetricWithAttribution): PageVitalDetailDto | undefined {
  if (m.name === "INP") {
    const a = m.attribution;
    const phases = { input: a.inputDelay, processing: a.processingDuration, presentation: a.presentationDelay };
    const el = a.interactionTarget ? codeWordOf(a.interactionTarget) : undefined;
    return {
      ...(el ? { el } : {}),
      ...(a.interactionType ? { type: a.interactionType } : {}),
      input_ms: rounded(a.inputDelay),
      processing_ms: rounded(a.processingDuration),
      presentation_ms: rounded(a.presentationDelay),
      ...(a.longestScript ? { script_ms: rounded(a.longestScript.intersectingDuration) } : {}),
      ...(a.loadState ? { state: a.loadState } : {}),
      ...(longest(phases) ? { phase: longest(phases) } : {}),
    };
  }
  if (m.name === "LCP") {
    const a = m.attribution;
    const phases = {
      ttfb: a.timeToFirstByte,
      load_delay: a.resourceLoadDelay,
      load: a.resourceLoadDuration,
      render_delay: a.elementRenderDelay,
    };
    const el = a.target ? codeWordOf(a.target) : undefined;
    return {
      ...(el ? { el } : {}),
      ttfb_ms: rounded(a.timeToFirstByte),
      load_delay_ms: rounded(a.resourceLoadDelay),
      load_ms: rounded(a.resourceLoadDuration),
      render_delay_ms: rounded(a.elementRenderDelay),
      ...(longest(phases) ? { phase: longest(phases) } : {}),
    };
  }
  if (m.name === "CLS") {
    const a = m.attribution;
    const el = a.largestShiftTarget ? codeWordOf(a.largestShiftTarget) : undefined;
    return {
      ...(el ? { el } : {}),
      ...(typeof a.largestShiftValue === "number" ? { shift: a.largestShiftValue } : {}),
      ...(a.loadState ? { state: a.loadState } : {}),
    };
  }
  return undefined;
}

/** When on the page's clock a tap or a shift happened, so a document's report can say which page it was on. */
function happenedAt(m: MetricWithAttribution): number | undefined {
  if (m.name === "INP") return m.attribution.interactionTime;
  if (m.name === "CLS") return m.attribution.largestShiftTime;
  return undefined;
}

/**
 * One metric as the collector takes it: under the library's own id, of the page it was of. A soft navigation's first
 * byte and first paint say nothing a move has (the byte is the document's; the paint is whatever the move drew first).
 */
export function reportOf(m: MetricWithAttribution, host: Pick<SpeedHost, "landing" | "pageAt">) {
  const soft = m.navigationType === "soft-navigation";
  if (soft && (m.name === "TTFB" || m.name === "FCP")) return null;
  let page = host.landing;
  let from: string | null = null;
  if (soft) {
    // The shell began the move's page at the press, before the browser counts its navigation: the page on screen at
    // the navigation's start is the move's own, and the page it left is that page's `from`.
    const at = host.pageAt(m.navigationStartTime ?? 0);
    page = (m.navigationURL ? pageOfUrl(m.navigationURL) : null) ?? at.page;
    from = at.page === page ? at.from : at.page;
  } else {
    const t = happenedAt(m);
    if (t !== undefined) ({ page, from } = host.pageAt(t));
  }
  const detail = detailOf(m);
  return {
    id: m.id,
    name: m.name,
    value: m.value,
    ...(page !== host.landing || soft ? { page } : {}),
    ...(from ? { from } : {}),
    ...(detail ? { detail } : {}),
  };
}

let started = false;

/** Hear the browser's five for this load and each move it counts, once; each report goes to the load's collector. */
export function reportWebVitals(host: SpeedHost): void {
  if (started) return;
  started = true;
  // Said in the page's timeline, so a browser test (or DevTools) can tell the reporter is listening.
  performance.mark?.("chanlytics:web-vitals");
  const note = (m: MetricWithAttribution) => {
    const r = reportOf(m, host);
    if (r) host.fieldData.note(r);
  };
  const opts = { reportSoftNavs: true, generateTarget: elementNameOf };
  onLCP(note, opts);
  onINP(note, opts);
  onCLS(note, opts);
  onFCP(note, opts);
  onTTFB(note);
}
