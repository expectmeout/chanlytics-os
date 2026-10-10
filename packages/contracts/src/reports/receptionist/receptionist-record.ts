/**
 * Reports › Receptionist — what the lens is read from, counted once on the server.
 *
 * The database hands over the lens's own read in one answer (receptionist_series, 00380): the receptionist's held replies by
 * what became of them, what customers asked about and in which language, the replies the send door refused, how calls
 * ended, how long a handover took, the calls nobody took, when people write by the workspace's clock, the booking links sent,
 * and the escalations open now. This is that answer's shape, its guard, and the one place it becomes what the route answers:
 * who waits on the person looking is decided here by `standingOfThread` (never re-derived in SQL), and the people sent the
 * link are counted against what the calendar could say. The words are receptionist-report.ts's, which only Reports' page
 * reads; this stays in the root barrel for the server. Pure.
 */
import { standingOfThread } from "../../conversations/standing";
import type { BookingReportDto } from "../booking-report";
import type { ReportProfile } from "../report-closed";

/**
 * How long the business has to reach a person who rang and found nobody, said as the figure and its definition say it. The
 * SQL's `interval '1 hour'` (00380's v_touch): the database test holds the two together at 3,599 and 3,601 seconds.
 */
export const MISSED_CALL_TOUCH_WORDS = "an hour";

/** The most open escalations receptionist_series lists: the SQL's `limit 500` (00380, `stuck`). A list this long may be cut. */
const OPEN_ESCALATIONS_LISTED = 500;

/** The receptionist's held drafts of a period by what became of each; `total` is all of them, `low_confidence` those held for a look. */
interface HoldCountsDto {
  total: number;
  sent: number;
  canceled: number;
  steered: number;
  overtaken: number;
  person_first: number;
  waiting: number;
  other: number;
  low_confidence: number;
}

/** The handovers of a period (escalations that were not an opt-out or a call-back) and the middles of the two times, in whole seconds. */
interface HandoverDto {
  n: number;
  /** The first message a person sent in the thread that left. */
  replied: { n: number; median_s: number | null };
  /** The escalation's resolution; one with no recorded end is unknown and in neither count. */
  settled: { n: number; median_s: number | null };
}

/**
 * The calls nobody took, by person at their first such call: `n` the people whose hour has passed, `touched` the ones the
 * business reached within it, `pending` the ones whose hour has not passed (in neither), `unknown` the calls with no caller.
 */
interface MissedDto {
  n: number;
  touched: number;
  pending: number;
  unknown: number;
}

/** An escalation open now, with the standing of its thread: the reader decides who is waiting. */
interface OpenEscalationDto {
  reason: string;
  created_at: string;
  state: string;
  paused_until: string | null;
  assignee_user_id: string | null;
}

/** receptionist_series's own answer (00380). */
export interface ReceptionistSeriesDto {
  timezone: string;
  /** The workspace's day in that zone when the read was made: "2026-10-06". */
  today: string;
  /** The window's last day (00360): today for a period by name, an earlier day for days a member picked. */
  end?: string;
  days: number;
  hold: { now: HoldCountsDto; before: { total: number; sent: number } };
  topics: { of: number; stamped: number; by_intent: Record<string, number> };
  languages: { of: number; stamped: number; by_language: Record<string, number> };
  /** The replies the send door refused, by reason. A draft it refused is in the hold's `other` too: the two overlap by design. */
  blocked: { total: number; by_reason: Record<string, number> };
  call_endings: { total: number; by_reason: Record<string, number> };
  handover: { now: HandoverDto; before: HandoverDto };
  missed: { now: MissedDto; before: MissedDto };
  /** Every customer message of the window by its day and quarter hour in the workspace's zone, and how many the receptionist answered first. */
  after_hours: { d: string; q: number; n: number; a: number }[];
  /** The people sent the booking link, one row each at their first (at most 500 listed). */
  links: { total: number; people: { c: string; at: string }[] };
  stuck: { open: OpenEscalationDto[] };
}

type LinksCalendar = BookingReportDto["calendar"];

/** The booking links, against what the calendar could say of them. */
interface LinksSentDto {
  sent: number;
  /** Of the people sent the link, how many have booked since; null where the calendar could not say. */
  booked: number | null;
  calendar: LinksCalendar;
}

