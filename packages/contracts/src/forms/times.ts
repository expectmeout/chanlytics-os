/**
 * A time asked for on a form (the Forms plan, F3; Ruben's call 8 of 22 November 2026; decision 0061). What a form does
 * with its "when" question follows the workspace's own booking setting, the one AI follows in a chat, and nothing of the
 * form's own: a business that confirms its own bookings shows its real open times and takes a picked one as a request
 * it confirms; one that offers its own booking page sends people there; any other asks the question as the form wrote
 * it. Nothing a form does books a visit, and nothing it says is "booked".
 *
 * A time is kept as a slot on the business's clock, "2026-11-28 11:00" (the receptionist's own booking_slot shape), and
 * checked where it is sent against the openings as they stand then (contracts requestedBookingOf), never here. Pure.
 */
import { CLOCK_SLOT, dateFormat, MIN_MS } from "../shared/time";
import { clockInZone, dayInZone } from "../shared/zone/math";

/** How a form asks for a time: from the open times, on the business's own page, or as its own question. */
export type FormTimeWay = "requests" | "their_page" | "ask";

/**
 * The way a workspace takes a time, as a form follows it: a workspace that takes booking requests (`takesRequests`:
 * contracts takesBookingRequests, the chat's own rule, which its reader asks) is the open times; a booking page it
 * offers, where bookings are not held for a person, is that page; anything else asks.
 */
export function formTimeWayOf(setting: {
  takesRequests: boolean;
  bookingLink: string | null;
  held: boolean;
}): FormTimeWay {
  if (setting.takesRequests) return "requests";
  return setting.bookingLink?.trim() && !setting.held ? "their_page" : "ask";
}

/** A day's open windows, as the calendar's openings say them (contracts freeWindows): its key, and its windows. */
interface OpenDay {
  key: string;
  windows: ReadonlyArray<{ start: number; end: number }>;
}

/** One time a form offers: the slot it sends, and how the page says it ("11:00 AM"). */
export interface FormTime {
  slot: string;
  label: string;
}

/** One day of the times a form offers: its key, how the page says it ("Tue, Nov 24"), and its times. */
export interface FormTimeDay {
  key: string;
  label: string;
  times: FormTime[];
}

/**
 * How many days a form offers times for, and how many times each: a day's times are one row on a phone (a fourth wrapped
 * to a row of its own at 375 wide, the walk of 22 November), and four days fit without scrolling past.
 */
const FORM_TIME_DAYS = 4;
const FORM_TIMES_A_DAY = 3;

const twoDigits = (n: number) => String(n).padStart(2, "0");

/** An instant as a slot on the business's clock: "2026-11-28 11:00". */
function slotOf(atMs: number, tz: string): string {
  const day = dayInZone(tz, atMs);
  const clock = clockInZone(tz, atMs);
  return `${day.y}-${twoDigits(day.m)}-${twoDigits(day.d)} ${twoDigits(clock.hh)}:${twoDigits(clock.mm)}`;
}

/** At most `most` of a day's times, spread over it: the first, the last, and evenly between. */
function spread<T>(all: readonly T[], most: number): T[] {
  if (all.length <= most) return [...all];
  if (most <= 1) return all.slice(0, Math.max(0, most));
  const kept = new Set(Array.from({ length: most }, (_, i) => Math.round((i * (all.length - 1)) / (most - 1))));
  return all.filter((_, at) => kept.has(at));
}

/**
 * The times a form offers from the openings (contracts freeWindows: already past the business's least notice, on its
 * grid, its booking rules kept): each window's starts a slot apart that leave a slot before it closes, the first
 * `days` days that have any, at most `perDay` a day spread over it, said in the form's language on the business's
 * clock. A start an hour away or less is never offered: such a time is held for nobody (00688).
 */
export function formTimesOf(
  openings: readonly OpenDay[],
  at: { tz: string; slotMin: number; nowMs: number; lang: string; days?: number; perDay?: number },
): FormTimeDay[] {
  const stepMs = Math.max(5, at.slotMin) * MIN_MS;
  const soonest = at.nowMs + 60 * MIN_MS;
  const dayWords = dateFormat(at.lang, { timeZone: at.tz, weekday: "short", month: "short", day: "numeric" });
  const timeWords = dateFormat(at.lang, { timeZone: at.tz, hour: "numeric", minute: "2-digit" });
  const out: FormTimeDay[] = [];
  for (const opening of openings) {
    if (out.length >= (at.days ?? FORM_TIME_DAYS)) break;
    const starts: number[] = [];
    for (const window of opening.windows)
      for (let start = window.start; start + stepMs <= window.end; start += stepMs)
        if (start > soonest) starts.push(start);
    if (!starts.length) continue;
    out.push({
      key: opening.key,
      label: dayWords.format(new Date(starts[0] ?? 0)),
      times: spread(starts, at.perDay ?? FORM_TIMES_A_DAY).map((start) => ({
        slot: slotOf(start, at.tz),
        label: timeWords.format(new Date(start)),
      })),
    });
  }
  return out;
}

/** Whether an answer is a slot: a time asked for, as a form keeps it. */
export const isFormSlot = (answer: unknown): answer is string => typeof answer === "string" && CLOCK_SLOT.test(answer);

/**
 * A slot in words, "Sat, Nov 28, 11:00 AM", in a language: read as the clock time it is (the business's), so no zone is
 * asked. What it is not a slot of is said as it was kept.
 */
export function formSlotWords(slot: string, lang = "en-US"): string {
  const match = CLOCK_SLOT.exec(slot);
  if (!match) return slot;
  const [y = 0, mo = 1, d = 1, hh = 0, mm = 0] = match.slice(1).map(Number);
  return dateFormat(lang, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.UTC(y, mo - 1, d, hh, mm)));
}

/** Where the visit a time was asked for stands, as the record keeps it (appointments.status). */
export type FormTimeStatus = "proposed" | "booked" | "kept" | "missed" | "cancelled";

const TIME_STATUSES: readonly FormTimeStatus[] = ["proposed", "booked", "kept", "missed", "cancelled"];

/** A visit's status read back; one nobody knows is said as let go. */
export const formTimeStatusOf = (kept: string): FormTimeStatus =>
  TIME_STATUSES.find((status) => status === kept) ?? "cancelled";

/**
 * Whether a time asked for still takes its time: waiting on its owner, and not past its day (decision 0061: past it, it
 * takes nothing, and Booked it is refused, since the time may have gone to someone else).
 */
export const formTimeHolds = (time: { status: FormTimeStatus; expiresAt: string | null }, nowMs: number): boolean =>
  time.status === "proposed" && (!time.expiresAt || Date.parse(time.expiresAt) > nowMs);
