/**
 * The Calendar's blocks (moved from legacy/pages/calendar.jsx, decision 0015): one taken block from the feed, a window the
 * receptionist would offer, the board (hours down, days across), the month and the agenda. Each draws what it is handed,
 * and reads nothing itself: the days are the page's frames (types.ts), the words are the view model's, and the campaigns
 * a day carries are contracts' marks (calendar-runs.ts), which are never a block and never taken time.
 *
 * Every word of how a visit stands is the visit line's (contracts visitLineOf), judged at the board's own minute (the
 * page's useMinute), so a block, its dot and its sheet never disagree with each other or with the clock.
 */
import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  CalendarBlockVM,
  CalendarRunMark,
  CalendarServiceVM,
  CalendarVM,
  CalendarWindowVM,
} from "@chanlytics/contracts";
import { visitLineOfBlock } from "@chanlytics/contracts";
import { AgendaItem, AgendaItems, AgendaOpen } from "../kit/agenda/agenda";
import { EmptyState } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { calendar } from "./verbs";
import { useHourFit } from "./board-dom";
import { DayMarks, RunMark, markLook } from "./marks";
import type { CalendarFrame } from "./types";
import { crWhen } from "./words";

type Hours = CalendarVM["hours"];
type Fit = (w: CalendarWindowVM) => boolean;
/** A day's campaign marks under Show, by its key; none where Show leaves them off. */
type MarksOf = (key: string) => readonly CalendarRunMark[];

/** What every view is handed beside its days: the board's minute, the marks, and what a press opens. */
interface ViewAct {
  /** The board's own minute (the page's useMinute): what a block's phase and its word are judged at. */
  nowMs: number;
  marksOf: MarksOf;
  onOpen: (b: CalendarBlockVM) => void;
  /** A day's campaigns opened: the day's sheet of marks. */
  onRuns: (d: CalendarFrame) => void;
}

/**
 * A length down the board, in hours, as the stylesheet's hour draws it (calendar.css `--cal-hour`: a desk's 64px, or
 * what fits a phone's room, which CrBoard sets). Every block, window, band, tick and the now line is placed in these, so
 * the one value moves them all.
 */
const ofHours = (hours: number): string => `calc(${hours} * var(--cal-hour))`;

/**
 * Where a block stands against the clock, on today's column and list only: past, now, next (the first still to come), else
 * later. Any other day has no clock, so its blocks are all "later".
 */
function phaseOf(b: CalendarBlockVM, d: CalendarFrame, now: number | null): string {
  if (!d.today || now === null) return "later";
  if (b.t + b.dur / 60 <= now) return "past";
  if (b.t <= now) return "now";
  const soonest = d.blocks.reduce<CalendarBlockVM | null>(
    (first, x) => (x.t > now && (!first || x.t < first.t) ? x : first),
    null,
  );
  return soonest && soonest.id === b.id ? "next" : "later";
}

/**
 * How a visit stands on the board, in the visit line's words at the board's minute: a member's word (kept, missed,
 * cancelled), a tool's request, or one that has ended with nobody's word yet, which the board marks with a plain ring and
 * says only in its name for a reader (the sheet asks the question). Nothing for one ahead, or for an event that is nobody's:
 * a lunch is asked nothing (visitLineOf).
 */
function saidOf(b: CalendarBlockVM, nowMs: number): { status: string; word: string | null } | null {
  const line = visitLineOfBlock(b, nowMs);
  const state = line.state;
  if (!state) return null;
  if (state.tone === "past") return line.unmarked ? { status: "unmarked", word: null } : null;
  return { status: state.tone, word: state.text };
}

/** An event that is nobody's (no person, no number or address, no name): the owner's own time, drawn as busy, not a booking. */
const ownTime = (b: CalendarBlockVM): boolean =>
  !b.person && !b.guess && !b.contacts.e164.length && !b.contacts.emails.length;

