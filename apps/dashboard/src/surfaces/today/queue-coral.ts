/**
 * Who holds Today's coral, as the canvas walks it (Today in three zones, 2 Nov 2026; the Moments board: "the open row,
 * else the first that waits, else To do, else setting up, else Ask found's first act"): Need you's open row, else its
 * first waiting (zones/need-you.tsx `oneCoral`); else To do's first act, on a desk and a phone alike (zones/to-do.tsx),
 * and where To do draws nothing, Older's Mark all done, told as the queue's; else the setup card's first act
 * (zones/setup-card-body.tsx); else Ask found's first act, where it leads the page (zones/found.tsx). One coral a screen.
 * Each holder says it as it draws and hears only those before it in the walk, never itself: a holder that heard its own
 * hold would go quiet, let go, and flicker.
 *
 * Need you and Ask found say here too whether they draw at all, which the page lays its columns by (zones/page.tsx): where
 * Need you draws no pane, Ask found leads the work's column, whatever came in today; where neither draws, the day stands
 * alone.
 */
import { useEffect, useState } from "react";

/** What may hold the coral, in the walk's order: Need you (Older's row with it), To do, the setup card. */
type CoralHolder = "queue" | "todo" | "setup";

/** The walk, in its order: a holder hears those before it. */
const WALK: readonly CoralHolder[] = ["queue", "todo", "setup"];

const holders = new Set<CoralHolder>();
const hearing = new Set<() => void>();

/** A zone the page lays out by: Need you's pane (its groups, or the calls it could not read), Ask found's rows. */
type Zone = "need-you" | "found";

/** The zones drawing now. */
const drawing = new Set<Zone>();

/** A holder or a zone changed: every hearer reads the walk again. */
const walkChanged = () => {
  for (const hear of hearing) hear();
};

/** A holder drew (or let go of) the coral. */
export function holdsCoral(who: CoralHolder, on: boolean): void {
  if (on === holders.has(who)) return;
  if (on) holders.add(who);
  else holders.delete(who);
  walkChanged();
}

/** The queue drew (or let go of) the coral. */
export function queueHoldsCoral(on: boolean): void {
  holdsCoral("queue", on);
}

/** A zone drew, or drew nothing (zones/need-you.tsx and zones/found.tsx, each as it draws). */
export function zoneDrawn(zone: Zone, on: boolean): void {
  if (on === drawing.has(zone)) return;
  if (on) drawing.add(zone);
  else drawing.delete(zone);
  walkChanged();
}

/** A fact of the walk, read now and again whenever a holder or Need you tells. */
function useHeard(now: () => boolean, key: string): boolean {
  const [on, setOn] = useState(now);
  useEffect(() => {
    const hear = () => setOn(now());
    hearing.add(hear);
    hear();
    return () => {
      hearing.delete(hear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` reads what `key` names, the one thing it hangs on
  }, [key]);
  return on;
}

/** Whether `who` holds the coral now (any holder, unnamed), redrawn when that changes. */
export function useCoralHeld(who?: CoralHolder): boolean {
  return useHeard(() => (who ? holders.has(who) : holders.size > 0), who ?? "any");
}

/** Whether a holder before `who` in the walk holds the coral now (`found`: any of them), so `who` draws its act quiet. */
export function useCoralAhead(who: CoralHolder | "found"): boolean {
  const ahead = who === "found" ? WALK : WALK.slice(0, WALK.indexOf(who));
  return useHeard(() => ahead.some((h) => holders.has(h)), `ahead:${who}`);
}

/** Whether anything before the setup card holds the coral now: the card is then the quiet kind. */
export function useQueueHoldsCoral(): boolean {
  return useCoralAhead("setup");
}

/** Whether a zone draws now: where Need you draws no pane, Ask found leads the page. */
export function useZoneDrawn(zone: Zone): boolean {
  return useHeard(() => drawing.has(zone), `drawn:${zone}`);
}
