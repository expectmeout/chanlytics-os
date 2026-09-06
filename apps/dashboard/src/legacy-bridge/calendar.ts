/**
 * Calendar, the verbs: `window.__calendar` — move the shown week, and check a
 * feed address before it is saved.
 *
 * Moving the week re-reads through the runner, so the cache and the pill
 * agree with what is on screen (the way Reports' period does). The preview
 * is a read of a feed the workspace has not saved yet; it changes nothing.
 */
import { calendarOverride, getCalendarFrom, invalidateInFlight, scoped, setCalendarFrom } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";

export interface CalendarPreviewResult {
  ok: boolean;
  message?: string;
  data?: { events: number; recurring_expanded: number; skipped_recurring: number; next: Array<{ start: string; end: string; title: string }> };
}

/** Show the span that starts on `from` (a day key); null goes back to this week. */
export async function goToWeek(from: string | null): Promise<boolean> {
  const prev = getCalendarFrom();
  setCalendarFrom(from);
  invalidateInFlight();
  await refreshSurfaces([calendarOverride]);
  const got = (window as unknown as { __CALENDAR?: { vm?: { from?: string } } }).__CALENDAR?.vm?.from;
  if (from && got !== from) {
    setCalendarFrom(prev);
    return false;
  }
  return true;
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

export const calendar = { goToWeek, previewFeed };

declare global {
  interface Window {
    __calendar?: typeof calendar;
  }
}

export function installCalendar(): void {
  window.__calendar = calendar;
}
