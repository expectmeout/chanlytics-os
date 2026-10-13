/**
 * The Calendar's words: a clock time, a date, a span of hours, a closure's dates, the booking rules, a week's
 * hours, and the feed's state and what a read left out. The board, Today, Settings and Setup say each one way.
 */
import { agoWords } from "../shared/time";
import type { BookingRules, Closure, Hours } from "../config/workspace-config/business-profile";
import { DAYS } from "../config/workspace-config/config-rules";
import { hoursRuns } from "../config/workspace-config/prompt-hours";
import { BOOKING_DEFAULTS, dayIntervals, type BookingRulesLike } from "./availability";
import { DAY_SHORT, keyParts } from "./day-keys";
import type { CalendarFeedDto, VisitMark } from "./calendar-dto";
import { isGuess, matchWordsOf, type MatchVia } from "./calendar-people";
import type { VisitWord } from "../shared/enums";

/* ----------------------------------------------------------- what became of a visit (decision 0002, step 8) */

/** What a member may say became of a visit (00397 mark_visit): the closed set is shared/enums.ts's. */
export type { VisitWord };

/** Each word as the panel says it, on a state and on an act alike. */
export const VISIT_WORDS: Record<VisitWord, string> = { kept: "Kept", missed: "Missed", cancelled: "Cancelled" };

/** The door's refusals (mark_visit's `{ error }`), each in a sentence for the person who asked. */
export const VISIT_REFUSALS: Record<string, string> = {
  never_booked: "It was only requested, never booked: it can be cancelled, but not kept or missed.",
  cancelled: "It was cancelled already.",
  not_begun: "It hasn't begun yet: whether they came is said once it has.",
  already_said: "It's marked kept or missed already: say the other if that was wrong.",
  over: "It has ended: say whether they came instead.",
};

/**
 * Whether a visit still stands: the record has not been told it was cancelled, whoever cancelled it. A cancelled visit is
 * drawn on the board, struck, and is none anywhere a visit is counted or said to be booked (Today's day, People's visits,
 * Ask's calendar).
 */
export function visitStands(visit: { status: string } | null | undefined): boolean {
  return visit?.status !== "cancelled";
}

/**
 * Whether a sighting of a visit still stands for the same-visit rule (booking-notice.ts): not cancelled (visitStands) and,
 * for the calendar's copy, still named by the calendar. A visit cancelled or gone at that time and booked again is a
 * booking of its own, so the sweep's `twin` and the bell's told-once take only a sighting that stands. (The board still
 * folds the copy of a cancelled booking: it draws the booking itself, struck.)
 */
export function sightingStands(row: { status: string; vanished_at?: string | null }): boolean {
  return visitStands(row) && !row.vanished_at;
}

/** The word for a visit that has ended and nobody has said what became of: said once, by every page (D1-visit-match-words). */
const VISIT_PAST_WORD = "Past";

/** The tone each state wears on the kit's pill, in tone.ts's six: a kept visit is done, a missed one is for a person to look at, the rest are neutral. */
const VISIT_PILL_TONES: Record<VisitWord | "past", "ok" | "warn" | "plain"> = {
  kept: "ok",
  missed: "warn",
  cancelled: "plain",
  past: "plain",
};

/** How a visit stands, as every page says it: the word, the state it is of, and the tone of the pill that wears it. */
export interface VisitStateVM {
  text: string;
  tone: VisitWord | "past";
  pill: "ok" | "warn" | "plain";
}

/**
 * What a page says beside a visit's time: the member's word on it, else "Past" once it has ended (the record never
 * infers that they came: 0002's answer 3), else nothing. A word said stands whether or not the visit has ended, so a
 * visit marked while it is under way reads as its mark.
 */
export function visitStateOf(visit: VisitMark | null, endMs: number, nowMs: number): VisitStateVM | null {
  const said = visit?.status;
  if (said === "kept" || said === "missed" || said === "cancelled")
    return { text: VISIT_WORDS[said], tone: said, pill: VISIT_PILL_TONES[said] };
  return endMs <= nowMs ? { text: VISIT_PAST_WORD, tone: "past", pill: VISIT_PILL_TONES.past } : null;
}

/**
 * What a member may say of a visit now, in the order it is offered, by mark_visit's own rules (00397): kept or missed
 * once it has begun, cancelled until it ends; a kept visit that has begun may be corrected to missed and a missed one to
 * kept; nothing
 * of a cancelled one, nor of an event the record has not kept yet.
 */
export function visitActsOf(visit: VisitMark | null, startMs: number, endMs: number, nowMs: number): VisitWord[] {
  if (!visit) return [];
  switch (visit.status) {
    // A correction is a word about a visit that has begun, as the door holds it (not_begun).
    case "kept":
      return startMs <= nowMs ? ["missed"] : [];
    case "missed":
      return startMs <= nowMs ? ["kept"] : [];
    case "cancelled":
      return [];
    case "proposed":
      return endMs > nowMs ? ["cancelled"] : [];
    case "booked": {
      const out: VisitWord[] = startMs <= nowMs ? ["kept", "missed"] : [];
      if (endMs > nowMs) out.push("cancelled");
      return out;
    }
  }
}

