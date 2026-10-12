/**
 * The Campaigns lens's window cards from its own read: what was held back, which runs stopped, why sends failed after they left,
 * and each message's rate (how many of the sends that have had their time were answered); and the two waits of the time between steps
 * (how soon a message was answered, how long a run waited for your OK). Every row, line and sentence is the fold's
 * (contracts `toCampaignLensVM`, page-only): a card draws a bar a row, the line under its title and, for a part with nothing in it,
 * the fold's words for why, never a bar of nothing. A rate is a bar of its own kind: it is a share of some count, and a share of
 * fewer than the least that say anything is greyed as a strip's figure is (the reports lenses spec, D9: contracts' isThinShare, the
 * one predicate), in the chart grey that recedes, its words saying how few.
 */
import { isThinShare } from "@chanlytics/contracts";
import type { CampaignLensVM, RateRowVM } from "@chanlytics/contracts/report-lens";
import { BarList } from "../../kit/charts/bar";
import { ChartCard } from "../../kit/charts/card";
import { EmptyState } from "../../kit/empty/empty";
import { mixCard } from "./shared";

/** What a full bar of a rate is: all of them. */
const FULL_RATE = 100;
/** The chart grey that recedes (charts.css: the period before's colour, validated in both themes): the fill of a bar of too few. */
const THIN_BAR = "var(--chart-prior)";

/** The people a run did not send to, by why. */
export function heldCard(v: CampaignLensVM, className: string) {
  return mixCard(v.held, {
    title: "Held back",
    testid: "chart-campaigns-held",
    className,
    columns: ["Why", "People"],
  });
}

/** The runs that failed, by why, and the ones that were canceled. */
export function stoppedCard(v: CampaignLensVM, className: string) {
  return mixCard(v.stopped, {
    title: "Runs that stopped",
    testid: "chart-campaigns-stopped",
    className,
    columns: ["How it stopped", "Runs"],
  });
}

/** The messages that failed after they left, by the provider's own reason in the words the Inbox's thread uses. */
export function failedWhyCard(v: CampaignLensVM, className: string) {
  return mixCard(v.failedWhy, {
    title: "Sends that failed",
    testid: "chart-campaigns-failed-why",
    className,
    columns: ["Why it failed", "Messages"],
  });
}

/** How soon a message was answered after it was sent, in five steps, each step kept (the first answer of each message that was answered). */
export function firstReplyCard(v: CampaignLensVM, className: string) {
  return mixCard(v.firstReply, {
    title: "From a message to the first reply",
    testid: "chart-campaigns-first-reply",
    className,
    columns: ["How soon", "Messages"],
  });
}

/** How long the runs that needed your OK waited for it, in four steps, each step kept. */
export function approvalCard(v: CampaignLensVM, className: string) {
  return mixCard(v.approval, {
    title: "Waiting for your OK",
    testid: "chart-campaigns-approval",
    className,
    columns: ["How long it waited", "Runs"],
  });
}

/**
 * A rate's bar: its share, the fold's words beside it, and the grey of a share of too few (contracts' one predicate, the kit's
 * Figure's too). A message's rate and a reach-out angle's are both a `RateRowVM`: a share of some count, said with it.
 */
export function rateBar(r: RateRowVM) {
  return {
    id: r.id,
    label: r.label,
    value: r.value,
    display: r.display,
    ...(isThinShare(r.n, r.minN) ? { color: THIN_BAR } : {}),
  };
}

/** Each message's share of its sends that have had their time that were answered, every bar on the scale of all of them. */
export function byMessageCard(v: CampaignLensVM["byMessage"], className: string) {
  const rows = v.rows.map(rateBar);
  return (
    <ChartCard
      className={className}
      title="Replies, by message"
      testid="chart-campaigns-by-message"
      takeaway={v.line}
      table={rows.length ? { columns: ["Message", "Answered"], rows: rows.map((r) => [r.label, r.display]) } : null}
    >
      {rows.length ? (
        <BarList rows={rows} max={FULL_RATE} />
      ) : v.empty ? (
        <EmptyState kind="line" title={v.empty} />
      ) : null}
    </ChartCard>
  );
}
