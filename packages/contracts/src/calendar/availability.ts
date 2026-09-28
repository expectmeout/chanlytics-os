/**
 * Read-only availability: what is open, from a calendar feed and the rules.
 *
 * The receptionist never books. It may SEE the calendar — the owner's
 * appointments as an iCal feed, which every booking tool that syncs to
 * Google, Apple or Outlook can produce (Booksy Biz syncs two-way with Google
 * and Apple; Calendly, Square and the rest do the same) — subtract what is
 * taken from the opening hours, apply the owner's booking rules, and say
 * which windows are open before sending the booking link. The link is the
 * only way anything gets booked, whatever provider stands behind it.
 *
 * Pure: the feed text comes in, the windows come out, nothing is fetched
 * here. The edge fetches and caches; tests feed fixtures.
 *
 * This module holds the windows: the booking rules, the one reader of a day's hours (dayIntervals), the open
 * times (freeWindows), the ones a caller asked about (filterOpenings) and the words the receptionist is told
 * them in (describeOpenings). The feed is read in feed.ts and its text in ics-text.ts, the clock is
 * zone-math.ts, and the service a caller means, and what it is offered as, is service-offer.ts.
 */
import type { Closure, Hours } from "../config/workspace-config/business-profile";
import { NO_LINK_DETAILS } from "../config/no-booking-link";
import { clockInZone, dayPlusInZone, localToUtcMs } from "./zone-math";
import type { BusyBlock } from "./feed";

/* ----------------------------------------------------------- the windows */

export interface BookingRulesLike {
  lead_hours?: number;
  buffer_min?: number;
  max_days_ahead?: number;
  slot_min?: number;
}

export interface Opening {
  key: string;
  /** "mon".."sun" in the business's zone. */
  weekday: string;
  /** "Tuesday, September 9" */
  label: string;
  windows: Array<{ start: number; end: number }>;
}

export interface FreeWindowsInput {
  hours: Record<string, Hours | undefined> | undefined;
  closures?: Closure[];
  tz: string;
  busy: BusyBlock[];
  rules?: BookingRulesLike | null;
  now: Date;
}

/** The booking rules a workspace has until it sets its own. */
export const BOOKING_DEFAULTS = { lead_hours: 2, buffer_min: 0, max_days_ahead: 14, slot_min: 30 };