/** One taken block. Neutral, never an agent's colour: the calendar did not say who booked it, only that the time is taken. */
function CrBlock(p: {
  b: CalendarBlockVM;
  hours: Hours;
  onOpen: (b: CalendarBlockVM) => void;
  wide: boolean;
  dayLong: string;
  phase: string;
  nowMs: number;
  /** A campaign's moment meets its time: the block keeps the column's left half, the moment the right (C3). */
  half: boolean;
}) {
  const { b, hours, onOpen, wide, dayLong, phase, half } = p;
  const from = Math.max(hours.start, b.t) - hours.start;
  const span = Math.min(hours.end, b.t + b.dur / 60) - Math.max(hours.start, b.t);
  // Overlapping blocks take lanes side by side; a block alone keeps the column. Beside a moment it gives up the moment's
  // room, which the view says (calendar.css `--cal-side`): half of Day view's one wide column, a moment's glyph and clock
  // of a desk's week, where half cut a name to "Mar…", and none of a phone's week, where the moment is a badge on the
  // column's edge and a share of 45px left the visit nothing (the sample walk, 18 Oct 2026).
  const room = half ? "(100% - 8px - var(--cal-side, 0px))" : "(100% - 8px)";
  const laned: CSSProperties =
    b.lanes > 1 || half
      ? {
          left: `calc(4px + ${b.lane} * ${room} / ${b.lanes})`,
          width: `calc(${room} / ${b.lanes} - 2px)`,
          right: "auto",
        }
      : {};
  // How it stands (0002 step 8), said quietly: a dot, the word beside the time, a cancelled one struck, a request dashed.
  const said = saidOf(b, p.nowMs);
  const word = said?.word ?? null;
  const spoken = said ? (word ?? "not marked yet") : null;
  return (
    <button
      className="cal-appt feed"
      style={{ top: ofHours(from), height: `max(22px, ${ofHours(span)} - 2px)`, ...laned }}
      onClick={() => onOpen(b)}
      title={`${b.title} · ${b.time}${b.tool ? ` · ${b.tool}` : ""}${spoken ? ` · ${spoken}` : ""}`}
      aria-label={`${b.title}, ${b.time}, ${dayLong}${b.tool ? `, booked through ${b.tool}` : ""}${spoken ? `, ${spoken.toLowerCase()}` : ""}`}
      data-testid="cal-block"
      data-phase={phase}
      data-lane={b.lanes > 1 ? `${b.lane + 1}/${b.lanes}` : undefined}
      data-tool={b.tool ?? undefined}
      data-visit={said?.status ?? undefined}
      data-own={ownTime(b) || undefined}
    >
      <span className="cal-appt-line1">
        {said ? <span className="cal-appt-dot" aria-hidden="true" /> : null}
        <span className="cal-appt-who">{wide || !b.person ? b.title : b.person.name}</span>
      </span>
      {/* A booking that arrived by email names its tool on the second line: subtle, and said in the sheet too. */}
      <span className="cal-appt-service">
        {b.time}
        {wide && b.person ? ` · ${b.person.name}` : ""}
        {b.tool ? ` · ${b.tool}` : ""}
        {word ? ` · ${word}` : ""}
      </span>
    </button>
  );
}

/** A window the receptionist would offer: a quiet fill under the blocks. */
function CrWindow({ w, hours }: { w: CalendarWindowVM; hours: Hours }) {
  const from = Math.max(hours.start, w.t) - hours.start;
  const span = Math.min(hours.end, w.t + w.dur / 60) - Math.max(hours.start, w.t);
  return (
    <div
      className="cal-open"
      style={{ top: ofHours(from), height: `max(18px, ${ofHours(span)} - 2px)` }}
      title={`Open · ${w.label} — the receptionist would offer this`}
      data-testid="cal-window"
    >
      <span className="cal-open-label">Open · {w.label}</span>
    </div>
  );
}

/**
 * A campaign at its minute (the Calendar's lane C revisited, Ruben's C1-C4, 18 Oct 2026): a mark with a time stands where
 * its time falls, 18px whatever it holds (C2), its glyph, its clock and its words, in no fill or a faint one, so it never
 * reads as a booked chair; it takes no time and is never counted taken. One that meets a visit takes the column's right
 * half and the visit the left (C3); two that meet stand one under the other.
 */
