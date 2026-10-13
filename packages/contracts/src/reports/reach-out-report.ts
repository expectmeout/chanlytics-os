/**
 * Reports › Reach-outs (Reach out, Part 6: H1, H3–H6), and the day's numbers at 6 PM (H12): what a workspace's
 * reach-outs wrote over the period, and what came of it. Every number is a count the database holds (00241
 * reach_out_report, reach_out_day_due): written is an email that left; wrote back, interested, booked and said no count
 * each lead once, at the last email of the period that wrote to it; no opens and no clicks anywhere (decision 8).
 *
 * This module holds what the route answers (the DTOs), each reach-out's own totals and the bell's line. The page's fold of
 * the report, in the businesses it wrote to, is campaigns/reach-out-lens.ts.
 */
import { isCount, recordOrNull } from "../shared/unknown";
import type { HandKind } from "../reach-out/reach-out-hand";

export interface ReachOutReportCounts {
  /** Emails that left (a business with three is three). */
  written: number;
  delivered: number;
  bounced: number;
  /**
   * The businesses written to, each once, at its last email of the period (00404): the population wrote back, interested,
   * booked and said no are counts of, so a share of them is of this, never of `written`. Absent on a database before 00404.
   */
  businesses?: number;
  wrote_back: number;
  interested: number;
  booked: number;
  said_no: number;
  handed: number;
}

export interface ReachOutReportStepDto extends ReachOutReportCounts {
  id: string;
  n: number;
  hand: HandKind | null;
}

export interface ReachOutReportChainDto {
  root_id: string;
  name: string;
  state: string;
  search: { id: string; name: string } | null;
  last_at: string | null;
  runs: number;
  steps: ReachOutReportStepDto[];
}

export interface ReachOutReportMailboxDto {
  /** Null for the emails of a mailbox since gone. */
  address: string | null;
  state: string | null;
  held_why: string | null;
  held_at: string | null;
  sent: number;
  /** What left and did not fail: no provider tells a mailbox it delivered (00422). */
  delivered: number;
  /** Permanent bounces, the mailbox's own rule (00422 mailbox_connection_counts). */
  bounced: number;
  complained: number;
}

/** What `reach_out_report(tenant, days)` answers (00241). */
export interface ReachOutReportDto {
  timezone: string;
  days: number;
  today: string;
  /** The report's last day (00360): today for a period by name, an earlier day for days a member picked. */
  end?: string;
  since: string;
  /** The workspace has a reach-out at all: the section is drawn only then. */
  has_reach_out: boolean;
  totals: ReachOutReportCounts;
  /** What the period before (the same count of days, ending the day before `since`) wrote: emails only, outcomes being state now (00404). */
  before?: { written: number; delivered: number; bounced: number };
  series: Array<{ day: string; written: number }>;
  chains: ReachOutReportChainDto[];
  /** `businesses` (00404): the businesses whose last email had this angle; absent on a database before it. */
  angles: Array<{ angle: string; written: number; businesses?: number; wrote_back: number }>;
  other_angles: { written: number; businesses?: number; wrote_back: number };
  no_angle: number;
  /** Where its emails left from (00422); a database before it says none. */
  mailboxes: ReachOutReportMailboxDto[];
}

/**
 * Each reach-out's numbers over a period, by its first step's id (`reach_out_chain_totals`, one pass, every chain of the
 * workspace): what it wrote (emails), to how many businesses, and how many wrote back, in Reports' words. `complete` says
 * every chain was counted, so one absent from `by_root` wrote nothing; it is false where the numbers come from the
 * report's own chains (a database before the function, chainTotalsFromReport), which holds at most twenty, so one absent
 * may be past the twenty and says "—". `businesses` is the population `wrote_back` is a count of (00404): absent on a
 * database before it, never a guess. GET reports/reach-outs answers it beside the report (spec 2026-10-09 §4.5).
 */
export interface ReachOutChainTotalsDto {
  complete: boolean;
  by_root: Record<string, { written: number; businesses?: number; wrote_back: number }>;
}

/**
 * The function's answer, checked (no cast): each root's written, businesses and wrote back; null for anything else. A
 * root without `businesses` (a database before 00404) is read as it is, with the key absent; one whose `businesses` is
 * there and no count is no answer of the function.
 */
export function chainTotalsOf(answer: unknown): ReachOutChainTotalsDto | null {
  const roots = recordOrNull(answer);
  if (!roots) return null;
  const by_root: ReachOutChainTotalsDto["by_root"] = {};
  for (const [root, value] of Object.entries(roots)) {
    const v = recordOrNull(value);
    if (!v || !isCount(v.written) || !isCount(v.wrote_back)) return null;
    if (v.businesses === undefined) by_root[root] = { written: v.written, wrote_back: v.wrote_back };
    else if (isCount(v.businesses))
      by_root[root] = { written: v.written, businesses: v.businesses, wrote_back: v.wrote_back };
    else return null;
  }
  return { complete: true, by_root };
}

/**
 * The report's own chains, each its steps summed: what a database before the function can say, and not every chain. A
 * chain's businesses is its steps' summed (each business is counted at one step only, its last), said only where every
 * step carries it: a sum of some is not the chain's.
 */
export function chainTotalsFromReport(report: Pick<ReachOutReportDto, "chains">): ReachOutChainTotalsDto {
  const by_root: ReachOutChainTotalsDto["by_root"] = {};
  for (const c of report.chains) {
    const written = c.steps.reduce((sum, s) => sum + s.written, 0);
    const wrote_back = c.steps.reduce((sum, s) => sum + s.wrote_back, 0);
    const businesses = c.steps.reduce<number | null>(
      (sum, s) => (sum === null || s.businesses === undefined ? null : sum + s.businesses),
      0,
    );
    by_root[c.root_id] = businesses === null ? { written, wrote_back } : { written, businesses, wrote_back };
  }
  return { complete: false, by_root };
}

/** A mailbox's row in the Reach-outs part (H5): its state in words, and how its emails landed, as shares the lens words. */
export interface ReachOutMailboxRow {
  id: string;
  address: string;
  state: string;
  held: boolean;
  sent: number;
  landed: string;
  bounced: string;
  complained: string;
}

/** The day's numbers (00241 reach_out_day_due). */
export interface ReachOutDayNumbers {
  written: number;
  wrote_back: number;
  interested: number;
  said_no: number;
  bounced: number;
  held: number;
}

/**
 * The bell's line at 6 PM (H12): "Today's reach-outs" over what they wrote, who wrote back and what waits, each clause
 * only when it is not zero.
 */
export function reachOutDayWords(n: ReachOutDayNumbers): { title: string; body: string } {
  const clauses: string[] = [];
  if (n.written) clauses.push(`${n.written} written`);
  if (n.wrote_back) clauses.push(`${n.wrote_back} wrote back${n.interested ? `, ${n.interested} interested` : ""}`);
  if (n.said_no) clauses.push(`${n.said_no} said no`);
  if (n.bounced) clauses.push(`${n.bounced} bounced`);
  if (n.held) clauses.push(`${n.held} wait${n.held === 1 ? "s" : ""} for your say`);
  return { title: "Today's reach-outs", body: clauses.length ? `${clauses.join(" · ")}.` : "Nothing happened today." };
}
