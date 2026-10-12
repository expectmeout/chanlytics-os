/**
 * What `GET /api/v1/calendar` returns for one span of days (CalendarWeekDto): each day's appointments and the
 * windows the receptionist would offer, the feed's state, and the hours, closures, rules and services Settings
 * keeps. The page's view model is made from it in calendar.ts.
 */
import type { BookingRules, Closure, Hours } from "../config/workspace-config/business-profile";
import type { MatchVia } from "./calendar-people";
import type { FeedFailure } from "./feed-url";
import type { NoticeHold } from "./booking-notice";
import type { AppointmentStatus } from "./feed-appointments";

/** The record's row for a visit the board draws, and how it stands (decision 0002): what a member's word is said on. */
export interface VisitMark {
  id: string;
  status: AppointmentStatus;
}

export interface CalendarItemDto {
  id: string;
  /** ISO instants. */
  start: string;
  end: string;
  title: string;
  all_day: boolean;
  /** The person in People this appointment is for — by a phone in the event, else an address, else a whole name in its words; their thread and last WhatsApp message when they have one. */
  person: {
    id: string;
    name: string;
    via?: MatchVia;
    thread?: string | null;
    wa_inbound_at?: string | null;
    /** The wire a reply goes out on, and the two stops, as their People row says them (calendar-people.ts PersonLike.reach). */
    reply_wire?: "whatsapp" | "sms" | "email" | null;
    email_stopped?: boolean;
    opted_out?: boolean;
  } | null;
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
  /**
   * Where the board read this one: the calendar feed (absent, or "calendar"), or a booking notice the tool emailed
   * (docs/plans/2026-10-07-bookings-arrive-by-email.md). A notice carries what a feed's event never promises.
   */
  source?: "calendar" | "notice";
  /** The tool whose notice it is, as the product says it ("Booksy"); null for a feed's event. */
  tool?: string | null;
  service?: string | null;
  staff?: string | null;
  price?: string | null;
  /**
   * The record's row for this visit (00345), a booking's or the one the hourly sync keeps for a feed's event (by its
   * key), with how it stands: what a member says became of it (00397) is said on it. Null for an event the sync has not
   * kept yet; absent on an older read.
   */
  visit?: VisitMark | null;
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
  /** The owner said nothing books for them (config.bookings.by_hand): no page offers to connect a calendar then. */
  by_hand?: boolean;
  /**
   * The booking notices the workspace's address has taken in (docs/plans/2026-10-07-bookings-arrive-by-email.md): the
   * tool the latest came from, when, how many visits they hold in this span, and how many a person must look at. Absent
   * on an older read, and `last_at` null when none has ever arrived.
   */
  notices?: CalendarNoticesDto;
}

/** A notice a person must look at, as the card lists it. */
export interface HeldNoticeDto {
  id: string;
  tool: string | null;
  from: string | null;
  subject: string | null;
  received_at: string;
  reason: NoticeHold;
}

/**
 * Where the workspace's bookings come from, as the card states it (00345): the tool the owner named, the address its
 * emails go to (null until the workspace has one), the latest notice that became a visit, the ones held for a person,
 * and Gmail's pending confirmation of a forward here, when there is one.
 */
export interface CalendarNoticesDto {
  /** The tool the owner named in Settings (config.bookings.tool), else the latest notice's; null for neither. */
  tool: string | null;
  /** The workspace's address, as the tool is to send to; null when it has none yet. */
  address: string | null;
  /**
   * The address the workspace would be given, where it has none and one can be made from its name (mailbox.ts
   * suggestLocalPart): what the fold offers in one press. Null where it has one, where email is off on this deployment,
   * or where the name gives no address; absent on an older read.
   */
  suggested?: string | null;
  /** When the latest notice that became a visit arrived; null until one has. */
  last_at: string | null;
  count: number;
  held: number;
  held_list: HeldNoticeDto[];
  forwarding: { account: string; code: string; link: string | null; at: string } | null;
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
