/**
 * The day's card: today and tomorrow as the calendar reads them, who is coming and when, what is open, and the
 * appointment playbooks' line, in the workspace's word. Its foot line is today-period.ts's.
 */
import { visitDoor } from "../calendar/appointment-key";
import type { VisitMark } from "../calendar/calendar-dto";
import type { MatchVia } from "../calendar/calendar-people";
import {
  VISIT_ASK_WORDS,
  VISIT_WORDS,
  clockLabel,
  visitLineOfBlock,
  visitStands,
  type VisitLineVM,
} from "../calendar/calendar-words";
import { clockInZone } from "../calendar/zone-math";
import { HELD_WORDS, NEEDS_YOU_WORD } from "../conversations/standing";
import { initialsOf } from "../conversations/thread-contact";
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import { triggerOf, triggerWords } from "../playbooks/playbook-triggers";
import type { TodayQueueRowVM } from "./today-vm";
import { SEQUENCES_ROUTE } from "../sequences/sequence-address";

/* ------------------------------ the day ---------------------------------- */

/** One block of a day, as the calendar surface publishes it (CalendarBlockVM satisfies it). */
interface DayBlockLike {
  id: string;
  t: number;
  dur: number;
  time: string;
  title: string;
  /** The title with the person's name taken out of it (visit-service.ts visitTitleWithout). */
  service: string;
  person: { id: string; name: string; via?: MatchVia | null } | null;
  /** ISO instants: when it begins and ends, which a visit line reads to say whether it is over (CalendarBlockVM has both). */
  start?: string;
  end?: string;
  /**
   * The record's row for the visit and how it stands (CalendarBlockVM.visit, decision 0002), or null: a visit the record
   * holds nothing for. Absent on a block read before the marks existed, which stands as any visit does. The row's id is
   * what a press on Kept or Missed is said on.
   */
  visit?: (Pick<VisitMark, "status"> & Partial<Pick<VisitMark, "id">>) | null;
}
/** What the day module reads, as the calendar surface publishes it. Minimal on purpose: the page hands the surface in. */
export interface DayFrameLike {
  key: string;
  long: string;
  today: boolean;
  past: boolean;
  closed: { yes: boolean; note: string | null };
  blocks: DayBlockLike[];
  allDay: DayBlockLike[];
  windows: Array<{ label: string }>;
}
export interface CalendarLike {
  days: DayFrameLike[];
  /** The clock now, as hours in the business's zone (14.5 is 2:30 PM). */
  now: number;
  feed: { state: "ok" | "unavailable" | "none" };
  stats: { next: string };
  /** The hours the Calendar's grid draws, whole hours (CalendarVM.hours): the span a phone's day bar is drawn over. */
  hours?: { start: number; end: number };
}
/** A playbook card as the playbooks surface publishes it. */
export interface PlaybookCardLike {
  trigger: string;
  state: string;
  /** How many its next run would reach; null when the server could not count them. */
  candidates: number | null;
  next: string;
  /** Whether it runs on the business's day (contracts campaignRunsOn): on, and not past its last day. */
  runs: boolean;
}

export interface TodayDayItemVM {
  id: string;
  /** "2 PM" · "10:15 AM" · "All day" — the column. */
  start: string;
  /** "2 – 5 PM" — the whole span, for the hover. */
  time: string;
  /** "3h" · "1h 30m" · "45m"; empty for all-day. */
  dur: string;
  title: string;
  /** What it is FOR, with the person's name taken out of the title (visit-service.ts visitTitleWithout): the row names them
   *  once. "Gloss" from "Gloss · Emily Chen". */
  service: string;
  person: { id: string; name: string } | null;
  allDay: boolean;
  /** Where it sits against the clock, today only: past · now · next · later. */
  phase: "past" | "now" | "next" | "later";
  /** The person's open thread, when they have one: "Needs you — in Inbox". */
  flag: string | null;
  /**
   * What a member said became of the visit (decision 0002), in the board's own word for it; null while it stands. A
   * cancelled visit is none and never reaches an item.
   */
  said: { status: "kept" | "missed"; word: string } | null;
  /**
   * Where it opens: the visit, by its record's row, else its day on the Calendar (visitDoor). Every link to a visit opens it
   * (the wiring's second audit, S9-7): the strip's Next named one and opened nothing.
   */
  to: string;
  /** Where it sits on the day, in hours on the business's clock (14.5 is 2:30 PM); null for an all-day entry. */
  at: { from: number; to: number } | null;
}

