/**
 * How much of a thread is drawn (8 Oct 2026). A thread opens at its newest message, so a long one draws its newest
 * entries only, and the ones before them as its top is scrolled near, as People's table draws its rows
 * (people/table/row-window.ts). One person's 44 calls and 15 messages were 1,086 elements built before the first of them
 * could be read, 0.38 s from the tap on a CPU slowed four times, for a screen that shows five.
 *
 * The window is counted from the end and only ever grows: an entry that arrives is drawn after it, and nothing drawn is
 * taken away. Where a thread is opened at a message (a call, from Conversations), the window starts before that message.
 * The entries drawn above what is on screen push it down, so the entry that stood first is put back where it stood
 * before the browser paints: Safari anchors no scroll of its own. A seeded thread, and a browser that cannot watch an
 * element, draw it all.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Thread } from "../types";

/** How many of a thread's newest entries are drawn as it opens. */
const IX_DRAWN_FIRST = 30;
/** And how many more each time the top of what is drawn comes near. */
const IX_DRAWN_STEP = 30;
/** How near: within this of the scroller's top, as the People table's foot is watched. */
const IX_EARLIER_NEAR = "800px 0px 0px 0px";
/** How many entries before the message a thread was opened at are drawn with it. */
const IX_BEFORE_FOCUS = 3;

/** Where a thread's drawing starts as it opens: its newest entries, and back to the message it was opened at. */
const ixDrawnFrom = (thread: Thread, focusMessageId: string | null): number => {
  if (!thread.real || typeof IntersectionObserver !== "function") return 0;
  const from = Math.max(0, thread.timeline.length - IX_DRAWN_FIRST);
  if (!focusMessageId) return from;
  const at = thread.timeline.findIndex((e) => e.type === "msg" && e.messageId === focusMessageId);
  return at < 0 ? from : Math.min(from, Math.max(0, at - IX_BEFORE_FOCUS));
};

/**
 * The index a thread is drawn from, and the mark that stands before its first drawn entry while earlier ones wait
 * (`moreRef`, drawn only while `from` is over zero). `scrollRef` is the pane's scroller.
 */
export function useEarlierAsScrolled(
  thread: Thread | null,
  focusMessageId: string | null,
  scrollRef: RefObject<HTMLDivElement | null>,
): { from: number; moreRef: RefObject<HTMLDivElement | null> } {
  const id = thread ? thread.id : null;
  const [drawn, setDrawn] = useState(() => ({ id, from: thread ? ixDrawnFrom(thread, focusMessageId) : 0 }));
  // The window kept is this thread's; a pane handed another thread starts that one's own.
  const kept = drawn.id === id ? drawn.from : thread ? ixDrawnFrom(thread, focusMessageId) : 0;
  const from = thread ? Math.min(kept, thread.timeline.length) : 0;
  const moreRef = useRef<HTMLDivElement | null>(null);
  // The first entry drawn when earlier ones were asked for, and where it stood on the screen.
  const stood = useRef<{ entry: Element; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const was = stood.current;
    stood.current = null;
    if (!el || !was || !was.entry.isConnected) return;
    // Measured, not reckoned from the height added: a browser that anchors its own scroll (Chromium, Firefox) has put
    // the entry back already and the difference is nothing, where a second correction would throw it a screen away.
    el.scrollTop += was.entry.getBoundingClientRect().top - was.top;
  }, [from, scrollRef]);
  useEffect(() => {
    const el = scrollRef.current;
    const more = moreRef.current;
    if (from <= 0 || !el || !more || typeof IntersectionObserver !== "function") return undefined;
    const watch = new IntersectionObserver(
      (seen) => {
        if (!seen.some((s) => s.isIntersecting)) return;
        const first = more.nextElementSibling;
        stood.current = first ? { entry: first, top: first.getBoundingClientRect().top } : null;
        setDrawn({ id, from: Math.max(0, from - IX_DRAWN_STEP) });
      },
      { root: el, rootMargin: IX_EARLIER_NEAR },
    );
    watch.observe(more);
    return () => watch.disconnect();
  }, [from, id, scrollRef]);
  return { from, moreRef };
}
