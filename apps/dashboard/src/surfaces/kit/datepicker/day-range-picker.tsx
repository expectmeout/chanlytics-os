/**
 * The kit's month to choose a range of days from (kit.css, "A month to choose a range from"): the days of the range
 * one band across the weeks, its two ends the lozenge a picked tab wears, and every day a button the size of its cell.
 * Two presses choose a range, its first day and its last in whichever order they are pressed, and one day pressed twice
 * is a range of that day; nothing is chosen until the second, so a press on the wrong day costs nothing. While the first
 * is pressed and the last is not, the band follows the pointer or the keys, the days too far to be the other end stand
 * down (`most`), and Escape lets go of the first day rather than closing whatever the month stands in. A day after
 * `today` is never chosen. It took the place of the month that only drew a range (MonthRange, 7 Oct 2026), which
 * pressed nothing.
 *
 * What a press does is range-press.ts's, one rule for every hand (10 Oct 2026): a mouse or a pen acts as it presses, so a
 * pointer that slips before its release still pressed its day and a drag from the first day to the last chooses them;
 * a finger acts as it lifts, unless it travelled, which was a scroll; a day that cannot be chosen says why (`hint`'s
 * `refused`); and a first day pressed before the range changed from beside the month (a shortcut, a period) is let go.
 * A button's own click is read only where no pointer pressed it (`detail` 0: Enter, Space, a screen reader), so a press
 * is never read twice. The grid takes a double tap as two taps, not a zoom (`touch-action`, kit.css).
 *
 * It is the ARIA grid the date picker is (datepicker.tsx): one tab stop, on the range's last day until a key walks it;
 * the arrows walk the days (a week for up and down), Home and End the week, Page Up and Page Down the months (a year
 * with Shift), Enter or Space presses. A day that cannot be chosen keeps its place in the walk and says so
 * (`aria-disabled`), so the keys cross it. The range's two ends are the grid's selected cells, as the date picker's one
 * day is (and wear its lozenge by the same rule); a day between them says it is in the range by its name, and what is
 * chosen so far is said under the grid in the page's words (`hint`), in a status a screen reader hears as it changes.
 *
 * A day is the page's own "YYYY-MM-DD" and the page says which is today, since the kit knows no zone (days.ts holds the
 * arithmetic). The week starts on Monday unless the page says Sunday. The arrows' glyphs are the page's, the Icon's
 * `chevron` at 14px. It stands in the page's own popover or sheet: it opens nothing.
 *
 * It draws what the gallery's Day range picker family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * kit-components.test.mjs holds it to. `className` is for the page's layout, and comes last; the ref reaches its root.
 */
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactElement, ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../button/button";
import { cx } from "../variants";
import {
  dayForKey,
  dayLong,
  dayNumber,
  monthTitle,
  monthWeeks,
  sameMonth,
  shiftMonths,
  weekdayLong,
  weekdayShort,
} from "./days";
import {
  dayIsOpen,
  rangePress,
  restingPress,
  type PressEvent,
  type PressKind,
  type PressRefusal,
  type RangePress,
} from "./range-press";

/** A range of days: its first and its last, "YYYY-MM-DD". */
export type DayRange = { from: string; to: string };

/**
 * What the month says of itself under the grid: the first day pressed where the last is still to be (null: none is),
 * the band drawn, and the last day pressed that could not be chosen, and why (null: none was).
 */
export type DayRangeHint = { first: string | null; band: DayRange; refused: PressRefusal | null };

