/**
 * The day: today and tomorrow as the calendar reads them, who is coming and when, what is open, and the appointment
 * playbooks' line, in the workspace's word; and the day as Today's second zone says it (todayZoneDay). Yesterday's visits
 * to mark are To do's rows (today/to-do.ts).
 */
import { addressOf } from "../activity/record-address";
import { visitDoor } from "../calendar/appointment-key";
import type { VisitMark } from "../calendar/dto";
import type { MatchVia } from "../calendar/people";
import { VISIT_WORDS, clockLabel, visitStands } from "../calendar/words";
import { clockInZone, dayInZone } from "../calendar/zone-math";
import { HELD_WORDS, NEEDS_YOU_WORD } from "../conversations/standing";
import { contactName, shortName } from "../conversations/thread-contact";
import type { ConversationDto } from "../conversations/thread-dto";
import { DAY_MS } from "../shared/time";
import { capitalize } from "../shared/words";
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import { triggerOf, triggerWords } from "../campaigns/playbooks/playbook-triggers";
import { TODAY_PHONE_WORDS as P } from "./bands";
import { unmarkedVisitsOf } from "./to-do";
import { SEQUENCES_ROUTE } from "../campaigns/sequences/sequence-address";

/* ------------------------------ the day ---------------------------------- */

/** One block of a day, as the calendar surface publishes it (CalendarBlockVM satisfies it). */
interface DayBlockLike {
  id: string;
  t: number;
  dur: number;
  time: string;
  title: string;
  /** The title with the person's name taken out of it (visit/service.ts visitTitleWithout). */
  service: string;
  /**
   * Who it is for, and what the board's own read knows of them (CalendarBlockVM.person.facts): the day says one fact of
   * them under who is coming, their last visit, from it (Today in three zones, 2 Nov 2026).
   */
  person: {
    id: string;
    name: string;
    via?: MatchVia | null;
    facts?: { last_visit_at?: string | null } | null;
  } | null;
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
  /** The times the receptionist would offer: their words, and where each starts (hours) and how long it is (minutes). */
  windows: Array<{ label: string; t?: number; dur?: number }>;
  /**
   * The spans of the day OUTSIDE the business's hours, in hours on its clock (CalendarDayVM.bands, calendar.ts
   * dayBandsOf): the whole grid on a day it is closed, else the gaps before, between and after its hours. The one that
   * runs to the grid's end begins at closing.
   */
  bands?: ReadonlyArray<{ from: number; to: number }>;
}
export interface CalendarLike {
  days: DayFrameLike[];
  /** The clock now, as hours in the business's zone (14.5 is 2:30 PM). */
  now: number;
  /** The business's zone (CalendarVM.timezone): what a visit's date is said in. */
  timezone?: string;
  feed: { state: "ok" | "unavailable" | "none" };
  stats: { next: string };
  /** The hours the Calendar's grid draws, whole hours (CalendarVM.hours): the span a phone's day bar is drawn over. */
  hours?: { start: number; end: number };
  /** The shortest time the receptionist offers, minutes (CalendarVM.offer): no freed part shorter is offered. */
  offer?: { slot: number };
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
  /** What it is FOR, with the person's name taken out of the title (visit/service.ts visitTitleWithout): the row names them
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
  /**
   * One fact of who is coming, from the board's own read (Today in three zones, 2 Nov 2026): "Last here Aug 12", or "First
   * visit" where the record holds none before; null where nobody is matched or their visits were not read.
   */
  fact: string | null;
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
  /**
   * The day's bar, over every visit that stands (the card's cap leaves none out of it); now on it only today, so tomorrow's
   * bar has no mark. Null with no timed visit.
   */
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
  /**
   * How many the freed time's step would offer an hour to (the playbooks read's count for `slot_opened`), which a freed
   * hour's line says; null with no such step running, the playbooks unread, or a count the server could not make.
   */
  freedCandidates?: number | null;
}

/**
 * What a member said became of a visit that stands (decision 0002, step 8): kept or missed, in the board's word, or nothing
 * yet. A cancelled visit is none (visitStands, as People, Reports and the moments read it) and never reaches this.
 */
function markedOf(b: DayBlockLike): TodayDayItemVM["said"] {
  const status = b.visit?.status;
  return status === "kept" || status === "missed" ? { status, word: VISIT_WORDS[status] } : null;
}

/**
 * The one fact the day says of who is coming (Today in three zones, 2 Nov 2026): when they were last in, on the business's
 * calendar ("Last here Aug 12"), or that this is their first visit where the record holds none before it, in the season
 * or before (calendar-person-facts.ts last_visit_at). Nothing where nobody is matched, it is not known whether they were in
 * before, or the board's zone is unknown.
 */
