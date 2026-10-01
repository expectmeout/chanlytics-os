/**
 * Everything under the period row of the Reports page (moved from legacy/pages/reports-sections.jsx, decision 0015).
 * The page answers an owner's questions in order: is the receptionist handling my customers (the hero, Worth knowing,
 * the tiles, "The receptionist"), who are they and where and when do they reach me ("Your customers"), and what did
 * the campaigns send ("Campaigns"). It draws the contracts view models the bridge publishes with the chart kit. Every
 * sentence beside a number is the view model's (vm.lines, cm.lines, the booking's words, the facts): this file says
 * each number once and composes no claim about the numbers of its own.
 *
 * Each card is a function that returns its element, called by the section that holds it and not drawn as a component
 * of its own, so the page's tree is the tree it was.
 */
import type { CampaignReportVM, DealReportVM, ReportVM } from "@chanlytics/contracts";
import { navigate } from "../legacy-verbs";
import { EmptyState, FailedRead } from "../kit/empty/empty";
import { BarChart, BarList } from "../kit/charts/bar";
import { ChartCard, SegmentBar } from "../kit/charts/card";
import { ckSecondsLabel } from "../kit/charts/geometry";
import { HeatStrip } from "../kit/charts/heat";
import { LineChart } from "../kit/charts/line";
import { PieChart } from "../kit/charts/pie";
import { RadarChart } from "../kit/charts/radar";
import { RptBooked, RptFacts, RptHero, RptSection, RptSources, RptTiles, useRptPhone } from "./blocks";
import {
  RPT_ANSWERED,
  RPT_CALLS,
  RPT_CHANNELS,
  RPT_REPLY,
  RPT_SENT,
  rptMood,
  rptPeriods,
  rptPlural,
  rptSpread,
} from "./series";
import type { ReportsSurface } from "./surface";

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