interface CrLaid {
  m: CalendarRunMark;
  side: boolean;
  /** How many moments above it it stands under, each a moment's height. */
  under: number;
}

/** How long a moment stands, in hours, as far as meeting a visit or another moment goes: 18px of a desk's least hour (48). */
const CR_MOMENT_H = 0.375;
/** A moment's height and the room between two, in px, as calendar.css draws it (`.cal-moment`). */
const CR_MOMENT_STEP = 20;

/** Whether a mark stands on the board: it has a time, and the time is in the board's hours. The rest go in the day lane. */
const onBoard = (m: CalendarRunMark, hours: Hours): boolean => m.t !== null && m.t >= hours.start && m.t < hours.end;

/** The day's moments, laid: which meet a visit (and so the visits they halve), and how far down each one stands. */
function laidMoments(
  marks: readonly CalendarRunMark[],
  blocks: readonly CalendarBlockVM[],
): { laid: CrLaid[]; halves: Set<string> } {
  const halves = new Set<string>();
  const laid: CrLaid[] = [];
  let anchor = -Infinity;
  let under = 0;
  for (const m of marks) {
    const t = m.t ?? 0;
    const met = blocks.filter((b) => t < b.t + b.dur / 60 && t + CR_MOMENT_H > b.t);
    for (const b of met) halves.add(b.id);
    under = t < anchor + CR_MOMENT_H * (under + 1) ? under + 1 : 0;
    if (under === 0) anchor = t;
    laid.push({ m, side: met.length > 0, under });
  }
  return { laid, halves };
}

/** A moment's clock, short: "10:03", its place on the board saying the morning or the afternoon. */
function momentClock(t: number): string {
  const total = Math.round(t * 60);
  const h = Math.floor(total / 60) % 24;
  return `${((h + 11) % 12) + 1}:${String(total % 60).padStart(2, "0")}`;
}

/** One moment: a press opens the day's sheet of campaigns, as every mark's does. */
function CrMoment({ x, hours, onOpen }: { x: CrLaid; hours: Hours; onOpen: () => void }) {
  const { m } = x;
  const t = m.t ?? hours.start;
  const said = [m.time, m.name, m.words].filter(Boolean).join(" · ");
  // Inside the board: one in the last quarter hour stands on the board's foot, never over it.
  const at = Math.min(t - hours.start, hours.end - hours.start - CR_MOMENT_H);
  return (
    <button
      type="button"
      className="cal-moment"
      style={{ top: `calc(${ofHours(Math.max(0, at))} + ${x.under * CR_MOMENT_STEP}px)` }}
      onClick={onOpen}
      title={said}
      aria-label={said}
      data-look={markLook(m)}
      data-cold={m.cold || undefined}
      data-side={x.side || undefined}
      data-testid="cal-moment"
    >
      <Icon name={m.cold ? "mail" : "send"} size={11} />
      <span className="cal-moment-time tabular">{momentClock(t)}</span>
      <span className="cal-moment-words">{[m.name, m.words].filter(Boolean).join(" · ")}</span>
    </button>
  );
}

/** The all-day events of a day's lane: on a phone a dot and the words, cut short, so the hours keep the screen. */
function allDayOf(d: CalendarFrame, a: ViewAct) {
  return d.allDay.map((b) => {
    const said = saidOf(b, a.nowMs);
    return (
      <button
        key={b.id}
        className="cal-allday"
        onClick={() => a.onOpen(b)}
        title={said?.word ? `${b.title} · ${said.word}` : b.title}
        aria-label={`${b.title}, all day, ${d.long}${said?.word ? `, ${said.word.toLowerCase()}` : ""}`}
        data-visit={said?.status}
        data-testid="cal-allday"
      >
        {b.title}
        {said?.word ? ` · ${said.word}` : ""}
      </button>
    );
  });
}

/** How many of a day's lane marks are drawn: two in a week, then "+N"; every one in Day view (C6). */
const laneMax = (wide: boolean): number => (wide ? 12 : 2);

/** How many rows a day's lane draws: its all-day events, its marks up to the most, and a "+N". */
function laneRows(d: CalendarFrame, marks: readonly CalendarRunMark[], wide: boolean): number {
  const max = laneMax(wide);
  return d.allDay.length + Math.min(marks.length, max) + (marks.length > max ? 1 : 0);
}

