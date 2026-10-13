/**
 * When a send really goes, in one sentence for every receipt that has one (moved from when.tsx, which draws the picker):
 * words alone, so Today's receipts and the shell that publishes them (campaigns/globals.ts) carry no picker.
 */
import { MIN_MS, runApprovalRefusal, runDaysAt, waitingRunOffer } from "@chanlytics/contracts";
import type { WaitingRunOffer } from "@chanlytics/contracts";
import { pageClock, type PageClock } from "@/legacy-bridge/zone";

/** A waiting run as the approve verb reads it: whose it is, the day it was made for, and its moment. */
interface WaitingRun {
  playbook_id: string | null;
  run_for?: string | null;
  audience?: unknown;
}

/**
 * The business's day now and the day of the next open sending moment, in its words: what the verb asks by (contracts
 * runDaysAt, the one derivation the verb, the count and the sweep read), by the page's clock. The clock is asked only when
 * this is called, so a count with no runs to judge never asks it (a test with no window has none).
 */
export function approvalDaysNow(nowMs: number = Date.now(), clock: PageClock = pageClock()) {
  return { ...runDaysAt(clock.zone(), new Date(nowMs)), say: clock.dayWords };
}

/**
 * Why a waiting run cannot be approved now, in the verb's own sentence, or null: its day has passed, or it is a visit's
 * run an approval now would send on a later day (contracts runApprovalRefusal, THE predicate approveRun refuses by),
 * asked by the business's clock. For every Approve outside the run's sheet (Today's row, a run's card, a playbook's
 * card), which offered the button over a run the route then refused with a 409: the sheet alone asked (toApprovalVM).
 */
export function bcLateWords(run: WaitingRun): string | null {
  return runApprovalRefusal(run, approvalDaysNow());
}

/**
 * What a waiting run's row may offer outside its sheet (contracts waitingRunOffer, THE reading), asked by the business's
 * clock as bcLateWords asks: approve it, skip it alone with the verb's sentence for why (its day has passed, or the
 * workspace is paused: `at.paused`), or open it (a reach-out's run, or one whose playbook the page does not hold:
 * `at.known`). A playbook's card reads it here; Coming up's line reads the same rule in contracts (lifecycle-tiles.ts).
 */
export function bcRunOffer(run: WaitingRun, at: { paused: boolean; known: boolean }): WaitingRunOffer {
  return waitingRunOffer(run, approvalDaysNow(), at);
}

/**
 * Whether a waiting run is decided on its sheet alone, never from a row (the offer's `open`): a reach-out's run, whose
 * sheet counts and names each first cold email with its check. For the runs Sent lists, whose sheet is a press away, so
 * `known` is true: the row asks the rule the way Today's row does, and a Sent row, a Today row and the ledger's door
 * agree. The pause is the row's own business (Approve under a pause is refused in its words), so it is not asked here.
 */
export function bcOpensOnItsSheet(run: WaitingRun): boolean {
  return bcRunOffer(run, { paused: false, known: true }).kind === "open";
}

/** What a receipt says of its time: the server's answer to a send or an approve. */
interface WhenReceipt {
  scheduled_for?: string | null;
  moved_from?: string | null;
}

// The server moves a send outside 9:00-20:59 by the business's clock to the next nine o'clock (moved_from set); an
// approve or a send says so, rather than "sending now" over a run that waits until morning.
export function bcWhenWords(d: WhenReceipt | null | undefined): string {
  const C = pageClock();
  const at = d && d.scheduled_for ? Date.parse(d.scheduled_for) : NaN;
  const when = Number.isNaN(at) ? null : C.when(at);
  if (d && d.moved_from && when) return `scheduled for ${when} — messages go out ${C.hours.between} by your clock`;
  if (when && at - Date.now() > MIN_MS) return `scheduled for ${when}`;
  return "sending now";
}
