/**
 * A list that changes under one view (the Inbox's bucket, Conversations' channel, People's list) answers the press with a short rise
 * and fade of its rows, so the change reads as the same list answering and never as a page refreshing: the rows were
 * swapped between two frames, a hard cut (measured: no request, 10 to 110 ms to the new rows, nothing to say that the
 * list had heard). It is the web animations API on the list's own element, one run per change, cancelled by the next:
 * no class to add and take away, and no remount, so the list keeps its scroll box and its focus.
 *
 * Not on the draw that makes the list (the page's own arrival has its fade, components.css), and not under reduced
 * motion. `key` is what the list is of: the animation runs when it changes.
 */
import { useEffect, useRef } from "react";

/** The rise: how far the rows start under their place, and how long they take, on the house's ease-out. */
const RISE_PX = 6;
const RISE_MS = 180;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/** The ref for the list's element: its rows swap in with a rise whenever `key` changes after the first draw. */
export function useSwapMotion<T extends HTMLElement = HTMLDivElement>(key: string) {
  const list = useRef<T | null>(null);
  const was = useRef(key);
  useEffect(() => {
    if (was.current === key) return;
    was.current = key;
    const el = list.current;
    if (!el || typeof el.animate !== "function") return;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      [
        { opacity: 0.4, transform: `translateY(${RISE_PX}px)` },
        { opacity: 1, transform: "none" },
      ],
      { duration: RISE_MS, easing: EASE_OUT },
    );
  }, [key]);
  return list;
}
