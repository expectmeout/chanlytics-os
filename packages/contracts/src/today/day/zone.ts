/** Day: zone. */

import { addressOf } from "../../activity/record-address";
import { clockLabel } from "../../calendar/words/labels";
import { clockInZone, dayInZone } from "../../shared/zone/math";
import { contactName, shortName } from "../../conversations/thread-contact";
import type { ConversationDto } from "../../conversations/thread-dto";
import { DAY_MS } from "../../shared/time";
import { capitalize } from "../../shared/words";
import { appointmentWords, type AppointmentWord } from "../../journey/appointment-word";
import { TODAY_PHONE_WORDS as P } from "../bands";
import { unmarkedVisitsOf } from "../to-do";
import {
  durationLabel,
  todayDayNote,
  type CalendarLike,
  type DayFrameLike,
  type TodayDayBarVM,
  type TodayDayFrameVM,
  type TodayDayItemVM,
  type TodayDayVM,
} from "./frame";

/* ------------------------------ the day as Today's second zone says it (Today in three zones, 2 Nov 2026) ----------- */

/** One of the two cells over the day's bar: who is under way or next and the one after, or tomorrow's first two. */
export interface TodayZoneCellVM {
  /** "Now", "Next", "Then" or "First". */
  eyebrow: string;
  now: boolean;
  /** When it starts, or the span of the one under way ("11 AM – 12:30 PM"). */
  when: string;
  /** "Noor Haddad · Cut" */
  what: string;
  fact: string | null;
  to: string;
}

/** A line of the day at its time; the page lays them among what goes on its own and what went (the runs are Sent's). */
export interface TodayZoneLineVM {
  key: string;
  /** Where it falls, in hours on the business's clock: what orders the lines. */
  at: number;
  time: string;
  title: string;
  sub: string;
  kind: "visit" | "back" | "open";
  /** The glyph before its title: none for a visit. */
  glyph: "clock" | "plus" | null;
  /** An hour nothing is booked in: its title in the amber. */
  open: boolean;
  to: string | null;
  /**
   * On an hour a cancellation freed today: the visit it was, which Offer it offers to who asked and never booked (the edge
   * reads the time from the visit itself).
   */
  freed: { visitId: string } | null;
}

/** Someone who comes back today from Not now: their thread, their name, and when (TodayVM.back). */
export interface TodayBackVM {
  conversationId: string;
  who: string;
  /** ISO instant their Not now ends. */
  until: string;
}

/** Today's second zone: its name and line, the two cells, the bar, its lines, and what it leaves to the Calendar. */
export interface TodayZoneDayVM {
  /** "The day", or "Tomorrow" once today has closed (by the business's hours, else its last visit). */
  title: string;
  note: string;
  tomorrow: boolean;
  cells: TodayZoneCellVM[];
  bar: TodayDayBarVM | null;
  lines: TodayZoneLineVM[];
  /** Today's visits that are over and not drawn: "3 earlier". */
  earlier: number;
  /** The visits the Calendar holds past the ones the day lists. */
  more: number;
  /**
   * Today's visits that have ended and nobody has said whether they came to, by the one visit line (calendar/words.ts
   * visitLineOfBlock `unmarked`, the rule To do's visits to mark are asked by): the foot's "1 to mark" once the day turned.
   */
  toMark: number;
}

/**
 * Who comes back from Not now in the next day, soonest first (TodayVM.back): the threads put off whose time ends ahead.
 * The day draws those whose time falls today, at it (todayZoneDay).
 */
export function todayBackOf(conversations: readonly ConversationDto[], now: Date): TodayBackVM[] {
  const nowMs = now.getTime();
  return conversations
    .flatMap((c) => {
      const until = c.state === "snoozed" && c.snooze_until ? Date.parse(c.snooze_until) : Number.NaN;
      return Number.isFinite(until) && until > nowMs && until - nowMs <= DAY_MS
        ? [{ conversationId: c.id, who: contactName(c), until: new Date(until).toISOString() }]
        : [];
    })
    .sort((a, b) => Date.parse(a.until) - Date.parse(b.until));
}

/** Who and what, as the cells say it: "Camila Ortiz · Color"; the service alone where nobody is named. */
const whoAndWhat = (b: TodayDayItemVM): string =>
  (b.person ? [b.person.name, b.service] : [b.service || b.title]).filter(Boolean).join(" · ");

/** A line for a visit after the cells: who, then what and how long. */
function visitLineOf(todayDay: TodayDayItemVM): TodayZoneLineVM {
  return {
    key: todayDay.id,
    at: todayDay.at ? todayDay.at.from : 0,
    time: todayDay.start,
    title: todayDay.person ? todayDay.person.name : todayDay.service || todayDay.title,
    sub: [todayDay.person ? todayDay.service : "", todayDay.dur].filter(Boolean).join(" · "),
    kind: "visit",
    glyph: null,
    open: false,
    to: todayDay.to,
    freed: null,
  };
}

/**
 * When the day closes, in hours on the business's clock: where its hours end, which is where the closed span that runs to
 * the grid's end begins (DayFrameLike.bands); else, on a day it is closed, a weekday its hours leave out or with no hours
 * set, the end of its last visit; null on a day with neither, which never turns (the build's lane L2).
 */
