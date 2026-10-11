/**
 * The People lens: who reached you, how, and when, and who you can reach. The sentence at its head is the frame's (head.ts), which
 * says the fold's once the lens's own read is held; the figures against the period before are that read's, and the page has three
 * sections: your customers (the figures and the mix, three rows of cards, the window then the book), the time between steps (the
 * steps finished and the email that stopped working), and what is stuck now with where the book stands.
 *
 * It draws from two reads that fail alone. The frame's (`reports`) draws the two cards it kept, New people, adding up and when they
 * reach you; the lens's own (`reports_people`, folded once per read by the real `toPeopleReportVM`) draws the rest: the four figures,
 * how they reached you, how the new ones first came, how the yeses were won and the stops came, the ways the book reaches you by, how
 * fresh it is, the steps done and the email that stopped working, what is stuck now and where the book stands. While the own read is
 * out, or is of a period the strip no longer shows, the frame's cards stand and the rest are absent; when it could not be made one
 * failed read stands in their place with its Retry; a database that has no people_series yet draws no window card, no Time between
 * steps and no failure; a pool that could not be counted draws the window and one failed read where the book stands, and no Stuck
 * now. The lens never says that nothing came in (a period nobody reached you in still has a book, and a head, and its figures at 0):
 * each card says in words why it is empty. Whichever of the reads were made, every row of cards adds up to the grid's twelve columns
 * (the existing `rpt-span-*` classes: a card never stands alone at a third of its row).
 */
import { useMemo } from "react";
import { lensRoute, plural, type ReportVM } from "@chanlytics/contracts";
import {
  FIRST_CAME_NOBODY,
  PEOPLE_RHYTHM_EMPTY,
  PEOPLE_RHYTHM_UNIT,
  toPeopleReportVM,
  type PeopleReportVM,
} from "@chanlytics/contracts/report-lens";
import { ChartCard } from "../../kit/charts/card";
import type { ChartConfig } from "../../kit/charts/geometry";
import { HeatStrip } from "../../kit/charts/heat";
import { LineChart } from "../../kit/charts/line";
import { RadarChart } from "../../kit/charts/radar";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { navigate } from "../../legacy-verbs";
import type { Follower } from "../../use-surface";
import { RptSection, RptStrip } from "../blocks";
import { lensShownHere } from "../chrome";
import type { PeopleSurface } from "../people-surface";
import { rptPeriods } from "../series";
import type { ReportsSurface } from "../surface";
import { bouncedCard, channelsCard, firstCard, stepsCard, stopsCard, wiresCard, yesesCard } from "./people-mix";
import { freshCard, standStrip, stuckStrip } from "./people-now";
import type { LensProps } from "./shared";

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

/** The week round a radar, and the hours of the day under it as a strip, both in the unit contracts name. */
function rhythmCharts(vm: ReportVM, days: number, weekNames: string[], config: ChartConfig) {
  const avg = vm.week.unit === "average";
  return (
    <>
      <RadarChart
        axes={vm.week.axes}
        names={weekNames}
        config={config}
        height={190}
        animKey={days}
        series={[
          { key: "now", values: vm.week.current },
          ...(vm.week.prior ? [{ key: "prior", values: vm.week.prior, fill: false }] : []),
        ]}
        ariaLabel={`By day of the week, in ${PEOPLE_RHYTHM_UNIT}${avg ? ", on an average day" : ""}. The arrow keys read each day.`}
      />
      {vm.hours && (
        <div className="rpt-hours">
          <span className="ck-segbar-title">By hour of the day</span>
          <HeatStrip
            values={vm.hours.values}
            labels={vm.hours.labels}
            unit={PEOPLE_RHYTHM_UNIT}
            ariaLabel={`By hour of the day, in ${PEOPLE_RHYTHM_UNIT}. The arrow keys read each hour.`}
          />
        </div>
      )}
    </>
  );
}

/** When they reach you: the days of the week round a radar, and the hours of the day as a strip; a period nobody wrote or called in says so. */
function rhythmCard(vm: ReportVM, days: number, span: string) {
  const avg = vm.week.unit === "average";
  const weekNames = avg ? vm.week.long.map((d) => `An average ${d}`) : vm.week.long;
  const rhythm = rptPeriods(vm, "now", !!vm.week.prior);
  return (
    <ChartCard
      className={span}
      title="When they reach you"
      testid="chart-rhythm"
      takeaway={vm.lines.rhythm}
      config={vm.empty ? null : rhythm}
      table={vm.empty ? null : rhythmTable(vm, weekNames)}
    >
      {vm.empty ? <EmptyState kind="line" title={PEOPLE_RHYTHM_EMPTY} /> : rhythmCharts(vm, days, weekNames, rhythm)}
    </ChartCard>
  );
}

/** New people, adding up: the running total over the period, beside the period before's own. */
function peopleCard(vm: ReportVM, days: number, span: string) {
  const peopleBefore = vm.people.cumulative.prior;
  const people = rptPeriods(vm, "total", !!peopleBefore);
  const before = vm.period.before.toLowerCase();
  return (
    <ChartCard
      className={span}
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
            note: d.newPeople ? `${plural(d.newPeople, "new person", "new people")} that day` : null,
          })}
          describe={(d, _i, ctx) =>
            `${d.label}: ${d.total} so far${ctx.prior != null ? `, ${ctx.prior} by this day ${before}` : ""}`
          }
        />
      ) : (
        <EmptyState kind="line" title={FIRST_CAME_NOBODY} />
      )}
    </ChartCard>
  );
}

