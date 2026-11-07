/** Broadcasts: states. */

import { RUN_WAITING_WORDS } from "../../shell/campaign-rooms";

export const BROADCAST_STATES = ["pending_approval", "scheduled", "sending", "sent", "canceled", "failed"] as const;

export type BroadcastState = (typeof BROADCAST_STATES)[number];

/**
 * A run that is going: scheduled, or sending. A reach-out's held emails wait for their owner's say only in a run that is
 * going (the held notice, reach-out-sheet listHeldNoticeDue); a run waiting for approval is counted as the run.
 */
export const RUN_GOING_STATES = ["scheduled", "sending"] as const satisfies readonly BroadcastState[];

export const RECIPIENT_STATES = ["queued", "sent", "skipped", "failed"] as const;

export type RecipientState = (typeof RECIPIENT_STATES)[number];

/**
 * A reach-out's send (00183 reach_out_sends): planned (a time and a domain), claimed under the domain's capacity,
 * queued as an email row with its job, then what that row became. A wait refusal plans it again (Reach out, Part 3).
 * The check before it goes may hold it (00197): held waits for its owner, who puts it back or skips it (Part 4).
 * A hand step's lead is handed to the team, and never moves (00228, Part 5). A reach-out its owner sends hands each
 * email to them, drafted, and the owner says whether it went: sent, or skipped (00429).
 */
export const REACH_OUT_SEND_STATES = [
  "planned",
  "held",
  "claimed",
  "queued",
  "drafted",
  "sent",
  "skipped",
  "failed",
  "handed",
] as const;

export type ReachOutSendState = (typeof REACH_OUT_SEND_STATES)[number];

/**
 * A run waiting on its owner says "Waiting for your approval", as its tab on Sent, its line on Campaigns' home, the drawer,
 * Coming up, Today's row and brief and Ask say it (lifecycle/words.ts, today/runs.ts, reach-out/approval.ts all read this
 * one). It said "Needs you" on its row's pill alone until 8 Oct 2026, which is the Inbox's word for a thread a person must
 * answer, and then "Waiting on you", which People used for a thread you have and Reports for a thread nobody has: three
 * things under one name, and a run waiting wore nine phrasings (D1-run-words). A thread is NEEDS_YOU_WORD or HELD_WORDS'
 * (conversations/standing.ts); a run is this.
 */
export const BROADCAST_STATE_LABELS: Record<BroadcastState, string> = {
  pending_approval: RUN_WAITING_WORDS,
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  canceled: "Canceled",
  failed: "Failed",
};

/** How many go in one job, and the breath between two sends. */
export const BROADCAST_CHUNK = 25;