function closesAt(frame: DayFrameLike, items: readonly TodayDayItemVM[], gridEnd: number | undefined): number | null {
  if (!frame.closed.yes && gridEnd !== undefined) {
    const tail = frame.bands?.find((b) => b.to === gridEnd);
    if (tail && tail.from < gridEnd) return tail.from;
  }
  const ends = items.flatMap((i) => (i.at ? [i.at.to] : []));
  return ends.length ? Math.max(...ends) : null;
}

/** "Open · 45 min", "Open · 1h": an hour with nothing booked in it, by its length, as the canvas says each. */
const openTitle = (minutes: number) =>
  `Open · ${minutes > 0 && minutes < 60 ? `${Math.round(minutes)} min` : durationLabel(minutes) || "now"}`;

/**
 * The hours a cancellation freed today that are still ahead and still open: the longest part of the visit that was inside
 * a window the receptionist would offer, at least one of its slots long (as contracts freedTimeOf picks it), "Open · 45
 * min", who cancelled, and the freed visit, which Offer it offers to how many could take it while that part has not begun.
 * Tomorrow's first open window instead, once the day has turned: "Nothing booked yet".
 */
function openLinesOf(
  frame: DayFrameLike,
  at: { now: number; tomorrow: boolean; slot: number },
  words: ReturnType<typeof appointmentWords>,
  could: number | null,
): TodayZoneLineVM[] {
  const { now, tomorrow } = at;
  const windows = frame.windows.filter(
    (w): w is { label: string; t: number; dur: number } =>
      typeof w.t === "number" && typeof w.dur === "number" && (tomorrow || w.t + w.dur / 60 > now),
  );
  if (tomorrow) {
    const [w] = windows;
    return w
      ? [
          {
            key: `open-${w.t}`,
            at: w.t,
            time: clockLabel(w.t),
            title: openTitle(w.dur),
            sub: "Nothing booked yet",
            kind: "open",
            glyph: "plus",
            open: true,
            to: null,
            freed: null,
          },
        ]
      : [];
  }
  return frame.blocks.flatMap((block) => {
    if (block.visit?.status !== "cancelled" || !block.visit.id || !block.start || !block.end) return [];
    const visitEnd = block.t + block.dur / 60;
    let part: { from: number; to: number } | null = null;
    for (const w of windows) {
      const from = Math.max(w.t, block.t);
      const to = Math.min(w.t + w.dur / 60, visitEnd);
      if (to > from && (!part || to - from > part.to - part.from)) part = { from, to };
    }
    // A part shorter than a slot frees no time anyone could book: the edge would make no offer of it either.
    if (!part || part.to <= now || (part.to - part.from) * 60 < at.slot) return [];
    const personName = block.person ? shortName(block.person.name) : null;
    // Offered only while the open part is still to come: one already under way nobody can be offered, or take.
    const ahead = part.from > now;
    return [
      {
        key: `freed-${block.id}`,
        at: part.from,
        time: clockLabel(part.from),
        title: openTitle((part.to - part.from) * 60),
        sub: [
          personName ? `${personName} cancelled.` : `${capitalize(words.a)} was cancelled.`,
          could && ahead ? P.offer.could(could) : "",
        ]
          .filter(Boolean)
          .join(" "),
        kind: "open",
        glyph: "plus",
        open: true,
        to: null,
        freed: ahead ? { visitId: block.visit.id } : null,
      },
    ];
  });
}

/** Who comes back today from Not now, still ahead: "Dana Ruiz comes back", at their time. */
function backLinesOf(back: readonly TodayBackVM[], tz: string, nowMs: number, todayKey: string): TodayZoneLineVM[] {
  return back.flatMap((second) => {
    const at = Date.parse(second.until);
    if (!Number.isFinite(at) || at <= nowMs) return [];
    const { hh, mm } = clockInZone(tz, at);
    const hours = hh + mm / 60;
    if (dayInZone(tz, at).key !== todayKey) return [];
    return [
      {
        key: `back-${second.conversationId}`,
        at: hours,
        time: clockLabel(hours),
        title: `${second.who} comes back`,
        sub: "From Not now",
        kind: "back" as const,
        glyph: "clock" as const,
        open: false,
        to: addressOf({ kind: "conversation", id: second.conversationId }),
        freed: null,
      },
    ];
  });
}

/** The two cells: the visit under way, else the next, and the one after it; tomorrow's first two, once the day turned. */
function dayCellsOf(items: readonly TodayDayItemVM[], tomorrow: boolean): { cells: TodayZoneCellVM[]; used: number } {
  const timed = items.filter((i) => !i.allDay);
  const ahead = tomorrow ? timed : timed.filter((i) => i.phase === "now" || i.phase === "next" || i.phase === "later");
  const [first, second] = ahead;
  if (!first) return { cells: [], used: 0 };
  const now = first.phase === "now";
  const eyebrows: readonly [string, string] = tomorrow ? [P.first, P.then] : now ? [P.now, P.next] : [P.next, P.then];
  const cell = (i: TodayDayItemVM, eyebrow: string, isNow: boolean): TodayZoneCellVM => ({
    eyebrow,
    now: isNow,
    when: isNow ? i.time : i.start,
    what: whoAndWhat(i),
    fact: i.fact,
    to: i.to,
  });
  return {
    cells: [cell(first, eyebrows[0], now), ...(second ? [cell(second, eyebrows[1], false)] : [])],
    used: second ? 2 : 1,
  };
}

