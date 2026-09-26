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
import type { Closure, Hours } from "../config/config";
import { NO_LINK_DETAILS } from "../config/no-booking-link";

/** A taken stretch of time, epoch milliseconds. */
export interface BusyBlock {
  start: number;
  end: number;
}

/** A guest on the event, as the calendar carried them. */
export interface FeedAttendee {
  name: string | null;
  email: string | null;
}

/** One taken block with the words the owner's calendar gave it. */
export interface FeedItem extends BusyBlock {
  title: string;
  allDay: boolean;
  uid: string | null;
  /** The event's description and place, unescaped, as the owner or their booking tool wrote them. */
  description: string | null;
  location: string | null;
  attendees: FeedAttendee[];
  /**
   * The address the event names as its ORGANIZER, lower-cased, or null. On a
   * business's own calendar that is the owner or the booking tool that writes
   * into it -- present on every event, and usually among the guests as well.
   * Kept so the match can tell them from the customer (calendar-people.ts).
   */
  organizer: string | null;
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

interface ZoneParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
  weekday: string;
}

function zoneParts(tz: string, at: Date): ZoneParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hh: Number(get("hour")) % 24,
    mm: Number(get("minute")),
    ss: Number(get("second")),
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

/** Days since epoch for a calendar date, for stepping and week arithmetic. */
const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);

/** The weekday keys in the order getUTCDay() numbers them, which is Sunday first. */
/** The days of the week by their number from Sunday (Date.getUTCDay, and Google's Point.day). */
export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * The local day `days` after the one `atMs` falls on -- BY THE CALENDAR, not by
 * the clock.
 *
 * THE DEFECT THIS EXISTS FOR. Every one of these used to be written as
 * `dayInZone(tz, now + n * 86_400_000)`: add a fixed number of milliseconds,
 * then ask which local day that landed on. Two days a year that is not the
 * next day. On 8 March 2026 New York loses an hour, so a customer asking at
 * 23:30 the night before was offered 9 March next and **8 March was never
 * offered at all**; on 1 November it gains one, so a read at 00:30 emitted
 * 1 November twice and lost a day off the far end of the horizon. Nobody sees
 * an error: the receptionist simply says the wrong days out loud.
 *
 * A calendar day is a count of days, so it is counted in days. The date is
 * read in the business's zone, stepped over UTC midnights (which never shift),
 * and handed back as a date -- no instant is carried across the boundary, so
 * there is nothing for an hour to move. The RRULE expander below has always
 * stepped this way, which is why a weekly appointment stays at 2 PM across a
 * change and the offered days did not. `calendar.ts shiftKey` is the twin that
 * steps a DATE to a date; this is the one that starts from an instant, which
 * is where reading "now" went wrong.
 */
export function dayPlusInZone(
  tz: string,
  atMs: number,
  days: number,
): { key: string; weekday: string; y: number; m: number; d: number } {
  const from = dayInZone(tz, atMs);
  if (days === 0) return from;
  const at = new Date((dayNumber(from.y, from.m, from.d) + days) * 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = at.getUTCFullYear(),
    m = at.getUTCMonth() + 1,
    d = at.getUTCDate();
  return { key: `${y}-${pad(m)}-${pad(d)}`, weekday: WEEKDAY_KEYS[at.getUTCDay()], y, m, d };
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

/**
 * "DTSTART;TZID=America/New_York:20260909T140000" → { name, params, value }.
 * A quoted parameter may hold ":" or ";" (CN="Lopez, Maria: stylist"), so
 * the split respects quotes and drops them.
 */
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  let colon = -1;
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === ":" && !q) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let cur = "";
  q = false;
  for (const ch of head) {
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === ";" && !q) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  const [name, ...rest] = parts;
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
function localPartsOf(
  value: string,
  params: Record<string, string>,
  fallbackTz: string,
): { tz: string; y: number; m: number; d: number; hh: number; mm: number; allDay: boolean } | null {
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
    const p = zoneParts(
      fallbackTz,
      new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))),
    );
    return { tz: fallbackTz, y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm, allDay: false };
  }
  return {
    tz: params.TZID ?? fallbackTz,
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    hh: Number(m[4]),
    mm: Number(m[5]),
    allDay: false,
  };
}

const WEEKDAYS = ["su", "mo", "tu", "we", "th", "fr", "sa"];

interface Rule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  until: number | null;
  byday: number[] | null;
  bymonthday: number | null;
}