/**
 * A day's lane under its date (C1, C5): its all-day events and the campaigns of the day alone (a run waiting, a last day,
 * cold email, or a time the board's hours leave out). Drawn on every day of a week that has one, each as tall as the
 * week's fullest, so the lanes' tops and the dates line up (C6); not drawn in a week with none.
 */
function dayLane(d: CalendarFrame, marks: readonly CalendarRunMark[], wide: boolean, a: ViewAct) {
  return (
    <div className="cal-daylane" data-testid="cal-daylane">
      {allDayOf(d, a)}
      <DayMarks marks={marks} max={laneMax(wide)} onOpen={() => a.onRuns(d)} />
    </div>
  );
}

/** How many of a day's lane items a phone's week head dots under its date. */
const CR_HEAD_DOTS = 3;

/**
 * What a day's lane holds, as a phone's week head says it: a dot each, in the lane's order (a run waiting first), its
 * look the mark's, and a sentence for a reader. A phone's week has no room for the lane itself (calendar.css hides it), so
 * a run waiting for approval was nowhere on it (the sample walk, 18 Oct 2026); the head opens the day, whose lane says all.
 */
function headDotsOf(d: CalendarFrame, lane: readonly CalendarRunMark[]): { looks: string[]; said: string | null } {
  const looks = [...lane.map(markLook), ...d.allDay.map(() => "allday")];
  if (!looks.length) return { looks, said: null };
  const waits = looks.includes("wait");
  return {
    looks,
    said: waits ? "a run waits for your approval" : `${looks.length} for the whole day`,
  };
}

/**
 * A day's head over the board: its name, which opens it in Day view (from a keyboard too), and what closes it, at its top
 * on every day; under them the day's lane, where the week has one, which a phone's week says as dots under the date.
 */
function dayHead(p: {
  d: CalendarFrame;
  wide: boolean;
  onDay: (key: string) => void;
  a: ViewAct;
  lane: readonly CalendarRunMark[] | null;
}) {
  const { d, wide, onDay, a, lane } = p;
  const dots = lane ? headDotsOf(d, lane) : null;
  return (
    <div key={d.key} className={`cal-dayhead ${d.today ? "today" : ""}`} data-testid="cal-dayhead">
      {/* The day's name opens it in Day view from a keyboard too (C4). */}
      {wide ? (
        <span className="cal-dayhead-when">
          <span className="cal-dow">{d.dow}</span>
          <span className="cal-date tabular">{d.date}</span>
        </span>
      ) : (
        <button
          type="button"
          className="cal-dayhead-open"
          onClick={() => onDay(d.key)}
          aria-label={`Open ${d.long} in Day view${dots?.said ? `, ${dots.said}` : ""}`}
          aria-current={d.today ? "date" : undefined}
          data-testid="cal-dayhead-open"
        >
          <span className="cal-dow">{d.dow}</span>
          <span className="cal-date tabular">{d.dayNum}</span>
          {/* Drawn on every day of a week with a lane, empty where the day has nothing, so the dates stand level. */}
          {dots ? (
            <span className="cal-dayhead-dots" aria-hidden="true" data-testid="cal-dayhead-dots">
              {dots.looks.slice(0, CR_HEAD_DOTS).map((look, i) => (
                <span key={i} className="cal-dayhead-dot" data-look={look} />
              ))}
            </span>
          ) : null}
        </button>
      )}
      {d.closed.yes && (
        <span className="cal-closed" title={d.closed.note || ""}>
          Closed{d.closed.note ? ` · ${d.closed.note}` : ""}
        </span>
      )}
      {lane ? dayLane(d, lane, wide, a) : null}
    </div>
  );
}

/**
 * A day's column under the board: what closures and the hours rule out, the receptionist's open times, the blocks, the now
 * line, and the campaigns that stand at their minute.
 */