/**
 * Today's bar on a phone (the phone canvas, 28 Oct 2026): the day's span cut into the visits and the gaps between them,
 * each a share of the whole, in the day's order, and where now stands on it. Shares sum to one; a visit is never cut by
 * the span, the span is widened to hold it.
 */
export interface TodayDayBarVM {
  parts: Array<{ share: number; phase: TodayDayItemVM["phase"] | "gap" }>;
  /** Now, as a share of the span; null before it opens and after it closes. */
  now: number | null;
}

export interface TodayDayFrameVM {
  key: string;
  /** "Today · Sunday, September 6" */
  label: string;
  today: boolean;
  past: boolean;
  closed: { yes: boolean; note: string | null };
  items: TodayDayItemVM[];
  /** "2 booked" (a visit said missed is not booked), and "1 needs you" when a person on the day has an open thread. */
  summary: { booked: string; flagged: string | null } | null;
  /** How many of the day's visits were said missed: nobody came. */
  missed: number;
  /** The windows the receptionist would offer, as labels; none on a closed or past day. */
  open: string[];
  /** How many of the day's entries the cap left out, and the line that says so ("2 more on the Calendar"). */
  more: number;
  moreLine: string | null;
  /** Today's bar, over every visit that stands (the card's cap leaves none out of it); null on tomorrow and with none. */
  bar: TodayDayBarVM | null;
}

/**
 * The bar over a day's timed visits, in the day's order: the span is the Calendar's grid, widened to hold the first and the
 * last visit, else the visits alone. Overlapping visits are one stretch of the bar, in the phase of the first; `now` is a
 * share only while it is inside the span.
 */
export function todayDayBar(
  items: readonly TodayDayItemVM[],
  grid: { start: number; end: number } | null,
  now: number | null,
): TodayDayBarVM | null {
  const timed = items.filter((i): i is TodayDayItemVM & { at: { from: number; to: number } } => !!i.at);
  if (!timed.length) return null;
  const from = Math.min(grid ? grid.start : Infinity, ...timed.map((i) => i.at.from));
  const to = Math.max(grid ? grid.end : -Infinity, ...timed.map((i) => i.at.to));
  const span = to - from;
  if (!(span > 0)) return null;
  const parts: TodayDayBarVM["parts"] = [];
  let at = from;
  for (const i of [...timed].sort((a, b) => a.at.from - b.at.from)) {
    const start = Math.max(at, i.at.from);
    const end = Math.max(start, i.at.to);
    if (start > at) parts.push({ share: (start - at) / span, phase: "gap" });
    if (end > start) parts.push({ share: (end - start) / span, phase: i.phase });
    at = Math.max(at, end);
  }
  if (to > at) parts.push({ share: (to - at) / span, phase: "gap" });
  return { parts, now: now !== null && now >= from && now <= to ? (now - from) / span : null };
}

/**
 * The line beside today's date on a phone: closed and why; booked through with the next opening; how many and the first
 * time still open; how many. In the workspace's word for a visit.
 */
export function todayDayNote(frame: TodayDayFrameVM, nextOpening: string | null, word: AppointmentWord): string {
  if (frame.closed.yes) return `Closed today${frame.closed.note ? ` · ${frame.closed.note}` : ""}`;
  const W = appointmentWords(word);
  const n = frame.items.length + frame.more - frame.missed;
  const count = n ? `${n} ${n === 1 ? W.one : W.many}` : `No ${W.many}`;
  if (frame.open.length) return `${count} · open ${frame.open[0]}`;
  if (nextOpening) return `Fully booked · next opening ${nextOpening}`;
  return count;
}