/* ----------------------------------------------------------- one visit line (decision 0047, D1-visit-mark) */

/** What a page asks of the owner about a visit nobody has marked, and the role gate's "to ...". */
export const VISIT_ASK_WORDS = {
  /** The question over the presses: Today's row, the person's History and Coming up. */
  question: "Did they come?",
  /** What a visit that has ended and nobody has marked is, said where "Past" alone would leave the owner guessing. */
  unmarked: "Not marked yet",
  gate: "say whether they came",
  /** The confirm before a cancel, under the workspace's own question (appointmentWords cancelAsk). */
  cancel: {
    detail: "It can't be undone here. Its reminders stop; the calendar keeps the time until it is changed there.",
    yes: "Yes, cancelled",
    no: "Keep it",
  },
} as const;

/**
 * A visit as one line, whichever page draws it (the Calendar's panel and board, People's Visits cell, the person's
 * History and Coming up, the Inbox's chip, Today): when, what, who, how it stands, how it was matched and what can be
 * said of it. A page draws these fields and works none of them out, so a visit never reads one way here and another there.
 */
export interface VisitLineVM {
  id: string;
  /** The record's row and how it stands: what a press is said on. Null for an event the record has not kept yet. */
  mark: VisitMark | null;
  title: string;
  /** "Tue, Sep 8", "Today" or "Yesterday": the page's day word, "" where the page says the day elsewhere. */
  day: string;
  /** "2 – 3:30 PM" */
  time: string;
  person: { id: string; name: string } | null;
  /** Kept, missed, cancelled, or Past once it has ended; null while it is ahead or under way and nobody has said. */
  state: VisitStateVM | null;
  /** The record holds a row for it, it has ended, and nobody has said whether they came: it asks "Did they come?". */
  unmarked: boolean;
  /** How the calendar found it to be theirs, in the one set of words (MATCH_WORDS); null without a route. */
  match: string | null;
  /** The match is a guess (a name): a page about the person says it only then; the Calendar's panel says every match. */
  guess: boolean;
  /** Everything mark_visit allows now, in the order the panel offers it (visitActsOf). */
  acts: VisitWord[];
  /** The two presses a visit nobody has marked is asked with, once it has begun: Kept and Missed, and never Cancelled. */
  asks: VisitWord[];
  /** Where it opens on the Calendar (visitDoor); null where the page gives none. */
  to: string | null;
}

/** What a visit line is made from: the facts every page holds of a visit, whatever they came in. */
export interface VisitLineInput {
  id: string;
  mark: VisitMark | null;
  startMs: number;
  endMs: number;
  title: string;
  day: string;
  time: string;
  person: { id: string; name: string } | null;
  via: MatchVia | null;
  to?: string | null;
}

/**
 * The one visit line: its state from visitStateOf, its presses from visitActsOf (so no page offers what the door would
 * refuse), its match from MATCH_WORDS. `asks` are the acts of a visit nobody has marked without Cancelled: a page outside
 * the Calendar asks whether they came, and the Calendar's panel keeps the rest.
 */
export function visitLineOf(v: VisitLineInput, nowMs: number): VisitLineVM {
  const acts = visitActsOf(v.mark, v.startMs, v.endMs, nowMs);
  const standing = v.mark?.status === "booked";
  return {
    id: v.id,
    mark: v.mark,
    title: v.title,
    day: v.day,
    time: v.time,
    person: v.person,
    state: visitStateOf(v.mark, v.endMs, nowMs),
    unmarked: standing && v.endMs <= nowMs,
    match: matchWordsOf(v.via),
    guess: isGuess(v.via),
    acts,
    asks: standing ? acts.filter((a) => a !== "cancelled") : [],
    to: v.to ?? null,
  };
}

/** A block of the board as a visit line reads it (CalendarBlockVM satisfies it). */
interface VisitLineBlock {
  id: string;
  title: string;
  time: string;
  /** ISO instants. */
  start: string;
  end: string;
  visit: VisitMark | null;
  person: { id: string; name: string; via?: MatchVia | null } | null;
}

/** The board's block as a visit line, at `nowMs`; `day` is the page's own word for the day ("" where it says it beside). */
export function visitLineOfBlock(b: VisitLineBlock, nowMs: number, day = "", to: string | null = null): VisitLineVM {
  return visitLineOf(
    {
      id: b.visit ? b.visit.id : b.id,
      mark: b.visit,
      startMs: Date.parse(b.start),
      endMs: Date.parse(b.end),
      title: b.title,
      day,
      time: b.time,
      person: b.person ? { id: b.person.id, name: b.person.name } : null,
      via: b.person?.via ?? null,
      to,
    },
    nowMs,
  );
}

