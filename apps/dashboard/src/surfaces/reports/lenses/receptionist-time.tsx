/**
 * The Receptionist lens's time between steps and what is stuck. How fast it answers is each reply as a dot on the day it was
 * asked, as high as the seconds it went out past the hold the owner set (the plot's line), over the window's own days; under it
 * the spread of every reply. Then the figures of the steps that follow (your first reply after a handover and the time to
 * settle it, the calls nobody took, what came while you were closed) and, apart, what waits on you now. The figures and their
 * words are the lens fold's (contracts `toReceptionistReportVM`, page-only); the plot's words are the frame's (`vm.lines.reply`).
 */
import type { ReportVM } from "@chanlytics/contracts";
import type { ReceptionistReportVM } from "@chanlytics/contracts/report-lens";
import { ChartCard, SegmentBar } from "../../kit/charts/card";
import { DotPlot, type DotRow } from "../../kit/charts/dot";
import { ckSecondsLabel, type ChartConfig } from "../../kit/charts/geometry";
import { EmptyState } from "../../kit/empty/empty";
import { RptStrip } from "../blocks";
import { rptSpread } from "../series";

/** The plot's one series: a reply, named for what its height is. */
const dotConfig = (held: boolean): ChartConfig => ({
  dot: { label: held ? "Past the hold" : "Reply time", color: "var(--chart-1)" },
});

/** Each reply as the plot draws it: the day it was asked, and the seconds it went out past its own hold (from the question where it waited none). */
const replyDots = (vm: ReportVM): DotRow[] => vm.replyTime.dots.map((d) => ({ day: d.day, value: d.past }));

/**
 * The table the card offers beside its plot: a day at a time, how many replies are plotted that day (the plot holds the latest 500
 * of the period, so this is not the day's count) and the slowest; the spread where there are no dots. Where a hold is set the
 * slowest is past the hold, unless it is a reply sent with none, whose whole time it is, and it says so.
 */
function replyTable(vm: ReportVM, dots: DotRow[]) {
  if (!dots.length)
    return { columns: ["Reply time", "Replies"], rows: vm.replyTime.buckets.map((b) => [b.label, b.value]) };
  const hold = vm.replyTime.hold !== null;
  return {
    columns: ["Day", "Replies plotted", hold ? "Slowest, past the hold" : "Slowest reply"],
    rows: vm.answered.points.flatMap((p) => {
      const that = vm.replyTime.dots.filter((d) => d.day === p.day);
      if (!that.length) return [];
      const slowest = that.reduce((a, b) => (b.past > a.past ? b : a));
      const said = ckSecondsLabel(slowest.past);
      return [[p.label, that.length, hold && !slowest.held ? `${said}, no hold` : said]];
    }),
  };
}

/**
 * What the plot says of one dot aloud: its day, and how far past the hold it went; a reply sent with no hold is not past one, so
 * it says how long it took and that it had none. `i` is the dot's place in the plot's dots, which are the view model's, in order.
 */
function dotSaid(vm: ReportVM) {
  const dayOf = new Map(vm.answered.points.map((p) => [p.day, p.label]));
  return (d: DotRow, i: number): string => {
    const day = dayOf.get(d.day) ?? d.day;
    if (vm.replyTime.hold === null) return `${day}: answered in ${ckSecondsLabel(d.value)}`;
    if (vm.replyTime.dots[i]?.held === false) return `${day}: answered in ${ckSecondsLabel(d.value)}, no hold`;
    return d.value === 0 ? `${day}: went out as the hold ended` : `${day}: ${ckSecondsLabel(d.value)} past the hold`;
  };
}

/** The dots over the window's days, with the hold's end as the line they are measured from, and the spread of every reply under them. */
function replyBody(vm: ReportVM, days: number) {
  const hold = vm.replyTime.hold;
  const dots = replyDots(vm);
  return (
    <>
      {dots.length > 0 && (
        <DotPlot
          days={vm.answered.points}
          dots={dots}
          config={dotConfig(hold !== null)}
          reference={hold ? { value: 0, label: `your ${hold.label} hold ends` } : null}
          scale="seconds"
          yFormat={ckSecondsLabel}
          height={176}
          animKey={days}
          ariaLabel={
            hold
              ? "Each reply, on the day it was asked, as high as it went past your hold. The arrow keys read each reply."
              : "Each reply, on the day it was asked, as high as it took to answer. The arrow keys read each reply."
          }
          describe={dotSaid(vm)}
        />
      )}
      <SegmentBar
        title={hold ? "Every reply, against your hold" : "Every reply, by how long it took"}
        testid="reply-spread"
        rows={vm.replyTime.buckets.map((b) => ({ key: b.id, value: b.value }))}
        config={rptSpread(vm.replyTime.buckets)}
      />
    </>
  );
}

/** How fast it answers: every reply of the window, past the hold the owner set. */
export function speedCard(vm: ReportVM, days: number) {
  return (
    <ChartCard
      className="rpt-span-12"
      title="How fast it answers"
      testid="chart-reply"
      takeaway={vm.lines.reply}
      config={dotConfig(vm.replyTime.hold !== null)}
      table={replyTable(vm, replyDots(vm))}
    >
      {vm.replyTime.count ? (
        replyBody(vm, days)
      ) : (
        <EmptyState kind="line" title="No receptionist replies in this period to time." />
      )}
    </ChartCard>
  );
}

/**
 * The steps after the receptionist's reply, as figures: your first reply after a handover and the time to settle it, the calls
 * nobody took, and what came while you were closed (none where the workspace's hours could not be read). Four across, or three.
 */
export function timeFigures(v: ReceptionistReportVM) {
  const tiles = [...v.handover, v.missed, ...(v.closed ? [v.closed] : [])];
  return <RptStrip tiles={tiles} className={tiles.length === 4 ? "quad" : "trio"} testid="receptionist-figures" />;
}

/** What waits on you now, each a door to the page where it is answered. */
export function stuckFigures(v: ReceptionistReportVM) {
  return <RptStrip tiles={v.stuck} className="trio" testid="receptionist-stuck" />;
}
