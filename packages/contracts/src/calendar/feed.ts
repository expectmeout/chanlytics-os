/**
 * The taken time in a calendar feed (parseIcs): its events, each recurring series expanded inside a horizon, and
 * the occurrences an override moved or cancelled; with the shapes a read returns (BusyBlock, FeedItem, ParsedFeed).
 * The text is read line by line in ics-text.ts; the open times are worked out from the result in availability.ts.
 */
import { dayNumber, localToUtcMs } from "./zone-math";
import { durationMs, localPartsOf, splitLine, toMs, unescapeText, unfold } from "./ics-text";

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
