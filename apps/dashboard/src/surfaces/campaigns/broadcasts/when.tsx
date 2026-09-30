/**
 * When a send goes, in the words every receipt and the schedule box share (moved from legacy/pages/broadcasts.jsx,
 * decision 0015): the sentence for a receipt, the box that picks the time, and what the picked time means.
 */
import { pageClock } from "@/legacy-bridge/zone";

/** What a receipt says of its time: the server's answer to a send or an approve. */
interface WhenReceipt {
  scheduled_for?: string | null;
  moved_from?: string | null;
}

// When a send really goes, in one sentence for every receipt that has one. The
// server moves a send outside 9:00-20:59 by the business's clock to the next
// nine o'clock (moved_from set); an approve or a send says so, rather than
// "sending now" over a run that waits until morning.
export function bcWhenWords(d: WhenReceipt | null | undefined): string {
  const C = pageClock();
  const at = d && d.scheduled_for ? Date.parse(d.scheduled_for) : NaN;
  const when = Number.isNaN(at) ? null : C.when(at);
  if (d && d.moved_from && when) return `scheduled for ${when} — messages go out ${C.hours.between} by your clock`;
  if (when && at - Date.now() > 60_000) return `scheduled for ${when}`;
  return "sending now";
}

interface BcWhenBoxProps {
  at: number | null;
  maxDays: number;
  onChange: (at: number | null) => void;
}

// The schedule box, by the business's clock (pageClock): 22:30 in the box is half past ten where the
// business is, whatever the device's zone. It holds the instant, so what is sent is what the note says, and
// it stops at now and at the ceiling the route keeps.
export function BcWhenBox({ at, maxDays, onChange }: BcWhenBoxProps) {
  const C = pageClock();
  const now = Date.now();
  return (
    <input
      className="bc-subject"
      type="datetime-local"
      value={at === null ? "" : C.inputValue(at)}
      min={C.inputValue(now)}
      max={C.inputValue(now + maxDays * 86_400_000)}
      onChange={(e) => onChange(C.fromInput(e.target.value))}
      aria-label={`When, by ${C.city()} time`}
      aria-describedby="bc-when-note"
      data-testid="bc-when"
    />
  );
}

/** What the box's time means: whether Send can go, in which tone, and the sentence. */
interface WhenNote {
  ok: boolean;
  tone: string;
  words: string;
}

// What the box's time means before Schedule is pressed: when the send really goes, a time outside
// 9:00-20:59 moved to the next nine o'clock as the route will move it, and a time that has passed or is
// past the ceiling refused here rather than after the click.
export function bcWhenNote(at: number | null, maxDays: number): WhenNote {
  const C = pageClock();
  const city = C.city();
  const now = Date.now();
  if (at === null) return { ok: false, tone: "", words: `By ${city} time · within ${maxDays} days` };
  if (at <= now) return { ok: false, tone: "warn", words: "That time has passed — pick a later one, or Send now" };
  const open = C.nextOpen(at);
  if (open.at > now + maxDays * 86_400_000)
    return { ok: false, tone: "warn", words: `Pick a time within ${maxDays} days` };
  return open.moved
    ? { ok: true, tone: "", words: `Goes out ${C.when(open.at)}, ${city} time — sends wait for ${C.hours.range}` }
    : { ok: true, tone: "", words: `Goes out ${C.when(at)}, ${city} time` };
}
