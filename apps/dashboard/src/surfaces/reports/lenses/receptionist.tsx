/**
 * The Receptionist lens, in the spec's five parts (the lenses spec, D7): the sentence at its head (the frame's, head.ts), the figures
 * against the period before, the mix (who answered, why it stopped, what became of the held replies, what customers asked about, the
 * language it wrote in, the calls and how they ended, asked then booked and the link), the time between steps (how fast it answers
 * past the hold, then the steps after it), and what is stuck now.
 *
 * It draws from two reads that fail alone. The frame's (`reports`) draws who answered, why it stopped, the calls, asked then booked and
 * how fast it answers, and the figures against before; the lens's own (`reports_receptionist`, folded here once by the real
 * `toReceptionistReportVM`) draws the rest. While the own read is out, or is of a period the strip no longer shows, the frame's cards
 * stand and the rest are absent; when it could not be made one failed read stands in their place with its Retry; a database that has
 * no function for it yet draws neither. Why it stopped is not a door: the Inbox takes no reason, and the way there is part five's
 * "Waiting on you".
 */
import { useMemo } from "react";
import { plural, type ReportStripTile, type ReportVM } from "@chanlytics/contracts";
import { toReceptionistReportVM, type ReceptionistReportVM } from "@chanlytics/contracts/report-lens";
import { BarChart, BarList } from "../../kit/charts/bar";
import { ChartCard, SegmentBar } from "../../kit/charts/card";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import type { Follower } from "../../use-surface";
import { RptBooked, RptSection, RptStrip } from "../blocks";
import type { ReceptionistSurface } from "../receptionist-surface";
import { RPT_ANSWERED, RPT_CALLS, rptSpread } from "../series";
import type { ReportsSurface } from "../surface";
import { callEndingsCard, holdCard, languagesCard, linkLine, topicsCard } from "./receptionist-mix";
import { speedCard, stuckFigures, timeFigures } from "./receptionist-time";
import { nothingCameIn, type LensProps } from "./shared";

/** The frame's figures the lens opens on, in the order it reads them: the messages, how many it answered, how fast, and how often it needed you. */
const STRIP_IDS = ["messages", "answered", "reply", "needed"];

const stripTiles = (vm: ReportVM): ReportStripTile[] => STRIP_IDS.flatMap((id) => vm.tiles.filter((t) => t.id === id));

/** Who answered, day by day: the receptionist, you, and nobody, as one stack a day. */
function answeredCard(vm: ReportVM, days: number) {
  const t = vm.answered.totals;
  return (
    <ChartCard
      className="rpt-span-8"
      title="Who answered, day by day"
      testid="chart-answered"
      takeaway={vm.lines.answered}
      config={RPT_ANSWERED}
      legend={t.in ? { values: { ai: t.ai, you: t.you, none: t.none } } : false}
      table={vm.table}
    >
      {t.in ? (
        <BarChart
          data={vm.answered.points}
          keys={["ai", "you", "none"]}
          config={RPT_ANSWERED}
          // The room its row gives it: Why it stopped beside it may stand taller, and a chart of a set height left the
          // card's lower half empty (Ruben's screenshot, 18 Oct 2026).
          height="fill"
          floor={188}
          animKey={days}
          ariaLabel="Customer messages per day, split by who answered. The arrow keys read each day."
          tipNote={(d) => plural(d.in, "customer message")}
          describe={(d) =>
            `${d.label}: ${plural(d.in, "customer message")}, ${d.ai} answered by the receptionist, ${d.you} by you, ${d.none} unanswered`
          }
        />
      ) : (
        <EmptyState
          kind="line"
          title="No customer messages in this period, so the receptionist had nothing to answer by text. Calls are below."
        />
      )}
    </ChartCard>
  );
}

/** Why it stopped: each handover's reason. The Inbox takes no reason, so a row is no door; "Needs you" is the way there. */
function reasonsCard(vm: ReportVM) {
  const t = vm.answered.totals;
  return (
    <ChartCard
      className="rpt-span-4"
      title="Why it stopped"
      testid="chart-reasons"
      takeaway={vm.reasonsShown.line}
      table={{ columns: ["Reason", "Times"], rows: vm.reasons.map((r) => [r.label, r.value]) }}
    >
      {vm.reasons.length ? (
        <BarList rows={vm.reasonsShown.bars.map((r) => ({ id: r.id, label: r.label, value: r.value }))} />
      ) : (
        <EmptyState
          kind="line"
          title={
            t.you === 0 && t.none === 0
              ? "It never stopped in this period: every message was answered without you."
              : "It never stopped in this period, though some messages were answered by you or by nobody (see above)."
          }
        />
      )}
    </ChartCard>
  );
}