/** A range of days to choose, on a month: the range chosen, what it says as one is, today, the longest it may be, and its words. */
export type DayRangePickerProps = {
  /** The range chosen: its first day and its last, "YYYY-MM-DD". */
  from: string;
  to: string;
  onRangeChange: (range: DayRange) => void;
  /** Today, "YYYY-MM-DD", in the business's zone: marked in the grid, and the last day that can be chosen. */
  today: string;
  /** The most days a range may hold, its first and its last included. */
  most: number;
  /** The grid's name to a screen reader. */
  label: string;
  /** What is said under the grid of what is chosen so far, in the page's words. */
  hint: (at: DayRangeHint) => ReactNode;
  /** The arrows over the grid: the Icon's `chevron`, at 14px; the previous one is drawn turned round by the kit. */
  glyphs: { previous: ReactElement; next: ReactElement };
  weekStartsOn?: 0 | 1;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

/** Two days in their order. */
const ordered = (a: string, b: string): DayRange => (a <= b ? { from: a, to: b } : { from: b, to: a });

/** What presses: a pointer the browser names, a mouse where it names none. */
const pressKindOf = (pointerType: string): PressKind =>
  pointerType === "touch" || pointerType === "pen" ? pointerType : "mouse";

/** The day a pointer was let go on, in this month's grid; null off it. */
const dayUnder = (grid: HTMLElement | null, target: EventTarget | null): string | null => {
  const cell = (target as Partial<Element> | null)?.closest?.<HTMLElement>("[data-day]") ?? null;
  return cell && grid?.contains(cell) ? (cell.dataset.day ?? null) : null;
};

/** What the band says of a day: in it, its first day or its last, out of the month shown, today. */
const dayMarks = (day: string, p: { band: DayRange; today: string; shown: string }) => ({
  "data-in": day >= p.band.from && day <= p.band.to ? "true" : undefined,
  "data-start": day === p.band.from ? "true" : undefined,
  "data-end": day === p.band.to ? "true" : undefined,
  "data-outside": sameMonth(day, p.shown) ? undefined : "true",
  "data-today": day === p.today ? "true" : undefined,
});

/**
 * The month's presses (range-press.ts) over the range shown: the state, held in a ref too since a pointer's release is
 * heard on the window, between the month's draws; a press of a range no longer shown is drawn, and read, as none.
 */
function useMonthPresses(p: {
  from: string;
  to: string;
  today: string;
  most: number;
  onRangeChange: (r: DayRange) => void;
}) {
  const of = `${p.from}~${p.to}`;
  const rules = { today: p.today, most: p.most };
  const [held, setHeld] = useState<RangePress>(() => restingPress(of));
  const pressRef = useRef(held);
  const gridRef = useRef<HTMLDivElement>(null);
  // The window's ears for a pointer that is down, let go once it is up (or the month is gone).
  const unhear = useRef<(() => void) | null>(null);
  useEffect(() => () => unhear.current?.(), []);

  /** One press event: the state after it is drawn, a range it chose is the page's, and whether it was the month's. */
  const send = (event: PressEvent): boolean => {
    const step = rangePress(pressRef.current, event, rules, of);
    if (step.state !== pressRef.current) {
      pressRef.current = step.state;
      setHeld(step.state);
    }
    if (step.chose) p.onRangeChange(step.chose);
    return step.handled;
  };

  const onDayPointerDown = (day: string) => (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    unhear.current?.();
    send({ type: "down", day, kind: pressKindOf(event.pointerType), x: event.clientX, y: event.clientY });
    const id = event.pointerId;
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId === id) send({ type: "move", x: e.clientX, y: e.clientY });
    };
    const end = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== id) return;
      unhear.current?.();
      if (e.type === "pointercancel") send({ type: "cancel" });
      else send({ type: "up", day: dayUnder(gridRef.current, e.target), x: e.clientX, y: e.clientY });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    unhear.current = () => {
      unhear.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  };
  // A click no pointer made (Enter, Space, a screen reader's) is a key's press; a pointer's was read as it pressed.
  const onDayClick = (day: string) => (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) send({ type: "key", day });
  };
  const press = held.of === of ? held : restingPress(of);
  const open = (day: string): boolean => dayIsOpen(press, day, rules);
  return { press, open, send, gridRef, onDayPointerDown, onDayClick };
}