/**
 * Today's second zone (Today in three zones, 2 Nov 2026): what's ahead first. The visit under way or next and the one
 * after, each with one fact of who is coming; the bar with now on it; then, at their times, the visits after them, who
 * comes back from Not now, and an hour a cancellation freed; what is over is folded ("3 earlier"). Once the day has
 * closed (by the business's hours where Settings hold them, else after its last visit; never on a day with neither) it
 * turns to tomorrow: its first two, its visits and its first open hour. Null where the calendar says no day.
 */
export function todayZoneDay(
  cal: CalendarLike | null,
  day: TodayDayVM | null,
  back: readonly TodayBackVM[],
  nowMs: number,
): TodayZoneDayVM | null {
  if (!cal || !day) return null;
  const todayFrame = cal.days.find((d) => d.today) ?? null;
  const today = day.frames.find((f) => f.today) ?? null;
  if (!todayFrame || !today) return null;
  const close = closesAt(todayFrame, today.items, cal.hours?.end);
  const next = day.frames.find((f) => !f.today) ?? null;
  const nextFrame = next ? (cal.days.find((d) => d.key === next.key) ?? null) : null;
  const tomorrow = close !== null && cal.now >= close && !!next && !!nextFrame;
  const frame = tomorrow && next ? next : today;
  const raw = tomorrow && nextFrame ? nextFrame : todayFrame;
  const words = appointmentWords(day.word);
  const { cells, used } = dayCellsOf(frame.items, tomorrow);
  const timed = frame.items.filter((i) => !i.allDay);
  const ahead = tomorrow ? timed : timed.filter((i) => i.phase !== "past");
  const tz = cal.timezone ?? "UTC";
  const lines = [
    ...ahead.slice(used).map(visitLineOf),
    ...(tomorrow ? [] : backLinesOf(back, tz, nowMs, todayFrame.key)),
    ...openLinesOf(raw, { now: cal.now, tomorrow, slot: cal.offer?.slot ?? 0 }, words, day.freedCandidates ?? null),
  ].sort((a, b) => a.at - b.at);
  const count = frame.items.length + frame.more - frame.missed;
  return {
    title: tomorrow ? P.tomorrow : P.day,
    // Tomorrow with nothing booked says so once, in its open hour's line ("Nothing booked yet"): its head said "No
    // meetings" over it (the phone pass, 3 Nov 2026). A day with no open hour either keeps the head's words.
    note: tomorrow
      ? count
        ? `${count} ${count === 1 ? words.one : words.many}`
        : lines.some((l) => l.open)
          ? ""
          : `No ${words.many}`
      : todayDayNote(frame, day.nextOpening, day.word),
    tomorrow,
    cells,
    bar: frame.bar,
    lines,
    earlier: tomorrow ? 0 : timed.filter((i) => i.phase === "past").length,
    more: frame.more,
    toMark: toMarkOn(todayFrame, nowMs),
  };
}

/** Today's visits that have ended with nobody's word on whether they came, by the rule To do asks yesterday's by. */
const toMarkOn = (frame: DayFrameLike, nowMs: number): number => unmarkedVisitsOf(frame, nowMs, "Today").length;

/**
 * The foot of the day once it has turned to tomorrow: how today went, its visits, the ones still to mark, and how many
 * of the customer messages the receptionist answered. "Today: 8 visits, 1 to mark · 31 of 34 answered". A day of none
 * says nothing of its visits, as the page's head already said it ("Today: 0 booked"; the phone pass, 3 Nov 2026), and a
 * foot with nothing left to say is none.
 */
export function todayWentFoot(
  today: TodayDayFrameVM | null,
  toMark: number,
  answered: { value: number | null; of?: number } | null,
  word: AppointmentWord,
): string {
  const words = appointmentWords(word);
  const visits = today ? today.items.length + today.more - today.missed : 0;
  const parts = [
    visits || toMark ? `${visits} ${visits === 1 ? words.one : words.many}${toMark ? `, ${toMark} to mark` : ""}` : "",
    answered && answered.value !== null && answered.of ? `${answered.value} of ${answered.of} answered` : "",
  ].filter(Boolean);
  return parts.length ? `Today: ${parts.join(" · ")}` : "";
}

/** The day's foot otherwise: what is over, folded, and what the Calendar holds past the lines drawn. */
export function todayDayFoot(earlier: number, more: number, word: AppointmentWord): string {
  const words = appointmentWords(word);
  if (earlier && more) return `${P.earlier(earlier)} · ${more} more on the Calendar`;
  if (earlier) return P.earlier(earlier);
  return more ? P.dayMore(more, words.one, words.many) : "";
}
