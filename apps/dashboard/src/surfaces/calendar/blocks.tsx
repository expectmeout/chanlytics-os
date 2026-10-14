/**
 * The Calendar's blocks (moved from legacy/pages/calendar.jsx, decision 0015): one taken block from the feed, a window the
 * receptionist would offer, the board (hours down, days across), the month and the agenda. Each draws what it is handed,
 * and reads nothing itself: the days are the page's frames (types.ts), the words are the view model's, and the campaigns
 * a day carries are contracts' marks (calendar-runs.ts), which are never a block and never taken time.
 *
 * Every word of how a visit stands is the visit line's (contracts visitLineOf), judged at the board's own minute (the
 * page's useMinute), so a block, its dot and its sheet never disagree with each other or with the clock.
 */
import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
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
import { calendar } from "./verbs";
import { crPhone } from "./board-dom";
import { DayMarks, RunMark } from "./marks";
import type { CalendarFrame } from "./types";
import { crWhen, fitHourPx } from "./words";

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
}) {
  const { b, hours, onOpen, wide, dayLong, phase } = p;
  const from = Math.max(hours.start, b.t) - hours.start;
  const span = Math.min(hours.end, b.t + b.dur / 60) - Math.max(hours.start, b.t);
  // Overlapping blocks take lanes side by side; a block alone keeps the column.
  const laned: CSSProperties =
    b.lanes > 1
      ? {
          left: `calc(4px + ${b.lane} * (100% - 8px) / ${b.lanes})`,
          width: `calc((100% - 8px) / ${b.lanes} - 2px)`,
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

/** The all-day events of a day's head: on a phone a dot and the words, cut short, so the hours keep the screen. */
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

/**
 * A day's head over the board: its name, which opens it in Day view (from a keyboard too), what closes it, its all-day
 * events, and its campaigns (two and then "+N" in a week, every one in Day view).
 */
function dayHead(p: { d: CalendarFrame; wide: boolean; onDay: (key: string) => void; a: ViewAct }) {
  const { d, wide, onDay, a } = p;
  return (
    <div key={d.key} className={`cal-dayhead ${d.today ? "today" : ""}`} data-testid="cal-dayhead">
      {/* The day's name opens it in Day view from a keyboard too (C4). */}
      {wide ? (
        <>
          <span className="cal-dow">{d.dow}</span>
          <span className="cal-date tabular">{d.date}</span>
        </>
      ) : (
        <button
          type="button"
          className="cal-dayhead-open"
          onClick={() => onDay(d.key)}
          aria-label={`Open ${d.long} in Day view`}
          aria-current={d.today ? "date" : undefined}
          data-testid="cal-dayhead-open"
        >
          <span className="cal-dow">{d.dow}</span>
          <span className="cal-date tabular">{d.dayNum}</span>
        </button>
      )}
      {d.closed.yes && (
        <span className="cal-closed" title={d.closed.note || ""}>
          Closed{d.closed.note ? ` · ${d.closed.note}` : ""}
        </span>
      )}
      {allDayOf(d, a)}
      <DayMarks marks={a.marksOf(d.key)} max={wide ? 12 : 2} onOpen={() => a.onRuns(d)} />
    </div>
  );
}

/** A day's column under the board: what closures and the hours rule out, the receptionist's open times, the blocks, the now line. */
function dayColumn(p: { d: CalendarFrame; hours: Hours; now: number | null; wide: boolean; fit: Fit; a: ViewAct }) {
  const { d, hours, now, wide, fit, a } = p;
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
        />
      ))}
    </div>
  );
}

/**
 * On a phone the board takes the room the page leaves and the day's hours share it: the hour's height is what fits them
 * there (words.ts fitHourPx), set on the grid before the first paint and again as the room changes. A desk keeps the
 * stylesheet's 64px, and opens at the hour before now on a day it holds today in (CAL-7): the morning a desk scrolled past
 * every time is above it, a scroll away.
 */
function useHourFit(scroller: RefObject<HTMLDivElement | null>, span: number, startAt: number | null): void {
  useLayoutEffect(() => {
    const el = scroller.current;
    const grid = el?.firstElementChild as HTMLElement | null | undefined;
    if (!el || !grid) return undefined;
    const fit = () => {
      if (!crPhone()) {
        grid.style.removeProperty("--cal-hour");
        return;
      }
      const box = getComputedStyle(el);
      const heads = grid.querySelector<HTMLElement>(".cal-corner")?.offsetHeight ?? 0;
      const room = el.clientHeight - heads - parseFloat(box.paddingTop) - parseFloat(box.paddingBottom);
      grid.style.setProperty("--cal-hour", `${fitHourPx(room, span)}px`);
    };
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [scroller, span]);
  // Open at now, once for the view: a scroller with room to scroll is put an hour above the now line.
  const opened = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (opened.current || !el || startAt === null) return;
    opened.current = true;
    if (el.scrollHeight <= el.clientHeight + 1) return;
    const hour = parseFloat(getComputedStyle(el.firstElementChild as Element).getPropertyValue("--cal-hour")) || 64;
    el.scrollTop = Math.max(0, startAt * hour);
  }, [scroller, startAt]);
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
  useHourFit(scroller, span, holdsToday && now !== null ? Math.max(0, now - 1 - hours.start) : null);
  return (
    <div className="cal-scroll" ref={scroller}>
      {/* How many hours tall the board is, for the stylesheet: the gutter and every column are that many of --cal-hour. */}
      <div className={`cal-grid ${wide ? "cal-grid-day" : ""}`} style={{ "--cal-hours": span } as CSSProperties}>
        <div className="cal-corner" />
        {frames.map((d) => dayHead({ d, wide, onDay, a }))}
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
