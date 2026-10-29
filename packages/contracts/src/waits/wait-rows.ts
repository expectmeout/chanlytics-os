/**
 * Every wait is one row, from one list (the Campaigns wiring review's rule D, lane 4, 19 Oct 2026): the runs waiting for
 * you as Needs you draws them, the Inbox's whole list and Today's queue a part of it, each the same row with the same
 * act. Two or more whose emails are handed to you are one row, To send (toSendRunsOf), which opens as a part of Needs you
 * (Ruben's call 3). Two or more waiting for an OK are one row too, which opens the first, whose screen walks the rest
 * ("1 of 3", each answer opening the next: the run review's item 5, where four rows pushed the customers waiting off a
 * phone's screen). The rest are a run each: one whose emails the check holds, one handing its emails to you alone, one
 * waiting for an OK alone, and one whose day has passed, which only Skip answers, on its screen.
 *
 * Pure: a page hands in the runs that wait (runsThatWait) and those too late to approve (runTooLate), as it read them,
 * and draws the rows.
 */
import { joinWords, plural } from "../shared/words";
import { RUN_WAITING_WORDS } from "../shell/campaign-rooms";
import { toSendAllOf, toSendRunsOf, type ToSendCount, type ToSendRunLike } from "../reach-out/reach-out-approval";
import { runHeldEmails } from "./waits";

/** A run as the rows read it: what To send reads, and whether its check holds emails too. */
type RowRun = ToSendRunLike & { held?: number | null };

/** One row of the runs waiting for you: To send's, the runs waiting for an OK folded into one, or a run's own. */
export type WaitRowOf<R> =
  | ({ kind: "to_send"; runs: R[] } & ToSendCount)
  | { kind: "approvals"; runs: R[] }
  | { kind: "run"; run: R; late: boolean };

/**
 * To send's row: two or more runs whose emails are handed to you, none holding emails for a say too (toSendRunsOf); and,
 * where To send is open (`inbox/to-send`, an old link to it among them), the one run handing emails over too, so the list
 * it opened on is there.
 */
function toSendOf<R extends RowRun>(waiting: readonly R[], open: boolean) {
  const folded = toSendRunsOf(waiting);
  if (folded || !open) return folded;
  const all = toSendAllOf(waiting.filter((r) => runHeldEmails(r) === 0));
  return all ? { runs: all.runs, count: all.count, from: all.from } : null;
}

/**
 * The rows, in the order the runs wait: To send first (the list the owner works down), then each run, the ones waiting
 * for an OK one row where two or more do, at the place of the first; then those too late to approve. `toSendOpen` is
 * whether To send is open where the rows are drawn.
 */
export function waitRowsOf<R extends RowRun>(
  waiting: readonly R[],
  late: readonly R[] = [],
  toSendOpen = false,
): WaitRowOf<R>[] {
  const toSend = toSendOf(waiting, toSendOpen);
  const rest = waiting.filter((r) => !toSend || !toSend.runs.includes(r));
  // An OK alone sends these, and the run's screen walks them in turn (its queue: those waiting for an approval).
  const asks = rest.filter((r) => r.state === "pending_approval");
  const folded = asks.length > 1 ? asks : [];
  const rows: WaitRowOf<R>[] = toSend ? [{ kind: "to_send", ...toSend }] : [];
  for (const r of rest) {
    if (!folded.includes(r)) rows.push({ kind: "run", run: r, late: false });
    else if (r === folded[0]) rows.push({ kind: "approvals", runs: folded });
  }
  for (const r of late) rows.push({ kind: "run", run: r, late: true });
  return rows;
}

/** The first two by name, then how many more: "VIP color clients, Holiday gift cards and 1 more". */
const approvalsSentence = (names: readonly string[]) =>
  `${joinWords(names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names)}. Each one you answer opens the next.`;

/** The folded row's words: how many wait for an OK, who they are, and that each answer opens the next. */
export const WAIT_ROW_WORDS = {
  /**
   * A run's row on Today on a phone, where it opens to be answered (a reach-out's, a run of several): what you do there, not
   * where it goes (his look on a phone, 29 Oct 2026). Open stays the desk's, and a run too late to approve still opens.
   */
  review: "Review",
  approvals: {
    name: (n: number) => `${plural(n, "run waits", "runs wait")} for your OK`,
    meta: "Campaigns · ready",
    sentence: approvalsSentence,
    status: [RUN_WAITING_WORDS],
    open: "Open",
    /** Today's brief, saying the folded row once (contracts todayBriefWords): "4 runs wait for your OK: …". */
    brief: (names: readonly string[]) => ({
      label: plural(names.length, "run", "runs"),
      says: names.length === 1 ? "waits for your OK" : "wait for your OK",
      sentence: approvalsSentence(names),
    }),
  },
} as const;