/** "45m" · "1h" · "1h 30m" */
export function durationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** The person's standing on a visit, in the words People and the Inbox say it (standing.ts), and where it is answered. */
const FLAG_WORDS: Record<string, string> = {
  needs_you: `${NEEDS_YOU_WORD} — in Inbox`,
  waiting_on_you: `${HELD_WORDS.yours.pill} — in Inbox`,
};

export interface TodayDayVM {
  feed: "ok" | "unavailable" | "none";
  frames: TodayDayFrameVM[];
  nextOpening: string | null;
  /**
   * The appointment playbooks' line — what goes out and when — or the offer to start one, in the workspace's word; null
   * without a feed, or while the playbooks are unread.
   */
  reminders: { text: string; to: string } | null;
  /**
   * What the workspace calls an appointment, for the brief's count and the day's own sentences: the playbooks' shape's
   * word where it is read, else the word a workspace gets until it picks (appointmentWordOf) -- the default, never a
   * guess at a pick.
   */
  word: AppointmentWord;
}

/**
 * What a member said became of a visit that stands (decision 0002, step 8): kept or missed, in the board's word, or nothing
 * yet. A cancelled visit is none (visitStands, as People, Reports and the moments read it) and never reaches this.
 */
function markedOf(b: DayBlockLike): TodayDayItemVM["said"] {
  const status = b.visit?.status;
  return status === "kept" || status === "missed" ? { status, word: VISIT_WORDS[status] } : null;
}

/** Rows on Today's day card; the Calendar has the rest. */
export const TODAY_DAY_MAX = 5;

/**
 * The `max` entries worth the card: everything still to come first, then what is over, most recent first, back in the
 * day's order. At ten with seven appointments the eight o'clock goes before anything ahead does.
 */
function capDay(items: TodayDayItemVM[], max: number): TodayDayItemVM[] {
  if (items.length <= max) return items;
  const keep = new Set<string>();
  for (const i of items) if (i.phase !== "past" && keep.size < max) keep.add(i.id);
  for (const i of [...items].reverse()) if (i.phase === "past" && keep.size < max) keep.add(i.id);
  return items.filter((i) => keep.has(i.id));
}

/**
 * Today and tomorrow, as the calendar reads them: who is coming and when,
 * what is open, what is closed — and the appointment playbooks' line. Nothing here
 * is derived from a message; the calendar is the source, the playbooks say
 * what they will do about it, in the word Campaigns says (spec 2026-10-09 §4.8, "One page, one word").
 */
