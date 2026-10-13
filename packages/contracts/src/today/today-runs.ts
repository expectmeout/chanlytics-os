/**
 * The runs' words: every sentence with a number the queue and the day's card say about a playbook's run, and the
 * toast when a waiting run is approved. The page decides which runs wait; it composes none of their words.
 */

import { isReachOutRun } from "../reach-out/reach-out-rules";
import { RUN_WAITING_WORDS, runStopWords } from "../shell/campaign-rooms";

/* ------------------------------ the runs' words ------------------------------ */

/** A broadcast or a playbook's run as the broadcasts surface publishes it (toBroadcastVM), as far as the words read it. */
export interface RunLike {
  state: string;
  recipient_count: number;
  /** "today 9:00 AM" / "Sep 12 · 10:00 AM", by the business's clock (toBroadcastVM). */
  when: string;
  counts: { sent: number; replied: number };
  /** Whom it goes to: a reach-out's run (kind `reach_out`) writes to businesses, and says so. */
  audience?: unknown;
}

export interface TodayRunWordsVM {
  /** "3 people" */
  people: string;
  /** A run waiting for a word: what kind of run it is ("Campaign · ready"), then its sentence. */
  waiting: { meta: string; sentence: string; status: string[] };
  /**
   * A waiting run the approve verb would refuse (contracts runApprovalRefusal: its day has passed): what its row says in
   * place of "ready". Its sentence is the verb's own, which the page asks for, and its act is to open it, where Skip is.
   */
  late: { meta: string; status: string[] };
  /** A run under the veto window: scheduled, not yet sending. */
  soon: { meta: string; sentence: string; status: string[] };
  /** A run that went out today: what it earned so far, and whether it is still sending. */
  done: { counts: string; still: boolean };
}

/**
 * Every sentence with a number the queue and the day's card say about a playbook's run. The page kept seven of
 * them (dashboard-a-command.jsx, dashboard-a-brief.jsx); the rule that a number's sentence lives in contracts was
 * stated in this file's own header and enforced next door on Reports. The page keeps deciding WHICH rows wait, are
 * scheduled or went out today; it composes none of their words. The words are sentences now ("3 people. Nothing
 * sends until you say so."), where the page had a middle dot and no capital.
 */
export function todayRunWords(r: RunLike): TodayRunWordsVM {
  // A reach-out's run writes to businesses a search found, not to people the workspace knows (Reach out Part 5, PR 8).
  const reach = isReachOutRun(r.audience);
  const one = r.recipient_count === 1;
  const people = reach
    ? `${r.recipient_count} ${one ? "business" : "businesses"}`
    : `${r.recipient_count} ${one ? "person" : "people"}`;
  // A person reads "campaign", never "playbook" (decision 19 of 9 Oct 2026).
  const kind = reach ? "Reach-out" : "Campaign";
  const sent = `${r.counts.sent} sent`;
  return {
    people,
    waiting: {
      meta: `${kind} · ready`,
      sentence: `${people}. Nothing sends until you say so.`,
      // The run's one phrase for it (broadcasts.ts BROADCAST_STATE_LABELS), which Sent, Campaigns and the drawer say too.
      status: [RUN_WAITING_WORDS],
    },
    late: { meta: `${kind} · too late to approve`, status: ["Too late to approve"] },
    soon: {
      meta: `${kind} · sends ${r.when}`,
      // The verb of Sent's own cancel of a run still to come (campaign-rooms.ts RUN_STOP_WORDS), not a second one.
      sentence: `${people}. ${runStopWords("scheduled").verb} it if you'd rather not.`,
      status: ["Scheduled", `sends ${r.when}`],
    },
    done: { counts: r.counts.replied ? `${sent}, ${r.counts.replied} replied` : sent, still: r.state === "sending" },
  };
}

/** "2 runs waiting" beside the queue's own parts; null when none waits. */
export function todayRunsSub(n: number): string | null {
  return n ? `${n} run${n === 1 ? "" : "s"} waiting` : null;
}

/** "1 run too late to approve" beside the queue's parts: a run whose day has passed, which waits on nobody; null for none. */
export function todayLateRunsSub(n: number): string | null {
  return n ? `${n} run${n === 1 ? "" : "s"} too late to approve` : null;
}

/**
 * The toast when a waiting run is approved: the audience's name, which the page sets in bold, then who it reaches
 * and when it really goes (bcWhenWords). Two parts, so the page keeps its typography without composing the number.
 */
export function todayRunApproved(label: string, n: number, when: string): { lead: string; rest: string } {
  return { lead: label, rest: `approved: ${n} ${n === 1 ? "person" : "people"}, ${when}` };
}