/** The median reply a day (or week) at a time, against the promised minute, over the spread of every reply. */
function replyBody(vm: ReportVM, days: number) {
  const speed = vm.speed;
  return (
    <>
      {speed && (
        <LineChart
          data={speed.points}
          keys={[{ key: "p50" }]}
          config={RPT_REPLY}
          scale="seconds"
          yFormat={ckSecondsLabel}
          reference={{ value: 60, label: "1 min" }}
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
        title="Every reply, by how long it took"
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

// Deals (0004, 0008): one cohort, the proposals of the period, and beside it the stock. The headline says how many
// went out; the card draws what became of them in the kit's bars, each outcome's count and its share of the cohort,
// said there and nowhere else (a sentence of the same counts would say each twice); the lines beside it say what the
// bars cannot -- how long a yes took, where the new clients came from, why people passed, what is still open -- each
// only when it has something; the clients now close the section under the one hairline. Every word is contracts'
// DealReportVM. Drawn wherever deals are on and a deal was ever recorded, whatever came in this period: an engagement
// is agreed in a call or a meeting as often as in a message, so a quiet month for the receptionist is not a month
// without clients.
function dealsSection(deals: DealReportVM | null | undefined) {
  const dl = deals && deals.present ? deals : null;
  if (!dl) return null;
  const dealLines = dl.lines.length ? (
    <ul className={`rpt-deals-lines${dl.outcomes ? " rpt-span-7" : ""}`} data-testid="rpt-deals-lines">
      {dl.lines.map((l) => (
        <li key={l.id} data-line={l.id}>
          {l.text}
        </li>
      ))}
    </ul>
  ) : null;
  return (
    <RptSection title="Deals" testid="rpt-deals">
      <div className="rpt-deals">
        <p className="rpt-deals-headline" data-testid="rpt-deals-headline">
          {dl.headline}
        </p>
        {dl.outcomes ? (
          <div className="rpt-grid">
            <ChartCard className="rpt-span-5" title={dl.outcomes.title} testid="rpt-deals-outcomes">
              <BarList max={dl.outcomes.max} rows={dl.outcomes.rows} />
            </ChartCard>
            {dealLines}
          </div>
        ) : (
          dealLines
        )}
        <p className="rpt-booked-rest" data-testid="rpt-deals-stock">
          {dl.stock}
        </p>
      </div>
    </RptSection>
  );
}

/** From sent to replied: the campaigns' funnel, each step a share of what went out. */
function funnelCard(cm: CampaignReportVM) {
  const sentPct = (n: number) => (cm.totals.sent ? Math.round((n / cm.totals.sent) * 100) : 0);
  return (
    <ChartCard className="rpt-span-5" title="From sent to replied" testid="chart-funnel" takeaway={cm.lines.funnel}>
      {cm.totals.sent ? (
        <BarList
          max={cm.totals.sent}
          rows={[
            { id: "sent", label: "Sent", value: cm.totals.sent, color: "var(--chart-ramp-5)" },
            {
              id: "delivered",
              label: "Delivered",
              value: cm.totals.delivered,
              display: `${cm.totals.delivered}  ${sentPct(cm.totals.delivered)}%`,
              color: "var(--chart-ramp-4)",
            },
            {
              id: "replied",
              label: "Wrote back",
              value: cm.totals.replied,
              display: `${cm.totals.replied}  ${sentPct(cm.totals.replied)}%`,
              color: "var(--chart-ramp-3)",
            },
          ]}
        />
      ) : (
        <EmptyState kind="line" title="No message went out in this period." />
      )}
    </ChartCard>
  );
}

/** Sent, day by day. */
function sentCard(cm: CampaignReportVM, days: number) {
  return (
    <ChartCard
      className="rpt-span-7"
      title="Sent, day by day"
      testid="chart-campaigns"
      takeaway={cm.lines.sent}
      config={RPT_SENT}
      table={cm.table}
    >
      {cm.totals.sent ? (
        <BarChart
          data={cm.points}
          keys={["sent"]}
          config={RPT_SENT}
          height={150}
          yTicks={2}
          animKey={days}
          ariaLabel="Campaign messages sent per day. The arrow keys read each day."
          tipNote={(d) => (d.replied ? `${d.replied} wrote back` : null)}
          describe={(d) => `${d.label}: ${d.sent} sent`}
        />
      ) : (
        <EmptyState kind="line" title="No message went out in this period; the yeses and stops are the people's own." />
      )}
    </ChartCard>
  );
}

/** What the broadcasts and playbooks sent: its cards, or why there are none (a failed read, or nothing sent). */
function campaignsBody(vm: ReportVM, cm: CampaignReportVM | null, days: number) {
  if (!cm)
    return (
      <FailedRead
        kind="card"
        what="the campaign numbers"
        body="The receptionist's own numbers above are current."
        surface="reports"
        testid="chart-campaigns"
      />
    );
  if (cm.empty)
    return (
      <EmptyState
        kind="card"
        glyph="wave"
        title="Nothing went out"
        testid="chart-campaigns"
        body={`No broadcast or playbook run reached anyone between ${vm.since} and ${vm.until}, and nobody said yes or asked to stop.`}
        action={{ label: "Open Broadcasts", to: "broadcasts" }}
      />
    );
  return (
    <div className="rpt-grid">
      {funnelCard(cm)}
      {sentCard(cm, days)}
      <ChartCard
        className="rpt-span-12"
        title="By playbook and broadcast"
        testid="chart-sources"
        switchable={false}
        table={{
          columns: ["Source", "Kind", "Runs", "Sent", "Delivered", "Replied"],
          rows: cm.sources.map((x) => [x.name, x.kindLabel, x.runs, x.sent, x.delivered, x.replied]),
        }}
      >
        <RptSources rows={cm.sources} />
      </ChartCard>
    </div>
  );
}

/** Nothing came in: the period said so, and a door to a longer one. */
function nothingCameIn(vm: ReportVM, days: number, pick: (days: number) => Promise<void>) {
  return (
    <EmptyState
      kind="card"
      glyph="wave"
      title="Nothing came in"
      testid="reports-empty"
      body={`Nobody wrote or called between ${vm.since} and ${vm.until}.`}
      action={days !== 90 ? { label: "Look at 90 days", onClick: () => void pick(90) } : null}
    />
  );
}

// Everything the period row scopes. R is the published surface ({ vm, campaigns, booking, facts, days }); pick(days)
// is the row's own period switch, for the empty period's door.
export function ReportsSections({ R, pick }: { R: ReportsSurface; pick: (days: number) => Promise<void> }) {
  const vm = R.vm;
  const days = R.days;
  const phone = useRptPhone();
  const deals = dealsSection(R.deals);
  return (
    <>
      <section className="rpt-grid rpt-top" aria-label="This period">
        <RptHero vm={vm} phone={phone} />
        {!vm.empty && <RptFacts facts={R.facts || []} />}
      </section>
      <RptTiles vm={vm} booking={R.booking || null} />

      {vm.empty ? (
        <>
          {nothingCameIn(vm, days, pick)}
          {deals}
        </>
      ) : (
        <>
          {receptionistSection(R, phone)}

          {/* Drawn only where deals are on and a deal was ever recorded, so a workspace whose customers book never grows a section of zeros. */}
          {deals}

          {customersSection(vm, days)}
        </>
      )}

      <RptSection title="Campaigns" meta="what your broadcasts and playbooks sent">
        {campaignsBody(vm, R.campaigns || null, days)}
      </RptSection>
    </>
  );
}