function dayColumn(p: { d: CalendarFrame; hours: Hours; now: number | null; wide: boolean; fit: Fit; a: ViewAct }) {
  const { d, hours, now, wide, fit, a } = p;
  const { laid, halves } = laidMoments(
    a.marksOf(d.key).filter((m) => onBoard(m, hours)),
    d.blocks,
  );
  return (
    <div
      key={d.key}
      className={`cal-col ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.loading ? "loading" : ""} ${d.unread ? "unread" : ""}`}
      data-testid="cal-col"
    >
      {d.bands.map((b, i) => (
        <div
          key={i}
          className={`cal-unavail ${b.from <= hours.start && b.to >= hours.end ? "full" : ""}`}
          style={{ top: ofHours(b.from - hours.start), height: ofHours(b.to - b.from) }}
        >
          {b.label && <span>{b.label}</span>}
        </div>
      ))}
      {d.windows.filter(fit).map((w, i) => (
        <CrWindow key={i} w={w} hours={hours} />
      ))}
      {/* The now line under the blocks: a block it crosses stays readable over it. */}
      {d.today && now !== null && now >= hours.start && now <= hours.end && (
        <div className="cal-nowline" style={{ top: ofHours(now - hours.start) }}>
          <span className="cal-nowdot" />
        </div>
      )}
      {d.blocks.map((b) => (
        <CrBlock
          key={b.id}
          b={b}
          hours={hours}
          onOpen={a.onOpen}
          wide={wide}
          dayLong={d.long}
          phase={phaseOf(b, d, now)}
          nowMs={a.nowMs}
          half={halves.has(b.id)}
        />
      ))}
      {laid.map((x) => (
        <CrMoment key={x.m.key} x={x} hours={hours} onOpen={() => a.onRuns(d)} />
      ))}
    </div>
  );
}

/** The board: hours down, days across. Seven columns in Week, one in Day. */
export function CrBoard(p: {
  frames: CalendarFrame[];
  hours: Hours;
  now: number | null;
  wide: boolean;
  fit: Fit;
  onDay: (key: string) => void;
  a: ViewAct;
}) {
  const { frames, hours, now, wide, fit, onDay, a } = p;
  const span = hours.end - hours.start;
  const ticks: number[] = [];
  for (let h = hours.start; h < hours.end; h++) ticks.push(h);
  const scroller = useRef<HTMLDivElement>(null);
  const holdsToday = frames.some((d) => d.today);
  // Each day's lane marks (those not on the board), and as many rows as the fullest day's lane; none, no lane (C6).
  const lanes = new Map(frames.map((d) => [d.key, a.marksOf(d.key).filter((m) => !onBoard(m, hours))]));
  const rows = Math.max(0, ...frames.map((d) => laneRows(d, lanes.get(d.key) ?? [], wide)));
  // Where now stands down the board, in hours from its top, on a board that holds today.
  useHourFit(scroller, span, holdsToday && now !== null ? now - hours.start : null, rows);
  return (
    <div className="cal-scroll" ref={scroller}>
      {/* How many hours tall the board is, for the stylesheet: the gutter and every column are that many of --cal-hour;
          and how many rows the day lanes are, so every lane is as tall as the fullest and their tops line up. */}
      <div
        className={`cal-grid ${wide ? "cal-grid-day" : ""}`}
        style={{ "--cal-hours": span, "--cal-lane-rows": rows } as CSSProperties}
      >
        {/* The lane's band runs through the corner too, so it reads as one row across the board. */}
        <div className="cal-corner">{rows > 0 ? <span className="cal-daylane" aria-hidden="true" /> : null}</div>
        {frames.map((d) => dayHead({ d, wide, onDay, a, lane: rows > 0 ? (lanes.get(d.key) ?? []) : null }))}
        <div className="cal-gutter">
          {ticks.map((h) => (
            <span key={h} className="cal-hour tabular" style={{ top: ofHours(h - hours.start) }}>
              {calendar.clockLabel(h)}
            </span>
          ))}
        </div>
        {frames.map((d) => dayColumn({ d, hours, now, wide, fit, a }))}
      </div>
    </div>
  );
}

