/**
 * Reports' period (Ruben, 6 Oct 2026): a round button at the right of the strip of lenses, as the Calendar's options are,
 * which opens the period over the page (period-popover.tsx): the days it covers in words, the four periods to pick from,
 * and the days on a month. On a desk the days stand beside the button too; a phone has room for the button alone, beside
 * the strip. The window is contracts' (`reportWindowOf`), counted from the business's today by the route's own arithmetic.
 *
 * What the button opens is loaded on demand, as a pointer or focus reaches the button, and a press before it has loaded
 * opens it as it lands: Base UI's popover and the month stay off the page's first load, which the bundle budget holds to
 * what a person waits for (tooling/scripts/checks/bundle-budget.mjs).
 */
import { useState } from "react";
import { reportWindowOf, type ReportPeriodId, type ReportWindowVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";

export interface PeriodPickerProps {
  /** The period the control shows: the pick as it is made, until the page's own catches up with it. */
  chosen: ReportPeriodId;
  /** The business's today, "YYYY-MM-DD", and its zone, as the report says them. */
  today: string;
  timezone: string;
  pick: (period: ReportPeriodId) => Promise<void>;
  /** A desk: the days stand beside the button. */
  desk: boolean;
}

/** The round button: drawn by the page before what it opens has loaded, and by what it opens after; one look and one name. */
export function periodButton(win: ReportWindowVM, on: { onClick?: () => void; onWarm?: () => void } = {}) {
  return (
    <Button
      iconOnly
      size="lg"
      className="rpt-when-open"
      aria-label={`Period: ${win.said}, ${win.range}`}
      data-testid="reports-period-open"
      onClick={on.onClick}
      onPointerEnter={on.onWarm}
      onFocus={on.onWarm}
    >
      <Icon name="calendar" size={16} />
    </Button>
  );
}

type PopoverModule = typeof import("./period-popover");
let popoverModule: PopoverModule | null = null;
let popoverLoading: Promise<PopoverModule> | null = null;

/** What the button opens, loaded once for the tab; a test loads it before drawing the page. */
export function loadPeriodPopover(): Promise<PopoverModule> {
  popoverLoading ??= import("./period-popover").then((loaded) => (popoverModule = loaded));
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
      {p.desk ? <span className="rpt-dates">{win.range}</span> : null}
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
