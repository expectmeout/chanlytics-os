/**
 * When a send really goes, in one sentence for every receipt that has one (moved from when.tsx, which draws the picker):
 * words alone, so Today's receipts and the shell that publishes them (campaigns/globals.ts) carry no picker.
 */
import { MIN_MS } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";

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
