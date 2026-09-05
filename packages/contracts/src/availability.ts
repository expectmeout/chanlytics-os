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
 */
import type { Closure, Hours } from "./config";

/** A taken stretch of time, epoch milliseconds. */
export interface BusyBlock {
  start: number;
  end: number;
}

export interface ParsedFeed {
  busy: BusyBlock[];
  /** VEVENTs read, before any were dropped. */
  events: number;
  /** Recurring events are not expanded (yet); they are counted so the
   *  diagnostic can say the feed carries some. */
  skippedRecurring: number;
}

/* ------------------------------------------------------------- zone math */

interface ZoneParts { y: number; m: number; d: number; hh: number; mm: number; ss: number; weekday: string }

function zoneParts(tz: string, at: Date): ZoneParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")), m: Number(get("month")), d: Number(get("day")),
    hh: Number(get("hour")) % 24, mm: Number(get("minute")), ss: Number(get("second")),
    weekday: get("weekday").toLowerCase().slice(0, 3),
  };
}

/** Offset of `tz` from UTC at the instant `atMs`, in milliseconds. */
export function zoneOffsetMs(tz: string, atMs: number): number {
  const p = zoneParts(tz, new Date(atMs));
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(atMs / 1000) * 1000;
}

/** The instant a wall-clock time in `tz` refers to. Two passes cover a DST edge. */
export function localToUtcMs(tz: string, y: number, m: number, d: number, hh: number, mm: number): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - zoneOffsetMs(tz, guess);
  const second = guess - zoneOffsetMs(tz, first);
  return second;
}

/** "YYYY-MM-DD" and the weekday key ("mon".."sun") of an instant in `tz`. */
export function dayInZone(tz: string, atMs: number): { key: string; weekday: string; y: number; m: number; d: number } {
  const p = zoneParts(tz, new Date(atMs));
  const pad = (n: number) => String(n).padStart(2, "0");
  return { key: `${p.y}-${pad(p.m)}-${pad(p.d)}`, weekday: p.weekday, y: p.y, m: p.m, d: p.d };
}

/* ------------------------------------------------------------ the feed */

/** RFC 5545 folds long lines; a continuation starts with a space or tab. */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}

/** "DTSTART;TZID=America/New_York:20260909T140000" → { name, params, value }. */
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rest] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of rest) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * An iCal date-time to an instant.
 *  - "20260909T180000Z"  → UTC
 *  - "20260909T140000" with TZID → that zone; without → `fallbackTz`
 *  - "20260909" (VALUE=DATE) → midnight in `fallbackTz`; `endOfDay` for DTEND
 */
function toMs(value: string, params: Record<string, string>, fallbackTz: string): number | null {
  const v = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || params.VALUE === "DATE") {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return localToUtcMs(fallbackTz, Number(m[1]), Number(m[2]), Number(m[3]), 0, 0);
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (z) return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0));
  const tz = params.TZID ?? fallbackTz;
  try {
    return localToUtcMs(tz, Number(y), Number(mo), Number(d), Number(hh), Number(mm)) + Number(ss ?? 0) * 1000;
  } catch {
    return localToUtcMs(fallbackTz, Number(y), Number(mo), Number(d), Number(hh), Number(mm));
  }
}

/** "PT1H30M" / "P1D" → milliseconds. */
function durationMs(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * ((Number(m[2] ?? 0) * 86400 + Number(m[3] ?? 0) * 3600 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)) * 1000);
}

/**
 * The taken time in a feed. Cancelled events and events marked transparent
 * (free) are not taken. Recurring events are counted, not expanded.
 */