/** What waits on the person looking, now. */
interface StuckNowDto {
  waiting: number;
  /** When the longest-waiting one was flagged; null with none waiting. */
  oldest_at: string | null;
  callbacks: number;
  /** The database listed as many open escalations as it ever does, so `waiting` and `callbacks` count the ones listed: at least that many. */
  capped: boolean;
}

/** What the route answers (the reader's body). `series` is null where the database has no receptionist_series yet. */
export interface ReceptionistDto {
  timezone: string;
  today: string;
  end?: string;
  days: number;
  series:
    | (Omit<ReceptionistSeriesDto, "links" | "stuck"> & {
        links: LinksSentDto;
        stuck: StuckNowDto;
      })
    | null;
  profile: ReportProfile | null;
}

const isObjectAnswer = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Whether the database answered a receptionist read (receptionist_series): the window, the hold, the handovers and the open
 * escalations the builder reads, and not its own `{ error }` (an unknown workspace).
 */
export function isReceptionistSeriesDto(answer: unknown): answer is ReceptionistSeriesDto {
  return (
    isObjectAnswer(answer) &&
    typeof answer.timezone === "string" &&
    typeof answer.today === "string" &&
    typeof answer.days === "number" &&
    isObjectAnswer(answer.hold) &&
    isObjectAnswer(answer.handover) &&
    isObjectAnswer(answer.stuck) &&
    Array.isArray(answer.stuck.open)
  );
}

/** The window the answer is of, as the DTO echoes it: `end` only where there is one. */
function windowEcho(h: {
  timezone: string;
  today: string;
  end?: string;
  days: number;
}): Omit<ReceptionistDto, "series" | "profile"> {
  return { timezone: h.timezone, today: h.today, ...(h.end === undefined ? {} : { end: h.end }), days: h.days };
}

/**
 * Who waits on the person looking, of the escalations open now: a thread that is flagged and that nobody has, by the one rule
 * (`standingOfThread`). One a teammate has, one the owner has, and one put aside are not waiting on you.
 */
function stuckOf(open: readonly OpenEscalationDto[], nowMs: number): StuckNowDto {
  // `needs_you` is unassigned and flagged whatever `assignee_is_me` says (standing.ts:61-78), so the count is the workspace's, not one member's, and the read stays cacheable per workspace.
  const needsYou = (o: OpenEscalationDto): boolean =>
    standingOfThread(
      { state: o.state, paused_until: o.paused_until, assignee_user_id: o.assignee_user_id },
      true,
      nowMs,
    ).standing === "needs_you";
  const waiting = open.filter(needsYou);
  const oldest = waiting.reduce<string | null>(
    (first, o) => (first === null || Date.parse(o.created_at) < Date.parse(first) ? o.created_at : first),
    null,
  );
  return {
    waiting: waiting.length,
    oldest_at: oldest,
    callbacks: waiting.filter((o) => o.reason === "callback").length,
    capped: open.length >= OPEN_ESCALATIONS_LISTED,
  };
}

/**
 * The route's answer from the database's: the people sent the booking link counted against what the calendar could say
 * of them (`booked`: null where it was not asked, read as no calendar), and who waits on you counted from the open
 * escalations. With no receptionist_series in this database (`series` null) the answer carries the window the route
 * asked (`head`) and no series. Pure: the reader feeds it the rows and the clock.
 */
export function receptionistDtoOf(
  series: ReceptionistSeriesDto | null,
  parts: {
    /** What the reader could say of the people sent the link; null: it was not asked (read as "none"). */
    booked: { calendar: LinksCalendar; booked: number | null } | null;
    profile: ReportProfile | null;
    /** The window as the route asked it, which the DTO echoes (used when `series` is null). */
    head: { timezone: string; today: string; end?: string; days: number };
    nowMs: number;
  },
): ReceptionistDto {
  if (series === null) return { ...windowEcho(parts.head), series: null, profile: parts.profile };
  const { links, stuck, ...rest } = series;
  return {
    ...windowEcho(series),
    series: {
      ...rest,
      links: { sent: links.total, booked: parts.booked?.booked ?? null, calendar: parts.booked?.calendar ?? "none" },
      stuck: stuckOf(stuck.open, parts.nowMs),
    },
    profile: parts.profile,
  };
}
