/**
 * The ledger now (decision 0089): what Health's "The ledger now" draws from jobs_ledger_now (00526), by lane and by
 * kind, and each lane in words. Pure: the reader hands it rows.
 */

/** One lane of the ledger now (jobs_ledger_now, 00526): how many run, are due, wait for a retry and ran past their lease. */
export interface LedgerLaneDto {
  lane: number;
  running: number;
  due: number;
  waiting: number;
  expired: number;
  /** How long the oldest due row has waited, in seconds; 0 when none is due. */
  oldest_due_s: number;
}

/** One kind of job now: its lane, whether an operator paused it and why, and its last day's failed and done. */
export interface LedgerKindDto {
  kind: string;
  lane: number;
  paused_at: string | null;
  paused_why: string | null;
  failed_day: number;
  done_day: number;
}

/** Each lane in words (decision 0018): what a claim takes first, then someone waiting, then bulk; -1 is a kind with none. */
export const LEDGER_LANE_WORDS: Record<number, string> = {
  0: "Replies",
  1: "Someone waiting",
  2: "Bulk",
  [-1]: "No lane",
};

/** What the ledger holds now (00526): by lane, by kind, and when its own canary last finished. */
export interface LedgerNowDto {
  lanes: LedgerLaneDto[];
  kinds: LedgerKindDto[];
  canary_done_at: string | null;
  read_at: string;
}
