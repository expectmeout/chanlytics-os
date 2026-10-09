/** The Campaigns lens: what the broadcasts and playbooks sent, and what the reach-outs wrote. */
import type { CampaignReportVM, ReportTileVM, ReportVM } from "@chanlytics/contracts";
import { BarChart, BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { RptFigure, RptSection, RptSources } from "../blocks";
import { RptReachOuts } from "../reach-outs";
import { RPT_CHANNEL_COLORS, RPT_SENT } from "../series";
import { LensEmpty, type LensProps } from "./shared";

/**
 * Who said yes and who asked to stop, each with the period before beside it and, over its label, what is counted. The people
 * are the consent ledger's, not the campaigns': a yes or a stop counts however the person came to give it.
 */
function answersStrip(cm: CampaignReportVM) {
  const by = Object.fromEntries(cm.tiles.map((t) => [t.id, t]));
  const tiles = [by.optins, by.optouts].filter((t): t is ReportTileVM => !!t);
  return (
    <dl className="rpt-figures answers rpt-span-12" data-testid="campaign-answers">
      {tiles.map((t) => (
        <RptFigure key={t.id} t={t} />
      ))}
    </dl>
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

/**
 * By channel (0030): what each channel sent and how much of it was delivered, the most first, in the colour each channel
 * wears across Reports; its table has every figure, a read WhatsApp's alone. Drawn where more than one channel sent.
 */
function channelsCard(cm: CampaignReportVM) {
  if (cm.channels.length < 2) return null;
  return (
    <ChartCard
      className="rpt-span-12"
      title="By channel"
      testid="chart-campaign-channels"
      takeaway={cm.lines.channels}
      table={cm.channelTable}
    >
      <BarList
        max={Math.max(...cm.channels.map((c) => c.sent))}
        rows={cm.channels.map((c) => ({
          id: c.channel,
          label: c.label,
          value: c.sent,
          display: c.display,
          color: RPT_CHANNEL_COLORS[c.channel],
        }))}
      />
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
      {answersStrip(cm)}
      {funnelCard(cm)}
      {sentCard(cm, days)}
      {channelsCard(cm)}
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
      <RptSection title="Campaigns" bare>
        {campaignsBody(R.vm, R.campaigns || null, R.days)}
      </RptSection>
      {/* What the reach-outs wrote and what came back (Reach out Part 6, H3): a section of its own, after Campaigns. */}
      <RptReachOuts R={R} />
    </>
  );
}