/** How much a day holds, as the month says it: what is taken (whatever the feed's state: a booking email is taken too) and the open times. */
function monthCounts(d: CalendarFrame, fit: Fit, nowMs: number): { taken: number; open: number } {
  // A visit said cancelled is no time taken, whatever the calendar still holds.
  const taken = [...d.blocks, ...d.allDay].filter((b) => saidOf(b, nowMs)?.status !== "cancelled").length;
  return { taken, open: d.windows.filter(fit).length };
}

/**
 * What a month day holds, said with its date (C4): a screen reader heard "8", "1 taken", "1 open" and no day. The words the
 * cell draws, in its order.
 */
const crCellLabel = (d: CalendarFrame, taken: number, open: number, feedOk: boolean): string => {
  const held = d.closed.yes
    ? `closed${d.closed.note ? ` · ${d.closed.note}` : ""}`
    : d.unread
      ? "couldn't read"
      : d.loading
        ? "reading"
        : [taken > 0 ? `${taken} taken` : "", feedOk && open > 0 && !d.past ? `${open} open` : ""]
            .filter(Boolean)
            .join(", ") || "nothing on the calendar";
  return `${d.long}: ${held}`;
};

/** What the month's cell has to say: closed, unread, reading, or its counts (taken whatever the feed; open where it reads). */
function monthCellWords(d: CalendarFrame, taken: number, open: number, feedOk: boolean) {
  if (d.closed.yes)
    return <span className="cal-month-closed">{d.closed.note ? `Closed · ${d.closed.note}` : "Closed"}</span>;
  if (d.unread) return <span className="cal-month-none">couldn't read</span>;
  if (d.loading) return <span className="cal-month-none">reading…</span>;
  const showOpen = feedOk && open > 0 && !d.past;
  return (
    <span className="cal-month-counts">
      {taken > 0 && <span className="cal-month-taken">{taken} taken</span>}
      {showOpen && <span className="cal-month-open">{open} open</span>}
      {taken === 0 && !showOpen && <span className="cal-month-none">—</span>}
    </span>
  );
}

/** One day of the month: its number, why it is closed or could not be read, its counts, its named campaigns, and its all-day events. */
function monthCell(p: {
  d: CalendarFrame;
  monthKey: string | null;
  feedOk: boolean;
  fit: Fit;
  onDay: (key: string) => void;
  a: ViewAct;
  picked: string | null;
}) {
  const { d, monthKey, feedOk, fit, onDay, a, picked } = p;
  const { taken, open } = monthCounts(d, fit, a.nowMs);
  const inMonth = d.key.slice(0, 7) === monthKey;
  // Month names the runs that are facts of the day alone (a one-off send, a run waiting, a last day), never the forecasts.
  const named = a.marksOf(d.key).filter((m) => m.named);
  const first = named.at(0);
  return (
    <div
      key={d.key}
      className={`cal-month-cell ${inMonth ? "" : "muted"} ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.closed.yes ? "closed" : ""} ${d.loading ? "loading" : ""} ${d.unread ? "unread" : ""}`}
      data-picked={picked === d.key || undefined}
    >
      <button
        type="button"
        className="cal-month-day"
        data-testid="cal-month-cell"
        onClick={() => onDay(d.key)}
        title={d.long}
        aria-label={crCellLabel(d, taken, open, feedOk)}
        aria-current={d.today ? "date" : undefined}
        aria-pressed={picked !== null ? picked === d.key : undefined}
      >
        <span className="cal-month-num tabular">{d.dayNum}</span>
        {monthCellWords(d, taken, open, feedOk)}
        {/* A phone's month is dots: one for each thing on the day, three at most (D7). */}
        <span className="cal-month-dots" aria-hidden="true">
          {Array.from({ length: Math.min(3, taken + (named.length ? 1 : 0)) }, (_, i) => (
            <i key={i} data-run={i === Math.min(3, taken) && named.length ? "" : undefined} />
          ))}
        </span>
      </button>
      {first ? (
        <span className="cal-month-runs">
          <RunMark m={first} onOpen={() => a.onRuns(d)} short />
          {named.length > 1 ? <span className="cal-month-more">+{named.length - 1}</span> : null}
        </span>
      ) : null}
      {d.allDay.slice(0, 2).map((b) => (
        <span key={b.id} className="cal-month-allday" title={b.title}>
          {b.title}
        </span>
      ))}
    </div>
  );
}

