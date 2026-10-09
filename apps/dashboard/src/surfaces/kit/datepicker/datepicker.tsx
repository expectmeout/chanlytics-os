/**
 * The kit's date picker (kit.css, "A date picker"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and
 * step 2.5): one day of a calendar, chosen from a month that pops over the page from a control of the page's. The
 * browser's own `<input type="date">` drew its picker in the system's colours, in the system's type, whatever the
 * look, so the Calendar's "go to a date" was the one control on the page that looked from somewhere else.
 *
 * It stands on Base UI's Popover (`@base-ui/react/popover`, the plan's decision 15): its control opens and closes it,
 * Escape and a press outside close it and focus goes back to the control, and it is a dialog named by `label` that the
 * page behind stays open beside. Base UI has no calendar, so the grid is the kit's, after the ARIA grid pattern: one
 * tab stop, on the day that is chosen; the arrows walk the days (a week for up and down), Home and End the week, Page
 * Up and Page Down the months (a year with Shift), and Enter or Space chooses and closes it. A press on a day does the
 * same. The month shown is its own state, moved by the two arrows over it or by the keys; the chosen day is the page's.
 *
 * A day is the page's own "YYYY-MM-DD" and the page says which is today, since the kit knows no zone (days.ts holds the
 * arithmetic). The week starts on Monday unless the page says Sunday. The arrows' glyphs are the page's, the Icon's
 * `chevron` at 14px, as every kit component takes its glyphs.
 *
 * It draws what the gallery's Date picker family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the ref
 * reaches the popup.
 */
import { Popover as BasePopover } from "@base-ui/react/popover";
import type { KeyboardEvent, ReactElement, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../button/button";
import { Panel } from "../panel/panel";
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

/** The room between the control and the picker. */
const POP_GAP_PX = 8;

/** A date picker: the day chosen, what it says as one is, today, its control, its name, and the arrows' glyphs. */
export type DatePickerProps = {
  /** The day chosen, "YYYY-MM-DD". */
  value: string;
  onValueChange: (day: string) => void;
  /** Today, "YYYY-MM-DD", in the business's zone: marked in the grid, and where Today goes. */
  today: string;
  /** The page's control that opens it: the kit's Button, which it is drawn as. */
  trigger: ReactElement;
  /** Its name to a screen reader. */
  label: string;
  /** The arrows over the grid: the Icon's `chevron`, at 14px; the previous one is drawn turned round by the kit. */
  glyphs: { previous: ReactElement; next: ReactElement };
  weekStartsOn?: 0 | 1;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

/** A day to choose, from a month over the page. */
export function DatePicker({
  value,
  onValueChange,
  today,
  trigger,
  label,
  glyphs,
  weekStartsOn = 1,
  className,
  ref,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // The month shown (any day of it) and the day that holds the tab stop; both begin at the chosen day each time it opens.
  const [shown, setShown] = useState(value);
  const [stop, setStop] = useState(value);
  const stopRef = useRef<HTMLButtonElement>(null);
  const walked = useRef(false);

  // A key moved the tab stop: focus follows it once the grid has drawn the new one.
  useEffect(() => {
    if (!walked.current) return;
    walked.current = false;
    stopRef.current?.focus();
  });

  const toggle = (next: boolean) => {
    if (next) {
      setShown(value);
      setStop(value);
    }
    setOpen(next);
  };
  const choose = (day: string) => {
    onValueChange(day);
    setOpen(false);
  };
  const walk = (day: string) => {
    walked.current = true;
    setStop(day);
    if (!sameMonth(day, shown)) setShown(day);
  };
  const month = (by: number) => {
    setShown(shiftMonths(shown, by));
    setStop(shiftMonths(stop, by));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const to = dayForKey(event.key, stop, event.shiftKey, weekStartsOn);
    if (to === null) return;
    event.preventDefault();
    walk(to);
  };

  const weeks = monthWeeks(shown, weekStartsOn);
  const heads = weeks[0] ?? [];
  return (
    <BasePopover.Root open={open} onOpenChange={toggle}>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner className="pop-place" side="bottom" align="start" sideOffset={POP_GAP_PX}>
          <BasePopover.Popup
            ref={ref}
            aria-label={label}
            initialFocus={stopRef}
            className={cx("date-pick", className)}
            render={<Panel variant="pop" size="sm" />}
          >
            <div className="date-pick-head">
              <span className="date-pick-title" aria-live="polite">
                {monthTitle(shown)}
              </span>
              <span className="date-pick-nav">
                <Button variant="quiet" size="sm" iconOnly aria-label="Previous month" onClick={() => month(-1)}>
                  <span className="date-pick-back">{glyphs.previous}</span>
                </Button>
                <Button variant="quiet" size="sm" iconOnly aria-label="Next month" onClick={() => month(1)}>
                  {glyphs.next}
                </Button>
              </span>
            </div>
            <div
              role="grid"
              tabIndex={-1}
              aria-label={monthTitle(shown)}
              className="date-pick-grid"
              onKeyDown={onKeyDown}
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
                  {week.map((day) => (
                    <div key={day} role="gridcell" aria-selected={day === value}>
                      <button
                        ref={day === stop ? stopRef : undefined}
                        type="button"
                        className="date-pick-day"
                        tabIndex={day === stop ? 0 : -1}
                        aria-label={dayLong(day)}
                        aria-current={day === today ? "date" : undefined}
                        data-outside={sameMonth(day, shown) ? undefined : "true"}
                        onClick={() => choose(day)}
                      >
                        <span className="date-pick-num">{dayNumber(day)}</span>
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="date-pick-foot">
              <Button variant="quiet" size="sm" onClick={() => choose(today)}>
                Today
              </Button>
            </div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
