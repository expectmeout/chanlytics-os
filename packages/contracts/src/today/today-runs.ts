/**
 * The runs' words: every sentence with a number the queue and the day's card say about a playbook's run, and the
 * toast when a waiting run is approved. The page decides which runs wait; it composes none of their words.
 */

import { isReachOutRun } from "../reach-out/reach-out-rules";

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
  /** A run waiting for a word: what kind of run it is ("Playbook · ready"), then its sentence. */
  waiting: { meta: string; sentence: string; status: string[] };
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
  const kind = reach ? "Reach-out" : "Playbook";
  const sent = `${r.counts.sent} sent`;
  return {
    people,
    waiting: {
      meta: `${kind} · ready`,
      sentence: `${people}. Nothing sends until you say so.`,
      status: ["Waiting for your approval"],
    },
    soon: {
      meta: `${kind} · sends ${r.when}`,
      sentence: `${people}. Stop it if you'd rather not.`,
      status: ["Scheduled", `sends ${r.when}`],
    },
    done: { counts: r.counts.replied ? `${sent}, ${r.counts.replied} replied` : sent, still: r.state === "sending" },
  };
}

/** "2 runs waiting" beside the queue's own parts; null when none waits. */
export function todayRunsSub(n: number): string | null {
  return n ? `${n} run${n === 1 ? "" : "s"} waiting` : null;
}

/**
 * The toast when a waiting run is approved: the audience's name, which the page sets in bold, then who it reaches
 * and when it really goes (bcWhenWords). Two parts, so the page keeps its typography without composing the number.
 */
export function todayRunApproved(label: string, n: number, when: string): { lead: string; rest: string } {
  return { lead: label, rest: `approved: ${n} ${n === 1 ? "person" : "people"}, ${when}` };
}
