/**
 * A desk's peek leaves as a side sheet does (components.css, the peek's `[data-leaving]`: side-out), where it went in a
 * single frame and the table took its room back under it. A peek is drawn by one of two asides, the person or the deal
 * read or the pane held while it lands, so the ref is the asides' and the leaving is their mount's: it plays as the peek
 * closes, never as one aside gives way to the other while J and K step. A phone's peek is the kit's sheet, which leaves
 * by its own. Where the page goes with it (Open the full page, a scope's tab), the view deck plays the page out with the
 * peek still in it, so the peek's own copy is played only once the commit shows its rows still on screen: it was a second
 * peek, half as tall (27 Oct 2026, on production).
 */
import { useLayoutEffect, useRef } from "react";
import { leaveLater } from "../../kit/motion/leaving";

/** Where a peek stands beside the rows rather than over them as a sheet. */
const DESK_QUERY = "(width > 900px)";
/** A peek shown for less than this was never seen, and does not leave (a development check's mount and unmount). */
const SEEN_MS = 60;

const onDesk = (): boolean => typeof window.matchMedia === "function" && window.matchMedia(DESK_QUERY).matches;

/** The ref each of a peek's asides takes; its mount calls it once, for the peek's life. */
export function usePeekLeaves(): (el: HTMLElement | null) => void {
  const last = useRef<HTMLElement | null>(null);
  const since = useRef(0);
  useLayoutEffect(() => {
    since.current = Date.now();
    // Run as the mount goes, before React takes its aside out of the page: the aside still stands to be copied.
    return () => {
      const el = last.current;
      if (!el || !el.isConnected || !onDesk() || Date.now() - since.current <= SEEN_MS) return;
      const rows = el.parentElement;
      const play = leaveLater(el);
      // The commit is over by then: rows React took away are out of the document, and rows it keeps for Back are hidden.
      if (play && rows)
        queueMicrotask(() => (rows.isConnected && rows.getClientRects().length > 0 ? play() : undefined));
    };
  }, []);
  const hold = useRef((el: HTMLElement | null) => {
    if (el) last.current = el;
  });
  return hold.current;
}
