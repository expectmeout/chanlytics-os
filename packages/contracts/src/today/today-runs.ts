/**
 * The runs' words: every sentence with a number the queue and the day's card say about a playbook's run, and the
 * toast when a waiting run is approved. The page decides which runs wait; it composes none of their words.
 */

import { audienceTrigger } from "../broadcasts/broadcast-audience";
import { batchWaitWords } from "../playbooks/playbook-triggers";
import { isReachOutRun } from "../reach-out/reach-out-rules";
import { RUN_WAITING_WORDS, heldEmailsWords, runApprovedTail, runStopWords } from "../shell/campaign-rooms";
import { capitalize, plural } from "../shared/words";
import { runDraftedEmails, runHeldEmails } from "../waits/waits";
import { waitEndsWords } from "../waits/wait-rules";

/* ------------------------------ the runs' words ------------------------------ */

/** A broadcast or a playbook's run as the broadcasts surface publishes it (toBroadcastVM), as far as the words read it. */
export interface RunLike {
  state: string;
  recipient_count: number;
  /** "today 9:00 AM" / "Sep 12 · 10:00 AM", by the business's clock (toBroadcastVM). */
  when: string;
  counts: { sent: number; replied: number; took?: number | null };
  /**
   * Whom it goes to: a reach-out's run (kind `reach_out`) writes to businesses, and says so. Its moment (`trigger`) says
   * how a customer batch's wait ends: a visit's with the day's sending hours.
   */
  audience?: unknown;
  /**
   * The sequence step that made it: a customer batch's waits until its day ends (a visit's, its sending hours); a
   * one-off's or a reach-out's has no day.
   */
  playbook_id?: string | null;
  /** How many of a going run's emails the check holds for your say (waits.ts runHeldEmails). */
  held?: number | null;
  /** How many of a going run's emails are handed to you to send from your inbox (waits.ts runDraftedEmails, 00429). */
  drafted?: number | null;
  /** The time a freed time's run offers, as its view model says it ("tomorrow 3:00 PM", 0082); absent on any other run. */
  offered?: string | null;
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
  /** A going run whose emails the check holds: they wait for your say on the run, and the rest goes as planned. */
  held: { meta: string; sentence: string; status: string[] };
  /** A going run whose emails are handed to you: they wait on the run for you to send them from your inbox (00429). */
  drafted: { meta: string; sentence: string; status: string[] };
  /**
   * What the brief says after the run's name: what it waits for, and the queue's own sentence for it. A run waiting for
   * approval is "waiting for your approval"; a going one whose emails are held, or handed to you, is "waiting for you".
   */
  brief: { waits: string; sentence: string };
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
  // A person reads "campaign", never "playbook" (decision 19 of 9 Oct 2026); a sequence to leads sends cold emails, never
  // "a reach-out" (the Campaigns wiring review's lane 7).
  const kind = reach ? "Cold email" : "Campaign";
  const sent = `${r.counts.sent} sent`;
  const held = `${heldEmailsWords(r.held ?? 0)}. The rest of the run goes as planned.`;
  const drafted = `${plural(r.drafted ?? 0, "email", "emails")} to send from your inbox, each written and checked.`;
  // How its wait ends, by the wait rule (decision 0064): a customer batch's until its day ends, then skipped and told, a
  // visit's until 21:00, as its notice says (batchWaitWords); a reach-out's or a one-off's until it is answered.
  const ends =
    !reach && r.playbook_id ? batchWaitWords(audienceTrigger(r.audience), r.offered) : waitEndsWords("leads_batch");
  // A freed time's run says the time first, and why these people (0082): they asked and never booked.
  const waiting = r.offered
    ? `${capitalize(r.offered)} opened. ${people} asked this month and never booked. ${ends}.`
    : `${people}. ${ends}.`;
  const took = typeof r.counts.took === "number" ? `, ${r.counts.took} took it` : "";
  return {
    people,
    waiting: {
      meta: `${kind} · ready`,
      sentence: waiting,
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
    done: {
      counts: `${r.counts.replied ? `${sent}, ${r.counts.replied} replied` : sent}${took}`,
      still: r.state === "sending",
    },
    held: {
      meta: `${kind} · going`,
      sentence: held,
      status: ["Held for your say"],
    },
    drafted: {
      meta: `${kind} · to send`,
      sentence: drafted,
      status: ["Handed to you"],
    },
    brief:
      runHeldEmails(r) > 0
        ? { waits: "waiting for you", sentence: held }
        : runDraftedEmails(r) > 0
          ? { waits: "waiting for you", sentence: drafted }
          : { waits: RUN_WAITING_WORDS.toLowerCase(), sentence: waiting },
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
 * and when it really goes, as every receipt of an approve says it (shell/campaign-rooms.ts runApprovedTail). Two parts, so
 * the page keeps its typography without composing the number.
 */
export function todayRunApproved(label: string, n: number, when: string): { lead: string; rest: string } {
  return { lead: label, rest: runApprovedTail(n, when) };
}
