/**
 * The Campaigns lens's time between steps and what is stuck now, from its own read. How soon a message was answered and how long a
 * run waited for your OK are the window's, two cards of five and four steps each; what is stuck is as it stands now, whatever
 * period is picked: five figures (runs waiting for you and replies waiting on you in amber, failed runs and the messages Meta
 * stopped in red, each only above zero, and the number's health by its own tone), a door each to the page that fixes it. Every row,
 * line and sentence is the fold's (contracts `toCampaignLensVM`, page-only): a part the database lacks is not drawn and not a
 * failure, a read that failed is one failed read in its place, with its Retry, and a quiet window has no waits to draw.
 */
import type { CampaignLensVM } from "@chanlytics/contracts/report-lens";
import { FailedRead } from "../../kit/empty/empty";
import { RptSection, RptStrip } from "../blocks";
import { approvalCard, firstReplyCard } from "./campaigns-mix";

/**
 * A read that failed, as the house's failed read: the fold's words for what could not be read and what still stands, and its
 * Retry. Keyed by its test id, so several can stand in a row of the grid.
 */
export function failedRead(f: CampaignLensVM["failed"][number], testid: string) {
  return (
    <FailedRead
      key={testid}
      className="rpt-span-12"
      kind="card"
      what={f.what}
      body={f.body}
      surface="reports_campaigns"
      testid={testid}
    />
  );
}

/** The two waits of the window, in halves: drawn where the ledger was read, and not for a window in which nothing happened. */
export function campaignsTime(fold: CampaignLensVM) {
  if (fold.reads.ledger !== "ok" || fold.quiet) return null;
  return (
    <RptSection title="Time between steps" bare testid="campaigns-time">
      <div className="rpt-grid">
        {firstReplyCard(fold, "rpt-span-6")}
        {approvalCard(fold, "rpt-span-6")}
      </div>
    </RptSection>
  );
}

/**
 * What is stuck now: the five figures where `campaign_stuck` was read, the one failed read in their place where only that read
 * failed, and nothing where the database lacks it (or where the ledger failed, which says so for what is stuck too).
 */
export function campaignsStuck(fold: CampaignLensVM) {
  const failed = fold.failed.find((f) => f.part === "stuck");
  if (failed === undefined && fold.stuck.length === 0) return null;
  return (
    <RptSection title="Stuck now" bare testid="campaigns-stuck">
      {failed === undefined ? (
        <RptStrip tiles={fold.stuck} testid="campaigns-stuck-strip" />
      ) : (
        <div className="rpt-grid">{failedRead(failed, "campaigns-failed-stuck")}</div>
      )}
    </RptSection>
  );
}
