/**
 * The kit's month of a range (kit.css, "A month of a range"): the days a period covers, drawn on a month as one band from its
 * first day to its last, under the month's title and the two arrows that move the month shown. It chooses nothing: the range
 * is the page's (a report's window), and so are the words that name it, said beside it, so the grid is hidden from a screen
 * reader, which reads those words instead. It opens on the month the range ends in, and again whenever the range moves.
 *
 * A day is the page's own "YYYY-MM-DD", and the page says which is today, since the kit knows no zone (days.ts holds the
 * arithmetic, as for the DatePicker beside it). The week starts on Monday unless the page says Sunday. The arrows' glyphs are
 * the page's, the Icon's `chevron` at 14px, as every kit component takes its glyphs.
 *
 * It draws what the gallery's Month range family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * kit-components.test.mjs holds it to. `className` is for the page's layout, and comes last; the ref reaches its root.
 */
import type { ReactElement, Ref } from "react";
import { useState } from "react";
import { Button } from "../button/button";
import { cx } from "../variants";
import { dayNumber, monthTitle, monthWeeks, sameMonth, shiftMonths, weekdayShort } from "./days";

/** A month of a range: its first and last days, today, the arrows' glyphs, and the day the week begins on. */
export type MonthRangeProps = {
  /** The range's first day and its last, "YYYY-MM-DD". */
  from: string;
  to: string;
  /** Today, "YYYY-MM-DD", in the business's zone: marked in the grid. */
  today: string;
  /** The arrows over the grid: the Icon's `chevron`, at 14px; the previous one is drawn turned round by the kit. */
  glyphs: { previous: ReactElement; next: ReactElement };
  weekStartsOn?: 0 | 1;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

/** What the band says of a day: in the range, its first day or its last, out of the month shown, today. */
const dayMarks = (day: string, p: { from: string; to: string; today: string; shown: string }) => ({
  "data-in": day >= p.from && day <= p.to ? "true" : undefined,
  "data-start": day === p.from ? "true" : undefined,
  "data-end": day === p.to ? "true" : undefined,
  "data-outside": sameMonth(day, p.shown) ? undefined : "true",
  "data-today": day === p.today ? "true" : undefined,
});

/** The days of a range, on a month. */
export function MonthRange({ from, to, today, glyphs, weekStartsOn = 1, className, ref }: MonthRangeProps) {
  // The month a person moved to, for the range it was moved over: a range that moves opens on its own last month again.
  const [moved, setMoved] = useState<{ to: string; month: string } | null>(null);
  const shown = moved && moved.to === to ? moved.month : to;
  const move = (by: number) => setMoved({ to, month: shiftMonths(shown, by) });
  const weeks = monthWeeks(shown, weekStartsOn);
  const heads = weeks[0] ?? [];
  return (
    <div ref={ref} className={cx("date-pick-month", className)}>
      <div className="date-pick-head">
        <span className="date-pick-title" aria-live="polite">
          {monthTitle(shown)}
        </span>
        <span className="date-pick-nav">
          <Button variant="quiet" size="sm" iconOnly aria-label="Previous month" onClick={() => move(-1)}>
            <span className="date-pick-back">{glyphs.previous}</span>
          </Button>
          <Button variant="quiet" size="sm" iconOnly aria-label="Next month" onClick={() => move(1)}>
            {glyphs.next}
          </Button>
        </span>
      </div>
      <div className="date-pick-grid" aria-hidden="true">
        <div className="date-pick-row">
          {heads.map((day) => (
            <span key={day} className="date-pick-dow">
              {weekdayShort(day)}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="date-pick-row">
            {week.map((day) => (
              <span key={day} className="date-pick-cell" {...dayMarks(day, { from, to, today, shown })}>
                <span className="date-pick-num">{dayNumber(day)}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
