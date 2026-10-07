/**
 * What `GET /api/v1/calendar` returns for one span of days (CalendarWeekDto): each day's appointments and the
 * windows the receptionist would offer, the feed's state, and the hours, closures, rules and services Settings
 * keeps. The page's view model is made from it in calendar.ts.
 */
import type { BookingRules, Closure, Hours } from "../config/workspace-config/business-profile";
import type { MatchVia } from "./calendar-people";
import type { FeedFailure } from "./feed-url";

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
