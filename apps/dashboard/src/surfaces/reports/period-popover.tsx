/**
 * What Reports' date range button opens (period-picker.tsx), loaded on demand: the days the range covers in words and
 * the days every figure is compared with (the same number before them, contracts `before`), the four periods the
 * report reads, a few days reached in one press (yesterday, last week, last month), and a month to
 * pick any days on (the kit's DayRangePicker): two presses, a first day and a last, no more of them than a report reads
 * and none to come. A pick is read at once and the popover stays open on the window picked, so the month shows what was
 * chosen and another pick is one press away; Escape or a press outside closes it, and focus goes back to the button.
 *
 * A period is a name for days that end today, kept in this browser. Any other days are those days: the address says them
 * (period.ts), so they are shared with a link and walked by Back. The four periods' control shows none chosen while the
 * page is on days a member picked.
 */
import {
  REPORT_MOST_DAYS,
  REPORT_RANGES,
  reportRangeKey,
  timezoneCity,
  type ReportPeriodId,
} from "@chanlytics/contracts";
import { reportPickWords, reportShortcuts, type ReportWindowVM } from "@chanlytics/contracts/report-window";
import { Button } from "../kit/button/button";
import { DayRangePicker } from "../kit/datepicker/day-range-picker";
import { Icon } from "../kit/icon/icon";
import { Popover } from "../kit/popover/popover";
import { Segmented } from "../kit/segmented/segmented";
import { periodButton, type PeriodPickerProps } from "./period-picker";

/** What the periods' control holds while the page is on days a member picked: none of the four. */
const NO_PERIOD = "";

export function PeriodPopover({
  today,
  timezone,
  pick,
  win,
  openFirst,
}: PeriodPickerProps & { win: ReportWindowVM; openFirst: boolean }) {
  const chevron = <Icon name="chevron" size={14} />;
  return (
    <Popover label="Date range" align="end" className="rpt-when" defaultOpen={openFirst} trigger={periodButton(win)}>
      <div className="rpt-when-head">
        <p className="rpt-when-range" data-testid="reports-period-range">
          {win.dates}
        </p>
        <p className="rpt-when-said">
          {win.said} · {timezoneCity(timezone)} time
        </p>
        <p className="rpt-when-said" data-testid="reports-period-before">
          Compared with {win.before.dates}
        </p>
      </div>
      {/* The control never holds while a period loads: an arrow key chooses and choosing reads, so a key held on 30 days
          must be able to go on to Month. Each pick is read, the surface drops the answer for a range left, and the latest
          pick wins. */}
      <Segmented<ReportPeriodId | typeof NO_PERIOD>
        label="Period"
        value={win.period ?? NO_PERIOD}
        onValueChange={(next) => (next === NO_PERIOD ? undefined : void pick(next))}
        options={REPORT_RANGES.map((r) => ({ value: r.id, label: r.label, testid: `period-${r.id}` }))}
      />
      {/* Days reached in one press: each is the days it names today, picked as any days are. The one the page is on is
          drawn as chosen, the rest quiet. */}
      <div className="rpt-when-quick" role="group" aria-label="Other days">
        {reportShortcuts(today).map((s) => {
          const on = win.key === reportRangeKey(s.days);
          return (
            <Button
              key={s.id}
              size="sm"
              variant={on ? undefined : "quiet"}
              aria-pressed={on}
              data-testid={`period-${s.id}`}
              onClick={() => void pick(s.days)}
            >
              {s.label}
            </Button>
          );
        })}
      </div>
      <DayRangePicker
        className="rpt-when-month"
        from={win.from}
        to={win.to}
        today={today}
        most={REPORT_MOST_DAYS}
        label="Days"
        hint={({ first, band }) => reportPickWords(first, band)}
        glyphs={{ previous: chevron, next: chevron }}
        onRangeChange={(days) => void pick(days)}
      />
    </Popover>
  );
}