export function todayDay(
  cal: CalendarLike | null,
  /**
   * The playbooks surface as the page already holds it: its cards, and what the workspace calls an appointment (its
   * shape's word, from GET playbooks). Null while it is unread: no read of its own is made for the word.
   */
  playbooks: { rows: PlaybookCardLike[]; word: AppointmentWord } | null,
  /**
   * People's rows, for the red line: a person on the day whose thread needs someone. And the workspace's word as People's
   * read says it (its `word`), while the playbooks are still unread.
   */
  people: { rows: Array<{ id: string; state: string }>; word?: AppointmentWord } | null = null,
  max = TODAY_DAY_MAX,
): TodayDayVM {
  const word = playbooks ? playbooks.word : (people?.word ?? "appointment");
  if (!cal) return { feed: "none", frames: [], nextOpening: null, reminders: null, word };
  const feed = cal.feed.state;
  const idx = cal.days.findIndex((d) => d.today);
  const picked = idx >= 0 ? cal.days.slice(idx, idx + 2) : [];
  const stateOf = new Map((people?.rows ?? []).map((r) => [r.id, r.state]));
  const item = (b: DayBlockLike, dayKey: string, allDay: boolean, phase: TodayDayItemVM["phase"]): TodayDayItemVM => ({
    id: b.id,
    start: allDay ? "All day" : clockLabel(b.t),
    time: b.time,
    dur: allDay ? "" : durationLabel(b.dur),
    title: b.title,
    service: b.service,
    person: b.person ? { id: b.person.id, name: b.person.name } : null,
    allDay,
    phase,
    flag: b.person ? (FLAG_WORDS[stateOf.get(b.person.id) ?? ""] ?? null) : null,
    said: markedOf(b),
    to: visitDoor(dayKey, b.visit?.id),
    at: allDay ? null : { from: b.t, to: b.t + b.dur / 60 },
  });
  const frames: TodayDayFrameVM[] = picked.map((d) => {
    // A cancelled visit is none: not listed, not counted, never the next.
    const standing = (blocks: DayBlockLike[]) => blocks.filter((b) => visitStands(b.visit));
    // Against the clock, today only: what is over, what is on now, the one
    // coming next. Tomorrow is all "later"; an all-day entry has no place on
    // the rail. A visit said missed is over whatever the clock says: nobody is under way or coming.
    let nextTaken = false;
    const timed = standing(d.blocks)
      .sort((a, b) => a.t - b.t)
      .map((b) => {
        let phase: TodayDayItemVM["phase"] = "later";
        if (d.today) {
          const end = b.t + b.dur / 60;
          if (b.visit?.status === "missed" || end <= cal.now) phase = "past";
          else if (b.t <= cal.now) phase = "now";
          else if (!nextTaken) {
            phase = "next";
            nextTaken = true;
          }
        }
        return item(b, d.key, false, phase);
      });
    const items = [...standing(d.allDay).map((b) => item(b, d.key, true, "later")), ...timed];
    const flagged = items.filter((i) => i.flag).length;
    const missed = items.filter((i) => i.said?.status === "missed").length;
    const booked = items.length - missed;
    const shown = capDay(items, max);
    const more = items.length - shown.length;
    return {
      key: d.key,
      label: `${d.today ? "Today" : "Tomorrow"} · ${d.long}`,
      today: d.today,
      past: d.past,
      closed: d.closed,
      items: shown,
      more,
      moreLine: more ? `${more} more on the Calendar` : null,
      summary: booked
        ? {
            booked: `${booked} booked`,
            flagged: flagged ? `${flagged} need${flagged === 1 ? "s" : ""} you` : null,
          }
        : null,
      missed,
      open: d.closed.yes || d.past ? [] : d.windows.map((w) => w.label),
      bar: d.today ? todayDayBar(timed, cal.hours ?? null, cal.now) : null,
    };
  });
  let reminders: TodayDayVM["reminders"] = null;
  // While the playbooks are unread the day does not know whether a reminder runs, or what the workspace calls one.
  if (feed === "ok" && playbooks) {
    // The ones that run on the business's day (campaignRunsOn): a reminder past its last day is no reminder (S1-3).
    const visit = playbooks.rows.filter((p) => (p.trigger === "visit_tomorrow" || p.trigger === "visited") && p.runs);
    const W = appointmentWords(word);
    reminders =
      visit.length === 0
        ? {
            // "Write", not "text": a campaign goes by WhatsApp, text or email, whichever each person is reached on. A
            // person reads "campaign", never "playbook" (decision 19 of 9 Oct 2026).
            text: `No ${W.one} reminders yet — a campaign can write the day before ${W.a} and the day after.`,
            to: SEQUENCES_ROUTE,
          }
        : {
            text: visit
              .map((p) => {
                // The playbook's kind in its moment's own label in the workspace's word (playbook-triggers.ts
                // triggerWords), never spelled again here. A count that could not be read is left out, never said as
                // "null people".
                const t = triggerOf(p.trigger);
                return `${t ? triggerWords(t, word).label : p.trigger}: ${p.candidates == null ? "" : `${p.candidates} ${p.candidates === 1 ? "person" : "people"} · `}next run ${p.next}`;
              })
              .join(" · "),
            to: SEQUENCES_ROUTE,
          };
  }
  return {
    feed,
    frames,
    nextOpening: feed === "ok" && cal.stats.next !== "—" ? cal.stats.next : null,
    reminders,
    word,
  };
}

/* ------------------------------ what is next, in the frame's top bar (the page heads canvas, H2) ---------------------- */

/**
 * What is next on the day, as the frame's top bar says it beside the bell on every page (the page heads canvas, H2, 31 Oct
 * 2026): the visit under way, else the next to come, today only. The strip under Today's head said it on Today alone, and
 * the brief's sentence says it again there.
 */