export function parseIcs(text: string, fallbackTz: string): ParsedFeed {
  const busy: BusyBlock[] = [];
  let events = 0;
  let skippedRecurring = 0;
  let cur: Record<string, { params: Record<string, string>; value: string }> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur) {
        events++;
        const status = cur.STATUS?.value.toUpperCase();
        const transp = cur.TRANSP?.value.toUpperCase();
        if (cur.RRULE || cur.RDATE) skippedRecurring++;
        else if (status !== "CANCELLED" && transp !== "TRANSPARENT" && cur.DTSTART) {
          const start = toMs(cur.DTSTART.value, cur.DTSTART.params, fallbackTz);
          let end: number | null = null;
          if (cur.DTEND) end = toMs(cur.DTEND.value, cur.DTEND.params, fallbackTz);
          else if (cur.DURATION && start !== null) { const d = durationMs(cur.DURATION.value); end = d === null ? null : start + d; }
          else if (start !== null) {
            // No end: an all-day event takes the day; a timed one takes nothing we can name.
            end = cur.DTSTART.params.VALUE === "DATE" || /^\d{8}$/.test(cur.DTSTART.value.trim()) ? start + 86400000 : start;
          }
          if (start !== null && end !== null && end > start) busy.push({ start, end });
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const s = splitLine(line);
    if (s) cur[s.name] = { params: s.params, value: s.value };
  }
  busy.sort((a, b) => a.start - b.start);
  return { busy, events, skippedRecurring };
}

/* ----------------------------------------------------------- the windows */

export interface BookingRulesLike {
  lead_hours?: number;
  buffer_min?: number;
  max_days_ahead?: number;
  slot_min?: number;
}

export interface Opening {
  key: string;
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

const DEFAULTS = { lead_hours: 2, buffer_min: 0, max_days_ahead: 14, slot_min: 30 };

function hhmm(s: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function dayIntervals(h: Hours | undefined): Array<[string, string]> {
  if (!h) return [];
  if (h.intervals?.length) return h.intervals.filter((i) => i.open && i.close).map((i) => [i.open, i.close] as [string, string]);
  return h.open && h.close ? [[h.open, h.close]] : [];
}

function closedOn(closures: Closure[] | undefined, key: string): boolean {
  return !!closures?.some((c) => c.date <= key && key <= (c.until && c.until >= c.date ? c.until : c.date));
}

/**
 * The open windows, day by day: opening hours minus what is taken (each
 * taken block widened by the buffer), never earlier than now plus the lead
 * time, never shorter than one slot, never on a closed date.
 */
export function freeWindows(input: FreeWindowsInput): Opening[] {
  const rules = { ...DEFAULTS, ...(input.rules ?? {}) };
  const leadMs = rules.lead_hours * 3600_000;
  const bufferMs = rules.buffer_min * 60_000;
  const slotMs = rules.slot_min * 60_000;
  const earliest = input.now.getTime() + leadMs;
  const busy = input.busy.map((b) => ({ start: b.start - bufferMs, end: b.end + bufferMs })).sort((a, b) => a.start - b.start);
  const out: Opening[] = [];
  for (let offset = 0; offset < rules.max_days_ahead; offset++) {
    const at = input.now.getTime() + offset * 86400_000;
    const day = dayInZone(input.tz, at);
    if (closedOn(input.closures, day.key)) continue;
    const ranges = dayIntervals(input.hours?.[day.weekday]);
    const windows: Array<{ start: number; end: number }> = [];
    for (const [open, close] of ranges) {
      const o = hhmm(open), c = hhmm(close);
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
        label: new Intl.DateTimeFormat("en-US", { timeZone: input.tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(at)),
        windows,
      });
    }
  }
  return out;
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
 */
export function describeOpenings(openings: Opening[], tz: string, opts: { maxDays?: number; daysAhead?: number } = {}): string {
  const maxDays = opts.maxDays ?? 5;
  const ahead = opts.daysAhead ?? DEFAULTS.max_days_ahead;
  if (!openings.length) {
    return `Open times (from the calendar): nothing is open in the next ${ahead} days. Offer to have someone call back, and send the booking link so they are told when a slot frees up.`;
  }
  const lines = openings.slice(0, maxDays).map((o) => `- ${o.label}: ${o.windows.map((w) => span(tz, w.start, w.end)).join(", ")}`);
  return (
    `Open times (from the calendar, checked just now — these change as bookings come in):\n${lines.join("\n")}\n` +
    `Offer up to three of these that fit what they want, then send the booking link to lock one in. Never confirm a slot yourself; the calendar decides.`
  );
}
