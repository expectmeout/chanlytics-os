import { agoWords, timezoneCity } from "../shared/time";
/**
 * Calendar — the owner's calendar as the receptionist reads it.
 *
 * A viewer, never a scheduler: what the feed says is taken, the hours and
 * closures the business keeps, and the windows the receptionist would offer
 * a caller — the same windows the phone tool and the assistant compute
 * (availability.ts), so the page shows what callers are told. Nothing is
 * booked here; the booking link does that, whichever tool stands behind it.
 *
 * The DTO is what the route returns for one span of days; the view model is
 * what the page draws — a week or a day on the mockup's own geometry (hours
 * down, days across), a month of counts, or an agenda — with bands where
 * the business is closed, blocks where the calendar is taken, dashed
 * windows where it is open, and the words Settings gave it: the hours, the
 * closures ahead, the booking rules, the services and how long they take.
 * Pure; tests feed fixtures.
 */
import { DAYS, hoursRuns, type BookingRules, type Closure, type Hours } from "../config/config";
import { waWindow } from "../config/policy";
import {
  BOOKING_DEFAULTS,
  clockInZone,
  closedOn,
  dayInZone,
  dayIntervals,
  dayPlusInZone,
  localToUtcMs,
  offerFor,
  type BookingRulesLike,
} from "./availability";
import type { MatchVia } from "./calendar-people";
import type { FeedFailure } from "./feed-url";
import { formatPhoneDisplay } from "../shared/phone";

export interface CalendarItemDto {
  id: string;
  /** ISO instants. */
  start: string;
  end: string;
  title: string;
  all_day: boolean;
  /** The person in People this appointment is for — by a phone in the event, else an address, else a whole name in its words; their thread and last WhatsApp message when they have one. */
  person: { id: string; name: string; via?: MatchVia; thread?: string | null; wa_inbound_at?: string | null } | null;
  /** The event's own words, plain text. */
  description?: string | null;
  location?: string | null;
  /** Phones (E.164) and emails found in the event, for the panel. */
  contacts?: { phones: string[]; emails: string[] };
  /** The client's name as the event gives it, for "Add … to People"; null when the title says nothing name-like. */
  guess?: string | null;
  /**
   * A consultation (0008): the title says so, or names a consult-first service -- deals.ts isConsultationTitle over the
   * workspace's services and rules, set by the server. Absent on an older read.
   */
  consultation?: boolean;
  /** The consult-first service the title names, as Settings spells it (consultServiceOf); null when it names none. */
  consult_service?: string | null;
}

export interface CalendarDayDto {
  /** "YYYY-MM-DD" in the business's zone. */
  key: string;
  items: CalendarItemDto[];
  /** The windows the receptionist would offer that day, ISO instants. */
  windows: Array<{ start: string; end: string }>;
}

export interface CalendarFeedDto {
  present: boolean;
  /** "Google Calendar", "Apple Calendar", "Outlook" or "your calendar" — from the address, which stays on the server. */
  source?: string;
  state: "ok" | "unavailable" | "none";
  read_at: string | null;
  events: number;
  recurring_expanded: number;
  skipped_recurring: number;
  /** Why the last read failed, when it did; with "ok" and a reason the read shown is the last good one (stale). */
  reason?: FeedFailure | null;
  /** The HTTP status when the calendar answered with one. */
  status?: number | null;
  /** The reason as a sentence the owner can act on (feedProblemWords). */
  problem?: string | null;
  /** The last fetch failed and what is shown is the previous read. */
  stale?: boolean;
  /** Items left out of the span because a day held more than the board draws. */
  dropped?: number;
  /** When the calendar was last tried, good or not: the news when a read failed or a refresh couldn't reach it (C2). */
  checked_at?: string | null;
}

export interface CalendarServiceDto {
  name: string;
  duration_min: number | null;
  /** Needs a consultation first: the receptionist books the consult, never the service. */
  consult_first: boolean;
}

/** What `GET /api/v1/calendar?from=&days=` returns. */
export interface CalendarWeekDto {
  timezone: string;
  from: string;
  to: string;
  feed: CalendarFeedDto;
  hours: Record<string, Hours | undefined> | null;
  closures: Closure[];
  /** The booking rules as Settings keeps them: how open times are offered, the party size, the services that need a consultation first. */
  rules: BookingRules | null;
  services: CalendarServiceDto[];
  booking_link: string | null;
  /**
   * The receptionist's next open time from now: the first of every time it would
   * offer, whatever span was asked for. The page worked it out from the loaded
   * weeks, so a board looking at December had none to name (C1).
   */
  next_opening: { start: string; end: string } | null;
  days: CalendarDayDto[];
  error?: string;
}

