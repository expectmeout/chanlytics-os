/**
 * When a send really goes, in one sentence for every receipt that has one (moved from when.tsx, which draws the picker):
 * words alone, so Today's receipts and the shell that publishes them (campaigns/globals.ts) carry no picker.
 */
import { MIN_MS, runApprovalRefusal } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";

/**
 * Why a waiting run cannot be approved now, in the verb's own sentence, or null: its day has passed, or it is a visit's
 * run an approval now would send on a later day (contracts runApprovalRefusal, THE predicate approveRun refuses by),
 * asked by the business's clock. For every Approve outside the run's sheet (Today's row, a run's card, a playbook's
 * card), which offered the button over a run the route then refused with a 409: the sheet alone asked (toApprovalVM).
 */
export function bcLateWords(run: {
  playbook_id: string | null;
  run_for?: string | null;
  audience?: unknown;
}): string | null {
  const C = pageClock();
  const now = Date.now();
  return runApprovalRefusal(run, { today: C.dayKey(now), sendsOn: C.dayKey(C.nextOpen(now).at), say: C.dayWords });
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
