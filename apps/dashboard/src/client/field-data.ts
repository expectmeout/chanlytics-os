/**
 * Field data from this browser (00229): what a page load's web vitals came to, sent when the page is put away.
 *
 * Next's hook (next/web-vitals) reports each metric when it knows it: TTFB and FCP at once, LCP at the first input
 * or when the page is hidden, INP and CLS each time the page is hidden, and again if they grew. This keeps the
 * latest report of each and, when the page is hidden or leaves, sends in one beacon every report it has not sent at
 * that value: a tab switched, a window closed, the phone app sent to the background. The server keeps each under the
 * browser's own id, so a grown INP replaces the INP it sent before rather than counting twice.
 *
 * Pure but for what the host hands it: the beacon and the window in a browser, a list and a stub in a test.
 */
import { PAGE_VITALS, PageVitalReport, type PageVital, type PageVitalsInputDto } from "@chanlytics/contracts";
import { ROUTES } from "./routes.generated";

export interface FieldData {
  /** A report from the hook. One that is not one of the five, or that the route would refuse, is dropped here. */
  note(report: { id: string; name: string; value: number }): void;
  /** Sends every report not yet sent at its value, in one call; nothing when there is none. */
  flush(): void;
}

export function createFieldData(page: string, send: (body: PageVitalsInputDto) => void): FieldData {
  const latest = new Map<PageVital, { id: string; value: number }>();
  const sent = new Map<string, number>();
  return {
    note({ id, name, value }) {
      const r = PageVitalReport.safeParse({ id, name, value });
      if (r.success) latest.set(r.data.name, { id: r.data.id, value: r.data.value });
    },
    flush() {
      const vitals = PAGE_VITALS.flatMap((name) => {
        const r = latest.get(name);
        return r && sent.get(r.id) !== r.value ? [{ id: r.id, name, value: r.value }] : [];
      });
      if (vitals.length === 0) return;
      for (const v of vitals) sent.set(v.id, v.value);
      send({ page, vitals });
    },
  };
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
