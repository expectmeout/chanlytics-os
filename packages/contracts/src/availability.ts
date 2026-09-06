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

/** One taken block with the words the owner's calendar gave it. */
export interface FeedItem extends BusyBlock {
  title: string;
  allDay: boolean;
  uid: string | null;
}

export interface ParsedFeed {
  busy: BusyBlock[];
  /** The same blocks as `busy`, with their titles — for the board. */
  items: FeedItem[];
  /** VEVENTs read, before any were dropped. */
  events: number;
  /** Recurring events expanded inside the horizon. */
  recurringExpanded: number;
  /** Recurring rules this parser does not understand (BYSETPOS, numbered
   *  BYDAY, hourly…): their first occurrence is kept, the rest is not, and
   *  they are counted so the diagnostic can say so. */
  skippedRecurring: number;
}

export interface ParseOptions {
  /** Occurrences of recurring events are produced inside this window only
   *  (epoch ms). Default: yesterday to ninety days out. */
  horizon?: { from: number; to: number };
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

/** The wall clock of an instant in `tz`. */
export function clockInZone(tz: string, atMs: number): { hh: number; mm: number; ss: number } {
  const p = zoneParts(tz, new Date(atMs));
  return { hh: p.hh, mm: p.mm, ss: p.ss };
}

/** "YYYY-MM-DD" and the weekday key ("mon".."sun") of an instant in `tz`. */
export function dayInZone(tz: string, atMs: number): { key: string; weekday: string; y: number; m: number; d: number } {
  const p = zoneParts(tz, new Date(atMs));
  const pad = (n: number) => String(n).padStart(2, "0");
  return { key: `${p.y}-${pad(p.m)}-${pad(p.d)}`, weekday: p.weekday, y: p.y, m: p.m, d: p.d };
}

/* ------------------------------------------------------------ the feed */

/** iCal TEXT escapes: \, \; \n and \\. */
function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c)).trim();
}

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

/** The wall-clock parts of an iCal date-time in the zone it names (or the
 *  fallback), so a recurring series can be stepped by calendar days. */
function localPartsOf(value: string, params: Record<string, string>, fallbackTz: string): { tz: string; y: number; m: number; d: number; hh: number; mm: number; allDay: boolean } | null {
  const v = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || params.VALUE === "DATE") {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { tz: fallbackTz, y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), hh: 0, mm: 0, allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  if (m[7]) {
    const p = zoneParts(fallbackTz, new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))));
    return { tz: fallbackTz, y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm, allDay: false };
  }
  return { tz: params.TZID ?? fallbackTz, y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), hh: Number(m[4]), mm: Number(m[5]), allDay: false };
}

const WEEKDAYS = ["su", "mo", "tu", "we", "th", "fr", "sa"];

interface Rule { freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"; interval: number; count: number | null; until: number | null; byday: number[] | null; bymonthday: number | null }

/** RRULE, in the forms a salon's calendar actually carries. Null = not understood. */
function parseRule(value: string, fallbackTz: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const kv of value.split(";")) { const eq = kv.indexOf("="); if (eq > 0) parts[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1); }
  const freq = parts.FREQ as Rule["freq"] | undefined;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  for (const k of Object.keys(parts)) if (!["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "WKST"].includes(k)) return null;
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1) || 1);
  const count = parts.COUNT ? Number(parts.COUNT) : null;
  let until: number | null = null;
  if (parts.UNTIL) {
    until = toMs(parts.UNTIL, {}, fallbackTz);
    if (until !== null && /^\d{8}$/.test(parts.UNTIL)) until += 86400000 - 1; // a date UNTIL includes that day
  }
  let byday: number[] | null = null;
  if (parts.BYDAY) {
    byday = [];
    for (const d of parts.BYDAY.split(",")) {
      const i = WEEKDAYS.indexOf(d.trim().toLowerCase());
      if (i === -1) return null; // "2TU" and friends
      byday.push(i);
    }
    if (freq !== "WEEKLY") return null;
  }
  let bymonthday: number | null = null;
  if (parts.BYMONTHDAY) {
    if (freq !== "MONTHLY" || parts.BYMONTHDAY.includes(",")) return null;
    bymonthday = Number(parts.BYMONTHDAY);
    if (!Number.isInteger(bymonthday) || bymonthday < 1 || bymonthday > 31) return null;
  }
  return { freq, interval, count: count && count > 0 ? count : null, until, byday, bymonthday };
}

