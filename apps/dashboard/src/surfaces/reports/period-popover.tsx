/**
 * What Reports' period button opens (period-picker.tsx), loaded on demand: the days the period covers in words, the four
 * periods the report reads, and the window drawn on a month (the kit's MonthRange). A pick is read at once and the popover
 * stays open on the window picked, so the month shows what was chosen; Escape or a press outside closes it, and focus goes
 * back to the button.
 *
 * The periods are the four the report reads (contracts REPORT_RANGES): a window of any days would need the report to read
 * one, which it does not.
 */
import { REPORT_RANGES, timezoneCity, type ReportWindowVM } from "@chanlytics/contracts";
import { MonthRange } from "../kit/datepicker/month-range";
import { Icon } from "../kit/icon/icon";
import { Popover } from "../kit/popover/popover";
import { Segmented } from "../kit/segmented/segmented";
import { periodButton, type PeriodPickerProps } from "./period-picker";

export function PeriodPopover({
  chosen,
  today,
  timezone,
  pick,
  win,
  openFirst,
}: PeriodPickerProps & { win: ReportWindowVM; openFirst: boolean }) {
  const chevron = <Icon name="chevron" size={14} />;
  return (
    <Popover label="Period" align="end" className="rpt-when" defaultOpen={openFirst} trigger={periodButton(win)}>
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
  );
}
