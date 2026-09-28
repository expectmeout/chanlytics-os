/**
 * The day's card: today and tomorrow as the calendar reads them, who is coming and when, what is open, and the
 * visit playbooks' line. Its foot line is today-period.ts's.
 */
import { clockLabel } from "../calendar/calendar";

/* ------------------------------ the day ---------------------------------- */

/** What the day module reads, as the calendar surface publishes it. Minimal on purpose: the page hands the surface in. */
export interface DayFrameLike {
  key: string;
  long: string;
  today: boolean;
  past: boolean;
  closed: { yes: boolean; note: string | null };
  blocks: Array<{
    id: string;
    t: number;
    dur: number;
    time: string;
    title: string;
    /** The title with the person's name taken out of it (calendar.ts serviceOf). */
    service: string;
    person: { id: string; name: string } | null;
  }>;
  allDay: Array<{
    id: string;
    t: number;
    dur: number;
    time: string;
    title: string;
    /** The title with the person's name taken out of it (calendar.ts serviceOf). */
    service: string;
    person: { id: string; name: string } | null;
  }>;
  windows: Array<{ label: string }>;
}
export interface CalendarLike {
  days: DayFrameLike[];
  /** The clock now, as hours in the business's zone (14.5 is 2:30 PM). */
  now: number;
  feed: { state: "ok" | "unavailable" | "none" };
  stats: { next: string };
}
/** A playbook card as the playbooks surface publishes it. */
export interface PlaybookCardLike {
  trigger: string;
  state: string;
  candidates: number;
  next: string;
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
  /** What it is FOR, with the person's name taken out of the title (calendar.ts serviceOf): the row names them
   *  once. "Gloss" from "Gloss · Emily Chen". */
  service: string;
  person: { id: string; name: string } | null;
  allDay: boolean;
  /** Where it sits against the clock, today only: past · now · next · later. */
  phase: "past" | "now" | "next" | "later";
  /** The person's open thread, when they have one: "Needs you — in Inbox". */
  flag: string | null;
}

export interface TodayDayFrameVM {
  key: string;
  /** "Today · Sunday, September 6" */
  label: string;
  today: boolean;
  past: boolean;
  closed: { yes: boolean; note: string | null };
  items: TodayDayItemVM[];
  /** "2 booked", and "1 needs you" when a person on the day has an open thread. */
  summary: { booked: string; flagged: string | null } | null;
  /** The windows the receptionist would offer, as labels; none on a closed or past day. */
  open: string[];
  /** How many of the day's entries the cap left out, and the line that says so ("2 more on the Calendar"). */
  more: number;
  moreLine: string | null;
}

/** "45m" · "1h" · "1h 30m" */
export function durationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const FLAG_WORDS: Record<string, string> = {
  needs_you: "Needs you — in Inbox",
  waiting_on_you: "Waiting on you — in Inbox",
};

export interface TodayDayVM {
  feed: "ok" | "unavailable" | "none";
  frames: TodayDayFrameVM[];
  nextOpening: string | null;
  /** The visit playbooks' line — what goes out and when — or the offer to start one. */
  reminders: { text: string; to: string } | null;
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
 * what is open, what is closed — and the visit playbooks' line. Nothing here
 * is derived from a message; the calendar is the source, the playbooks say
 * what they will do about it.
 */
export function todayDay(
  cal: CalendarLike | null,
  playbooks: PlaybookCardLike[] | null,
  /** People's rows, for the red line: a person on the day whose thread needs someone. */
  people: { rows: Array<{ id: string; state: string }> } | null = null,
  max = TODAY_DAY_MAX,
): TodayDayVM {
  if (!cal) return { feed: "none", frames: [], nextOpening: null, reminders: null };
  const feed = cal.feed.state;
  const idx = cal.days.findIndex((d) => d.today);
  const picked = idx >= 0 ? cal.days.slice(idx, idx + 2) : [];
  const stateOf = new Map((people?.rows ?? []).map((r) => [r.id, r.state]));
  const item = (
    b: DayFrameLike["blocks"][number],
    allDay: boolean,
    phase: TodayDayItemVM["phase"],
  ): TodayDayItemVM => ({
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
  });
  const frames: TodayDayFrameVM[] = picked.map((d) => {
    // Against the clock, today only: what is over, what is on now, the one
    // coming next. Tomorrow is all "later"; an all-day entry has no place on
    // the rail.
    let nextTaken = false;
    const timed = [...d.blocks]
      .sort((a, b) => a.t - b.t)
      .map((b) => {
        let phase: TodayDayItemVM["phase"] = "later";
        if (d.today) {
          const end = b.t + b.dur / 60;
          if (end <= cal.now) phase = "past";
          else if (b.t <= cal.now) phase = "now";
          else if (!nextTaken) {
            phase = "next";
            nextTaken = true;
          }
        }
        return item(b, false, phase);
      });
    const items = [...d.allDay.map((b) => item(b, true, "later")), ...timed];
    const flagged = items.filter((i) => i.flag).length;
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
      summary: items.length
        ? {
            booked: `${items.length} booked`,
            flagged: flagged ? `${flagged} need${flagged === 1 ? "s" : ""} you` : null,
          }
        : null,
      open: d.closed.yes || d.past ? [] : d.windows.map((w) => w.label),
    };
  });
  let reminders: TodayDayVM["reminders"] = null;
  if (feed === "ok") {
    const visit = (playbooks ?? []).filter(
      (p) => (p.trigger === "visit_tomorrow" || p.trigger === "visited") && p.state === "running",
    );
    reminders =
      visit.length === 0
        ? {
            text: "No visit reminders yet — a playbook can text the day before an appointment and the day after a visit.",
            to: "outbound",
          }
        : {
            text: visit
              .map(
                (p) =>
                  `${p.trigger === "visit_tomorrow" ? "Visit reminder" : "After the visit"}: ${p.candidates} ${p.candidates === 1 ? "person" : "people"} · next run ${p.next}`,
              )
              .join(" · "),
            to: "outbound",
          };
  }
  return { feed, frames, nextOpening: feed === "ok" && cal.stats.next !== "—" ? cal.stats.next : null, reminders };
}