/** RRULE, in the forms a salon's calendar actually carries. Null = not understood. */
function parseRule(value: string, fallbackTz: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const kv of value.split(";")) {
    const eq = kv.indexOf("=");
    if (eq > 0) parts[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
  }
  const freq = parts.FREQ as Rule["freq"] | undefined;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  for (const k of Object.keys(parts))
    if (!["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "WKST"].includes(k)) return null;
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
    const y = at.getUTCFullYear(),
      m = at.getUTCMonth() + 1,
      d = at.getUTCDate();
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
  return (
    sign * ((Number(m[2] ?? 0) * 86400 + Number(m[3] ?? 0) * 3600 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)) * 1000)
  );
}

/** One VEVENT as the text gives it, before it is read. */
interface RawEvent {
  props: Record<string, { params: Record<string, string>; value: string }>;
  exdates: Array<{ params: Record<string, string>; value: string }>;
  rdates: Array<{ params: Record<string, string>; value: string }>;
  attendees: FeedAttendee[];
}

/** The instants an EXDATE or RDATE line names; a PERIOD value (start/end) is left alone. */
function instantsOf(lines: Array<{ params: Record<string, string>; value: string }>, fallbackTz: string): number[] {
  const out: number[] = [];
  for (const e of lines) {
    for (const v of e.value.split(",")) {
      if (v.includes("/")) continue;
      const ms = toMs(v, e.params, fallbackTz);
      if (ms !== null) out.push(ms);
    }
  }
  return out;
}

/**
 * The taken time in a feed. Cancelled events and events marked transparent
 * (free) are not taken. A recurring event is expanded when its rule is one a
 * salon's calendar carries (parseRule); a rule that cannot be read keeps its
 * first occurrence and is counted as skipped. RDATE adds dates to a series
 * (or makes one of a single event); a VEVENT with RECURRENCE-ID replaces one
 * occurrence of the series with the same UID -- the moved instance is drawn
 * where it moved to, and a cancelled override removes its instance -- which
 * is what Google writes when one appointment in a weekly series is moved.
 */
export function parseIcs(text: string, fallbackTz: string, opts: ParseOptions = {}): ParsedFeed {
  const horizon = opts.horizon ?? { from: Date.now() - 86400000, to: Date.now() + 90 * 86400000 };
  const busy: BusyBlock[] = [];
  const items: FeedItem[] = [];
  let events = 0;
  let recurringExpanded = 0;
  let skippedRecurring = 0;

  // First pass: every VEVENT as the text gives it.
  const raws: RawEvent[] = [];
  let cur: RawEvent | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = { props: {}, exdates: [], rdates: [], attendees: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) raws.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const s = splitLine(line);
    if (!s) continue;
    if (s.name === "EXDATE") {
      cur.exdates.push({ params: s.params, value: s.value });
      continue;
    }
    if (s.name === "RDATE") {
      cur.rdates.push({ params: s.params, value: s.value });
      continue;
    }
    if (s.name === "ATTENDEE") {
      const v = s.value.trim();
      cur.attendees.push({
        name: s.params.CN?.trim() || null,
        email: /^mailto:/i.test(v) ? v.slice(7).toLowerCase() : null,
      });
      continue;
    }
    cur.props[s.name] = { params: s.params, value: s.value };
  }

  // The occurrences an override replaces, by the series' UID: cancelled or
  // moved, the series no longer has that instance.
  const overridden = new Map<string, Set<number>>();
  for (const r of raws) {
    const rid = r.props["RECURRENCE-ID"];
    const uid = r.props.UID?.value.trim();
    if (!rid || !uid) continue;
    const ms = toMs(rid.value, rid.params, fallbackTz);
    if (ms === null) continue;
    let set = overridden.get(uid);
    if (!set) {
      set = new Set();
      overridden.set(uid, set);
    }
    set.add(ms);
  }

  for (const r of raws) {
    events++;
    const p = r.props;
    const status = p.STATUS?.value.toUpperCase();
    const transp = p.TRANSP?.value.toUpperCase();
    if (status === "CANCELLED" || transp === "TRANSPARENT" || !p.DTSTART) continue;
    const start = toMs(p.DTSTART.value, p.DTSTART.params, fallbackTz);
    let end: number | null = null;
    if (p.DTEND) end = toMs(p.DTEND.value, p.DTEND.params, fallbackTz);
    else if (p.DURATION && start !== null) {
      const d = durationMs(p.DURATION.value);
      end = d === null ? null : start + d;
    } else if (start !== null) {
      // No end: an all-day event takes the day; a timed one takes nothing we can name.
      end = p.DTSTART.params.VALUE === "DATE" || /^\d{8}$/.test(p.DTSTART.value.trim()) ? start + 86400000 : start;
    }
    if (start === null || end === null || end <= start) continue;
    const title = unescapeText(p.SUMMARY?.value ?? "");
    const description = unescapeText(p.DESCRIPTION?.value ?? "") || null;
    const location = unescapeText(p.LOCATION?.value ?? "") || null;
    const guests = r.attendees.slice();
    const allDay = p.DTSTART.params.VALUE === "DATE" || /^\d{8}$/.test(p.DTSTART.value.trim());
    const uid = p.UID?.value.trim() || null;
    const org = p.ORGANIZER?.value.trim() ?? "";
    const organizer = /^mailto:/i.test(org) ? org.slice(7).toLowerCase() : null;
    const isOverride = !!p["RECURRENCE-ID"];
    const rule = p.RRULE && !isOverride ? parseRule(p.RRULE.value, fallbackTz) : null;
    const local = p.RRULE && !isOverride ? localPartsOf(p.DTSTART.value, p.DTSTART.params, fallbackTz) : null;
    const dur = end - start;
    const push = (o: BusyBlock) => {
      busy.push(o);
      items.push({ ...o, title, allDay, uid, description, location, attendees: guests, organizer });
    };

    if (p.RRULE && !isOverride && rule && local) {
      const ex = new Set<number>(instantsOf(r.exdates, fallbackTz));
      for (const ms of uid ? (overridden.get(uid) ?? []) : []) ex.add(ms);
      const seen = new Set<number>();
      const occ = occurrences(local, dur, rule, ex, horizon);
      for (const o of occ) {
        if (!seen.has(o.start)) {
          seen.add(o.start);
          push(o);
        }
      }
      // RDATE: dates the rule does not produce, added to the series.
      for (const ms of instantsOf(r.rdates, fallbackTz)) {
        if (ex.has(ms) || seen.has(ms) || ms > horizon.to || ms + dur < horizon.from) continue;
        seen.add(ms);
        push({ start: ms, end: ms + dur });
      }
      recurringExpanded++;
    } else if (!p.RRULE && r.rdates.length && !isOverride) {
      // A list of dates with no rule: the event and its extra dates are a series.
      const ex = new Set<number>(instantsOf(r.exdates, fallbackTz));
      const seen = new Set<number>([start]);
      push({ start, end });
      for (const ms of instantsOf(r.rdates, fallbackTz)) {
        if (ex.has(ms) || seen.has(ms) || ms > horizon.to || ms + dur < horizon.from) continue;
        seen.add(ms);
        push({ start: ms, end: ms + dur });
      }
      recurringExpanded++;
    } else {
      // A single event, an override standing where it moved to, or a rule we
      // cannot read keeping its first occurrence.
      if (p.RRULE && !isOverride) skippedRecurring++;
      push({ start, end });
    }
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

/** A service the business lists, as far as matching one needs it. */
export interface ServiceLike {
  name: string;
  duration_min?: number;
}

// Accents off and case folded: "unas" finds "Uñas de gel", and a caller who
// says "depilacion" means the service written "Depilación". Exported for the
// Business tab's services sheet, whose search folds a name the same way: one
// rule for what counts as the same name, not a copy of it in the page.
export const foldName = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * Whether two names on one of the business's lists (its services, its languages) are one: accents, case and the space
 * around a name are not the name (foldName). The one test for "already there" on such a list: the first run's chips and
 * the Business tab's languages box both ask it, so a language chosen as "Haitian Créole" is the chip "Haitian Creole",
 * and is not offered again beside it. An empty name is no name, and the same as none. A business's own name is
 * facts.ts sameName's, which lets punctuation go too.
 */
export function sameListed(a: string, b: string): boolean {
  const x = foldName(String(a ?? "").trim());
  return x !== "" && x === foldName(String(b ?? "").trim());
}

const wordsOf = (s: string): string[] => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * The listed service somebody means, from what they said ("a haircut", "the
 * balayage thing", "uñas"): exact first, then one name containing the other,
 * then the service sharing the most words of four letters or more.
 *
 * One function for the phone tool and the assistant. The two copies it
 * replaced split words differently, and the phone's cut "uñas" at the ñ into
 * two pieces too short to count, so a caller asking for nails matched nothing.
 */
export function matchService<S extends ServiceLike>(services: readonly S[] | undefined, asked: unknown): S | null {
  const q = typeof asked === "string" ? foldName(asked.trim()) : "";
  if (!q || !services?.length) return null;
  const named = services.map((s) => ({ s, n: foldName(s.name) }));
  const exact = named.find((x) => x.n === q);
  if (exact) return exact.s;
  const contains = named.find((x) => x.n && (x.n.includes(q) || q.includes(x.n)));
  if (contains) return contains.s;
  const asks = wordsOf(q).filter((w) => w.length >= 4);
  let best: S | null = null;
  let bestScore = 0;
  for (const { s, n } of named) {
    const own = wordsOf(n);
    const score = asks.filter((w) => own.includes(w)).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

/** The booking rules as far as a consultation needs them. */
export interface ConsultRules {
  consult_first?: readonly string[];
}

/**
 * Whether a listed service needs a consultation before it can be booked, as Business lists them. Accents, case and the
 * spaces around a name are not the name, as in matchService; the board matched them exactly, lower-cased.
 */
export function needsConsultation(name: string, rules: ConsultRules | null | undefined): boolean {
  const n = foldName(name.trim());
  // A stored list that is not one (a hand-edited record) names nothing, never a throw.
  const list = Array.isArray(rules?.consult_first) ? rules.consult_first : [];
  return !!n && list.some((c) => foldName(String(c).trim()) === n);
}

/** What an asked-for service is offered as: itself, or a consultation first. */
export interface ServiceOffer<S extends ServiceLike = ServiceLike> {
  /** The listed service asked about. */
  service: S;
  /** Offered as a consultation, never as itself. */
  consultation: boolean;
  /** The listed service a consultation is, when the business lists one: the one sharing the service's words first. */
  consultationService: S | null;
  /** How long an open time has to be: the service's own length, a consultation's, or null for any open time. */
  minMinutes: number | null;
}

/**
 * The one rule for a service asked about, for the phone tool, the assistant and the board. A service that needs a
 * consultation first is never offered itself: the consultation is, sized by the consultation the business lists
 * ("Consultation", "Consulta"), or any open time when it lists none. All three sized a three-hour color correction by
 * its own length while the prompt said a consultation comes first (C5b). A client is past the consultation, and is
 * offered the service itself (0004).
 */
export function offerFor<S extends ServiceLike>(
  services: readonly S[] | undefined,
  rules: ConsultRules | null | undefined,
  asked: unknown,
  opts: { client?: boolean } = {},
): ServiceOffer<S> | null {
  const service = matchService(services, asked);
  if (!service) return null;
  // A client is past the consultation (0004): the service itself, sized by its own length.
  if (opts.client)
    return { service, consultation: false, consultationService: null, minMinutes: service.duration_min ?? null };
  if (!needsConsultation(service.name, rules))
    return { service, consultation: false, consultationService: null, minMinutes: service.duration_min ?? null };
  const own = wordsOf(foldName(service.name)).filter((w) => w.length >= 4);
  let consultationService: S | null = null;
  let best = -1;
  for (const s of services ?? []) {
    const n = foldName(s.name);
    if (s === service || !n.includes("consult") || needsConsultation(s.name, rules)) continue;
    const score = wordsOf(n).filter((w) => own.includes(w)).length;
    if (score > best) {
      consultationService = s;
      best = score;
    }
  }
  return { service, consultation: true, consultationService, minMinutes: consultationService?.duration_min ?? null };
}

/**
 * The words before the open times, the phone's and the assistant's alike: a service's length, or that it needs a
 * consultation first and what is offered instead.
 */
export function offerLead(offer: ServiceOffer | null): string {
  if (!offer) return "";
  if (!offer.consultation)
    return offer.service.duration_min
      ? `For ${offer.service.name} (about ${offer.service.duration_min} minutes): `
      : "";
  const c = offer.consultationService;
  const detail = [
    c && foldName(c.name.trim()) !== "consultation" ? c.name : "",
    offer.minMinutes ? `about ${offer.minMinutes} minutes` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return `${offer.service.name} needs a consultation before it can be booked, so offer a consultation instead. For a consultation${detail ? ` (${detail})` : ""}: `;
}
