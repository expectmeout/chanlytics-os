/** The Receptionist lens: who answered, how fast, why it stopped, the calls, and who booked (moved from sections.tsx). */
import type { ReportVM } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { BarChart, BarList } from "../../kit/charts/bar";
import { ChartCard, SegmentBar } from "../../kit/charts/card";
import { ckSecondsLabel } from "../../kit/charts/geometry";
import { LineChart } from "../../kit/charts/line";
import { EmptyState } from "../../kit/empty/empty";
import { RptBooked, RptSection } from "../blocks";
import { RPT_ANSWERED, RPT_CALLS, RPT_REPLY, rptMood, rptPlural, rptSpread } from "../series";
import type { ReportsSurface } from "../surface";
import type { LensProps } from "./shared";

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
          height={188}
          animKey={days}
          ariaLabel="Customer messages per day, split by who answered. The arrow keys read each day."
          tipNote={(d) => rptPlural(d.in, "customer message")}
          describe={(d) =>
            `${d.label}: ${rptPlural(d.in, "customer message")}, ${d.ai} answered by the receptionist, ${d.you} by you, ${d.none} unanswered`
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

/** The reply-time table a card offers beside its chart: a day (or week) at a time where the payload has speed, else the spread. */
function replyTable(vm: ReportVM) {
  const speed = vm.speed;
  return speed
    ? {
        columns: [speed.unit === "week" ? "Week of" : "Day", "Median reply", "Slowest tenth", "Replies"],
        rows: speed.points.map((p) => [
          p.label,
          p.p50 == null ? null : p.p50Label,
          p.p90 == null ? null : p.p90Label,
          p.count,
        ]),
      }
    : { columns: ["Reply time", "Replies"], rows: vm.replyTime.buckets.map((b) => [b.label, b.value]) };
}

/** The median reply a day (or week) at a time, with the owner's hold drawn where replies waited one, over every reply. */
function replyBody(vm: ReportVM, days: number) {
  const speed = vm.speed;
  const hold = vm.replyTime.hold;
  return (
    <>
      {speed && (
        <LineChart
          data={speed.points}
          keys={[{ key: "p50" }]}
          config={RPT_REPLY}
          scale="seconds"
          yFormat={ckSecondsLabel}
          reference={hold ? { value: hold.seconds, label: `${hold.label} hold` } : null}
          height={122}
          animKey={days}
          ariaLabel={`The receptionist's median reply, a ${speed.unit} at a time. The arrow keys read each ${speed.unit}.`}
          tip={(d) => ({
            title: speed.unit === "week" ? `Week of ${d.label}` : d.label,
            rows:
              d.p50 == null
                ? []
                : [
                    { key: "p50", label: "median reply", value: d.p50Label },
                    { key: "p90", color: "var(--chart-prior)", label: "slowest tenth", value: d.p90Label },
                  ],
            note: d.p50 == null ? "No replies" : rptPlural(d.count, "reply", "replies"),
          })}
          describe={(d) =>
            d.p50 == null
              ? `${d.label}: no replies`
              : `${d.label}: median reply ${d.p50Label}, slowest tenth ${d.p90Label}`
          }
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

/** How fast it answers. */
function replyCard(vm: ReportVM, days: number) {
  return (
    <ChartCard
      className="rpt-span-4"
      title="How fast it answers"
      testid="chart-reply"
      takeaway={vm.lines.reply}
      config={RPT_REPLY}
      table={replyTable(vm)}
    >
      {vm.replyTime.count ? (
        replyBody(vm, days)
      ) : (
        <EmptyState kind="line" title="No receptionist replies in this period to time." />
      )}
    </ChartCard>
  );
}

/** Why it stopped: each handover's reason, a row a door to the Inbox. */
function reasonsCard(vm: ReportVM) {
  const t = vm.answered.totals;
  return (
    <ChartCard
      className="rpt-span-4"
      title="Why it stopped"
      testid="chart-reasons"
      table={{ columns: ["Reason", "Times"], rows: vm.reasons.map((r) => [r.label, r.value]) }}
    >
      {vm.reasons.length ? (
        <BarList
          rows={vm.reasons.map((r) => ({ id: r.id, label: r.label, value: r.value }))}
          onPick={() => navigate("inbox")}
        />
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
            describe={(d) => `${d.label}: ${rptPlural(d.calls, "call")}`}
          />
          <SegmentBar
            title="Caller mood, as the voice provider read it"
            testid="caller-mood"
            small
            rows={vm.calls.sentiments.map((r) => ({ key: r.id, value: r.value }))}
            config={rptMood(vm.calls.sentiments)}
          />
        </>
      ) : (
        <EmptyState kind="line" title="Nobody phoned in this period." />
      )}
    </ChartCard>
  );
}

/** The receptionist's section: who answered, how fast, why it stopped, the calls, and who booked. */
function receptionistSection(R: ReportsSurface, phone: boolean) {
  const { vm, days } = R;
  return (
    <RptSection title="The receptionist">
      <div className="rpt-grid">
        {answeredCard(vm, days)}
        {replyCard(vm, days)}
      </div>
      <div className="rpt-grid">
        {reasonsCard(vm)}
        {callsCard(vm, days)}
        <ChartCard className="rpt-span-4" title="Asked, then booked" testid="chart-booking">
          <RptBooked bk={R.booking || null} phone={phone} />
        </ChartCard>
      </div>
    </RptSection>
  );
}

export function ReceptionistLens({ R, phone }: LensProps) {
  return R.vm.empty ? null : receptionistSection(R, phone);
}
