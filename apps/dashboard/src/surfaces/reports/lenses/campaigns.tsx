/** The Campaigns lens: what the broadcasts and playbooks sent, and what the reach-outs wrote. */
import type { CampaignReportVM, ReportVM } from "@chanlytics/contracts";
import { BarChart, BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { RptSection, RptSources } from "../blocks";
import { RptReachOuts } from "../reach-outs";
import { RPT_SENT } from "../series";
import { LensEmpty, type LensProps } from "./shared";

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
  if (cm.empty) return <LensEmpty lens="campaigns" vm={vm} testid="chart-campaigns" />;
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

export function CampaignsLens({ R }: LensProps) {
  return (
    <>
      <RptSection title="Campaigns" meta="what your broadcasts and playbooks sent">
        {campaignsBody(R.vm, R.campaigns || null, R.days)}
      </RptSection>
      {/* What the reach-outs wrote and what came back (Reach out Part 6, H3): a section of its own, after Campaigns. */}
      <RptReachOuts R={R} />
    </>
  );
}