function visitFactOf(b: DayBlockLike, tz: string | undefined, word: AppointmentWord): string | null {
  const last = b.person?.facts?.last_visit_at;
  if (last === undefined || !tz) return null;
  if (last === null) return `First ${appointmentWords(word).one}`;
  const at = Date.parse(last);
  if (!Number.isFinite(at)) return null;
  return `Last here ${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(at)}`;
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
    fact: visitFactOf(b, cal.timezone, word),
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
      bar: todayDayBar(timed, cal.hours ?? null, d.today ? cal.now : null),
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
    // How many could take an hour a cancellation freed: the freed time's step's next run, where it runs (decision 0082).
    freedCandidates: playbooks?.rows.find((p) => p.trigger === "slot_opened" && p.runs)?.candidates ?? null,
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
function visitLineOf(v: TodayDayItemVM): TodayZoneLineVM {
  return {
    key: v.id,
    at: v.at ? v.at.from : 0,
    time: v.start,
    title: v.person ? v.person.name : v.service || v.title,
    sub: [v.person ? v.service : "", v.dur].filter(Boolean).join(" · "),
    kind: "visit",
    glyph: null,
    open: false,
    to: v.to,
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
  W: ReturnType<typeof appointmentWords>,
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
  return frame.blocks.flatMap((b) => {
    if (b.visit?.status !== "cancelled" || !b.visit.id || !b.start || !b.end) return [];
    const visitEnd = b.t + b.dur / 60;
    let part: { from: number; to: number } | null = null;
    for (const w of windows) {
      const from = Math.max(w.t, b.t);
      const to = Math.min(w.t + w.dur / 60, visitEnd);
      if (to > from && (!part || to - from > part.to - part.from)) part = { from, to };
    }
    // A part shorter than a slot frees no time anyone could book: the edge would make no offer of it either.
    if (!part || part.to <= now || (part.to - part.from) * 60 < at.slot) return [];
    const who = b.person ? shortName(b.person.name) : null;
    // Offered only while the open part is still to come: one already under way nobody can be offered, or take.
    const ahead = part.from > now;
    return [
      {
        key: `freed-${b.id}`,
        at: part.from,
        time: clockLabel(part.from),
        title: openTitle((part.to - part.from) * 60),
        sub: [
          who ? `${who} cancelled.` : `${capitalize(W.a)} was cancelled.`,
          could && ahead ? P.offer.could(could) : "",
        ]
          .filter(Boolean)
          .join(" "),
        kind: "open",
        glyph: "plus",
        open: true,
        to: null,
        freed: ahead ? { visitId: b.visit.id } : null,
      },
    ];
  });
}

/** Who comes back today from Not now, still ahead: "Dana Ruiz comes back", at their time. */
function backLinesOf(back: readonly TodayBackVM[], tz: string, nowMs: number, todayKey: string): TodayZoneLineVM[] {
  return back.flatMap((b) => {
    const at = Date.parse(b.until);
    if (!Number.isFinite(at) || at <= nowMs) return [];
    const { hh, mm } = clockInZone(tz, at);
    const hours = hh + mm / 60;
    if (dayInZone(tz, at).key !== todayKey) return [];
    return [
      {
        key: `back-${b.conversationId}`,
        at: hours,
        time: clockLabel(hours),
        title: `${b.who} comes back`,
        sub: "From Not now",
        kind: "back" as const,
        glyph: "clock" as const,
        open: false,
        to: addressOf({ kind: "conversation", id: b.conversationId }),
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
  const W = appointmentWords(day.word);
  const { cells, used } = dayCellsOf(frame.items, tomorrow);
  const timed = frame.items.filter((i) => !i.allDay);
  const ahead = tomorrow ? timed : timed.filter((i) => i.phase !== "past");
  const tz = cal.timezone ?? "UTC";
  const lines = [
    ...ahead.slice(used).map(visitLineOf),
    ...(tomorrow ? [] : backLinesOf(back, tz, nowMs, todayFrame.key)),
    ...openLinesOf(raw, { now: cal.now, tomorrow, slot: cal.offer?.slot ?? 0 }, W, day.freedCandidates ?? null),
  ].sort((a, b) => a.at - b.at);
  const n = frame.items.length + frame.more - frame.missed;
  return {
    title: tomorrow ? P.tomorrow : P.day,
    // Tomorrow with nothing booked says so once, in its open hour's line ("Nothing booked yet"): its head said "No
    // meetings" over it (the phone pass, 3 Nov 2026). A day with no open hour either keeps the head's words.
    note: tomorrow
      ? n
        ? `${n} ${n === 1 ? W.one : W.many}`
        : lines.some((l) => l.open)
          ? ""
          : `No ${W.many}`
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
  const W = appointmentWords(word);
  const visits = today ? today.items.length + today.more - today.missed : 0;
  const parts = [
    visits || toMark ? `${visits} ${visits === 1 ? W.one : W.many}${toMark ? `, ${toMark} to mark` : ""}` : "",
    answered && answered.value !== null && answered.of ? `${answered.value} of ${answered.of} answered` : "",
  ].filter(Boolean);
  return parts.length ? `Today: ${parts.join(" · ")}` : "";
}

/** The day's foot otherwise: what is over, folded, and what the Calendar holds past the lines drawn. */
export function todayDayFoot(earlier: number, more: number, word: AppointmentWord): string {
  const W = appointmentWords(word);
  if (earlier && more) return `${P.earlier(earlier)} · ${more} more on the Calendar`;
  if (earlier) return P.earlier(earlier);
  return more ? P.dayMore(more, W.one, W.many) : "";
}