/* ------------------------------------------------------------ day keys */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_SHORT: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function keyParts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m ?? 1, d: d ?? 1 };
}

/** The key `n` days after `key`. */
export function shiftKey(key: string, n: number): string {
  const { y, m, d } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
}

/** The Monday of the week `key` is in. */
export function mondayOf(key: string): string {
  const { y, m, d } = keyParts(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shiftKey(key, -((dow + 6) % 7));
}

export function isDayKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** The span a month view shows: six weeks from the Monday on or before the first. */
export function monthSpan(key: string): { from: string; days: number } {
  return { from: mondayOf(`${key.slice(0, 7)}-01`), days: 42 };
}

/** The first of the month `n` months away from `key`'s month. */
export function shiftMonth(key: string, n: number): string {
  const { y, m } = keyParts(key);
  const at = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "September 2026" */
export function monthLabelOf(key: string): string {
  const { y, m } = keyParts(key);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1, 12)),
  );
}

/* ----------------------------------------------------------- the words */

/** "9 AM", "2:30 PM". */
export function clockLabel(t: number): string {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  const ap = h >= 12 && h < 24 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ap}`;
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function shortDate(key: string): string {
  const { y, m, d } = keyParts(key);
  return SHORT.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function longDate(key: string): string {
  const { y, m, d } = keyParts(key);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

/**
 * A closure's dates, as the board and Settings › Business both say them: "Dec 24", "Dec 24 – 26" within a month,
 * "Dec 30 – Jan 2" across two. One spelling, here, so the row that counts the closures ahead and the board that
 * draws them never name one date two ways.
 */
export function closureDatesLabel(c: Pick<Closure, "date" | "until">): string {
  if (!(c.until && c.until > c.date)) return shortDate(c.date);
  return `${shortDate(c.date)} – ${c.until.slice(0, 7) === c.date.slice(0, 7) ? c.until.slice(8).replace(/^0/, "") : shortDate(c.until)}`;
}

/**
 * The closures still ahead on the business's day `todayKey`, soonest first. One that ends today is still ahead; an
 * `until` before its `date` is a one-day closure, as the composer reads it.
 */
export function closuresFrom<C extends Pick<Closure, "date" | "until">>(closures: readonly C[], todayKey: string): C[] {
  return closures
    .filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function readAgoLabel(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  return agoWords(Date.parse(iso), now.getTime(), { dateAfterMs: Number.POSITIVE_INFINITY });
}

/** The booking rules as separate phrases, so a narrow screen wraps between rules and never inside one: "at least 2h notice", "15 min between appointments", "up to 14 days ahead", "30-min slots", "up to 6 people per booking" -- Business's own words, least notice and days ahead (C3). */
export function ruleParts(rules: (BookingRulesLike & Pick<BookingRules, "party_max">) | null | undefined): string[] {
  const r = { ...BOOKING_DEFAULTS, ...(rules ?? {}) };
  const parts = [`at least ${r.lead_hours}h notice`];
  if (r.buffer_min > 0) parts.push(`${r.buffer_min} min between appointments`);
  parts.push(`up to ${r.max_days_ahead} days ahead`, `${r.slot_min}-min slots`);
  // The party size a booking is held to, when Settings gives one: the receptionist follows it, and the page never said it (C1).
  if (rules?.party_max)
    parts.push(`up to ${rules.party_max} ${rules.party_max === 1 ? "person" : "people"} per booking`);
  return parts;
}

/** "Offers times with at least 2h notice · 15 min between appointments · up to 14 days ahead · 30-min slots". */
export function rulesLine(rules: (BookingRulesLike & Pick<BookingRules, "party_max">) | null | undefined): string {
  return `Offers times with ${ruleParts(rules).join(" · ")}`;
}

/**
 * What a read left out, in words the owner can act on. The feed line said
 * "2 repeating rules read once" and "3 more not shown" and never what either
 * meant: a repeat whose pattern parseIcs cannot follow keeps only its first
 * date, so a later one could be offered to a caller; and a day holding more
 * events than the board draws still has every one of them taken, because the
 * windows are worked out from all of them.
 */
export function feedNotes(
  feed: Pick<CalendarFeedDto, "state" | "skipped_recurring" | "dropped">,
): CalendarFeedNoteVM[] {
  if (feed.state !== "ok") return [];
  const notes: CalendarFeedNoteVM[] = [];
  const repeats = feed.skipped_recurring || 0;
  if (repeats > 0) {
    const one = repeats === 1;
    notes.push({
      id: "repeats",
      title: `${repeats} repeating event${one ? " counts" : "s count"} only once.`,
      body: `${one ? "It repeats" : "They repeat"} in a pattern the receptionist can't follow, like the second Tuesday of each month, so only the first date is treated as taken, and a caller could be offered a time on a later one. Repeating daily, weekly on set days, or monthly on one date fixes it.`,
    });
  }
  const undrawn = feed.dropped || 0;
  if (undrawn > 0) {
    const one = undrawn === 1;
    notes.push({
      id: "undrawn",
      title: `${undrawn} more event${one ? " isn't" : "s aren't"} drawn.`,
      body: `${one ? "It falls" : "They fall"} on a day holding more events than the board draws; the receptionist still treats ${one ? "its time" : "their times"} as taken.`,
    });
  }
  return notes;
}

