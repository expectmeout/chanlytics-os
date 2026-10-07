/**
 * The Calendar's view model (CalendarVM): the span the page draws, its days with their bands, blocks and open
 * windows, the feed as the pill and the bar say it, and the hours, closures, rules and services beside them.
 * Types only; calendar.ts builds it (toCalendarVM).
 */
import type { MatchVia } from "./calendar-people";
import type { CalendarFeedHealth, CalendarFeedNoteVM } from "./calendar-words";

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