function hhmm(s: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * When a day is open, as one list of [open, close] spans.
 *
 * open/close and intervals are UNIONED, merged where they touch or overlap,
 * and a span that runs backwards is dropped. This is the ONE reader: the
 * prompt (config.ts), the free windows a caller is offered and the calendar
 * board all read a day through it. It used to have two readers -- the prompt
 * unioned the two, this one let intervals win -- so a row holding both could
 * be described two ways, and "are you open at nine?" had two answers.
 */
export function dayIntervals(h: Hours | undefined): Array<[string, string]> {
  const raw: Array<[string, string]> = [];
  if (h?.open && h?.close) raw.push([h.open, h.close]);
  for (const iv of h?.intervals ?? []) if (iv?.open && iv?.close) raw.push([iv.open, iv.close]);
  const usable = raw.filter(([o, c]) => c > o).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const merged: Array<[string, string]> = [];
  for (const [o, c] of usable) {
    const last = merged[merged.length - 1];
    if (last && o <= last[1]) {
      if (c > last[1]) last[1] = c;
    } else {
      merged.push([o, c]);
    }
  }
  return merged;
}

export function closedOn(closures: Closure[] | undefined, key: string): boolean {
  return !!closures?.some((c) => c.date <= key && key <= (c.until && c.until >= c.date ? c.until : c.date));
}

/**
 * An instant rounded up to the slot grid on the business's clock: :00 and :30 for half-hour slots, the quarter hour when
 * a slot does not divide the hour. The first open time was now plus the least notice to the minute, "1:29 PM" (C5).
 */
function onTheGrid(tz: string, atMs: number, slotMin: number): number {
  const grid = slotMin > 0 && 60 % slotMin === 0 ? slotMin : 15;
  const c = clockInZone(tz, atMs);
  const into = ((c.mm % grid) * 60 + c.ss) * 1000 + (((atMs % 1000) + 1000) % 1000);
  return into === 0 ? atMs : atMs - into + grid * 60_000;
}

/**
 * The open windows, day by day: opening hours minus what is taken (each
 * taken block widened by the buffer), never earlier than now plus the lead
 * time, never shorter than one slot, never on a closed date.
 */
export function freeWindows(input: FreeWindowsInput): Opening[] {
  const rules = { ...BOOKING_DEFAULTS, ...(input.rules ?? {}) };
  const leadMs = rules.lead_hours * 3600_000;
  const bufferMs = rules.buffer_min * 60_000;
  const slotMs = rules.slot_min * 60_000;
  // The first moment worth offering: now plus the least notice, up to the slot grid on the business's clock (C5).
  const earliest = onTheGrid(input.tz, input.now.getTime() + leadMs, rules.slot_min);
  const busy = input.busy
    .map((b) => ({ start: b.start - bufferMs, end: b.end + bufferMs }))
    .sort((a, b) => a.start - b.start);
  const out: Opening[] = [];
  for (let offset = 0; offset < rules.max_days_ahead; offset++) {
    const day = dayPlusInZone(input.tz, input.now.getTime(), offset);
    if (closedOn(input.closures, day.key)) continue;
    const ranges = dayIntervals(input.hours?.[day.weekday]);
    const windows: Array<{ start: number; end: number }> = [];
    for (const [open, close] of ranges) {
      const o = hhmm(open),
        c = hhmm(close);
      if (!o || !c) continue;
      let start = Math.max(localToUtcMs(input.tz, day.y, day.m, day.d, o[0], o[1]), earliest);
      const end = localToUtcMs(input.tz, day.y, day.m, day.d, c[0], c[1]);
      for (const b of busy) {
        if (b.end <= start) continue;
        if (b.start >= end) break;
        if (b.start > start && b.start - start >= slotMs) windows.push({ start, end: b.start });
        start = Math.max(start, b.end);
      }
      if (end - start >= slotMs) windows.push({ start, end });
    }
    if (windows.length) {
      out.push({
        key: day.key,
        weekday: day.weekday,
        // Noon on that local day: an instant the day owns whichever way the
        // clock moved, where midnight on a spring-forward day may not exist
        // and 1 AM on an autumn one happens twice.
        label: new Intl.DateTimeFormat("en-US", {
          timeZone: input.tz,
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date(localToUtcMs(input.tz, day.y, day.m, day.d, 12, 0))),
        windows,
      });
    }
  }
  return out;
}

const DAY_NAMES: Record<string, string> = {
  mon: "mon",
  monday: "mon",
  tue: "tue",
  tues: "tue",
  tuesday: "tue",
  wed: "wed",
  wednesday: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  thursday: "thu",
  fri: "fri",
  friday: "fri",
  sat: "sat",
  saturday: "sat",
  sun: "sun",
  sunday: "sun",
};

/**
 * The openings a caller actually asked about: one day (a date or a weekday
 * name), and only windows long enough for the service they want. Days with
 * nothing left are dropped.
 */
export function filterOpenings(
  openings: Opening[],
  by: { day?: string | null; minMinutes?: number | null },
): Opening[] {
  const day = (by.day ?? "").trim().toLowerCase();
  const weekday = day ? DAY_NAMES[day] : undefined;
  const key = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
  const minMs = by.minMinutes && by.minMinutes > 0 ? by.minMinutes * 60_000 : 0;
  const picked = openings.filter((o) => (key ? o.key === key : weekday ? o.weekday === weekday : true));
  const first = weekday && !key ? picked.slice(0, 1) : picked; // "Tuesday" means the next one
  return first
    .map((o) => ({ ...o, windows: o.windows.filter((w) => w.end - w.start >= minMs) }))
    .filter((o) => o.windows.length > 0);
}

/** "2:00 PM – 4:30 PM" in the business's zone. */
function span(tz: string, start: number, end: number): string {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  return `${f.format(new Date(start))} – ${f.format(new Date(end))}`;
}

/**
 * The openings as the receptionist is told them: a few days, the windows on
 * each, and the rule that the calendar decides. Text on both channels; the
 * phone agent reads it aloud in its own words.
 *
 * `hasBookingLink` is required: what follows an opening is the link, or for a
 * business with none, the details the team needs (NO_LINK_DETAILS).
 */
export function describeOpenings(
  openings: Opening[],
  tz: string,
  opts: { maxDays?: number; daysAhead?: number; hasBookingLink: boolean },
): string {
  const maxDays = opts.maxDays ?? 5;
  const ahead = opts.daysAhead ?? BOOKING_DEFAULTS.max_days_ahead;
  const hasLink = opts.hasBookingLink;
  if (!openings.length) {
    return `Open times (from the calendar): nothing is open in the next ${ahead} days. Offer to have someone call back${hasLink ? ", and send the booking link so they are told when a slot frees up" : ""}.`;
  }
  const lines = openings
    .slice(0, maxDays)
    .map((o) => `- ${o.label}: ${o.windows.map((w) => span(tz, w.start, w.end)).join(", ")}`);
  return (
    `Open times (from the calendar, checked just now — these change as bookings come in):\n${lines.join("\n")}\n` +
    (hasLink
      ? "Offer up to three of these that fit what they want, then send the booking link to lock one in. Never confirm a slot yourself; the calendar decides."
      : `Offer up to three of these that fit what they want, then take ${NO_LINK_DETAILS} so the team can confirm one. Never confirm a slot yourself; the calendar decides.`)
  );
}