/**
 * "Mon–Fri 10 AM – 7 PM", "Wed 9 AM – 1 PM and 3 – 7 PM", "Sun closed" — one line per run of days with the same hours:
 * the prompt's own runs, said in the board's clock. The bar said "10:00–19:00" over a board drawn in 10 AM, and a day
 * with half its hours said the prompt's "ask them to call" to the owner (C3).
 */
export function hoursLines(hours: Record<string, Hours | undefined> | null | undefined): string[] {
  if (!hours) return [];
  const clean: Record<string, Hours> = {};
  for (const d of DAYS) if (hours[d]) clean[d] = hours[d] as Hours;
  return hoursRuns(clean).map(
    (r) =>
      `${DAY_SHORT[r.from] ?? r.from}${r.to !== r.from ? `–${DAY_SHORT[r.to] ?? r.to}` : ""} ${dayHoursWords(clean[r.from])}`,
  );
}

/** One day's hours in the board's clock: its spans; "closed" when it states none; "hours incomplete" when what it states can't be used. */
function dayHoursWords(h: Hours | undefined): string {
  const at = (s: string) => Number(s.split(":")[0]) + Number(s.split(":")[1]) / 60;
  const parts = dayIntervals(h).map(([o, c]) => spanLabel(at(o), at(c)));
  if (!parts.length) return h?.open || h?.close || h?.intervals?.length ? "hours incomplete" : "closed";
  return parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/* ------------------------------------------------------------ the view */

export interface CalendarBlockVM {
  id: string;
  /** Hours from midnight in the business's zone, fractional. */
  t: number;
  /** Minutes. */
  dur: number;
  title: string;
  /** What the appointment is FOR, with the person's name taken out of it: "Gloss" from "Gloss · Emily Chen".
   *  A business writes the customer into the event's own title, so a row that also names them said them twice.
   *  The whole title when nobody is matched, or when taking the name out would leave nothing. */
  service: string;
  /** "2 – 3:30 PM" */
  time: string;
  /** Who it is for; `threadId` is the Inbox thread a booking link is texted into ("th-…"), `replyOpen` whether a plain text still reaches them. */
  person: { id: string; name: string; via: MatchVia | null; threadId: string | null; replyOpen: boolean } | null;
  description: string | null;
  location: string | null;
  /** Display-formatted phones (and the same in E.164, for the add), and the emails the event carried. */
  contacts: { phones: string[]; e164: string[]; emails: string[] };
  /** The client's name as the event gives it, or null. */
  guess: string | null;
  /** A consultation (0008), as the server found it (isConsultationTitle): once it is over, a proposal may follow. */
  consultation: boolean;
  /** The consult-first service its title names, as Settings spells it, or null: what a proposal after it is for. */
  consultService: string | null;
  start: string;
  end: string;
  /** Blocks that overlap in time sit side by side: this block's lane, and how many lanes its cluster needs. */
  lane: number;
  lanes: number;
}

export interface CalendarBandVM {
  from: number;
  to: number;
  label: string | null;
}

export interface CalendarWindowVM {
  t: number;
  dur: number;
  /** "2:30 – 4 PM" */
  label: string;
}

export interface CalendarDayVM {
  key: string;
  dow: string;
  date: string;
  long: string;
  /** "8" — the day of the month, for the month grid. */
  dayNum: string;
  today: boolean;
  past: boolean;
  closed: { yes: boolean; note: string | null };
  bands: CalendarBandVM[];
  blocks: CalendarBlockVM[];
  allDay: CalendarBlockVM[];
  windows: CalendarWindowVM[];
  /** Past the last day the receptionist offers: nothing on it is offered yet, however free it is (C1). */
  beyondOffer: boolean;
}

export interface CalendarServiceVM {
  name: string;
  duration: number | null;
  consultFirst: boolean;
  /** How long an open time must be for it: its own length, or a consultation's when it needs one first (offerFor, C5b). */
  offerMinutes: number | null;
  /** "Balayage · 90 min" */
  label: string;
}

export interface CalendarClosureVM {
  key: string;
  /** "Sep 12" or "Sep 12 – 14" */
  label: string;
  note: string | null;
}

/** Something a read of the calendar left out, said so the owner can act on it. */
export interface CalendarFeedNoteVM {
  id: "repeats" | "undrawn";
  /** "2 repeating events count only once." */
  title: string;
  body: string;
}

/**
 * The calendar feed's state, in the words the Calendar's pill, Connections and Setup all use (C3): the page drew a
 * coloured dot where Connections said "Readable". `stale` is a read that landed before a refresh that didn't.
 */
export const CALENDAR_FEED_WORDS = {
  ok: "Readable",
  stale: "Last good read",
  unavailable: "Could not be read",
  none: "Not connected",
} as const;
export type CalendarFeedHealth = keyof typeof CALENDAR_FEED_WORDS;

export interface CalendarVM {
  timezone: string;
  /** "New York": the zone by the name Settings gives it (C3). */
  zoneCity: string;
  from: string;
  to: string;
  /** "Sep 7 – 13" */
  rangeLabel: string;
  /** "September 2026" — the month a six-week span shows, else the month of `from`. */
  monthLabel: string;
  /** The hours the grid draws, whole hours. */
  hours: { start: number; end: number };
  days: CalendarDayVM[];
  today: string;
  /** Where the now line sits, hours from midnight, when today is in the span. */
  now: number | null;
  feed: {
    present: boolean;
    state: "ok" | "unavailable" | "none";
    line: string;
    events: number;
    source: string;
    problem: string | null;
    stale: boolean;
    /** The state the pill says, in CALENDAR_FEED_WORDS. */
    health: CalendarFeedHealth;
    /** The line without the state the pill says: where and when it was read, when it was tried; "" when that is all. */
    detail: string;
    /**
     * WHEN it was last read, and nothing else: "read 4m ago", "last read 4m ago" for one that failed since, "" with
     * no read at all. For a row that states the calendar as one fact of a record and keeps the rest (where it reads
     * from, how many events it found) for whoever opens it.
     */
    read: string;
    /** Repeating events whose pattern the receptionist cannot follow: only their first date is taken. */
    skippedRecurring: number;
    /** Events past what a crowded day draws; their times are still taken. */
    dropped: number;
    /** Those two explained, when a read that landed left anything out. */
    notes: CalendarFeedNoteVM[];
  };
  stats: { events: number; windows: number; next: string };
  /** How far ahead the receptionist offers times: `days` from today, through the day `until` ("Sep 21"). */
  offer: { days: number; until: string; label: string };
  rules: string;
  /** The same rules as separate phrases. */
  ruleParts: string[];
  hoursLines: string[];
  closuresAhead: CalendarClosureVM[];
  /** Closures ahead past the six the bar names. */
  closuresMore: number;
  /** The services that need a consultation before they can be booked, as Settings names them. */
  consultFirst: string[];
  services: CalendarServiceVM[];
  bookingLink: string | null;
}

function hoursOf(tz: string, ms: number): number {
  const c = clockInZone(tz, ms);
  return c.hh + c.mm / 60;
}

function spanLabel(t1: number, t2: number): string {
  const a = clockLabel(t1);
  const b = clockLabel(t2);
  // One AM or PM for a span inside one half of one day. A span to midnight ends in the next day's AM: its halves were
  // matched by their letters, and "10 AM – 12 AM" read "10 – 12 AM" (C3).
  const sameHalf = t2 < 24 && t1 < 12 === t2 < 12;
  return `${sameHalf ? a.slice(0, -3) : a} – ${b}`;
}

/**
 * When the next open time is, the way an owner says it: "today 3:30 PM",
 * "tomorrow 10 AM", "Fri 10 AM" within the week, and past it the date,
 * "Sep 17, 10 AM" -- a weekday alone named a day a week too soon (C1).
 */
function nextOpenWords(startIso: string | null, tz: string, todayKey: string): string {
  const ms = startIso ? Date.parse(startIso) : Number.NaN;
  if (!Number.isFinite(ms)) return "—";
  const day = dayInZone(tz, ms);
  const clock = clockLabel(hoursOf(tz, ms));
  if (day.key === todayKey) return `today ${clock}`;
  if (day.key === shiftKey(todayKey, 1)) return `tomorrow ${clock}`;
  if (day.key <= shiftKey(todayKey, 6)) return `${DAY_SHORT[day.weekday] ?? day.weekday} ${clock}`;
  return `${shortDate(day.key)}, ${clock}`;
}

/**
 * The appointment's title with the person's name taken out of it, so a row that names them does not say them
 * twice: "Gloss · Emily Chen" beside Emily Chen is "Gloss". A salon writes the customer into the event title,
 * so the feed hands us both, and the Today card and the Calendar's agenda each rendered the pair.
 *
 * Whole words only, either end, and the separator with it -- a dot, a dash, a pipe, a comma, a colon, or the
 * words "with" and "for". What is left of "Emily Chen" in "Emily Chenoweth" is not a match. If taking the name
 * out leaves nothing but punctuation, the title stands as it is: a row saying "Gloss" is better than a row
 * saying nothing, and an event titled only with the name has no service to show.
 */
export function serviceOf(title: string, personName: string | null | undefined): string {
  const whole = (title || "").trim();
  const name = (personName || "").trim();
  if (!whole || !name) return whole;
  const quoted = name.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  // The join between a service and a name: spaces, and at most one of a dash, a middle dot, a pipe, a comma, a
  // colon, or the word "with" or "for".
  const gap = String.raw`\s*(?:[-–—·|,:]|\bwith\b|\bfor\b)?\s*`;
  // Whole words only, so "Emily Chen" does not cut into "Emily Chenoweth".
  const edge = String.raw`(?![\p{L}\p{N}])`;
  const cut = whole
    .replace(new RegExp(`^${gap}${quoted}${edge}${gap}`, "iu"), "")
    .replace(new RegExp(`${gap}(?<![\\p{L}\\p{N}])${quoted}${gap}$`, "iu"), "")
    .trim();
  // Nothing but punctuation left means the title WAS the name, and there is no service to show.
  return cut.replace(/[-–—·|,:\s]/gu, "") ? cut : whole;
}

function toBlock(item: CalendarItemDto, tz: string, dayStartMs: number, dayEndMs: number, now: Date): CalendarBlockVM {
  const s = Math.max(Date.parse(item.start), dayStartMs);
  const e = Math.min(Date.parse(item.end), dayEndMs);
  const t = s === dayStartMs ? 0 : hoursOf(tz, s);
  const tEnd = e === dayEndMs ? 24 : hoursOf(tz, e);
  return {
    id: item.id,
    t,
    dur: Math.max(15, Math.round((tEnd - t) * 60)),
    title: item.title || "Busy",
    service: serviceOf(item.title || "Busy", item.person?.name ?? null),
    time: spanLabel(t, tEnd),
    person: item.person
      ? {
          id: item.person.id,
          name: item.person.name,
          via: item.person.via ?? null,
          threadId: item.person.thread ? `th-${item.person.thread}` : null,
          replyOpen: item.person.thread ? waWindow(item.person.wa_inbound_at ?? null, now).open : false,
        }
      : null,
    description: item.description ?? null,
    location: item.location ?? null,
    contacts: {
      phones: (item.contacts?.phones ?? []).map((p) => formatPhoneDisplay(p) ?? p),
      e164: item.contacts?.phones ?? [],
      emails: item.contacts?.emails ?? [],
    },
    guess: item.guess ?? null,
    consultation: !!item.consultation,
    consultService: item.consultation ? (item.consult_service ?? null) : null,
    start: item.start,
    end: item.end,
    lane: 0,
    lanes: 1,
  };
}

/**
 * Lanes: blocks that overlap in time sit side by side, never on top of each
 * other. Sorted by start, each block takes the first lane whose last block
 * has ended; a run of transitively overlapping blocks is one cluster, and
 * every block in it is as wide as the cluster's lane count allows.
 */
function assignLanes(timed: CalendarBlockVM[]): void {
  let cluster: CalendarBlockVM[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const close = () => {
    for (const b of cluster) b.lanes = laneEnds.length;
  };
  for (const b of timed) {
    const end = b.t + b.dur / 60;
    if (b.t >= clusterEnd - 1e-9 && cluster.length) {
      close();
      cluster = [];
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((e) => e <= b.t + 1e-9);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else laneEnds[lane] = end;
    b.lane = lane;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, end);
  }
  close();
}

/**
 * The span as the page draws it. `now` decides today, the now line, which
 * days are past, the next open time and the closures ahead.
 */
export function toCalendarVM(dto: CalendarWeekDto, now = new Date()): CalendarVM {
  const tz = dto.timezone;
  const todayKey = dayInZone(tz, now.getTime()).key;
  const nowMs = now.getTime();
  // How far ahead the receptionist offers: the days freeWindows walks, today and max_days_ahead - 1 after it.
  // A day past the last of them has no open times however free it is, and says so rather than looking booked (C1).
  const offerDays = { ...BOOKING_DEFAULTS, ...(dto.rules ?? {}) }.max_days_ahead;
  const offerUntil = dayPlusInZone(tz, nowMs, offerDays - 1).key;

  // The grid's hours: the business's own, an hour of air on each side.
  let start = 24;
  let end = 0;
  for (const h of Object.values(dto.hours ?? {})) {
    for (const [o, c] of dayIntervals(h)) {
      const oh = Number(o.split(":")[0]);
      const ch = Number(c.split(":")[0]) + (Number(c.split(":")[1]) > 0 ? 1 : 0);
      if (Number.isFinite(oh)) start = Math.min(start, oh);
      if (Number.isFinite(ch)) end = Math.max(end, ch);
    }
  }
  if (start >= end) {
    start = 8;
    end = 20;
  }
  start = Math.max(0, start - 1);
  end = Math.min(24, end + 1);
  // A block outside the business's hours widens the grid rather than falling
  // off it: an 8 PM appointment when the shop closes at 6 is still drawn.
  for (const d of dto.days) {
    const ds = zoneMidnight(tz, d.key);
    const de = zoneMidnight(tz, shiftKey(d.key, 1));
    for (const item of d.items) {
      const s = Date.parse(item.start);
      const e = Date.parse(item.end);
      if (item.all_day || !(e > ds && s < de) || (s <= ds && e >= de)) continue;
      const b = toBlock(item, tz, ds, de, now);
      start = Math.min(start, Math.max(0, Math.floor(b.t)));
      end = Math.max(end, Math.min(24, Math.ceil(b.t + b.dur / 60)));
    }
  }

  const days: CalendarDayVM[] = dto.days.map((d) => {
    const { y, m, d: dd } = keyParts(d.key);
    const weekday = DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()].toLowerCase();
    const closure =
      dto.closures.find((c) => c.date <= d.key && d.key <= (c.until && c.until >= c.date ? c.until : c.date)) ?? null;
    const intervals = dayIntervals(dto.hours?.[weekday]);
    const closedDay = closedOn(dto.closures, d.key) || intervals.length === 0;
    const bands: CalendarBandVM[] = [];
    if (closedDay) {
      bands.push({ from: start, to: end, label: closure?.note ? `Closed · ${closure.note}` : "Closed" });
    } else {
      let cursor = start;
      for (const [o, c] of intervals) {
        const oh = Number(o.split(":")[0]) + Number(o.split(":")[1]) / 60;
        const ch = Number(c.split(":")[0]) + Number(c.split(":")[1]) / 60;
        if (oh > cursor) bands.push({ from: cursor, to: oh, label: null });
        cursor = Math.max(cursor, ch);
      }
      if (cursor < end) bands.push({ from: cursor, to: end, label: null });
    }
    const zoneDayStart = zoneMidnight(tz, d.key);
    const zoneDayEnd = zoneMidnight(tz, shiftKey(d.key, 1));
    const timed: CalendarBlockVM[] = [];
    const allDay: CalendarBlockVM[] = [];
    for (const item of d.items) {
      const s = Date.parse(item.start);
      const e = Date.parse(item.end);
      if (!(e > zoneDayStart && s < zoneDayEnd)) continue;
      const block = toBlock(item, tz, zoneDayStart, zoneDayEnd, now);
      if (item.all_day || (s <= zoneDayStart && e >= zoneDayEnd))
        allDay.push({ ...block, t: 0, dur: 24 * 60, time: "All day" });
      else timed.push(block);
    }
    timed.sort((a, b) => a.t - b.t || b.dur - a.dur);
    assignLanes(timed);
    const windows: CalendarWindowVM[] = d.windows.map((w) => {
      const t = hoursOf(tz, Date.parse(w.start));
      const tEnd = hoursOf(tz, Date.parse(w.end));
      return { t, dur: Math.round((tEnd - t) * 60), label: spanLabel(t, tEnd) };
    });
    return {
      key: d.key,
      dow: DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()],
      date: shortDate(d.key),
      long: longDate(d.key),
      dayNum: String(dd),
      today: d.key === todayKey,
      past: d.key < todayKey,
      closed: { yes: closedDay, note: closure?.note ?? null },
      bands,
      blocks: timed,
      allDay,
      windows,
      beyondOffer: d.key > offerUntil,
    };
  });

  const events = days.reduce((a, d) => a + d.blocks.length + d.allDay.length, 0);
  const windowCount = days.reduce((a, d) => a + d.windows.length, 0);
  // The receptionist's next open time, as the route found it among every time it would offer -- never worked out
  // from the loaded weeks, which on a board looking at another month held none (C1).
  const next = dto.feed.state === "ok" ? nextOpenWords(dto.next_opening?.start ?? null, tz, todayKey) : "—";
  const ago = readAgoLabel(dto.feed.read_at, now);
  const stale = dto.feed.state === "ok" && !!dto.feed.stale;
  // When the calendar was last tried is the news only when that try failed (C2).
  const tried = readAgoLabel(dto.feed.checked_at ?? null, now);
  // What the pill beside it does not say (C3). What a read left out is said once, by feedNotes, in words the owner can
  // act on; the line said it again as "2 repeating rules read once · 3 more not shown", unexplained (C1).
  const feedDetail =
    dto.feed.state === "ok"
      ? `From ${dto.feed.source ?? "your calendar"} · read ${ago ?? "just now"}${stale ? ` · could not be refreshed${tried ? ` ${tried}` : ""}` : ""} · ${dto.feed.events} event${dto.feed.events === 1 ? "" : "s"}`
      : dto.feed.state === "unavailable"
        ? [tried ? `tried ${tried}` : "", ago ? `last read ${ago}` : ""].filter(Boolean).join(" · ")
        : "";
  // The whole sentence, for whoever reads the line without the pill: Ask's calendar.week.
  const feedLine =
    dto.feed.state === "ok"
      ? feedDetail
      : dto.feed.state === "unavailable"
        ? `Your calendar could not be read${feedDetail ? ` · ${feedDetail}` : ""}`
        : "No calendar connected";
  // When it was read, on its own: a row that says only that is saying the one part an owner acts on ("is it current?").
  const feedRead =
    dto.feed.state === "ok"
      ? `read ${ago ?? "just now"}`
      : dto.feed.state === "unavailable" && ago
        ? `last read ${ago}`
        : "";
  const feedHealth: CalendarFeedHealth = dto.feed.state === "ok" ? (stale ? "stale" : "ok") : dto.feed.state;

  const nowIn = days.some((d) => d.today) ? hoursOf(tz, nowMs) : null;
  const last = dto.days[dto.days.length - 1]?.key ?? dto.from;
  const sameMonth = dto.from.slice(0, 7) === last.slice(0, 7);
  const ahead = closuresFrom(dto.closures, todayKey);
  const closuresAhead: CalendarClosureVM[] = ahead
    .slice(0, 6)
    .map((c) => ({ key: c.date, label: closureDatesLabel(c), note: c.note ?? null }));
  // Sized by the phone tool's and the assistant's rule: a service that needs a consultation first, as a consultation (C5b).
  const listed = (dto.services ?? []).map((s) => ({ name: s.name, duration_min: s.duration_min ?? undefined }));
  const services: CalendarServiceVM[] = (dto.services ?? []).map((s) => ({
    name: s.name,
    duration: s.duration_min,
    consultFirst: s.consult_first,
    offerMinutes: offerFor(listed, dto.rules, s.name)?.minMinutes ?? null,
    label: `${s.name}${s.duration_min ? ` · ${s.duration_min} min` : ""}${s.consult_first ? " · consultation first" : ""}`,
  }));
  return {
    timezone: tz,
    zoneCity: timezoneCity(tz),
    from: dto.from,
    to: last,
    rangeLabel: `${shortDate(dto.from)} – ${sameMonth ? shortDate(last).replace(/^[A-Za-z]+ /, "") : shortDate(last)}`,
    monthLabel: monthLabelOf(dto.days.length >= 28 ? shiftKey(dto.from, 7) : dto.from),
    hours: { start, end },
    days,
    today: todayKey,
    now: nowIn,
    feed: {
      present: dto.feed.present,
      state: dto.feed.state,
      health: feedHealth,
      line: feedLine,
      detail: feedDetail,
      read: feedRead,
      events: dto.feed.events,
      source: dto.feed.source ?? "your calendar",
      problem: dto.feed.problem ?? null,
      stale,
      skippedRecurring: dto.feed.skipped_recurring || 0,
      dropped: dto.feed.dropped || 0,
      notes: feedNotes(dto.feed),
    },
    stats: { events, windows: windowCount, next },
    offer: { days: offerDays, until: offerUntil, label: shortDate(offerUntil) },
    rules: rulesLine(dto.rules),
    ruleParts: ruleParts(dto.rules),
    hoursLines: hoursLines(dto.hours),
    closuresAhead,
    // Past the six the bar names, counted: a seventh closure used to vanish without a word (C1).
    closuresMore: Math.max(0, ahead.length - closuresAhead.length),
    consultFirst: (dto.rules?.consult_first ?? []).map((s) => s.trim()).filter(Boolean),
    services,
    bookingLink: dto.booking_link,
  };
}

