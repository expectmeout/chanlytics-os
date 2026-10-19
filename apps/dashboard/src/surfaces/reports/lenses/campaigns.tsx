/**
 * The Campaigns lens: did the messages a business sends on its own reach people, did they answer, and what is stuck. The sentence at
 * its head is the frame's (head.ts), which says the fold's once the lens's own read is held and current; the figures against the
 * period before, the window's cards and every word they say are that read's, folded once per read by the real `toCampaignLensVM`
 * (the page-only entry, `@chanlytics/contracts/report-lens`): the frame reads the report alone and holds nothing of campaigns.
 *
 * It draws from one read that fails in three parts alone (`reports_campaigns`, campaigns-surface.ts): the sends (the funnel, the day
 * card, the channels and the sources), the ledger (the people, the held, the stopped, the failed sends and each message's rate, the
 * waits, and what is stuck now) and the reach-outs. A part that failed is one failed read with its Retry, and the others stand; a
 * database without the ledger draws the sends and no failure; the sends that failed draw the ledger's parts alone. A period in which
 * nothing went out and nobody answered is the lens's own card, in place of the strip and every card of the window (it never draws the
 * Overview's "nothing came in"), and the waits with them: what is stuck now and the reach-outs are not of the window and draw anyway.
 * While the read is out or of another period nothing of it is drawn and the page dims; one that could not be made is the failed cards,
 * and never the period it left under the new one's name. Every row of cards adds up to the grid's twelve columns.
 *
 * Four sections, in order: the lens (this file: the strip and the window's cards), the time between steps and what is stuck now
 * (campaigns-now.tsx), and the reach-outs, a part that names itself (campaigns-reach-outs.tsx).
 */
import { useMemo } from "react";
import type { CampaignReportVM } from "@chanlytics/contracts";
import { toCampaignLensVM, type CampaignLensVM } from "@chanlytics/contracts/report-lens";
import { BarChart, BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState } from "../../kit/empty/empty";
import type { Follower } from "../../use-surface";
import { RptSection, RptSources, RptStrip } from "../blocks";
import type { CampaignsSurface } from "../campaigns-surface";
import { RPT_CHANNEL_COLORS, RPT_SENT } from "../series";
import type { ReportsSurface } from "../surface";
import { byMessageCard, failedWhyCard, heldCard, stoppedCard } from "./campaigns-mix";
import { campaignsStuck, campaignsTime, failedRead } from "./campaigns-now";
import { reachOutsSection } from "./campaigns-reach-outs";
import { LensEmpty, mixCard, type LensProps } from "./shared";

/**
 * How a strip of fewer than the five figures stands in its frame: the class that says how many are across. Each can be: the ledger
 * missing leaves three, the sends failing two, and a run count the database left out of the ledger takes the people sent to out
 * of the strip (four across, or with the sends failing too, the people who wrote back alone: one).
 */
const STRIP_ACROSS: Readonly<Record<number, string>> = { 1: "solo", 2: "duo", 3: "trio", 4: "quad" };

/** What the lens folds where its read could not be made at all: every part failed, as the surface says three nulls. */
const UNREAD = { campaigns: null, ledger: null, reachOuts: null } as const;

/**
 * The fold of the lens's own read, once per read: of the value held, so a period left still folds (the page decides what to draw
 * of it: the lens draws it only while it is current, the head and Worth knowing say the same). The clock is the fold's own now.
 */
export function useCampaignsFold(own: Follower<CampaignsSurface>): CampaignLensVM | null {
  const read = own.value;
  return useMemo(
    () =>
      read === undefined
        ? null
        : toCampaignLensVM({ campaigns: read.campaigns, ledger: read.ledger, reachOuts: read.reachOuts }, Date.now()),
    [read],
  );
}

/** From sent to answered: the funnel is messages, whatever the strip above counts (it counts the people they went to). */
function funnelCard(fold: CampaignLensVM) {
  return mixCard(fold.funnel, {
    title: "Messages, from sent to answered",
    testid: "chart-funnel",
    className: "rpt-span-5",
    columns: ["What happened", "Messages"],
  });
}

/** Sent, day by day. */
function sentCard(fold: CampaignLensVM, report: CampaignReportVM, days: number) {
  return (
    <ChartCard
      className="rpt-span-7"
      title="Sent, day by day"
      testid="chart-campaigns"
      takeaway={fold.runsLine ?? report.lines.sent}
      config={RPT_SENT}
      table={report.table}
    >
      {report.totals.sent ? (
        <BarChart
          data={report.points}
          keys={["sent"]}
          config={RPT_SENT}
          // The room its row gives it: the funnel beside it stands taller, and 150px left a third of the card empty under
          // the days (the sample walk, 18 Oct 2026; receptionist.tsx's Who answered is the same).
          height="fill"
          floor={150}
          yTicks={2}
          animKey={days}
          ariaLabel="Campaign messages sent per day. The arrow keys read each day."
          tipNote={(d) => d.answeredWords}
          describe={(d) => d.sentWords}
        />
      ) : fold.funnel.empty ? (
        <EmptyState kind="line" title={fold.funnel.empty} />
      ) : null}
    </ChartCard>
  );
}