/** A range of days to choose, on a month. */
export function DayRangePicker({
  from,
  to,
  onRangeChange,
  today,
  most,
  label,
  hint,
  glyphs,
  weekStartsOn = 1,
  className,
  ref,
}: DayRangePickerProps) {
  const { press, open, send, gridRef, onDayPointerDown, onDayClick } = useMonthPresses({
    from,
    to,
    today,
    most,
    onRangeChange,
  });
  // The month a person moved to and the day the keys walked to, for the range they were moved over: a range that
  // moves (a period picked beside the month) opens on its own last month again, its tab stop on its last day.
  const [moved, setMoved] = useState<{ to: string; month: string; stop: string } | null>(null);
  const at = moved && moved.to === to ? moved : { to, month: to, stop: to };
  const { month: shown, stop } = at;
  const stopRef = useRef<HTMLButtonElement>(null);
  const walked = useRef(false);

  // A key moved the tab stop: focus follows it once the grid has drawn the new one.
  useEffect(() => {
    if (!walked.current) return;
    walked.current = false;
    stopRef.current?.focus();
  });

  const first = press.anchor;
  const band = first === null ? { from, to } : ordered(first, press.reach ?? first);

  const walk = (day: string) => {
    walked.current = true;
    setMoved({ to, month: sameMonth(day, shown) ? shown : day, stop: day });
    send({ type: "enter", day });
  };
  const month = (by: number) => setMoved({ to, month: shiftMonths(shown, by), stop: shiftMonths(stop, by) });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Escape lets go of the first day, and only then is whatever the month stands in's to close.
    if (event.key === "Escape") {
      if (send({ type: "escape" })) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const next = dayForKey(event.key, stop, event.shiftKey, weekStartsOn);
    if (next === null) return;
    event.preventDefault();
    walk(next);
  };

  const weeks = monthWeeks(shown, weekStartsOn);
  const heads = weeks[0] ?? [];
  // Nothing after this month can be chosen once it holds today: the arrow that goes there stands down.
  const last = sameMonth(shown, today) || shown > today;
  return (
    <div ref={ref} className={cx("date-pick-month", className)} data-pending={first ? "true" : undefined}>
      <div className="date-pick-head">
        <span className="date-pick-title" aria-live="polite">
          {monthTitle(shown)}
        </span>
        <span className="date-pick-nav">
          <Button variant="quiet" size="sm" iconOnly aria-label="Previous month" onClick={() => month(-1)}>
            <span className="date-pick-back">{glyphs.previous}</span>
          </Button>
          <Button variant="quiet" size="sm" iconOnly aria-label="Next month" disabled={last} onClick={() => month(1)}>
            {glyphs.next}
          </Button>
        </span>
      </div>
      <div
        ref={gridRef}
        role="grid"
        tabIndex={-1}
        aria-label={label}
        aria-multiselectable="true"
        className="date-pick-grid"
        onKeyDown={onKeyDown}
        onPointerLeave={() => send({ type: "leave" })}
      >
        <div role="row" className="date-pick-row">
          {heads.map((day) => (
            <span key={day} role="columnheader" aria-label={weekdayLong(day)} className="date-pick-dow">
              {weekdayShort(day)}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="date-pick-row">
            {week.map((day) => {
              const marks = dayMarks(day, { band, today, shown });
              return (
                <div
                  key={day}
                  role="gridcell"
                  className="date-pick-cell"
                  data-day={day}
                  aria-selected={day === band.from || day === band.to}
                  {...marks}
                >
                  <button
                    ref={day === stop ? stopRef : undefined}
                    type="button"
                    className="date-pick-day"
                    tabIndex={day === stop ? 0 : -1}
                    aria-label={marks["data-in"] ? `${dayLong(day)}, in the range` : dayLong(day)}
                    aria-current={day === today ? "date" : undefined}
                    aria-disabled={open(day) ? undefined : "true"}
                    onPointerDown={onDayPointerDown(day)}
                    onPointerEnter={() => send({ type: "enter", day })}
                    onClick={onDayClick(day)}
                  >
                    <span className="date-pick-num">{dayNumber(day)}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="date-pick-hint" role="status">
        {hint({ first, band, refused: press.refused })}
      </p>
    </div>
  );
}
