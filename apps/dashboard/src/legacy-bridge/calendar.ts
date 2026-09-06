/**
 * Calendar, the verbs: `window.__calendar` — move the shown span (a week, a
 * day's week, six weeks for a month, two weeks for the agenda), and check a
 * feed address before it is saved.
 *
 * Moving the span re-reads through the runner, so the cache and the pill
 * agree with what is on screen (the way Reports' period does). The preview
 * is a read of a feed the workspace has not saved yet; it changes nothing.
 */
import { calendarOverride, getCalendarSpan, invalidateInFlight, scoped, setCalendarSpan } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";

export interface CalendarPreviewResult {
  ok: boolean;
  message?: string;
  data?: { events: number; recurring_expanded: number; skipped_recurring: number; next: Array<{ start: string; end: string; title: string }> };
}

/** Show `days` days starting on `from` (a day key); a null `from` is the week of today. */
export async function goTo(from: string | null, days = 7): Promise<boolean> {
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

export const goToWeek = (from: string | null): Promise<boolean> => goTo(from, 7);

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

export const calendar = { goTo, goToWeek, previewFeed };

declare global {
  interface Window {
    __calendar?: typeof calendar;
  }
}

export function installCalendar(): void {
  window.__calendar = calendar;
}
