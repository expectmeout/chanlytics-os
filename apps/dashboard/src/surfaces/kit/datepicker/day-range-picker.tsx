/**
 * The kit's month to choose a range of days from (kit.css, "A month to choose a range from"): the days of the range
 * one band across the weeks, its two ends the lozenge a picked tab wears, and every day a button. Two presses choose a
 * range, its first day and its last in whichever order they are pressed, and one day pressed twice is a range of that
 * day; nothing is chosen until the second, so a press on the wrong day costs nothing. While the first is pressed and
 * the last is not, the band follows the pointer or the keys, the days too far to be the other end stand down (`most`),
 * and Escape lets go of the first day rather than closing whatever the month stands in. A day after `today` is never
 * chosen. It took the place of the month that only drew a range (MonthRange, 7 Oct 2026), which pressed nothing.
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
import type { KeyboardEvent, ReactElement, ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../button/button";
import { cx } from "../variants";
import {
  dayForKey,
  dayLong,
  dayNumber,
  daysApart,
  monthTitle,
  monthWeeks,
  sameMonth,
  shiftMonths,
  weekdayLong,
  weekdayShort,
} from "./days";

/** A range of days: its first and its last, "YYYY-MM-DD". */
export type DayRange = { from: string; to: string };

/** What the month says of itself under the grid: the first day pressed where the last is still to be (null: none is), and the band drawn. */
export type DayRangeHint = { first: string | null; band: DayRange };

/** A month to choose a range from: the range chosen, what it says as one is, today, the longest it may be, and its words. */
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

/** What the band says of a day: in it, its first day or its last, out of the month shown, today. */
const dayMarks = (day: string, p: { band: DayRange; today: string; shown: string }) => ({
  "data-in": day >= p.band.from && day <= p.band.to ? "true" : undefined,
  "data-start": day === p.band.from ? "true" : undefined,
  "data-end": day === p.band.to ? "true" : undefined,
  "data-outside": sameMonth(day, p.shown) ? undefined : "true",
  "data-today": day === p.today ? "true" : undefined,
});

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
  // The first day pressed, while the last is still to be: nothing is chosen until both are.
  const [first, setFirst] = useState<string | null>(null);
  // Where the pointer or the keys are while the last day is still to be: the band is drawn to it.
  const [reach, setReach] = useState<string | null>(null);
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

  /** Whether a day can be pressed: not one to come, and, with the first day pressed, not too far to be the other end. */
  const open = (day: string): boolean => day <= today && (first === null || daysApart(first, day) < most);
  const band = first === null ? { from, to } : ordered(first, reach ?? first);

  const press = (day: string) => {
    if (!open(day)) return;
    if (first === null) {
      setFirst(day);
      setReach(day);
      return;
    }
    setFirst(null);
    setReach(null);
    onRangeChange(ordered(first, day));
  };
  const walk = (day: string) => {
    walked.current = true;
    setMoved({ to, month: sameMonth(day, shown) ? shown : day, stop: day });
    if (first !== null) setReach(day);
  };
  const month = (by: number) => setMoved({ to, month: shiftMonths(shown, by), stop: shiftMonths(stop, by) });
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Escape lets go of the first day, and only then is whatever the month stands in's to close.
    if (event.key === "Escape" && first !== null) {
      event.preventDefault();
      event.stopPropagation();
      setFirst(null);
      setReach(null);
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
        role="grid"
        tabIndex={-1}
        aria-label={label}
        aria-multiselectable="true"
        className="date-pick-grid"
        onKeyDown={onKeyDown}
        onPointerLeave={() => (first === null ? undefined : setReach(first))}
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
                    onClick={() => press(day)}
                    onPointerEnter={() => (first !== null && open(day) ? setReach(day) : undefined)}
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
        {hint({ first, band })}
      </p>
    </div>
  );
}
