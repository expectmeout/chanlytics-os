/**
 * The Calendar's blocks (moved from legacy/pages/calendar.jsx, decision 0015): one taken block from the feed, a window the
 * receptionist would offer, the board (hours down, days across), the month's counts and the agenda's rows. Each draws what
 * it is handed, and reads nothing itself: the days are the page's frames (types.ts), and the words are the view model's.
 */
import type { CSSProperties } from "react";
import type { CalendarBlockVM, CalendarServiceVM, CalendarVM, CalendarWindowVM } from "@chanlytics/contracts";
import { AgendaItem, AgendaItems, AgendaOpen } from "../kit/agenda/agenda";
import { EmptyState } from "../kit/empty/empty";
import { calendar } from "./verbs";
import type { CalendarFrame } from "./types";
import { CR_HOUR_PX } from "./words";

type Hours = CalendarVM["hours"];
type Fit = (w: CalendarWindowVM) => boolean;

/** One taken block from the feed. Neutral, never an agent's colour: the calendar did not say who booked it, only that the time is taken. */
function CrBlock({
  b,
  hours,
  onOpen,
  wide,
  dayLong,
}: {
  b: CalendarBlockVM;
  hours: Hours;
  onOpen: (b: CalendarBlockVM) => void;
  wide: boolean;
  dayLong: string;
}) {
  const y = (Math.max(hours.start, b.t) - hours.start) * CR_HOUR_PX;
  const h = Math.max(22, (Math.min(hours.end, b.t + b.dur / 60) - Math.max(hours.start, b.t)) * CR_HOUR_PX - 2);
  // Overlapping blocks take lanes side by side; a block alone keeps the column.
  const laned: CSSProperties =
    b.lanes > 1
      ? {
          left: `calc(4px + ${b.lane} * (100% - 8px) / ${b.lanes})`,
          width: `calc((100% - 8px) / ${b.lanes} - 2px)`,
          right: "auto",
        }
      : {};
  return (
    <button
      className="cal-appt feed"
      style={{ top: y, height: h, ...laned }}
      onClick={() => onOpen(b)}
      title={`${b.title} · ${b.time}`}
      aria-label={`${b.title}, ${b.time}, ${dayLong}`}
      data-testid="cal-block"
      data-lane={b.lanes > 1 ? `${b.lane + 1}/${b.lanes}` : undefined}
    >
      <span className="cal-appt-line1">
        <span className="cal-appt-who">{b.title}</span>
      </span>
      <span className="cal-appt-service">
        {b.time}
        {wide && b.person ? ` · ${b.person.name}` : ""}
      </span>
    </button>
  );
}

/** A window the receptionist would offer: dashed, quiet, under the blocks. */
function CrWindow({ w, hours }: { w: CalendarWindowVM; hours: Hours }) {
  const y = (Math.max(hours.start, w.t) - hours.start) * CR_HOUR_PX;
  const h = Math.max(18, (Math.min(hours.end, w.t + w.dur / 60) - Math.max(hours.start, w.t)) * CR_HOUR_PX - 2);
  return (
    <div
      className="cal-open"
      style={{ top: y, height: h }}
      title={`Open · ${w.label} — the receptionist would offer this`}
      data-testid="cal-window"
    >
      <span className="cal-open-label">Open · {w.label}</span>
    </div>
  );
}

/** A day's head over the board: its name, which opens it in Day view (from a keyboard too), what closes it, and the all-day events. */
function dayHead(p: {
  d: CalendarFrame;
  wide: boolean;
  onDay: (key: string) => void;
  onOpen: (b: CalendarBlockVM) => void;
}) {
  const { d, wide, onDay, onOpen } = p;
  return (
    <div key={d.key} className={`cal-dayhead ${d.today ? "today" : ""}`} data-testid="cal-dayhead">
      {/* The day's name opens it in Day view from a keyboard too (C4): the head was a clickable div no Tab reached,
                named only in a title. */}
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
          <span className="cal-date tabular">{d.date}</span>
        </button>
      )}
      {d.closed.yes && (
        <span className="cal-closed-chip" title={d.closed.note || ""}>
          Closed{d.closed.note ? ` · ${d.closed.note}` : ""}
        </span>
      )}
      {d.allDay.map((b) => (
        <button
          key={b.id}
          className="cal-allday"
          onClick={() => onOpen(b)}
          title={b.title}
          aria-label={`${b.title}, all day, ${d.long}`}
        >
          {b.title}
        </button>
      ))}
    </div>
  );
}