/**
 * The record's row for a visit a person's read carries (VisitDto), as a mark: its id, and how it stands. A visit nobody has
 * said anything of stands as booked, the only way a visit gets here unsaid (a cancelled one is none, and a request is no
 * visit yet: feedWithRecord). Null for an event the record has not kept yet. A member's word stands even where the read
 * carries no id for the row (an older one): the mark then has an empty id, so it is read and never pressed on.
 */
export function visitMarkOfDto(v: { record_id?: string | null; said?: "kept" | "missed" | null }): VisitMark | null {
  if (v.said) return { id: v.record_id ?? "", status: v.said };
  return v.record_id ? { id: v.record_id, status: "booked" } : null;
}

/* ----------------------------------------------------------- adding the person an appointment names (decision 0047, lane 6) */

/**
 * What the board says when it offers to add the person a visit names. Reading the calendar adds nobody (a read never
 * writes: decision 0034 section 4); the hourly sweep and the booking email's reader put the calendar's people in People,
 * and a visit whose person the board cannot match offers the press, here, through the door "Add a person" uses.
 */
export const ADD_TO_PEOPLE_WORDS = {
  /** The press, and the role gate's "to ...". */
  act: "Add to People",
  gate: "add this person to People",
  busy: "Adding…",
  /** Said once the door answered: made now, or already there (a person is never made twice). */
  added: (name: string | null) => (name ? `${name} is in People now` : "In People now"),
  existed: (name: string | null) => (name ? `${name} was in People already` : "They were in People already"),
} as const;

/**
 * What a press on "Add to People" adds, from the block alone, as the add takes it (a number, an address or both, and the
 * name the event gave): one number names one person (their one address rides
 * beside it, as the sweep's rule has it: two addresses are nobody's), and with no number one address does. An event with
 * several numbers or several addresses does not say which is the customer, so it offers nothing and the sweep adds the
 * numbers within the hour. Nothing for a visit whose person People already matched.
 */
export function addToPeopleOf(b: {
  person: unknown;
  /** Absent on a week the tab cached before the panel read it. */
  contacts?: { e164: readonly string[]; emails: readonly string[] } | null;
  guess: string | null;
}): { phone: string | null; email: string | null; name: string | null } | null {
  if (b.person || !b.contacts) return null;
  const { e164, emails } = b.contacts;
  const email = emails.length === 1 ? (emails.at(0) ?? null) : null;
  if (e164.length === 1) return { phone: e164.at(0) ?? null, email, name: b.guess };
  if (e164.length === 0 && email) return { phone: null, email, name: b.guess };
  return null;
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

/*
 * A day key is already the business's day ("2026-11-17"), so its words are that day's for every viewer: the key's UTC
 * noon, said in UTC. Said in the viewer's own zone, as these were, a Tuesday read "Wednesday" east of UTC+12 (the
 * scorecard's defect 28); said in the business's zone it would do the same to a business there. Never a zone here.
 */
const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

/** "Nov 17" */
export function shortDate(key: string): string {
  const { y, m, d } = keyParts(key);
  return SHORT.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "Tuesday, November 17" */
export function longDate(key: string): string {
  const { y, m, d } = keyParts(key);
  return LONG.format(new Date(Date.UTC(y, m - 1, d, 12)));
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
  for (const d of DAYS) if (hours[d]) clean[d] = hours[d];
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

export function spanLabel(t1: number, t2: number): string {
  const a = clockLabel(t1);
  const b = clockLabel(t2);
  // One AM or PM for a span inside one half of one day. A span to midnight ends in the next day's AM: its halves were
  // matched by their letters, and "10 AM – 12 AM" read "10 – 12 AM" (C3).
  const sameHalf = t2 < 24 && t1 < 12 === t2 < 12;
  return `${sameHalf ? a.slice(0, -3) : a} – ${b}`;
}

/* ----------------------------------------------------------- the feed, in words (from calendar-people.ts) */

/** Which calendar the feed comes from, from its address alone — the address itself never leaves the server. */
export function feedSourceLabel(url: string | null | undefined): string {
  if (!url) return "your calendar";
  let host: string;
  try {
    host = new URL(url.replace(/^webcal:\/\//i, "https://")).hostname.toLowerCase();
  } catch {
    return "your calendar";
  }
  if (host.includes("google")) return "Google Calendar";
  if (host.includes("icloud")) return "Apple Calendar";
  if (host.includes("office365") || host.includes("outlook") || host.includes("live.com")) return "Outlook";
  return "your calendar";
}

/** A description as plain text: tags out, entities back, at most a screen of it. */
export function eventText(raw: string | null | undefined, max = 1500): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
