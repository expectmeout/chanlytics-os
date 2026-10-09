/**
 * Reports' date range (Ruben, 6 and 9 Oct 2026): a glass capsule at the right of the strip of lenses, as the Calendar's
 * options are, which opens the range over the page (period-popover.tsx): the days it covers in words, the four periods
 * to pick from, a few days reached in one press, and a month the days are picked on. It says what it is on beside its
 * glyph, "30 days", "Month", "Yesterday" or "Sep 1 – 20" (the bare glyph said nothing of what it held); where the row has
 * no room for the word it is the glyph's circle (reports.css, which measures the row, not the screen). On a desk the half
 * its word leaves out stands beside it, the days of a period or the count of days picked; a phone has no room for that.
 * The window is contracts' (`reportWindowOf`), counted from the business's today by the route's own arithmetic. Days in
 * two months are the widest thing it says ("Aug 25 – Sep 23"): beside a strip on a phone it says them without its
 * glyph, so the dates stay on the page and the strip keeps two of its tabs whole (reports.css, `data-wide`).
 *
 * What the button opens is loaded on demand, as a pointer or focus reaches the button, and a press before it has loaded
 * opens it as it lands: Base UI's popover and the month stay off the page's first load, which the bundle budget holds to
 * what a person waits for (tooling/scripts/checks/bundle-budget.mjs).
 */
import { useState } from "react";
import type { ReportRange } from "@chanlytics/contracts";
import { reportWindowOf, type ReportWindowVM } from "@chanlytics/contracts/report-window";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";

export interface PeriodPickerProps {
  /** The range the control shows: the pick as it is made, until the page's own catches up with it. */
  chosen: ReportRange;
  /** The business's today, "YYYY-MM-DD", and its zone, as the report says them. */
  today: string;
  timezone: string;
  pick: (range: ReportRange) => Promise<void>;
  /** A desk: what the control's word leaves out stands beside the button. */
  desk: boolean;
}

/** Whether the control's word is days in two months, said whole: the widest word it has. */
const saysTwoMonths = (win: ReportWindowVM): boolean =>
  win.short === win.dates && win.from.slice(0, 7) !== win.to.slice(0, 7);

/** The button: drawn by the page before what it opens has loaded, and by what it opens after; one look and one name. */
export function periodButton(win: ReportWindowVM, on: { onClick?: () => void; onWarm?: () => void } = {}) {
  return (
    <Button
      size="lg"
      className="rpt-when-open"
      aria-label={`Date range: ${win.said}, ${win.dates}`}
      data-testid="reports-period-open"
      data-wide={saysTwoMonths(win) ? "" : undefined}
      onClick={on.onClick}
      onPointerEnter={on.onWarm}
      onFocus={on.onWarm}
    >
      <span className="rpt-when-glyph">
        <Icon name="calendar" size={16} />
      </span>
      <span className="rpt-when-word">{win.short}</span>
    </Button>
  );
}

type PopoverModule = typeof import("./period-popover");
let popoverModule: PopoverModule | null = null;
let popoverLoading: Promise<PopoverModule> | null = null;

/** What the button opens, loaded once for the tab; a test loads it before drawing the page. */
export function loadPeriodPopover(): Promise<PopoverModule> {
  // What it reads of the module is named, so the dead-exports check (knip) sees the use.
  popoverLoading ??= import("./period-popover").then(({ PeriodPopover }) => (popoverModule = { PeriodPopover }));
  return popoverLoading;
}

export function PeriodPicker(p: PeriodPickerProps) {
  // A press before what it opens has loaded: drawn open as it lands.
  const [pressed, setPressed] = useState(false);
  const [, landed] = useState(0);
  const win = reportWindowOf(p.chosen, p.today);
  const Opened = popoverModule?.PeriodPopover;
  const warm = () => void loadPeriodPopover();
  return (
    <div className="rpt-period" data-testid="reports-period">
      {p.desk ? <span className="rpt-dates">{win.beside}</span> : null}
      {Opened ? (
        <Opened {...p} win={win} openFirst={pressed} />
      ) : (
        periodButton(win, {
          onWarm: warm,
          onClick: () => {
            setPressed(true);
            void loadPeriodPopover().then(() => landed((n) => n + 1));
          },
        })
      )}
    </div>
  );
}