/** The fold of the lens's own read, once per read: of the value held, so a period left still folds (the page dims it, and the head names its comparison); nothing with none. */
export function usePeopleFold(own: Follower<PeopleSurface>): PeopleReportVM | null {
  const dto = own.value?.dto;
  return useMemo(() => (dto === undefined ? null : toPeopleReportVM(dto)), [dto]);
}

/** The one failed read that stands where the book would be drawn, when its pool could not be counted: a row of its own. */
function bookFailed() {
  return (
    <FailedRead
      className="rpt-span-12"
      kind="card"
      what="who you can reach now"
      surface="reports_people"
      testid="people-now-failed"
    />
  );
}

/**
 * The window's cards in three rows of three, then the book's cards where they belong. Every row adds up to the grid's twelve
 * columns: where the pool could not be counted the failed read takes the last row alone, and the rhythm card moves up to
 * fill the second.
 */
function windowRows({ vm, days }: ReportsSurface, v: PeopleReportVM, ads: (() => void) | null) {
  return (
    <>
      <div className="rpt-grid">
        {channelsCard(v, "rpt-span-4")}
        {firstCard(v, "rpt-span-4", ads)}
        {peopleCard(vm, days, "rpt-span-4")}
      </div>
      <div className="rpt-grid">
        {yesesCard(v, "rpt-span-4")}
        {stopsCard(v, "rpt-span-4")}
        {v.nowAvailable ? wiresCard(v, "rpt-span-4") : rhythmCard(vm, days, "rpt-span-4")}
      </div>
      <div className="rpt-grid">
        {v.nowAvailable ? freshCard(v, "rpt-span-8") : bookFailed()}
        {v.nowAvailable && rhythmCard(vm, days, "rpt-span-4")}
      </div>
    </>
  );
}

/**
 * The cards the frame's read draws on its own, filling their one row: where the lens's read is out, of another period or could
 * not be made, and where the database has no people_series yet (then the book's cards follow, and fill theirs).
 */
function keptRow({ vm, days }: ReportsSurface) {
  return (
    <div className="rpt-grid">
      {peopleCard(vm, days, "rpt-span-8")}
      {rhythmCard(vm, days, "rpt-span-4")}
    </div>
  );
}

/** The book's cards without the window's: the ways they reach you beside how fresh it is, or the one failed read. */
function bookRow(v: PeopleReportVM) {
  return (
    <div className="rpt-grid">
      {v.nowAvailable ? wiresCard(v, "rpt-span-4") : bookFailed()}
      {v.nowAvailable && freshCard(v, "rpt-span-8")}
    </div>
  );
}

/** The lens's own read held and current: the strip and the window's cards with the book's, or the kept cards and the book's where no window was read. */
function mixRows(R: ReportsSurface, v: PeopleReportVM, ads: (() => void) | null) {
  if (v.windowAvailable)
    return (
      <>
        <RptStrip tiles={v.strip} className="quad" testid="people-strip" />
        {windowRows(R, v, ads)}
      </>
    );
  return (
    <>
      {keptRow(R)}
      {bookRow(v)}
    </>
  );
}

/** The time between steps: the steps the team finished and the email that stopped working, both the window's. */
function timeSection(v: PeopleReportVM) {
  return (
    <RptSection title="Time between steps" bare testid="people-time">
      <div className="rpt-grid">
        {stepsCard(v, "rpt-span-5")}
        {bouncedCard(v, "rpt-span-7")}
      </div>
    </RptSection>
  );
}

/** What is stuck now and where the book stands: both the book's, as of now, whatever period is picked. */
function stuckSection(v: PeopleReportVM) {
  return (
    <RptSection title="Stuck now" bare>
      {stuckStrip(v)}
      {standStrip(v)}
    </RptSection>
  );
}

/**
 * The door from "An ad" to Reports › Ads, over the days this lens shows: the days the address says, else the period kept, which
 * Ads opens on too. Only where the Ads lens is shown to this workspace; none otherwise.
 */
function adsDoor({ range }: ReportsSurface): (() => void) | null {
  return lensShownHere("ads") === true
    ? () => navigate(lensRoute("ads", typeof range === "string" ? null : range))
    : null;
}

export function PeopleLens({
  R,
  own,
  fold,
}: LensProps & {
  /** The lens's own read, and where it stands against the period shown. */
  own: Follower<PeopleSurface>;
  /** Its fold (usePeopleFold): of the value held, drawn only while that is of the period shown. */
  fold: PeopleReportVM | null;
}) {
  const shown = own.state === "current" ? fold : null;
  return (
    <>
      <RptSection title="Your customers" bare>
        {own.state === "failed" && (
          <div className="rpt-grid">
            <FailedRead
              className="rpt-span-12"
              kind="card"
              what="who reached you and who you can reach"
              surface="reports_people"
              testid="people-failed"
            />
          </div>
        )}
        {shown ? mixRows(R, shown, adsDoor(R)) : keptRow(R)}
      </RptSection>
      {shown?.windowAvailable ? timeSection(shown) : null}
      {shown?.nowAvailable ? stuckSection(shown) : null}
    </>
  );
}