/** Midnight of a day key in `tz`, as an instant. */
/**
 * Midnight of a day key, in the business's zone.
 *
 * ONE CLOCK, NOT TWO. This was a hand-written two-pass guess over a private
 * `zoneOffsetOf`, which computed the same offset `zoneOffsetMs` in
 * availability.ts already computed, by a different route — and the two passes
 * were `localToUtcMs` spelled out again, in a file that already imported from
 * that module. Daylight saving is the one piece of arithmetic in this product
 * it is least affordable to have two of: a second copy does not fail, it
 * disagrees, twice a year, about which hour a day starts.
 */
export function zoneMidnight(tz: string, key: string): number {
  const { y, m, d } = keyParts(key);
  return localToUtcMs(tz, y, m, d, 0, 0);
}

/* ------------------------------------------------- the window and the views */

export type CalendarView = "week" | "day" | "month" | "agenda";

/** The days a view needs, from the day it looks at: a week (the day's week), six weeks for a month, two weeks for the agenda. */
export function spanForView(view: CalendarView, anchor: string): { from: string; days: number } {
  if (view === "month") return monthSpan(anchor);
  if (view === "agenda") return { from: anchor, days: 14 };
  return { from: mondayOf(anchor), days: 7 };
}

/**
 * The window loaded around an anchor: nine weeks from the Monday a week
 * before the anchor's month starts — enough for the month grid, the anchor's
 * week and its neighbours, and two weeks of agenda from any day in it, so
 * switching views and moving a week are slices, not reads.
 */
export function windowFor(anchor: string): { from: string; days: number } {
  return { from: shiftKey(mondayOf(`${anchor.slice(0, 7)}-01`), -7), days: 63 };
}

/** Whether contiguous loaded days cover `count` days from `from`. */
export function coversSpan(days: ReadonlyArray<{ key: string }>, from: string, count: number): boolean {
  if (!days.length || count < 1) return false;
  return days[0].key <= from && days[days.length - 1].key >= shiftKey(from, count - 1);
}

/** A day's frame from its key alone — the shape a view draws before the day's data has landed. */
export function frameOf(
  key: string,
  todayKey: string,
): { key: string; dow: string; date: string; long: string; dayNum: string; today: boolean; past: boolean } {
  const { y, m, d } = keyParts(key);
  return {
    key,
    dow: DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()],
    date: shortDate(key),
    long: longDate(key),
    dayNum: String(d),
    today: key === todayKey,
    past: key < todayKey,
  };
}