export interface TodayDayNextVM {
  /** "Now" while it is under way, else "Next". */
  phase: "Now" | "Next";
  /** "10:45 AM", in the bold. */
  start: string;
  /** Who it is with, else what it is for: the bar's room holds one. */
  who: string;
  /** All of it as a reader hears it and a pointer reads it: "Next at 10:45 AM: Dulce Amaro · Color · 1h 30m". */
  label: string;
  /** The visit (visitDoor): the bar is its door. */
  to: string;
}

/**
 * The visit under way or next today, against the clock now in the business's zone: the bar stays up across pages, while
 * the Calendar's own `now` is the minute its weeks were read, so a visit that began since reads as under way, and one that
 * ended is gone. A visit said kept and still under way says so; one said missed or cancelled is never here (todayDay).
 */
export function todayDayNext(cal: (CalendarLike & { timezone: string }) | null, nowMs: number): TodayDayNextVM | null {
  if (!cal || cal.feed.state !== "ok" || !cal.days.some((d) => d.today)) return null;
  const at = clockInZone(cal.timezone, nowMs);
  const day = todayDay({ ...cal, now: at.hh + at.mm / 60 }, null);
  const items = day.frames.find((f) => f.today)?.items ?? [];
  const b = items.find((i) => i.phase === "now") ?? items.find((i) => i.phase === "next");
  if (!b) return null;
  const phase = b.phase === "now" ? "Now" : "Next";
  const what = b.person ? [b.person.name, b.service].filter(Boolean) : [b.service || b.title];
  const rest = [what.join(" · "), b.dur, b.said?.word].filter(Boolean).join(" · ");
  return {
    phase,
    start: b.start,
    who: b.person ? b.person.name : b.service || b.title,
    label: `${phase === "Now" ? "Now, since" : "Next at"} ${b.start}: ${rest}`,
    to: b.to,
  };
}

/* ------------------------------ yesterday's visits to mark (decision 0047, D1-visit-mark) ---------------------------- */

/** Yesterday's visits the queue names: three, as the steps due are; the rest are one row. */
const TODAY_VISITS_MAX = 3;

/** One of yesterday's visits nobody has marked, as the one visit line, with the record's row a press is said on. */
export interface TodayVisitAskVM {
  line: VisitLineVM;
  /** The record's row (VisitMark.id): what POST calendar/visits/[id] says Kept or Missed on. */
  markId: string;
  /** The person it is for: the row wears their face. */
  person: { id: string; name: string };
  /** The visit on the Calendar (visitDoor): the row's door. */
  to: string;
}

/** Yesterday's unmarked visits: the ones Today names, how many in all, the workspace's word for one, and where the rest are. */
export interface TodayVisitsAskedVM {
  items: TodayVisitAskVM[];
  count: number;
  word: AppointmentWord;
  /** The Calendar on yesterday, where every one of them is. */
  to: string;
}

/** What the rows say that a visit line's own words do not. */
const VISITS_ASKED_WORDS = {
  rest: (n: number, W: ReturnType<typeof appointmentWords>) => `${n} more ${n === 1 ? W.one : W.many} to mark`,
  restSentence: "Nobody has said whether they came, yesterday.",
  open: "Open",
  calendar: "on the Calendar",
} as const;

/** Visits to mark in a count, for the queue's head: "3 appointments to mark". */
export function todayVisitsSub(n: number, word: AppointmentWord): string {
  const W = appointmentWords(word);
  return `${n} ${n === 1 ? W.one : W.many} to mark`;
}

/** The visits the card could not hold, with the door's name: "3 appointments to mark on the Calendar". */
export function todayVisitsFoot(n: number, word: AppointmentWord): string {
  return `${todayVisitsSub(n, word)} ${VISITS_ASKED_WORDS.calendar}`;
}

/**
 * Yesterday's visits nobody has said whether they came to (product call of 11 Oct 2026, approved): a visit of the day
 * before today's that has ended, that the record keeps a row for (so a word can be said on it) and that is for a person
 * the board matched. Their lines are the one visit line (visitLineOfBlock), judged at `nowMs`; the first three are named,
 * in the day's order, and the count is all of them. Null with none, and without the day before today in the calendar the
 * page holds (a board moved to another span holds none of it). An event nobody is matched to is not asked about: a lunch
 * on the owner's calendar is no visit, and the Calendar's panel says it for the rest.
 */
