/**
 * The one To send (00429): the going runs whose emails are handed to their owner, and the ones that fold into its one row
 * of what waits for you. Pure, and without words: the count every page carries (the dashboard's needs-you.ts, through
 * wait-rows.ts) reads these, and the words of To send stay with its page (campaigns/reach-out/approval.ts
 * TO_SEND_ALL_WORDS), so what every page loads holds none of the reach-out's sheet.
 */
import { reachOutRootOf } from "../campaigns/reach-out/rules";
import { runDraftedEmails, runHeldEmails } from "./waits";

/** A run as Sent's list holds it (BroadcastVM), as far as the one To send reads it. */
export interface ToSendRunLike {
  id: string;
  state: string;
  scheduled_for: string;
  /** How many of a going run's emails are handed to its owner (waits.ts runDraftedEmails, 00429). */
  drafted?: number | null;
  /** Whose run it is: a reach-out's run names its reach-out (reachOutRootOf), so a first email and its nudge are one. */
  audience?: unknown;
}

/** One To send's numbers: the emails handed over, and the reach-outs they come from (a run's steps are one reach-out). */
export interface ToSendCount {
  count: number;
  from: number;
}

/**
 * Every going run with emails handed to its owner (00429), as one To send: the runs, the oldest first, with how many of
 * their emails wait in all. Null when none has one. Each run's own emails are its detail's (toSendWordsOf), read as its
 * part of the list is drawn.
 */
export function toSendAllOf<R extends ToSendRunLike>(runs: readonly R[]): ({ runs: R[] } & ToSendCount) | null {
  const waiting = runs
    .filter((r) => runDraftedEmails(r) > 0)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for) || a.id.localeCompare(b.id));
  if (waiting.length === 0) return null;
  return {
    runs: waiting,
    count: waiting.reduce((n, r) => n + runDraftedEmails(r), 0),
    // A reach-out's runs are its steps' (a first email, a nudge): counted as the one reach-out they are.
    from: new Set(waiting.map((r) => reachOutRootOf(r.audience) ?? r.id)).size,
  };
}

/** A run waiting for you, as the doors to the waiting runs read it: whether its check holds emails too, and its sequence. */
export type WaitingToSend = ToSendRunLike & { held?: number | null; sequence_id?: string | null };

/**
 * The runs waiting for you that fold into the one To send's row on Today: two or more going runs whose emails are handed
 * to their owner, none of them holding emails for a say too (a held email is answered on its run, its own row). Null
 * where fewer would fold, and each is its own run's row. The row says the list it opens: every email handed over and
 * every run with one (`count`, `from`: toSendAllOf), a run that holds emails too among them.
 */
export function toSendRunsOf<R extends WaitingToSend>(waiting: readonly R[]): ({ runs: R[] } & ToSendCount) | null {
  const folded = waiting.filter((r) => runHeldEmails(r) === 0 && runDraftedEmails(r) > 0);
  const all = toSendAllOf(waiting);
  return all && folded.length > 1 ? { runs: folded, count: all.count, from: all.from } : null;
}

/** The door from a run's own To send to the one list: where two or more runs hand emails over, its numbers. */
export function toSendEveryOf<R extends ToSendRunLike>(runs: readonly R[]): ToSendCount | null {
  const all = toSendAllOf(runs);
  return all && all.runs.length > 1 ? { count: all.count, from: all.from } : null;
}
