/** The People lens: where they reach you, and when, and how many are new (moved from sections.tsx). */
import type { ReportVM } from "@chanlytics/contracts";
import { ChartCard, SegmentBar } from "../../kit/charts/card";
import { HeatStrip } from "../../kit/charts/heat";
import { LineChart } from "../../kit/charts/line";
import { PieChart } from "../../kit/charts/pie";
import { RadarChart } from "../../kit/charts/radar";
import { EmptyState } from "../../kit/empty/empty";
import { RptSection } from "../blocks";
import { RPT_CHANNELS, rptPeriods, rptPlural } from "../series";
import { nothingCameIn, type LensProps } from "./shared";

/** Where they reach you: the split by channel, and the same split the period before, in the same colours. */
function channelsCard(vm: ReportVM) {
  const channels = vm.channels || [];
  const reached = channels.reduce((s, c) => s + c.value, 0);
  return (
    <ChartCard
      className="rpt-span-4"
      title="Where they reach you"
      testid="chart-channels"
      takeaway={vm.lines.channels}
      config={RPT_CHANNELS}
      legend={false}
      table={
        channels.length
          ? {
              columns: ["Channel", vm.period.now, vm.period.before],
              rows: channels.map((c) => [c.label, c.value, c.prior]),
            }
          : null
      }
    >
      {reached ? (
        <>
          <PieChart
            data={channels.map((c) => ({ key: c.key, value: c.value }))}
            config={RPT_CHANNELS}
            center={{ value: reached, label: "messages and calls" }}
            size="fill"
            floor={138}
            thickness={16}
            ariaLabel="Messages and calls by channel. The arrow keys read each channel."
          />
          {/* The same split the period before, in the same colours: the donut says where they reach you now,
              this says whether that is a change. Its own counts, which no tile and no legend above give. */}
          <SegmentBar
            title={vm.period.before}
            testid="channels-before"
            small
            rows={channels.map((c) => ({ key: c.key, value: c.prior }))}
            config={RPT_CHANNELS}
          />
        </>
      ) : (
        <EmptyState
          kind="line"
          title={vm.channels ? "Nothing to split by channel in this period." : "Not counted for this period yet."}
        />
      )}
    </ChartCard>
  );
}

/** The table a rhythm card offers: each weekday, then each hour of the day, with the period before beside the weekdays. */
function rhythmTable(vm: ReportVM, weekNames: string[]) {
  const hours = vm.hours;
  return {
    columns: ["When", vm.period.now, vm.period.before],
    rows: [
      ...weekNames.map((d, i) => [d, vm.week.current[i], vm.week.prior ? vm.week.prior[i] : null]),
      ...(hours ? hours.values.map((v, h) => [`${hours.labels[h]} to ${hours.labels[(h + 1) % 24]}`, v, null]) : []),
    ],
  };
}

/** When they reach you: the days of the week round a radar, and the hours of the day as a strip. */
function rhythmCard(vm: ReportVM, days: number) {
  const avg = vm.week.unit === "average";
  const weekNames = avg ? vm.week.long.map((d) => `An average ${d}`) : vm.week.long;
  const rhythm = rptPeriods(vm, "now", !!vm.week.prior);
  return (
    <ChartCard
      className="rpt-span-4"
      title="When they reach you"
      testid="chart-rhythm"
      takeaway={vm.lines.rhythm}
      config={rhythm}
      table={rhythmTable(vm, weekNames)}
    >
      <RadarChart
        axes={vm.week.axes}
        names={weekNames}
        config={rhythm}
        height={190}
        animKey={days}
        series={[
          { key: "now", values: vm.week.current },
          ...(vm.week.prior ? [{ key: "prior", values: vm.week.prior, fill: false }] : []),
        ]}
        ariaLabel={`Messages and calls by day of the week${avg ? ", on an average day" : ""}. The arrow keys read each day.`}
      />
      {vm.hours && (
        <div className="rpt-hours">
          <span className="ck-segbar-title">By hour of the day</span>
          <HeatStrip
            values={vm.hours.values}
            labels={vm.hours.labels}
            unit="messages and calls"
            ariaLabel="Messages and calls by hour of the day. The arrow keys read each hour."
          />
        </div>
      )}
    </ChartCard>
  );
}

/** New people, adding up: the running total over the period, beside the period before's own. */
function peopleCard(vm: ReportVM, days: number) {
  const peopleBefore = vm.people.cumulative.prior;
  const people = rptPeriods(vm, "total", !!peopleBefore);
  const before = vm.period.before.toLowerCase();
  return (
    <ChartCard
      className="rpt-span-4"
      title="New people, adding up"
      testid="chart-people"
      config={people}
      table={{ columns: ["Day", "New people"], rows: vm.people.points.map((p) => [p.label, p.newPeople]) }}
    >
      {vm.people.total ? (
        <LineChart
          data={vm.people.cumulative.points}
          keys={[{ key: "total", fill: true }]}
          prior={peopleBefore}
          config={people}
          height="fill"
          floor={176}
          animKey={days}
          ariaLabel="New people added up over the period, beside the period before. The arrow keys read each day."
          tip={(d, _i, ctx) => ({
            title: d.label,
            rows: [
              { key: "total", label: "so far", value: d.total },
              ...(ctx.prior != null ? [{ key: "prior", label: `by this day, ${before}`, value: ctx.prior }] : []),
            ],
            note: d.newPeople ? `${rptPlural(d.newPeople, "new person", "new people")} that day` : null,
          })}
          describe={(d, _i, ctx) =>
            `${d.label}: ${d.total} so far${ctx.prior != null ? `, ${ctx.prior} by this day ${before}` : ""}`
          }
        />
      ) : (
        <EmptyState kind="line" title="Nobody new wrote or called in this period." />
      )}
    </ChartCard>
  );
}

/** Who they are and where and when they reach you. */
function customersSection(vm: ReportVM, days: number) {
  return (
    <RptSection title="Your customers">
      <div className="rpt-grid">
        {channelsCard(vm)}
        {rhythmCard(vm, days)}
        {peopleCard(vm, days)}
      </div>
    </RptSection>
  );
}

export function PeopleLens({ R, pick }: LensProps) {
  return R.vm.empty ? nothingCameIn(R.vm, R.period, pick) : customersSection(R.vm, R.days);
}
