/**
 * What Reports' date range button opens (period-picker.tsx), loaded on demand: the days the range covers in words, the
 * four periods the report reads and the days reached in one press (yesterday, last week, last month), and a month to
 * pick any days on (the kit's DayRangePicker): two presses, a first day and a last, no more of them than a report reads
 * and none to come. The periods and the days reached in one press were drawn two ways, a track and a row of quiet words,
 * and the days every figure is compared with stood under the range (Ruben, 10 Oct 2026: "the presets have different
 * styling ... confusing", and the comparison "is not needed"): two tracks drawn alike now, one under the other, the
 * chosen one raised on whichever holds it, and the comparison is the figures' own to say.
 *
 * A pick is read at once and closes the popover (Ruben, 10 Oct 2026: "Apply and close"), so a pick is never left to look
 * undone, and the button says the days picked. It closes once the pick has landed in sight (`PICK_SETTLES_MS`: the
 * chosen option's lozenge, or the month's band and its two ends), and fades as it goes (the kit's Popover): it closed in
 * the frame of the press, which read as harsh. Escape or a press outside closes it too, and focus goes back to the
 * button. The presets close it on a press, not on an arrow key, so a key held on 30 days still goes on to Month.
 *
 * A period is a name for days that end today, kept in this browser. Any other days are those days: the address says them
 * (period.ts), so they are shared with a link and walked by Back. Neither track shows one chosen while the page is on
 * days a member picked that no shortcut names.
 */
import {
  REPORT_MOST_DAYS,
  REPORT_RANGES,
  reportRangeKey,
  timezoneCity,
  type ReportPeriodId,
  type ReportRange,
} from "@chanlytics/contracts";
import { useEffect, useRef, useState } from "react";
import { reportPickWords, reportShortcuts, type ReportWindowVM } from "@chanlytics/contracts/report-window";
import { DayRangePicker } from "../kit/datepicker/day-range-picker";
import { Icon } from "../kit/icon/icon";
import { Popover } from "../kit/popover/popover";
import { Segmented } from "../kit/segmented/segmented";
import { periodButton, type PeriodPickerProps } from "./period-picker";

/** What a track of presets holds while the page is on none of its own: none of them. */
const NO_PRESET = "";

/** How long a pick stays in sight before the popover goes: the lozenge or the band lands, then it fades. */
const PICK_SETTLES_MS = 180;

export function PeriodPopover({
  today,
  timezone,
  pick,
  win,
  openFirst,
}: PeriodPickerProps & { win: ReportWindowVM; openFirst: boolean }) {
  const chevron = <Icon name="chevron" size={14} />;
  const [open, setOpen] = useState(openFirst);
  // The close a pick asked for, while its pick is still in sight; any opening or closing of its own lets it go.
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold = (next: boolean) => {
    if (settling.current !== null) clearTimeout(settling.current);
    settling.current = null;
    setOpen(next);
  };
  const settle = () => {
    if (settling.current !== null) clearTimeout(settling.current);
    settling.current = setTimeout(() => hold(false), PICK_SETTLES_MS);
  };
  useEffect(
    () => () => {
      if (settling.current !== null) clearTimeout(settling.current);
    },
    [],
  );
  const choose = (days: ReportRange) => {
    void pick(days);
    settle();
  };
  const shortcuts = reportShortcuts(today);
  const shortcutOn = shortcuts.find((s) => win.key === reportRangeKey(s.days))?.id ?? NO_PRESET;
  const onShortcut = (next: string) => {
    const days = shortcuts.find((s) => s.id === next)?.days;
    if (days) void pick(days);
  };
  return (
    <Popover
      label="Date range"
      align="end"
      className="rpt-when"
      open={open}
      onOpenChange={hold}
      trigger={periodButton(win)}
    >
      <div className="rpt-when-head">
        <p className="rpt-when-range" data-testid="reports-period-range">
          {win.dates}
        </p>
        <p className="rpt-when-said">
          {win.said} · {timezoneCity(timezone)} time
        </p>
      </div>
      {/* The presets never hold while a period loads: an arrow key chooses and choosing reads, so a key held on 30 days
          must be able to go on to Month. Each pick is read, the surface drops the answer for a range left, and the latest
          pick wins. A press (a pointer's, Space's) closes the popover once it has landed; an arrow key does not. */}
      <div
        className="rpt-when-periods"
        role="presentation"
        onClick={(e) => (e.target instanceof Element && e.target.closest("button") ? settle() : undefined)}
      >
        <Segmented<ReportPeriodId | typeof NO_PRESET>
          label="Period"
          className="rpt-when-presets"
          value={win.period ?? NO_PRESET}
          onValueChange={(next) => (next === NO_PRESET ? undefined : void pick(next))}
          options={REPORT_RANGES.map((r) => ({ value: r.id, label: r.label, testid: `period-${r.id}` }))}
        />
        <Segmented<string>
          label="Other days"
          className="rpt-when-presets"
          value={shortcutOn}
          onValueChange={onShortcut}
          options={shortcuts.map((s) => ({ value: s.id, label: s.label, testid: `period-${s.id}` }))}
        />
      </div>
      <DayRangePicker
        className="rpt-when-month"
        from={win.from}
        to={win.to}
        today={today}
        most={REPORT_MOST_DAYS}
        label="Days"
        hint={({ first, band, refused }) => reportPickWords(first, band, refused)}
        glyphs={{ previous: chevron, next: chevron }}
        onRangeChange={choose}
      />
    </Popover>
  );
}
