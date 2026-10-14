/**
 * When a reach-out's open parts are read again (the wiring's second audit, X2-1 and W-campaign-run-template-reachout-8): the
 * Leads door's count, the sheet's, the lines under each lead's stage and the lead's story in the peek, and a chain's report
 * open on Campaigns. None is a surface: each is read as it opens, about one search, one lead or one chain, and was then kept
 * as it was read (a count for as long as the tab lived, a line on "sent" after the business wrote back).
 *
 * They follow the surfaces that hear what moves them, which publish each read: Leads (a lead's stage, a run's leads) and the
 * reach-outs (a reply read or undone, a run made, approved or sent, a chain paused). A part is read again at most once in a
 * window, and once more as the window ends for whatever was heard inside it, so the last change of a burst is read too.
 */
import { useEffect, useReducer, useRef } from "react";

/** The surfaces whose reads move a reach-out's open parts: Leads', and the reach-outs' own. */
const REACH_OUT_MOVES: readonly string[] = ["surface:leads", "surface:reach_outs"];

/** An open part is read again at most this often: Leads is read on every batch of a lead run. */
const READ_AGAIN_MS = 30_000;

/**
 * A count that moves when one of those surfaces publishes a read: at once when the part was last read a window ago, else once
 * as the window ends, however many were heard inside it. The window starts as the part opens on `subject` (what it is about: a
 * search, a lead, a chain), which its caller reads then, so a part just read is not read again for the first notice after
 * it. Nothing is heard while `subject` is null. The caller reads on the count.
 */
export function useReadAgain(subject: string | null): number {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const readAt = useRef(0);
  useEffect(() => {
    if (subject === null) return undefined;
    readAt.current = Date.now();
    let waiting: ReturnType<typeof setTimeout> | null = null;
    const again = () => {
      readAt.current = Date.now();
      bump();
    };
    const heard = () => {
      if (waiting !== null) return;
      const wait = readAt.current + READ_AGAIN_MS - Date.now();
      if (wait <= 0) again();
      else
        waiting = setTimeout(() => {
          waiting = null;
          again();
        }, wait);
    };
    for (const name of REACH_OUT_MOVES) window.addEventListener(name, heard);
    return () => {
      for (const name of REACH_OUT_MOVES) window.removeEventListener(name, heard);
      if (waiting !== null) clearTimeout(waiting);
    };
  }, [subject]);
  return tick;
}
