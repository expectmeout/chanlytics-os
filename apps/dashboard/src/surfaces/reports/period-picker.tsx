/**
 * Reports' period (Ruben, 6 Oct 2026): a round button at the right of the strip of lenses, as the Calendar's options are,
 * which opens the period over the page: the days it covers in words, the four periods to pick from, and the days on a month
 * (the kit's MonthRange). A pick is read at once and the popover stays open on the window picked, so the month shows what
 * was chosen; Escape or a press outside closes it, and focus goes back to the button. The window is contracts'
 * (`reportWindowOf`), counted from the business's today by the route's own arithmetic, so the period picked shows before its
 * read lands. On a desk the days stand beside the button too; a phone has room for the button alone, beside the strip.
 *
 * The periods are the four the report reads (contracts REPORT_RANGES): a window of any days would need the report to read
 * one, which it does not.
 */
import { REPORT_RANGES, reportWindowOf, timezoneCity, type ReportPeriodId } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { MonthRange } from "../kit/datepicker/month-range";
import { Icon } from "../kit/icon/icon";
import { Popover } from "../kit/popover/popover";
import { Segmented } from "../kit/segmented/segmented";

interface PeriodPickerProps {
  /** The period the control shows: the pick as it is made, until the page's own catches up with it. */
  chosen: ReportPeriodId;
  /** The business's today, "YYYY-MM-DD", and its zone, as the report says them. */
  today: string;
  timezone: string;
  pick: (period: ReportPeriodId) => Promise<void>;
  /** A desk: the days stand beside the button. */
  desk: boolean;
}

export function PeriodPicker({ chosen, today, timezone, pick, desk }: PeriodPickerProps) {
  const win = reportWindowOf(chosen, today);
  const chevron = <Icon name="chevron" size={14} />;
  return (
    <div className="rpt-period" data-testid="reports-period">
      {desk ? <span className="rpt-dates">{win.range}</span> : null}
      <Popover
        label="Period"
        align="end"
        className="rpt-when"
        trigger={
          <Button
            iconOnly
            size="lg"
            className="rpt-when-open"
            aria-label={`Period: ${win.said}, ${win.range}`}
            data-testid="reports-period-open"
          >
            <Icon name="calendar" size={16} />
          </Button>
        }
      >
        <div className="rpt-when-head">
          <p className="rpt-when-range" data-testid="reports-period-range">
            {win.range}
          </p>
          <p className="rpt-when-said">
            {win.said} · {timezoneCity(timezone)} time
          </p>
        </div>
        {/* The control never holds while a period loads: an arrow key chooses and choosing reads, so a key held on 30 days
            must be able to go on to Month. Each pick is read, the surface drops the answer for a period left, and the latest
            pick wins. */}
        <Segmented
          label="Period"
          value={chosen}
          onValueChange={(next) => void pick(next)}
          options={REPORT_RANGES.map((r) => ({ value: r.id, label: r.label, testid: `period-${r.id}` }))}
        />
        <MonthRange from={win.from} to={win.to} today={today} glyphs={{ previous: chevron, next: chevron }} />
      </Popover>
    </div>
  );
}
