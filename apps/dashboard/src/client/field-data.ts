/**
 * Field data from this browser (00255, 00412): what a page load and the moves inside it came to, sent when the page is
 * put away.
 *
 * The browser's five come from web-vitals (field-data-reporter.ts) as it knows them: TTFB and FCP at once, LCP at the
 * first input or when the page is hidden, INP and CLS each time the page is hidden, and again if they grew, and the same
 * again for each move the browser counts as a navigation. The shell's own two come from page-speed.ts as each page and
 * part is drawn. This keeps the latest report under each id and, when the page is hidden or leaves (or when enough have
 * waited to fill a beacon), sends every report not yet sent at its value: a tab switched, a window closed, the phone
 * app sent to the background. The server keeps each under its id, so a grown INP replaces the INP it sent before
 * rather than counting twice.
 *
 * Pure but for what the host hands it: the beacon and the window in a browser, a list and a stub in a test.
 */
import {
  PAGE_METRICS,
  PAGE_VITALS_PER_BEACON,
  PageVitalReport,
  type PageDevice,
  type PageVitalReportDto,
  type PageVitalsInputDto,
} from "@chanlytics/contracts";
import { ROUTES } from "./routes.generated";

export interface FieldData {
  /** A report from the browser or the shell. One the route would refuse is dropped here. */
  note(report: { id: string; name: string; value: number } & Partial<Omit<PageVitalReportDto, "id">>): void;
  /** Sends every report not yet sent at its value, in as few calls as the beacon's size allows; nothing when there is none. */
  flush(): void;
}

/** What a load says beside its reports: the shape of screen it is on and the deploy it runs (decision 0053). */
interface LoadFacts {
  device?: PageDevice;
  build?: string;
}

/** The most reports a load holds: a tab left open all week sends what it has and lets go of the oldest it sent. */
const HELD_MAX = 1000;
/** The order the card says the metrics in: the browser's five, then the shell's two. */
const METRIC_RANK: ReadonlyMap<string, number> = new Map(PAGE_METRICS.map((m, i) => [m, i]));

export function createFieldData(
  page: string,
  send: (body: PageVitalsInputDto) => void,
  facts: LoadFacts = {},
): FieldData {
  const latest = new Map<string, PageVitalReportDto>();
  // What each id was last sent at: its value and what its time went on, as one string.
  const sent = new Map<string, string>();
  const said = (r: PageVitalReportDto) => `${r.value}|${JSON.stringify(r.detail ?? null)}`;
  const letGo = () => {
    for (const id of latest.keys()) {
      if (latest.size <= HELD_MAX) return;
      const r = latest.get(id);
      if (r && sent.get(id) === said(r)) {
        latest.delete(id);
        sent.delete(id);
      }
    }
  };
  const fd: FieldData = {
    note(report) {
      const r = PageVitalReport.safeParse(report);
      if (!r.success) return;
      latest.set(r.data.id, r.data);
      if (latest.size > HELD_MAX) letGo();
      // A beacon's worth waiting: sent now, so a tab never put away still says what it measured.
      let waiting = 0;
      for (const [id, x] of latest) if (sent.get(id) !== said(x)) waiting += 1;
      if (waiting >= PAGE_VITALS_PER_BEACON) fd.flush();
    },
    flush() {
      const due = [...latest.values()]
        .filter((r) => sent.get(r.id) !== said(r))
        .sort((a, b) => (METRIC_RANK.get(a.name) ?? 0) - (METRIC_RANK.get(b.name) ?? 0));
      for (let at = 0; at < due.length; at += PAGE_VITALS_PER_BEACON) {
        const vitals = due.slice(at, at + PAGE_VITALS_PER_BEACON);
        for (const v of vitals) sent.set(v.id, said(v));
        send({
          page,
          ...(facts.device ? { device: facts.device } : {}),
          ...(facts.build ? { build: facts.build } : {}),
          vitals,
        });
      }
    },
  };
  return fd;
}

/**
 * The beacon: queued by the browser to outlive the page, same-origin, with the session's cookie. A beacon the
 * browser would not queue is a number lost, and nothing the page should hear about.
 */
export function beaconTo(nav: { sendBeacon?: (url: string, data: Blob) => boolean } | undefined) {
  return (body: PageVitalsInputDto): void => {
    try {
      nav?.sendBeacon?.(ROUTES["POST vitals"].path, new Blob([JSON.stringify(body)], { type: "application/json" }));
    } catch {
      // a number lost
    }
  };
}

interface Host {
  document: {
    visibilityState: string;
    addEventListener: EventTarget["addEventListener"];
    removeEventListener: EventTarget["removeEventListener"];
  };
  addEventListener: EventTarget["addEventListener"];
  removeEventListener: EventTarget["removeEventListener"];
}

/** Sends whenever the page is hidden, and as it leaves; answers the unhook. */
export function flushWhenHidden(win: Host, fd: FieldData): () => void {
  const hidden = () => {
    if (win.document.visibilityState === "hidden") fd.flush();
  };
  const leaving = () => fd.flush();
  win.document.addEventListener("visibilitychange", hidden);
  win.addEventListener("pagehide", leaving);
  return () => {
    win.document.removeEventListener("visibilitychange", hidden);
    win.removeEventListener("pagehide", leaving);
  };
}
