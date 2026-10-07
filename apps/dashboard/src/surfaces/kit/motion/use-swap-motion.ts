/**
 * A list that changes under one view (the Inbox's bucket, Conversations' channel, People's list) answers the press with a short rise
 * and fade of its rows, so the change reads as the same list answering and never as a page refreshing: the rows were
 * swapped between two frames, a hard cut (measured: no request, 10 to 110 ms to the new rows, nothing to say that the
 * list had heard). It is the web animations API on the list's own element, one run per change, cancelled by the next:
 * no class to add and take away, and no remount, so the list keeps its scroll box and its focus.
 *
 * Not on the draw that makes the list (the page's own arrival has its fade, components.css), and not under reduced
 * motion. `key` is what the list is of: the animation runs when it changes. `parts`: where a list is drawn in parts
 * under its element (the Pipeline's groups, a `<tbody>` each), the parts rise and the element itself (the table, with
 * its heads) holds still.
 */
import { useEffect, useRef } from "react";

/** The rise: how far the rows start under their place, and how long they take, on the house's ease-out. */
const RISE_PX = 6;
const RISE_MS = 180;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** What `swapRise` moves: an element that animates, or one whose parts do. */
interface Swapping {
  animate?: Element["animate"];
  getAnimations?: Element["getAnimations"];
  querySelectorAll?(
    selector: string,
  ): ArrayLike<{ animate?: Element["animate"]; getAnimations?: Element["getAnimations"] }>;
}

/** The rise on a list's element, or on each of its `parts`, the last run cancelled first. Answers how many moved. */
export function swapRise(el: Swapping, parts: string | null = null): number {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  const them = parts && el.querySelectorAll ? Array.from(el.querySelectorAll(parts)) : [el];
  let moved = 0;
  for (const it of them) {
    if (typeof it.animate !== "function") continue;
    it.getAnimations?.().forEach((a) => a.cancel());
    it.animate(
      [
        { opacity: 0.4, transform: `translateY(${RISE_PX}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: RISE_MS, easing: EASE_OUT },
    );
    moved += 1;
  }
  return moved;
}

/** The ref for the list's element: its rows swap in with a rise whenever `key` changes after the first draw. */
export function useSwapMotion<T extends HTMLElement = HTMLDivElement>(key: string, parts: string | null = null) {
  const list = useRef<T | null>(null);
  const was = useRef(key);
  useEffect(() => {
    if (was.current === key) return;
    was.current = key;
    if (list.current) swapRise(list.current, parts);
  }, [key, parts]);
  return list;
}