/** Days since epoch for a calendar date, for stepping and week arithmetic. */
const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);

/**
 * The occurrences of a recurring event, as [start, end] instants inside the
 * horizon. Stepped by calendar day in the event's own zone, so a weekly
 * appointment stays at 2 PM across a DST change.
 */
function occurrences(
  start: { tz: string; y: number; m: number; d: number; hh: number; mm: number },
  durMs: number,
  rule: Rule,
  exdates: Set<number>,
  horizon: { from: number; to: number },
): BusyBlock[] {
  const out: BusyBlock[] = [];
  const first = dayNumber(start.y, start.m, start.d);
  const firstDate = new Date(first * 86400000);
  const firstWeek = Math.floor((first - ((firstDate.getUTCDay() + 6) % 7)) / 7); // Monday-based week index
  const wanted = rule.byday ?? [firstDate.getUTCDay()];
  let produced = 0;
  for (let n = 0; n < 20000; n++) {
    const day = first + n;
    const at = new Date(day * 86400000);
    const y = at.getUTCFullYear(), m = at.getUTCMonth() + 1, d = at.getUTCDate();
    let hit = false;
    if (rule.freq === "DAILY") hit = n % rule.interval === 0;
    else if (rule.freq === "WEEKLY") {
      const week = Math.floor((day - ((at.getUTCDay() + 6) % 7)) / 7);
      hit = wanted.includes(at.getUTCDay()) && (week - firstWeek) % rule.interval === 0;
    } else if (rule.freq === "MONTHLY") {
      const months = (y - start.y) * 12 + (m - start.m);
      hit = d === (rule.bymonthday ?? start.d) && months % rule.interval === 0;
    } else if (rule.freq === "YEARLY") {
      hit = m === start.m && d === start.d && (y - start.y) % rule.interval === 0;
    }
    if (!hit) continue;
    const s = localToUtcMs(start.tz, y, m, d, start.hh, start.mm);
    if (rule.until !== null && s > rule.until) break;
    produced++;
    if (rule.count !== null && produced > rule.count) break;
    if (s > horizon.to) break;
    if (exdates.has(s)) continue;
    if (s + durMs >= horizon.from) out.push({ start: s, end: s + durMs });
  }
  return out;
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
export function parseIcs(text: string, fallbackTz: string, opts: ParseOptions = {}): ParsedFeed {
  const horizon = opts.horizon ?? { from: Date.now() - 86400000, to: Date.now() + 90 * 86400000 };
  const busy: BusyBlock[] = [];
  const items: FeedItem[] = [];
  let events = 0;
  let recurringExpanded = 0;
  let skippedRecurring = 0;
  let cur: Record<string, { params: Record<string, string>; value: string }> | null = null;
  const exdatesOf: Array<{ params: Record<string, string>; value: string }> = [];
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { cur = {}; exdatesOf.length = 0; continue; }
    if (line === "END:VEVENT") {
      if (cur) {
        events++;
        const status = cur.STATUS?.value.toUpperCase();
        const transp = cur.TRANSP?.value.toUpperCase();
        if (status !== "CANCELLED" && transp !== "TRANSPARENT" && cur.DTSTART) {
          const start = toMs(cur.DTSTART.value, cur.DTSTART.params, fallbackTz);
          let end: number | null = null;
          if (cur.DTEND) end = toMs(cur.DTEND.value, cur.DTEND.params, fallbackTz);
          else if (cur.DURATION && start !== null) { const d = durationMs(cur.DURATION.value); end = d === null ? null : start + d; }
          else if (start !== null) {
            // No end: an all-day event takes the day; a timed one takes nothing we can name.
            end = cur.DTSTART.params.VALUE === "DATE" || /^\d{8}$/.test(cur.DTSTART.value.trim()) ? start + 86400000 : start;
          }
          if (start !== null && end !== null && end > start) {
            const title = unescapeText(cur.SUMMARY?.value ?? "");
            const allDay = cur.DTSTART.params.VALUE === "DATE" || /^\d{8}$/.test(cur.DTSTART.value.trim());
            const uid = cur.UID?.value.trim() || null;
            const rule = cur.RRULE ? parseRule(cur.RRULE.value, fallbackTz) : null;
            const local = cur.RRULE ? localPartsOf(cur.DTSTART.value, cur.DTSTART.params, fallbackTz) : null;
            if (cur.RRULE && rule && local) {
              const ex = new Set<number>();
              for (const e of exdatesOf) for (const v of e.value.split(",")) { const ms = toMs(v, e.params, fallbackTz); if (ms !== null) ex.add(ms); }
              const occ = occurrences(local, end - start, rule, ex, horizon);
              busy.push(...occ);
              for (const o of occ) items.push({ ...o, title, allDay, uid });
              recurringExpanded++;
            } else {
              // Understood as a single event; a rule we cannot read keeps its first occurrence.
              if (cur.RRULE || cur.RDATE) skippedRecurring++;
              busy.push({ start, end });
              items.push({ start, end, title, allDay, uid });
            }
          }
        }
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const s = splitLine(line);
    if (!s) continue;
    if (s.name === "EXDATE") { exdatesOf.push({ params: s.params, value: s.value }); continue; }
    cur[s.name] = { params: s.params, value: s.value };
  }
  busy.sort((a, b) => a.start - b.start);
  items.sort((a, b) => a.start - b.start);
  return { busy, items, events, recurringExpanded, skippedRecurring };
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

export function dayIntervals(h: Hours | undefined): Array<[string, string]> {
  if (!h) return [];
  if (h.intervals?.length) return h.intervals.filter((i) => i.open && i.close).map((i) => [i.open, i.close] as [string, string]);
  return h.open && h.close ? [[h.open, h.close]] : [];
}

export function closedOn(closures: Closure[] | undefined, key: string): boolean {
  return !!closures?.some((c) => c.date <= key && key <= (c.until && c.until >= c.date ? c.until : c.date));
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
        weekday: day.weekday,
        label: new Intl.DateTimeFormat("en-US", { timeZone: input.tz, weekday: "long", month: "long", day: "numeric" }).format(new Date(at)),
        windows,
      });
    }
  }
  return out;
}

const DAY_NAMES: Record<string, string> = {
  mon: "mon", monday: "mon", tue: "tue", tues: "tue", tuesday: "tue", wed: "wed", wednesday: "wed",
  thu: "thu", thur: "thu", thurs: "thu", thursday: "thu", fri: "fri", friday: "fri", sat: "sat", saturday: "sat", sun: "sun", sunday: "sun",
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
 */
export function describeOpenings(openings: Opening[], tz: string, opts: { maxDays?: number; daysAhead?: number } = {}): string {
  const maxDays = opts.maxDays ?? 5;
  const ahead = opts.daysAhead ?? BOOKING_DEFAULTS.max_days_ahead;
  if (!openings.length) {
    return `Open times (from the calendar): nothing is open in the next ${ahead} days. Offer to have someone call back, and send the booking link so they are told when a slot frees up.`;
  }
  const lines = openings.slice(0, maxDays).map((o) => `- ${o.label}: ${o.windows.map((w) => span(tz, w.start, w.end)).join(", ")}`);
  return (
    `Open times (from the calendar, checked just now — these change as bookings come in):\n${lines.join("\n")}\n` +
    `Offer up to three of these that fit what they want, then send the booking link to lock one in. Never confirm a slot yourself; the calendar decides.`
  );
}