/**
 * By channel (0030): what each channel sent and how much of it was delivered, the most first, in the colour each channel
 * wears across Reports; its table has every figure, a read WhatsApp's alone. Drawn where more than one channel sent.
 */
function channelsCard(report: CampaignReportVM, className: string) {
  return (
    <ChartCard
      className={className}
      title="By channel"
      testid="chart-campaign-channels"
      takeaway={report.lines.channels}
      table={report.channelTable}
    >
      <BarList
        max={Math.max(...report.channels.map((c) => c.sent))}
        rows={report.channels.map((c) => ({
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

/** Each campaign and broadcast that sent in the period, with its table twin as the card has always offered it. */
function sourcesCard(report: CampaignReportVM) {
  return (
    <ChartCard
      className="rpt-span-12"
      title="By campaign and broadcast"
      testid="chart-sources"
      switchable={false}
      table={{
        columns: ["Source", "Kind", "Runs", "Sent", "Delivered", "Answered"],
        rows: report.sources.map((x) => [x.name, x.kindLabel, x.runs, x.sent, x.delivered, x.replied]),
      }}
    >
      <RptSources rows={report.sources} />
    </ChartCard>
  );
}

/**
 * The reads of the sends and the ledger that failed, each as the house's failed read in the fold's own words and with its Retry; the
 * stuck now and the reach-outs say theirs where they are drawn (campaigns-now.tsx, campaigns-reach-outs.tsx).
 */
function failedCards(fold: CampaignLensVM) {
  const mine = fold.failed.filter((f) => f.part === "campaigns" || f.part === "ledger");
  if (mine.length === 0) return null;
  return <div className="rpt-grid">{mine.map((f) => failedRead(f, `campaigns-failed-${f.part}`))}</div>;
}

/** The funnel beside the days, where the sends were read. */
function sendsRow(fold: CampaignLensVM, report: CampaignReportVM | null, days: number) {
  if (report === null) return null;
  return (
    <div className="rpt-grid">
      {funnelCard(fold)}
      {sentCard(fold, report, days)}
    </div>
  );
}

/** What was held, what stopped and what failed, in thirds, where the ledger was read. */
function trailRow(fold: CampaignLensVM) {
  if (fold.reads.ledger !== "ok") return null;
  return (
    <div className="rpt-grid">
      {heldCard(fold, "rpt-span-4")}
      {stoppedCard(fold, "rpt-span-4")}
      {failedWhyCard(fold, "rpt-span-4")}
    </div>
  );
}

/** The channels beside each message's rate, in halves; the one that stands alone takes the row. */
function ratesRow(fold: CampaignLensVM, report: CampaignReportVM | null) {
  const byChannel = report !== null && report.channels.length >= 2;
  const byMessage = fold.reads.ledger === "ok";
  if (!byChannel && !byMessage) return null;
  const span = byChannel && byMessage ? "rpt-span-6" : "rpt-span-12";
  return (
    <div className="rpt-grid">
      {byChannel && channelsCard(report, span)}
      {byMessage && byMessageCard(fold.byMessage, span)}
    </div>
  );
}

/** The window's figures and cards, whichever of the sends and the ledger were read. */
function windowBody({ vm, days }: ReportsSurface, fold: CampaignLensVM) {
  if (fold.quiet) return <LensEmpty lens="campaigns" vm={vm} testid="chart-campaigns-quiet" />;
  const { report } = fold;
  return (
    <>
      {fold.strip.length > 0 && (
        <RptStrip tiles={fold.strip} className={STRIP_ACROSS[fold.strip.length]} testid="campaigns-strip" />
      )}
      {sendsRow(fold, report, days)}
      {trailRow(fold)}
      {ratesRow(fold, report)}
      {report !== null && report.sources.length > 0 && <div className="rpt-grid">{sourcesCard(report)}</div>}
    </>
  );
}

/** What the lens draws of its read: nothing while it is out or of another period, the failed reads where it could not be made, else its parts. */
function shownFold(own: Follower<CampaignsSurface>, fold: CampaignLensVM | null): CampaignLensVM | null {
  if (own.state === "failed") return toCampaignLensVM(UNREAD, 0);
  return own.state === "current" ? fold : null;
}

export function CampaignsLens({
  R,
  own,
  fold,
}: LensProps & {
  /** The lens's own read, and where it stands against the period shown. */
  own: Follower<CampaignsSurface>;
  /** Its fold (useCampaignsFold): drawn only while that is of the period shown. */
  fold: CampaignLensVM | null;
}) {
  const shown = shownFold(own, fold);
  if (shown === null) return null;
  return (
    <>
      <RptSection title="Campaigns" bare>
        {failedCards(shown)}
        {windowBody(R, shown)}
      </RptSection>
      {campaignsTime(shown)}
      {campaignsStuck(shown)}
      {reachOutsSection(shown)}
    </>
  );
}
