/**
 * Every wait is one row, from one list (the Campaigns wiring review's rule D, lane 4, 19 Oct 2026): the runs waiting for
 * you as Needs you draws them, the Inbox's whole list and Today's queue a part of it, each the same row with the same
 * act. Two or more whose emails are handed to you are one row, To send (toSendRunsOf), which opens as a part of Needs you
 * (Ruben's call 3). Cold email is one row (decision 0120, D8): two or more of its runs that wait, for an OK or with
 * emails the check holds, say what waits in them all and open the first to look at, whose screen walks the rest. Two or
 * more of a customer campaign's runs waiting for an OK are one row too, which opens the first, whose screen walks the
 * rest ("1 of 3", each answer opening the next: the run review's item 5, where four rows pushed the customers waiting
 * off a phone's screen). The rest are a run each: one whose emails the check holds, one handing its emails to you alone,
 * one waiting for an OK alone, and one whose day has passed, which only Skip answers, on its screen.
 *
 * Pure: a page hands in the runs that wait (runsThatWait) and those too late to approve (runTooLate), as it read them,
 * and draws the rows.
 */
import {
  batchHeldEmails,
  isReachOutRun,
  joinWords,
  plural,
  reachOutRootOf,
  RUN_WAITING_WORDS,
  toSendAllOf,
  toSendRunsOf,
  type ToSendCount,
  type ToSendRunLike,
  runHeldEmails,
} from "@chanlytics/contracts";

/** A run as the rows read it: what To send reads, whether its check holds emails too, and how many it writes to. */
type RowRun = ToSendRunLike & { held?: number | null; recipient_count?: number | null };

/**
 * Cold email's one row in numbers: the emails the check holds for a look in all its runs, the emails an OK would send,
 * and how many sequences they come from (a sequence's steps are one).
 */
export interface ColdEmailCount {
  held: number;
  asks: number;
  from: number;
}

/** One row of the runs waiting for you: To send's, cold email's, the runs waiting for an OK folded into one, or a run's own. */
export type WaitRowOf<R> =
  | ({ kind: "to_send"; runs: R[] } & ToSendCount)
  | ({ kind: "cold_email"; runs: R[] } & ColdEmailCount)
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

/** Whether a cold email's run waits for a look or an OK: one handing its emails to its owner alone is To send's. */
const coldWaits = (r: RowRun) => isReachOutRun(r.audience) && (r.state === "pending_approval" || runHeldEmails(r) > 0);

/**
 * Cold email's one row (decision 0120, D8): two or more of its runs that wait, those holding emails for a look first
 * (a held email is the one thing only its owner can answer), then those waiting for an OK, each in the order it waits.
 * Null where fewer do, and the one is its own run's row.
 */
function coldEmailOf<R extends RowRun>(rest: readonly R[]): ({ runs: R[] } & ColdEmailCount) | null {
  const cold = rest.filter(coldWaits);
  if (cold.length < 2) return null;
  const looks = cold.filter((r) => runHeldEmails(r) > 0);
  const asks = cold.filter((r) => runHeldEmails(r) === 0);
  return {
    runs: [...looks, ...asks],
    held: cold.reduce((n, r) => n + runHeldEmails(r) + batchHeldEmails(r), 0),
    // What an OK would send: a waiting batch's emails, less those its check holds, which an OK sends none of.
    asks: asks.reduce((n, r) => n + Math.max(0, (r.recipient_count ?? 0) - batchHeldEmails(r)), 0),
    from: new Set(cold.map((r) => reachOutRootOf(r.audience) ?? r.id)).size,
  };
}

/**
 * The rows, in the order the runs wait: To send first (the list the owner works down), then each run, cold email's one
 * row where two or more of its runs wait and a customer campaign's runs waiting for an OK one row where two or more do,
 * each at the place of its first; then those too late to approve. `toSendOpen` is whether To send is open where the rows
 * are drawn.
 */
export function waitRowsOf<R extends RowRun>(
  waiting: readonly R[],
  late: readonly R[] = [],
  toSendOpen = false,
): WaitRowOf<R>[] {
  const toSend = toSendOf(waiting, toSendOpen);
  const rest = waiting.filter((r) => !toSend || !toSend.runs.includes(r));
  const cold = coldEmailOf(rest);
  const inCold = (r: R) => !!cold && cold.runs.includes(r);
  // An OK alone sends these, and the run's screen walks them in turn (its queue: those waiting for an approval). A
  // customer campaign's alone: a cold email's run is opened and read first, and one alone is its own row.
  const asks = rest.filter((r) => r.state === "pending_approval" && !isReachOutRun(r.audience));
  const folded = asks.length > 1 ? asks : [];
  const rows: WaitRowOf<R>[] = toSend ? [{ kind: "to_send", ...toSend }] : [];
  let coldDrawn = false;
  for (const r of rest) {
    if (inCold(r)) {
      if (cold && !coldDrawn) rows.push({ kind: "cold_email", ...cold });
      coldDrawn = true;
    } else if (!folded.includes(r)) rows.push({ kind: "run", run: r, late: false });
    else if (r === folded[0]) rows.push({ kind: "approvals", runs: folded });
  }
  for (const r of late) rows.push({ kind: "run", run: r, late: true });
  return rows;
}

/** The first two by name, then how many more: "VIP color clients, Holiday gift cards and 1 more". */
const approvalsSentence = (names: readonly string[]) =>
  `${joinWords(names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names)}. Each one you answer opens the next.`;

/** Cold email's row in a sentence: what is held for a look, then what waits for an OK, and what happens to the rest. */
function coldEmailSentence(c: ColdEmailCount): string {
  const held = c.held > 0 ? `${c.held} held for a look.` : null;
  const asks = c.asks > 0 ? `${plural(c.asks, "email waits", "emails wait")} for your OK.` : null;
  // With nothing to OK, the rest is already going; with something, each answer opens the next, as the runs' row says.
  const tail = c.asks > 0 ? "Each one you answer opens the next." : "The rest go as planned.";
  return [held, asks, tail].filter(Boolean).join(" ");
}

/** The folded rows' words: how many wait for an OK, who they are, and that each answer opens the next. */
export const WAIT_ROW_WORDS = {
  /**
   * A run's row on Today on a phone, where it opens to be answered (a reach-out's, a run of several): what you do there, not
   * where it goes (his look on a phone, 29 Oct 2026). Open stays the desk's, and a run too late to approve still opens.
   */
  review: "Review",
  /** A batch waiting for an OK that holds emails an OK does not send: each is decided on the sequence's People. */
  decide: (n: number) => `Decide ${n}`,
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
  /** Cold email's one row (decision 0120, D8): every sequence to leads that waits on its owner, said once. */
  cold: {
    name: "Cold email",
    meta: (from: number) => plural(from, "sequence", "sequences"),
    sentence: coldEmailSentence,
    /** Under the row: what kind of wait it holds, the held one first, as the row opens on it. */
    status: (c: ColdEmailCount) => [c.held > 0 ? "Held for a look" : RUN_WAITING_WORDS],
    open: "Look",
    /** Today's brief, saying the row once: "Cold email is waiting for you: 2 held for a look. …". */
    brief: (c: ColdEmailCount) => ({
      label: "Cold email",
      waits: "waiting for you",
      sentence: coldEmailSentence(c),
    }),
  },
} as const;