/**
 * The month: six weeks of counts. A day says how much is taken and how many open times it has, and names its campaigns;
 * closed days say why. On a desk a press opens the day in Day view; on a phone it picks the day, whose rows stand under the
 * month (D7), a month of dots the thumb walks.
 */
export function CrMonth(p: {
  frames: CalendarFrame[];
  monthKey: string | null;
  feedOk: boolean;
  fit: Fit;
  onDay: (key: string) => void;
  a: ViewAct;
  /** The day picked on a phone, whose rows the month draws under it; null on a desk. */
  picked: string | null;
  under?: ReactNode;
}) {
  const { frames, monthKey, feedOk, fit, onDay, a, picked } = p;
  const rows: CalendarFrame[][] = [];
  for (let i = 0; i < frames.length; i += 7) rows.push(frames.slice(i, i + 7));
  // The day picked stands under the month, not in its box: the box is the six weeks' height, and clipped the day's rows.
  return (
    <>
      <div className="cal-month" data-testid="cal-month" data-phone={picked !== null || undefined}>
        <div className="cal-month-head">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {rows.map((row, r) => (
          <div key={r} className="cal-month-row">
            {row.map((d) => monthCell({ d, monthKey, feedOk, fit, onDay, a, picked }))}
          </div>
        ))}
      </div>
      {p.under}
    </>
  );
}

/** What a day of the agenda says under its rows: the open times, or why there are none. */
function agendaOpenTimes(p: {
  d: CalendarFrame;
  windows: CalendarWindowVM[];
  service: CalendarServiceVM | null;
  offer: CalendarVM["offer"];
}) {
  const { d, windows, service, offer } = p;
  // Past the last day it offers, a free day read as a day with nothing to offer (C1).
  return d.beyondOffer ? (
    <span className="ag-none">not offered yet — it offers times up to {offer.days} days ahead</span>
  ) : windows.length ? (
    windows.map((w) => (
      <span key={w.label} className="ag-window">
        {w.label}
      </span>
    ))
  ) : (
    <span className="ag-none">
      {service && service.consultFirst
        ? "the receptionist offers a consultation for this, not the service"
        : "nothing the receptionist would offer"}
    </span>
  );
}

/** What the agenda is handed beside its days. */
interface AgendaProps {
  feedOk: boolean;
  fit: Fit;
  service: CalendarServiceVM | null;
  offer: CalendarVM["offer"];
  now: number | null;
  /** Whether open times are drawn (Show). */
  openOn: boolean;
  todayKey: string;
  a: ViewAct;
}

/** One visit of the agenda, as Today's rows draw it: who, then what and how long, and how it stands. */
function agendaRow(b: CalendarBlockVM, allDay: boolean, d: CalendarFrame, p: AgendaProps) {
  const said = saidOf(b, p.a.nowMs);
  return (
    <AgendaItem
      key={b.id}
      time={allDay ? "All day" : calendar.clockLabel(b.t)}
      name={b.person ? b.person.name : b.service}
      service={[b.person ? b.service : null, b.tool, said?.word].filter(Boolean).join(" · ") || null}
      dur={allDay ? null : calendar.durationLabel(b.dur)}
      onOpen={() => p.a.onOpen(b)}
      hint={b.time}
      phase={allDay ? "later" : phaseOf(b, d, p.now)}
      // Struck as the board strikes it: a cancelled visit read like the booked ones round it (the sample walk, 18 Oct 2026).
      struck={said?.status === "cancelled"}
      testid="cal-agenda-item"
    />
  );
}

/** One campaign of the agenda: a row among the visits, its glyph at the right, which opens the day's sheet. */
function agendaRun(m: CalendarRunMark, d: CalendarFrame, p: AgendaProps) {
  return (
    <AgendaItem
      key={m.key}
      time={m.time || "—"}
      name={m.name}
      service={m.words}
      glyph={m.cold ? "mail" : "send"}
      onOpen={() => p.a.onRuns(d)}
      testid="cal-agenda-run"
    />
  );
}