/** A day's column under the board: what the hours and closures rule out, the receptionist's open times, the blocks, the now line. */
function dayColumn(p: {
  d: CalendarFrame;
  hours: Hours;
  now: number | null;
  wide: boolean;
  fit: Fit;
  gridH: number;
  onOpen: (b: CalendarBlockVM) => void;
}) {
  const { d, hours, now, wide, fit, gridH, onOpen } = p;
  return (
    <div
      key={d.key}
      className={`cal-col ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.loading ? "loading" : ""} ${d.unread ? "unread" : ""}`}
      style={{ height: gridH }}
      data-testid="cal-col"
    >
      {d.bands.map((b, i) => (
        <div
          key={i}
          className={`cal-unavail ${b.from <= hours.start && b.to >= hours.end ? "full" : ""}`}
          style={{ top: (b.from - hours.start) * CR_HOUR_PX, height: (b.to - b.from) * CR_HOUR_PX }}
        >
          {b.label && <span>{b.label}</span>}
        </div>
      ))}
      {d.windows.filter(fit).map((w, i) => (
        <CrWindow key={i} w={w} hours={hours} />
      ))}
      {d.blocks.map((b) => (
        <CrBlock key={b.id} b={b} hours={hours} onOpen={onOpen} wide={wide} dayLong={d.long} />
      ))}
      {d.today && now !== null && now >= hours.start && now <= hours.end && (
        <div className="cal-nowline" style={{ top: (now - hours.start) * CR_HOUR_PX }}>
          <span className="cal-nowdot" />
        </div>
      )}
    </div>
  );
}

/** The board: hours down, days across. Seven columns in Week, one in Day. */
export function CrBoard({
  frames,
  hours,
  now,
  wide,
  fit,
  onDay,
  onOpen,
}: {
  frames: CalendarFrame[];
  hours: Hours;
  now: number | null;
  wide: boolean;
  fit: Fit;
  onDay: (key: string) => void;
  onOpen: (b: CalendarBlockVM) => void;
}) {
  const gridH = (hours.end - hours.start) * CR_HOUR_PX;
  const ticks: number[] = [];
  for (let h = hours.start; h < hours.end; h++) ticks.push(h);
  return (
    <div className="cal-scroll">
      <div className={`cal-grid ${wide ? "cal-grid-day" : ""}`}>
        <div className="cal-corner" />
        {frames.map((d) => dayHead({ d, wide, onDay, onOpen }))}
        <div className="cal-gutter" style={{ height: gridH }}>
          {ticks.map((h) => (
            <span key={h} className="cal-hour tabular" style={{ top: (h - hours.start) * CR_HOUR_PX }}>
              {calendar.clockLabel(h)}
            </span>
          ))}
        </div>
        {frames.map((d) => dayColumn({ d, hours, now, wide, fit, gridH, onOpen }))}
      </div>
    </div>
  );
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
        : !feedOk
          ? ""
          : [taken > 0 ? `${taken} taken` : "", open > 0 && !d.past ? `${open} open` : ""].filter(Boolean).join(", ") ||
            "nothing on the calendar";
  return held ? `${d.long}: ${held}` : d.long;
};

