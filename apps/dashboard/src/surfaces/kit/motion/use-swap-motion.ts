/**
 * A list that changes under one view (the Inbox's bucket, Conversations' channel, People's list) answers the press with a short fade
 * of its rows where they stand, so the change reads as the same list answering and never as a page refreshing: the rows
 * were swapped between two frames, a hard cut (measured: no request, 10 to 110 ms to the new rows, nothing to say that
 * the list had heard). The rows rose 6px as they faded, and on a phone the table read as shifting under the press (Ruben,
 * 23 Oct 2026). It is the web animations API on the list's own element, one run per change, cancelled by the next: no
 * class to add and take away, and no remount, so the list keeps its scroll box and its focus.
 *
 * Not on the draw that makes the list (its rows fade in on their own, use-rows-arrive.ts), and not under reduced motion.
 * `key` is what the list is of: the animation runs when it changes. `parts`: where a list is drawn in parts under its
 * element (the Pipeline's groups, a `<tbody>` each), the parts fade and the element itself (the table, with its heads)
 * holds still.
 */
import { useEffect, useRef } from "react";

/** The fade: from how faint the rows start, and how long they take, on the house's ease-out. */
const FAINT = 0.4;
const FADE_MS = 180;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** What `swapFade` fades: an element that animates, or one whose parts do. */
interface Swapping {
  animate?: Element["animate"];
  getAnimations?: Element["getAnimations"];
  querySelectorAll?(
    selector: string,
  ): ArrayLike<{ animate?: Element["animate"]; getAnimations?: Element["getAnimations"] }>;
}

/** The fade on a list's element, or on each of its `parts`, the last run cancelled first. Answers how many faded. */
export function swapFade(el: Swapping, parts: string | null = null): number {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  const them = parts && el.querySelectorAll ? Array.from(el.querySelectorAll(parts)) : [el];
  let faded = 0;
  for (const it of them) {
    if (typeof it.animate !== "function") continue;
    it.getAnimations?.().forEach((a) => a.cancel());
    it.animate([{ opacity: FAINT }, { opacity: 1 }], { duration: FADE_MS, easing: EASE_OUT });
    faded += 1;
  }
  return faded;
}

/** The ref for the list's element: its rows swap in with a fade whenever `key` changes after the first draw. */
export function useSwapMotion<T extends HTMLElement = HTMLDivElement>(key: string, parts: string | null = null) {
  const list = useRef<T | null>(null);
  const was = useRef(key);
  useEffect(() => {
    if (was.current === key) return;
    was.current = key;
    if (list.current) swapFade(list.current, parts);
  }, [key, parts]);
  return list;
}
