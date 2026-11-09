/**
 * What the moment asks of a row (his call D6, 9 Nov 2026): which press is the coral follows what is true now, not the row's
 * kind. A call reads the clock and what they said ("free after 4 PM" at 9 in the morning is Back at 4 PM). A reply that never
 * reached them offers what can work. A reply to a reach-out says what has already been done about it, and only what is left
 * is a press. One rule each, read by the sheet and the page alike.
 *
 * Pure: the page, the sheet and the tests read the same moments.
 */
import { formatWaited } from "../conversations/thread-clock";
import { formatPhoneDisplay } from "../shared/phone";
import { DAY_MS } from "../shared/time";
import { clockInZone, dayPlusInZone, localToUtcMs } from "../shared/zone/math";
import { shortName } from "../conversations/thread-contact";
import type { TodayQueueRowVM } from "../today/vm";
import { NEED_YOU_OLD_MS } from "./groups";

/** The line under a sheet's name: how it came and how long it has waited, in what that row has. */
export function sheetSubOf(
  row: Pick<TodayQueueRowVM, "kind" | "who" | "channel" | "via" | "when" | "phone" | "status" | "review">,
  nowMs: number = Date.now(),
): string {
  if (row.kind === "step") return ["To do", lowered(row.status[0] ?? "")].filter(Boolean).join(" · ");
  if (row.kind === "visit")
    return [row.when, (row.status[1] ?? "").replace(` · ${row.who}`, "")].filter(Boolean).join(" · ");
  if (row.kind === "review") {
    const at = row.review?.published_at ? Date.parse(row.review.published_at) : NaN;
    return ["Google", Number.isFinite(at) ? `${formatWaited(Math.max(0, nowMs - at))} ago` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  if (row.kind === "search") return ["Lead search", row.when].filter(Boolean).join(" · ");
  if (row.kind === "callback") {
    const number = row.phone ? formatPhoneDisplay(row.phone) : null;
    return [number ?? "Phone", row.when].filter(Boolean).join(" · ");
  }
  return [row.channel, (row.via ?? "").replace(/^Reach-out:\s*/i, ""), row.when].filter(Boolean).join(" · ");
}

/** A day of the open times as a press and a sentence say it: "Today", "Tomorrow", "Wed, Nov 11". */
export function openDayWord(key: string, tz: string, nowMs: number): string {
  if (key === dayPlusInZone(tz, nowMs, 0).key) return "Today";
  if (key === dayPlusInZone(tz, nowMs, 1).key) return "Tomorrow";
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    Date.UTC(y, m - 1, d),
  );
}

const lowered = (words: string): string => words.charAt(0).toLowerCase() + words.slice(1);

/* ------------------------------------------------ a call */

/** When the business is open, as the Calendar holds it: whole hours, and how far off its next open day is. */
export interface OpenClock {
  /** The hour it opens and the hour it shuts, in its zone. */
  start: number;
  end: number;
  /** It does not open today. */
  closedToday: boolean;
  /** How many days ahead its next open day is, tomorrow being 1. */
  nextOpenIn: number;
}

/** What a call asks now: wait until a time, call, let it go, or (with no number) open the thread. */
export type CallMoment =
  { lead: "wait"; until: string; back: string } | { lead: "call" } | { lead: "mark" } | { lead: "open" };

/** A time they said they are free from: "after 4 PM", "after 4", "after 4:30 pm". Morning hours need their AM. */
const AFTER_TIME = /\bafter\s+(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?(?!\s*(?:day|hour|minute|week|month|year))\b/i;

/** The hour on a 24-hour clock of what `AFTER_TIME` found; with no AM or PM, an afternoon's up to 7 and otherwise as said. */
function hourOf(hour: number, half: string | undefined): number {
  const h = hour % 12;
  if (half?.toLowerCase() === "a") return h;
  if (half?.toLowerCase() === "p") return h + 12;
  return hour >= 1 && hour <= 7 ? h + 12 : hour;
}

/** The hour as a press says it: "Back at 4 PM", "Back at 4:30 PM". */
const clockWords = (hour: number, minute: number): string => {
  const twelve = hour % 12 || 12;
  return `${twelve}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`;
};

/** The instant of a wall-clock time some days from today, in the zone. */
function at(tz: string, nowMs: number, days: number, hour: number, minute: number): string {
  const d = dayPlusInZone(tz, nowMs, days);
  return new Date(localToUtcMs(tz, d.y, d.m, d.d, hour, minute)).toISOString();
}

/**
 * What a call back asks now. Past a week it may be let go, so that leads; so does a call that reads as someone selling to the
 * business. Free from a time still to come, it waits for that time. Outside the business's hours, it waits for the morning.
 * Otherwise, call. With no number there is nothing to ring, and the thread is what is left.
 */
export function callMomentOf(
  row: Pick<TodayQueueRowVM, "sentence" | "phone" | "waitedMs">,
  when: { nowMs: number; tz: string; open: OpenClock | null; selling?: boolean },
): CallMoment {
  if (!row.phone) return { lead: "open" };
  if (row.waitedMs >= NEED_YOU_OLD_MS || when.selling) return { lead: "mark" };
  const { hh, mm } = clockInZone(when.tz, when.nowMs);
  const said = AFTER_TIME.exec(row.sentence);
  if (said) {
    const hour = hourOf(Number(said[1]), said[3]);
    const minute = said[2] ? Number(said[2]) : 0;
    if (hour < 24 && (hour > hh || (hour === hh && minute > mm)))
      return {
        lead: "wait",
        until: at(when.tz, when.nowMs, 0, hour, minute),
        back: `Back at ${clockWords(hour, minute)}`,
      };
  }
  const open = when.open;
  if (!open) return { lead: "call" };
  if (!open.closedToday && hh >= open.start && hh < open.end) return { lead: "call" };
  const days = !open.closedToday && hh < open.start ? 0 : Math.max(1, open.nextOpenIn);
  const day = days > 1 ? dayPlusInZone(when.tz, when.nowMs, days).weekday : "";
  const back = day
    ? `Back ${day.charAt(0).toUpperCase()}${day.slice(1)} at ${clockWords(open.start, 0)}`
    : `Back at ${clockWords(open.start, 0)}`;
  return { lead: "wait", until: at(when.tz, when.nowMs, days, open.start, 0), back };
}

/** Who to call, as the press says it: a first name, or "them" for a number. */
export const callWhoOf = (who: string): string => (/^[+\d(]/.test(who) ? "them" : shortName(who));

/* ------------------------------------------------ a reply to a reach-out */

/** What the reach-out read a reply as, on its row. */
export interface RowReading {
  intent: string;
  claim: string;
  /** The day a to-do was set for (YYYY-MM-DD), where one was. */
  step_day: string | null;
  /** Who they said to write to, where they said. */
  refer_to: string | null;
  /** When they are back, as an instant, where an automatic reply said. */
  until_at: string | null;
}

/** What a reading's sheet says has already been done, and which presses are left. */
export interface ReadingMoment {
  /** What was done, in a line with a green dot; for an automatic reply, what it is. */
  did: string;
  tone: "ok" | "plain";
  /** Whether a reply is still worth writing: Send where a draft stands, Reply now where none should lead. */
  reply: "send" | "door" | "none";
  /** It may be a program's mail: Not a person leads the quiet side. */
  notAPerson: boolean;
}

/** A day (YYYY-MM-DD) as a line says it: "Jan 5". */
function dayWords(key: string | null): string | null {
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    Date.UTC(y, m - 1, d),
  );
}

/**
 * What a reach-out's reply has already come to (his note on the Reads board): the sequence stops by itself on all of these, a
 * to-do is set where one should be, and someone who said no is off the list. So the sheet says that and offers only what is
 * left. Null for a reading that says nothing of the kind: the row is any other reply.
 */
export function readingMomentOf(reading: RowReading | null | undefined): ReadingMoment | null {
  if (!reading) return null;
  if (reading.claim === "auto_reply")
    return { did: "An automatic reply. No person wrote this.", tone: "plain", reply: "none", notAPerson: true };
  const on = dayWords(reading.step_day);
  switch (reading.intent) {
    case "interested":
    case "question":
      return { did: "Your sequence has stopped for them.", tone: "ok", reply: "send", notAPerson: false };
    case "not_now":
      return {
        did: `Your sequence has stopped. A to-do to write again is set${on ? ` for ${on}` : ""}.`,
        tone: "ok",
        reply: "door",
        notAPerson: false,
      };
    case "no":
      return { did: "They're off the list. Nothing more goes to them.", tone: "ok", reply: "none", notAPerson: false };
    case "wrong_person":
      return {
        did: `Your sequence has stopped. A to-do to write to ${reading.refer_to ? reading.refer_to : "who they named"} is on your list.`,
        tone: "ok",
        reply: "door",
        notAPerson: false,
      };
    case "away":
      return {
        did: `Your sequence has stopped. A to-do comes up${on ? ` ${on}` : ""}, when they are back.`,
        tone: "ok",
        reply: "none",
        notAPerson: false,
      };
    default:
      return null;
  }
}

/* ------------------------------------------------ a booking */

/** What an old row is, at a glance: the wait past which a plain reply leads with letting it go. */
export const staleRow = (row: Pick<TodayQueueRowVM, "waitedMs" | "kind">): boolean =>
  row.kind !== "held" && row.waitedMs >= NEED_YOU_OLD_MS;

/** One day's span as a share of a working day, for a booking's strip. */
export interface DayStripPart {
  from: number;
  width: number;
}

/**
 * What stands on the day a booking asks for, on a strip of the business's hours: each thing booked as a share of the span, and
 * the time asked for. A part outside the span is cut to it.
 */
export function dayStripOf(
  span: { start: number; end: number },
  blocks: readonly { t: number; dur: number }[],
  slot: { start: number; end: number },
): { busy: DayStripPart[]; slot: DayStripPart; hours: number[] } {
  const whole = Math.max(1, span.end - span.start);
  const share = (from: number, to: number): DayStripPart => {
    const a = Math.min(span.end, Math.max(span.start, from));
    const b = Math.min(span.end, Math.max(span.start, to));
    return { from: ((a - span.start) / whole) * 100, width: (Math.max(0, b - a) / whole) * 100 };
  };
  const hours: number[] = [];
  for (let h = Math.ceil(span.start); h <= span.end; h += 3) hours.push(h);
  return {
    busy: blocks.map((b) => share(b.t, b.t + b.dur / 60)).filter((p) => p.width > 0),
    slot: share(slot.start, slot.end),
    hours,
  };
}

/** The hour as a strip's tick says it: "9 AM", "12", "3 PM". */
export const stripHour = (hour: number): string =>
  hour === 12 ? "12" : `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;

/** What stands after the time asked for, as the sheet says it: "Nothing else until 5 PM", "Next one is at 1 PM". */
export function afterSlotWords(
  span: { end: number },
  blocks: readonly { t: number }[],
  slotEnd: number,
  hasMoreToday: boolean,
): string {
  const next = blocks
    .map((b) => b.t)
    .filter((t) => t >= slotEnd)
    .sort((a, b) => a - b)[0];
  if (next !== undefined) {
    const h = Math.floor(next);
    return `Next one is at ${clockWords(h, Math.round((next - h) * 60))}.`;
  }
  return hasMoreToday ? `Nothing else until ${clockWords(Math.floor(span.end), 0)}.` : "";
}

/** The days a booking's sheet looks ahead for another time: a week. */
export const OTHER_TIME_DAYS = 7;

/** A week, for the walk's words over who has waited past one. */
export const WEEK_DAYS = Math.round(NEED_YOU_OLD_MS / DAY_MS);
