/**
 * The taken time in a calendar feed (parseIcs): its events, each recurring series expanded inside a horizon, and
 * the occurrences an override moved or cancelled; with the shapes a read returns (BusyBlock, FeedItem, ParsedFeed).
 * The text is read line by line in ics-text.ts; the open times are worked out from the result in availability.ts.
 */
import { DAY_MS } from "../shared/time";
import { dayNumber, localToUtcMs } from "../shared/zone/math";
import { durationMs, localPartsOf, splitLine, toMs, unescapeText, unfold } from "./ics-text";
import { isOneOf } from "../shared/unknown";

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
  /**
   * For one occurrence of a repeating event, the instant it was due before any override moved it (epoch ms): its own
   * start when the rule made it, the RECURRENCE-ID when an override moved it. Absent on a single event. With the UID it
   * keys the appointment (appointment-key.ts), so a moved occurrence keeps its row.
   */
  occurrence?: number;
  /**
   * What a member said became of this visit (decision 0002 step 8), as the record's row holds it: kept or missed. Never
   * read from a calendar; set only where the record joins the feed (feedWithRecord). Absent while it stands.
   */
  said?: "kept" | "missed";
  /**
   * The id of the record's row for this visit (appointments.id), as the Calendar names a visit it opens (visitRoute): a feed
   * event's row by its key, a booking's own. Never read from a calendar; set only where the record joins the feed
   * (feedWithRecord), and absent for an event the hourly sync has not kept a row for.
   */
  recordId?: string;
  /**
   * The person a booking's row is linked to (appointments.contact_id: the read's match, a request's person, a merge's
   * keeper), so the visits index finds the row by its person as the board does (personOfAppointment). Never read from a
   * calendar; set only on a booking's own row where the record joins the feed (feedItemOfAppointment).
   */
  contactId?: string;
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
/** The frequencies a repeat rule may have, as the feed's RRULE says them. */
const RULE_FREQS = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const satisfies readonly Rule["freq"][];

