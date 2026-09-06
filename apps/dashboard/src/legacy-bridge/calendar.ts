/**
 * Calendar, the verbs and the arithmetic: `window.__calendar`.
 *
 * The page keeps one loaded WINDOW of days (nine weeks around the day it
 * looks at) and derives every view from it — a week, a day, six weeks for
 * a month, two weeks for the agenda — so switching views is a slice, never
 * a fetch. Only a move outside the window reads again, through the runner,
 * so the cache and the pill agree with what is on screen. The span
 * arithmetic lives in contracts and is exposed here, so the page (a classic
 * script that cannot import) and the tests use one implementation.
 *
 * The preview is a read of a feed the workspace has not saved yet; it
 * changes nothing.
 */
import { coversSpan, frameOf, spanForView, windowFor, type CalendarView } from "@chanlytics/contracts";
import { calendarOverride, getCalendarSpan, invalidateInFlight, scoped, setCalendarSpan } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";

export interface CalendarPreviewResult {
  ok: boolean;
  message?: string;
  data?: { events: number; recurring_expanded: number; skipped_recurring: number; next: Array<{ start: string; end: string; title: string }> };
}

/** Load `days` days starting on `from` (a day key); a null `from` is the window around today. */
export async function goTo(from: string | null, days = 63): Promise<boolean> {
  const prev = getCalendarSpan();
  setCalendarSpan(from, days);
  invalidateInFlight();
  await refreshSurfaces([calendarOverride]);
  const got = (window as unknown as { __CALENDAR?: { vm?: { from?: string; days?: unknown[] } } }).__CALENDAR?.vm;
  if ((from && got?.from !== from) || (got?.days && got.days.length !== days)) {
    setCalendarSpan(prev.from, prev.days);
    return false;
  }
  return true;
}

/** Make sure the window covers what a view needs from its anchor; reads only when it does not. */
export async function ensure(view: CalendarView, anchor: string): Promise<boolean> {
  const need = spanForView(view, anchor);
  const have = (window as unknown as { __CALENDAR?: { vm?: { days?: Array<{ key: string }> } } }).__CALENDAR?.vm?.days ?? [];
  if (coversSpan(have, need.from, need.days)) return true;
  const w = windowFor(anchor);
  return goTo(w.from, w.days);
}

export async function previewFeed(url: string): Promise<CalendarPreviewResult> {
  try {
    const res = await fetch(scoped("/api/v1/calendar/preview"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    if (res.status === 401) {
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as { ok: boolean; data?: CalendarPreviewResult["data"]; error?: { message?: string } } | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was checked." };
  }
}

export const calendar = { goTo, ensure, previewFeed, spanFor: spanForView, windowFor, covers: coversSpan, frameOf };

declare global {
  interface Window {
    __calendar?: typeof calendar;
  }
}

export function installCalendar(): void {
  window.__calendar = calendar;
}