/** A day's rows in the agenda's order: the all-day first, then the visits and the campaigns by the clock. */
function agendaRowsOf(d: CalendarFrame, p: AgendaProps) {
  const timed = d.blocks.map((b) => ({ at: b.t, el: agendaRow(b, false, d, p) }));
  const runs = p.a.marksOf(d.key).map((m) => ({ at: m.t ?? -1, el: agendaRun(m, d, p) }));
  const byClock = [...runs, ...timed].sort((x, y) => x.at - y.at).map((x) => x.el);
  return [...d.allDay.map((b) => agendaRow(b, true, d, p)), ...byClock];
}

/** Whether a day of the agenda is read and open, with nothing in the way of saying what it holds. */
const agendaReadable = (d: CalendarFrame): boolean => !d.loading && !d.unread && !d.closed.yes;

/** A day's head: Today or Tomorrow in words, the day and its date, a closure, and a quiet day's one line. */
function agendaHead(d: CalendarFrame, p: AgendaProps, quiet: boolean) {
  const rel = crWhen(d, p.todayKey);
  return (
    <div className="cal-agenda-head">
      {rel ? <span className="cal-agenda-rel">{rel}</span> : null}
      <span className="cal-dow">{d.dow}</span>
      <span className="cal-date tabular">{d.date}</span>
      {d.closed.yes && <span className="cal-closed">Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>}
      {quiet ? <span className="ag-none">nothing on the calendar</span> : null}
    </div>
  );
}

/** Under a day's rows: that it is being read or could not be, that nothing is on it, and the open times. */
function agendaFoot(d: CalendarFrame, p: AgendaProps, empty: boolean) {
  const windows = d.windows.filter(p.fit);
  const service = p.service;
  return (
    <>
      {d.loading && <span className="ag-none">Reading this day…</span>}
      {d.unread && <span className="ag-none">Couldn't read this day.</span>}
      {agendaReadable(d) && p.feedOk && empty && <EmptyState kind="line" title="Nothing on the calendar." />}
      {p.openOn && agendaReadable(d) && p.feedOk && !d.past && (
        <AgendaOpen
          label={`Open${service ? (service.consultFirst ? " for a consultation" : ` for ${service.name}`) : ""}:`}
        >
          {agendaOpenTimes({ d, windows, service, offer: p.offer })}
        </AgendaOpen>
      )}
    </>
  );
}

/** One day of the agenda: its heading (Today and Tomorrow said), its rows and campaigns, and what it says under them. */
function agendaDay(d: CalendarFrame, p: AgendaProps) {
  const rows = agendaRowsOf(d, p);
  // A day with nothing on it, no open time drawn and nothing to say, is one slim line (CAL-26).
  const quiet = !rows.length && agendaReadable(d) && !d.today && !(p.openOn && p.feedOk && !d.past);
  return (
    <div
      key={d.key}
      className={`cal-agenda-day ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.loading ? "loading" : ""} ${d.unread ? "unread" : ""}`}
      data-quiet={quiet || undefined}
      data-testid="cal-agenda-day"
    >
      {agendaHead(d, p, quiet)}
      {rows.length > 0 && <AgendaItems>{rows}</AgendaItems>}
      {quiet ? null : agendaFoot(d, p, rows.length === 0)}
    </div>
  );
}

/**
 * The agenda: days as a list, what is taken and the campaigns that day, then what the receptionist would offer, the way a
 * phone-first owner reads a day. Its rows ARE Today's rows (the kit's agenda): the same time column, the same rail, the
 * person first with the service and the length under them. The day's heading, what a press opens, and the Open line
 * below are still the Calendar's own.
 */
export function CrAgenda(p: AgendaProps & { frames: CalendarFrame[] }) {
  return (
    <div className="cal-agenda" data-testid="cal-agenda">
      {p.frames.map((d) => agendaDay(d, p))}
    </div>
  );
}

/** One day's rows, as the phone's month draws the day picked under it (D7). */
export function CrAgendaDay(p: AgendaProps & { day: CalendarFrame }) {
  return <div className="cal-agenda cal-agenda-one">{agendaDay(p.day, p)}</div>;
}

export type { ViewAct };