/** Calls, a day at a time, and the mood the voice provider read. */
function callsCard(vm: ReportVM, days: number) {
  return (
    <ChartCard
      className="rpt-span-4"
      title="Calls"
      testid="chart-calls"
      takeaway={vm.lines.calls}
      config={RPT_CALLS}
      table={{
        columns: ["Day", "Calls", "Seconds on the phone"],
        rows: vm.calls.points.map((p) => [p.label, p.calls, p.callSeconds]),
      }}
    >
      {vm.calls.total ? (
        <>
          <BarChart
            data={vm.calls.points}
            keys={["calls"]}
            config={RPT_CALLS}
            height="fill"
            floor={128}
            yTicks={2}
            animKey={days}
            ariaLabel="Calls per day. The arrow keys read each day."
            describe={(d) => `${d.label}: ${plural(d.calls, "call")}`}
          />
          <SegmentBar
            title="Caller mood, as the voice provider read it"
            testid="caller-mood"
            small
            rows={vm.calls.sentiments.map((r) => ({ key: r.id, value: r.value }))}
            config={rptSpread(vm.calls.sentiments)}
          />
        </>
      ) : (
        <EmptyState kind="line" title="Nobody phoned in this period." />
      )}
    </ChartCard>
  );
}

/** The fold of the lens's own read, once per read: nothing while the read is out, of a period left, or failed. */
function useOwnFold(own: Follower<ReceptionistSurface>): ReceptionistReportVM | null {
  const read = own.state === "current" ? own.value : undefined;
  const dto = read?.dto;
  const readAt = read?.readAt;
  return useMemo(
    () => (dto !== undefined && readAt !== undefined ? toReceptionistReportVM(dto, { nowMs: readAt }) : null),
    [dto, readAt],
  );
}

/** The lens's own cards of the mix, in their row; the failed read that stands in their place where it could not be made. */
function ownRow(fold: ReceptionistReportVM | null, failed: boolean) {
  if (failed)
    return (
      <div className="rpt-grid">
        <FailedRead
          className="rpt-span-12"
          kind="card"
          what="the receptionist's other numbers"
          surface="reports_receptionist"
          testid="receptionist-failed"
        />
      </div>
    );
  if (!fold) return null;
  // Three across; two only where it wrote in one language, and then they share the row.
  const third = fold.languages !== null;
  return (
    <div className="rpt-grid">
      {holdCard(fold, third ? "rpt-span-4" : "rpt-span-5")}
      {topicsCard(fold, third ? "rpt-span-4" : "rpt-span-7")}
      {languagesCard(fold, "rpt-span-4")}
    </div>
  );
}

/** The receptionist's section: the figures against before, the mix, the time between steps, and what is stuck now. */
function receptionistSection(
  R: ReportsSurface,
  phone: boolean,
  own: Follower<ReceptionistSurface>,
  fold: ReceptionistReportVM | null,
) {
  const { vm, days } = R;
  const more = fold !== null && fold.available ? fold : null;
  return (
    <>
      <RptSection title="The receptionist" bare>
        <RptStrip tiles={stripTiles(vm)} className="quad" testid="receptionist-strip" />
        <div className="rpt-grid">
          {answeredCard(vm, days)}
          {reasonsCard(vm)}
        </div>
        {ownRow(more, own.state === "failed")}
        <div className="rpt-grid">
          {callsCard(vm, days)}
          {more && callEndingsCard(more, "rpt-span-4")}
          <ChartCard className="rpt-span-4" title="Asked, then booked" testid="chart-booking">
            <RptBooked bk={R.booking || null} phone={phone} />
            {linkLine(more)}
          </ChartCard>
        </div>
      </RptSection>
      <RptSection title="Time between steps" bare testid="receptionist-time">
        <div className="rpt-grid">{speedCard(vm, days)}</div>
        {more && timeFigures(more)}
      </RptSection>
      {more && (
        <RptSection title="Stuck now" bare>
          {stuckFigures(more)}
        </RptSection>
      )}
    </>
  );
}

export function ReceptionistLens({
  R,
  pick,
  phone,
  own,
}: LensProps & {
  /** The lens's own read, and where it stands against the period shown. */
  own: Follower<ReceptionistSurface>;
}) {
  const fold = useOwnFold(own);
  return R.vm.empty ? nothingCameIn(R.vm, R.range, pick) : receptionistSection(R, phone, own, fold);
}