/** One day of the month: its number, why it is closed or could not be read, its counts, and its all-day events. */
function monthCell(p: {
  d: CalendarFrame;
  monthKey: string | null;
  feedOk: boolean;
  fit: Fit;
  onDay: (key: string) => void;
}) {
  const { d, monthKey, feedOk, fit, onDay } = p;
  const taken = d.blocks.length + d.allDay.length;
  const open = d.windows.filter(fit).length;
  const inMonth = d.key.slice(0, 7) === monthKey;
  return (
    <button
      key={d.key}
      className={`cal-month-cell ${inMonth ? "" : "muted"} ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.closed.yes ? "closed" : ""} ${d.loading ? "loading" : ""} ${d.unread ? "unread" : ""}`}
      onClick={() => onDay(d.key)}
      title={d.long}
      aria-label={crCellLabel(d, taken, open, feedOk)}
      aria-current={d.today ? "date" : undefined}
      data-testid="cal-month-cell"
    >
      <span className="cal-month-num tabular">{d.dayNum}</span>
      {d.closed.yes && (
        <span className="cal-month-closed">{d.closed.note ? `Closed · ${d.closed.note}` : "Closed"}</span>
      )}
      {d.unread && <span className="cal-month-none">couldn't read</span>}
      {d.loading && <span className="cal-month-none">reading…</span>}
      {!d.closed.yes && !d.loading && !d.unread && feedOk && (
        <span className="cal-month-counts">
          {taken > 0 && <span className="cal-month-taken">{taken} taken</span>}
          {open > 0 && !d.past && <span className="cal-month-open">{open} open</span>}
          {taken === 0 && (open === 0 || d.past) && <span className="cal-month-none">—</span>}
        </span>
      )}
      {d.allDay.slice(0, 2).map((b) => (
        <span key={b.id} className="cal-month-allday" title={b.title}>
          {b.title}
        </span>
      ))}
    </button>
  );
}

/** The month: six weeks of counts. A day says how much is taken and how many open times it has; closed days say why. Click a day to see it. */
export function CrMonth({
  frames,
  monthKey,
  feedOk,
  fit,
  onDay,
}: {
  frames: CalendarFrame[];
  monthKey: string | null;
  feedOk: boolean;
  fit: Fit;
  onDay: (key: string) => void;
}) {
  const rows: CalendarFrame[][] = [];
  for (let i = 0; i < frames.length; i += 7) rows.push(frames.slice(i, i + 7));
  return (
    <div className="cal-month" data-testid="cal-month">
      <div className="cal-month-head">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {rows.map((row, r) => (
        <div key={r} className="cal-month-row">
          {row.map((d) => monthCell({ d, monthKey, feedOk, fit, onDay }))}
        </div>
      ))}
    </div>
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

/** One day of the agenda: its heading, its rows, what could not be read, and what the receptionist would offer. */
function agendaDay(p: {
  d: CalendarFrame;
  feedOk: boolean;
  fit: Fit;
  service: CalendarServiceVM | null;
  offer: CalendarVM["offer"];
  onOpen: (b: CalendarBlockVM) => void;
}) {
  const { d, feedOk, fit, service, offer, onOpen } = p;
  const windows = d.windows.filter(fit);
  const items: Array<[CalendarBlockVM, boolean]> = [
    ...d.allDay.map((b): [CalendarBlockVM, boolean] => [b, true]),
    ...d.blocks.map((b): [CalendarBlockVM, boolean] => [b, false]),
  ];
  return (
    <div
      key={d.key}
      className={`cal-agenda-day ${d.today ? "today" : ""} ${d.past ? "past" : ""} ${d.loading ? "loading" : ""} ${d.unread ? "unread" : ""}`}
      data-testid="cal-agenda-day"
    >
      <div className="cal-agenda-head">
        <span className="cal-dow">{d.dow}</span>
        <span className="cal-date tabular">{d.date}</span>
        {d.closed.yes && <span className="cal-closed-chip">Closed{d.closed.note ? ` · ${d.closed.note}` : ""}</span>}
      </div>
      {items.length > 0 && (
        <AgendaItems>
          {items.map(([b, allDay]) => (
            <AgendaItem
              key={b.id}
              time={allDay ? "All day" : calendar.clockLabel(b.t)}
              name={b.person ? b.person.name : b.service}
              service={b.person ? b.service : null}
              dur={allDay ? null : calendar.durationLabel(b.dur)}
              onOpen={() => onOpen(b)}
              hint={b.time}
              testid="cal-agenda-item"
            />
          ))}
        </AgendaItems>
      )}
      {d.loading && <span className="ag-none">Reading this day…</span>}
      {d.unread && <span className="ag-none">Couldn't read this day.</span>}
      {!d.loading && !d.unread && !d.closed.yes && feedOk && items.length === 0 && (
        <EmptyState kind="line" title="Nothing on the calendar." />
      )}
      {!d.loading && !d.unread && !d.closed.yes && feedOk && !d.past && (
        <AgendaOpen
          label={`Open${service ? (service.consultFirst ? " for a consultation" : ` for ${service.name}`) : ""}:`}
        >
          {agendaOpenTimes({ d, windows, service, offer })}
        </AgendaOpen>
      )}
    </div>
  );
}

/**
 * The agenda: days as a list, what is taken, then what the receptionist would offer, the way a phone-first owner reads a
 * day.
 *
 * Its rows ARE Today's rows (the kit's agenda): the same time column, the same rail, the person first with the service and
 * the length under them. It drew its own before: a 120px span, the event's whole title, the name again underneath, so the
 * same appointment read one way here and another on Today, and the customer's name appeared twice in both. The day's
 * heading, what a press opens, and the Open line below are still the Calendar's own.
 */
export function CrAgenda({
  frames,
  feedOk,
  fit,
  service,
  offer,
  onOpen,
}: {
  frames: CalendarFrame[];
  feedOk: boolean;
  fit: Fit;
  service: CalendarServiceVM | null;
  offer: CalendarVM["offer"];
  onOpen: (b: CalendarBlockVM) => void;
}) {
  return (
    <div className="cal-agenda" data-testid="cal-agenda">
      {frames.map((d) => agendaDay({ d, feedOk, fit, service, offer, onOpen }))}
    </div>
  );
}