export function todayVisitsAsked(
  cal: CalendarLike | null,
  nowMs: number,
  word: AppointmentWord,
  max = TODAY_VISITS_MAX,
): TodayVisitsAskedVM | null {
  if (!cal) return null;
  const idx = cal.days.findIndex((d) => d.today);
  const yesterday = idx > 0 ? cal.days[idx - 1] : null;
  if (!yesterday) return null;
  const asked: TodayVisitAskVM[] = [];
  for (const b of [...yesterday.blocks].sort((x, y) => x.t - y.t)) {
    if (!b.person || !b.visit || !b.visit.id || !b.start || !b.end) continue;
    const to = visitDoor(yesterday.key, b.visit.id);
    const line = visitLineOfBlock(
      {
        id: b.id,
        title: b.title,
        time: b.time,
        start: b.start,
        end: b.end,
        visit: { id: b.visit.id, status: b.visit.status },
        person: b.person,
      },
      nowMs,
      "Yesterday",
      to,
    );
    if (line.unmarked) asked.push({ line, markId: b.visit.id, person: { id: b.person.id, name: b.person.name }, to });
  }
  if (!asked.length) return null;
  return { items: asked.slice(0, max), count: asked.length, word, to: `calendar/${yesterday.key}` };
}

/** One visit to mark as a row: the person and the question, the visit on the Calendar as the door and Kept and Missed as the verbs. */
function visitRow(a: TodayVisitAskVM): TodayQueueRowVM {
  const { line, person } = a;
  return {
    id: `q-visit-${a.markId}`,
    kind: "visit",
    conversationId: null,
    callId: null,
    person_id: person.id,
    who: person.name,
    initials: initialsOf(person.name),
    channel: "Calendar",
    when: [line.day, line.time].filter(Boolean).join(", "),
    sentence: VISIT_ASK_WORDS.question,
    quoted: false,
    status: [VISIT_ASK_WORDS.unmarked, line.title],
    tone: "warn",
    warn: false,
    cta: { label: VISIT_WORDS.kept, to: a.to },
    also: null,
    visit: { id: a.markId, asks: line.asks },
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/** The row for the visits past the named ones: how many, and the door to the Calendar on yesterday. */
function visitsRestRow(asked: TodayVisitsAskedVM): TodayQueueRowVM {
  const rest = asked.count - asked.items.length;
  const W = appointmentWords(asked.word);
  return {
    id: "q-visits-more",
    kind: "visits",
    conversationId: null,
    callId: null,
    person_id: null,
    who: VISITS_ASKED_WORDS.rest(rest, W),
    initials: `+${rest}`,
    channel: "Calendar",
    when: "",
    sentence: VISITS_ASKED_WORDS.restSentence,
    quoted: false,
    status: [VISIT_ASK_WORDS.unmarked, VISITS_ASKED_WORDS.calendar],
    tone: "warn",
    warn: false,
    cta: { label: VISITS_ASKED_WORDS.open, to: asked.to },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/**
 * Today's queue with yesterday's visits to mark among its rows (0047): a row for each of those named (three at most) and one
 * for the rest, after everyone who waits on a person and the steps due, before a call worth a listen. They are the team's
 * to-do as a step is: nobody waits on them, so they never take a seat from a person (the card draws the queue in order),
 * they are not counted in the head's number (it is who needs you), and the queue the brief built, which Ask, the widget
 * and the away card read, is left as it was. With none to mark, the rows as they were.
 */
export function withVisitsAsked(rows: TodayQueueRowVM[], asked: TodayVisitsAskedVM | null): TodayQueueRowVM[] {
  if (!asked) return rows;
  const mine = asked.items.map(visitRow);
  if (asked.count > asked.items.length) mine.push(visitsRestRow(asked));
  const firstCall = rows.findIndex((r) => r.kind === "call");
  const at = firstCall < 0 ? rows.length : firstCall;
  return [...rows.slice(0, at), ...mine, ...rows.slice(at)];
}