function parseRule(value: string, fallbackTz: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const kv of value.split(";")) {
    const eq = kv.indexOf("=");
    if (eq > 0) parts[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
  }
  const freq = parts.FREQ;
  if (!isOneOf(RULE_FREQS, freq)) return null;
  for (const k of Object.keys(parts))
    if (!["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "WKST"].includes(k)) return null;
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1) || 1);
  const count = parts.COUNT ? Number(parts.COUNT) : null;
  let until: number | null = null;
  if (parts.UNTIL) {
    until = toMs(parts.UNTIL, {}, fallbackTz);
    if (until !== null && /^\d{8}$/.test(parts.UNTIL)) until += DAY_MS - 1; // a date UNTIL includes that day
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
  const firstDate = new Date(first * DAY_MS);
  const firstWeek = Math.floor((first - ((firstDate.getUTCDay() + 6) % 7)) / 7); // Monday-based week index
  const wanted = rule.byday ?? [firstDate.getUTCDay()];
  let produced = 0;
  for (let count = 0; count < 20000; count++) {
    const day = first + count;
    const at = new Date(day * DAY_MS);
    const uTCFullYear = at.getUTCFullYear(),
      uTCMonth = at.getUTCMonth() + 1,
      uTCDate = at.getUTCDate();
    let hit: boolean;
    if (rule.freq === "DAILY") hit = count % rule.interval === 0;
    else if (rule.freq === "WEEKLY") {
      const week = Math.floor((day - ((at.getUTCDay() + 6) % 7)) / 7);
      hit = wanted.includes(at.getUTCDay()) && (week - firstWeek) % rule.interval === 0;
    } else if (rule.freq === "MONTHLY") {
      const months = (uTCFullYear - start.y) * 12 + (uTCMonth - start.m);
      hit = uTCDate === (rule.bymonthday ?? start.d) && months % rule.interval === 0;
    } else {
      // YEARLY, the last of the four.
      hit = uTCMonth === start.m && uTCDate === start.d && (uTCFullYear - start.y) % rule.interval === 0;
    }
    if (!hit) continue;
    const result = localToUtcMs(start.tz, uTCFullYear, uTCMonth, uTCDate, start.hh, start.mm);
    if (rule.until !== null && result > rule.until) break;
    produced++;
    if (rule.count !== null && produced > rule.count) break;
    if (result > horizon.to) break;
    if (exdates.has(result)) continue;
    if (result + durMs >= horizon.from) out.push({ start: result, end: result + durMs });
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
/** An item's place in its series (FeedItem.occurrence), or nothing for a single event. */
const seriesOf = (occurrence: number | null): { occurrence?: number } => (occurrence === null ? {} : { occurrence });

/** A content line of an event as splitLine reads it: its parameters and its value. */
type IcsValue = { params: Record<string, string>; value: string };

/** One content line of an event, kept where the event keeps it: a date taken out, a date added, who attends, or a property. */
function keepEventLine(cur: RawEvent, line: string): void {
  const result = splitLine(line);
  if (!result) return;
  if (result.name === "EXDATE") {
    cur.exdates.push({ params: result.params, value: result.value });
    return;
  }
  if (result.name === "RDATE") {
    cur.rdates.push({ params: result.params, value: result.value });
    return;
  }
  if (result.name === "ATTENDEE") {
    const v = result.value.trim();
    cur.attendees.push({
      name: result.params.CN?.trim() || null,
      email: /^mailto:/i.test(v) ? v.slice(7).toLowerCase() : null,
    });
    return;
  }
  cur.props[result.name] = { params: result.params, value: result.value };
}

/** The first pass: every VEVENT as the text gives it. */
function rawEventsOf(text: string): RawEvent[] {
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
    if (cur) keepEventLine(cur, line);
  }
  return raws;
}

/** The occurrences an override replaces, by the series' UID: cancelled or moved, the series no longer has that instance. */
function overriddenOf(raws: readonly RawEvent[], fallbackTz: string): Map<string, Set<number>> {
  const overridden = new Map<string, Set<number>>();
  for (const raw of raws) {
    const rid = raw.props["RECURRENCE-ID"];
    const uid = raw.props.UID?.value.trim();
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
  return overridden;
}

/** Whether an event's start is a day, not a moment: a DATE value, or eight digits. */
const startsAllDay = (dtstart: IcsValue): boolean =>
  dtstart.params.VALUE === "DATE" || /^\d{8}$/.test(dtstart.value.trim());

/**
 * An event's span: its start, and its end as DTEND or DURATION say, or, with neither, an all-day event's day and a timed
 * one's nothing we can name. Null where it cannot be read, or ends before it starts.
 */
function eventSpanOf(props: RawEvent["props"], dtstart: IcsValue, fallbackTz: string): BusyBlock | null {
  const start = toMs(dtstart.value, dtstart.params, fallbackTz);
  let end: number | null = null;
  if (props.DTEND) end = toMs(props.DTEND.value, props.DTEND.params, fallbackTz);
  else if (props.DURATION && start !== null) {
    const d = durationMs(props.DURATION.value);
    end = d === null ? null : start + d;
  } else if (start !== null) end = startsAllDay(dtstart) ? start + DAY_MS : start;
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

/** What the board says of an event: its title, whether it takes the day, its series, words, place, who attends and who asked. */
function eventWordsOf(raw: RawEvent, allDay: boolean) {
  const props = raw.props;
  const org = props.ORGANIZER?.value.trim() ?? "";
  return {
    title: unescapeText(props.SUMMARY?.value ?? ""),
    allDay,
    uid: props.UID?.value.trim() || null,
    description: unescapeText(props.DESCRIPTION?.value ?? "") || null,
    location: unescapeText(props.LOCATION?.value ?? "") || null,
    attendees: raw.attendees.slice(),
    organizer: /^mailto:/i.test(org) ? org.slice(7).toLowerCase() : null,
  };
}

/** What placing a feed's events holds: the window, the zone, the overrides, and the blocks and items so far. */
interface FeedPlacing {
  horizon: { from: number; to: number };
  fallbackTz: string;
  overridden: Map<string, Set<number>>;
  busy: BusyBlock[];
  items: FeedItem[];
}

/** One occurrence kept: a block, and the board's item for it with the event's words and its place in the series. */
type PlaceOccurrence = (o: BusyBlock, occurrence?: number | null) => void;

/** The dates a series adds (RDATE) that the rule does not produce, the dates taken out and the horizon allowing. */
function placeAddedDates(
  raw: RawEvent,
  dur: number,
  dates: { ex: Set<number>; seen: Set<number> },
  at: { feed: FeedPlacing; place: PlaceOccurrence },
): void {
  const { horizon, fallbackTz } = at.feed;
  for (const ms of instantsOf(raw.rdates, fallbackTz)) {
    if (dates.ex.has(ms) || dates.seen.has(ms) || ms > horizon.to || ms + dur < horizon.from) continue;
    dates.seen.add(ms);
    at.place({ start: ms, end: ms + dur }, ms);
  }
}

/** A series by its rule: each occurrence the rule gives in the horizon, but those taken out or overridden, then its added dates. */
function placeRuleSeries(
  raw: RawEvent,
  series: { rule: Rule; local: NonNullable<ReturnType<typeof localPartsOf>>; dur: number; uid: string | null },
  at: { feed: FeedPlacing; place: PlaceOccurrence },
): void {
  const { feed, place } = at;
  const ex = new Set<number>(instantsOf(raw.exdates, feed.fallbackTz));
  for (const ms of series.uid ? (feed.overridden.get(series.uid) ?? []) : []) ex.add(ms);
  const seen = new Set<number>();
  for (const o of occurrences(series.local, series.dur, series.rule, ex, feed.horizon)) {
    if (!seen.has(o.start)) {
      seen.add(o.start);
      place(o, o.start);
    }
  }
  // RDATE: dates the rule does not produce, added to the series.
  placeAddedDates(raw, series.dur, { ex, seen }, at);
}

/**
 * One event placed: dropped (cancelled, transparent, no start, no span), a series by its rule, a list of dates with no
 * rule, or a single event, an override standing where it moved to, or a rule we cannot read keeping its first
 * occurrence. What it was, for the feed's counts.
 */
function placeEvent(raw: RawEvent, feed: FeedPlacing): "none" | "series" | "unread" | "single" {
  const props = raw.props;
  const status = props.STATUS?.value.toUpperCase();
  const transp = props.TRANSP?.value.toUpperCase();
  const dtstart = props.DTSTART;
  if (status === "CANCELLED" || transp === "TRANSPARENT" || !dtstart) return "none";
  const span = eventSpanOf(props, dtstart, feed.fallbackTz);
  if (!span) return "none";
  const words = eventWordsOf(raw, startsAllDay(dtstart));
  const place: PlaceOccurrence = (o, occurrence = null) => {
    feed.busy.push(o);
    feed.items.push({ ...o, ...words, ...seriesOf(occurrence) });
  };
  const at = { feed, place };
  const ruled = !!props.RRULE && !props["RECURRENCE-ID"];
  const rule = ruled && props.RRULE ? parseRule(props.RRULE.value, feed.fallbackTz) : null;
  const local = ruled ? localPartsOf(dtstart.value, dtstart.params, feed.fallbackTz) : null;
  const dur = span.end - span.start;
  if (ruled && rule && local) {
    placeRuleSeries(raw, { rule, local, dur, uid: words.uid }, at);
    return "series";
  }
  if (!props.RRULE && raw.rdates.length && !props["RECURRENCE-ID"]) {
    // A list of dates with no rule: the event and its extra dates are a series.
    place({ start: span.start, end: span.end }, span.start);
    placeAddedDates(
      raw,
      dur,
      { ex: new Set<number>(instantsOf(raw.exdates, feed.fallbackTz)), seen: new Set([span.start]) },
      at,
    );
    return "series";
  }
  place(span, dueAt(props["RECURRENCE-ID"], feed.fallbackTz));
  return ruled ? "unread" : "single";
}

/** The instant an override's RECURRENCE-ID names: when the occurrence it moves was due. Null for an event that is none. */
function dueAt(rid: { params: Record<string, string>; value: string } | undefined, fallbackTz: string): number | null {
  return rid ? toMs(rid.value, rid.params, fallbackTz) : null;
}

export function parseIcs(text: string, fallbackTz: string, opts: ParseOptions = {}): ParsedFeed {
  const horizon = opts.horizon ?? { from: Date.now() - DAY_MS, to: Date.now() + 90 * DAY_MS };
  const raws = rawEventsOf(text);
  const feed: FeedPlacing = { horizon, fallbackTz, overridden: overriddenOf(raws, fallbackTz), busy: [], items: [] };
  let recurringExpanded = 0;
  let skippedRecurring = 0;
  for (const raw of raws) {
    const placed = placeEvent(raw, feed);
    if (placed === "series") recurringExpanded++;
    else if (placed === "unread") skippedRecurring++;
  }
  feed.busy.sort((a, b) => a.start - b.start);
  feed.items.sort((a, b) => a.start - b.start);
  return { busy: feed.busy, items: feed.items, events: raws.length, recurringExpanded, skippedRecurring };
}
