/** A desk page's own scroller, under the top bar or its strip: the frame's, a report's, a Settings pane's, a person's. */
const DESK_SCROLLERS = ".main-scroll, .rpt, .set-pane, .cl-profile";

/**
 * On a desk the window never scrolls; a page scrolls in its own box under the top bar (Today) or its strip (Reports,
 * Settings), and what passed under its top edge was cut there, a card's title halved. A box that has moved wears
 * `data-scrolled`, and its edge fades (components.css): only then, since a fade is a mask, and a mask makes the box a
 * backdrop root, so the glass in a page at rest (every page's panes and capsules) reads the page as it always did. One
 * listener for the document's life, on scrolls caught on their way down. Answers how to stop.
 */
export function watchPageEdges(): () => void {
  const moved = (e: Event) => {
    const box = e.target;
    if (!(box instanceof HTMLElement) || !box.matches(DESK_SCROLLERS)) return;
    const now = box.scrollTop > 0;
    if (now !== box.hasAttribute("data-scrolled")) box.toggleAttribute("data-scrolled", now);
  };
  document.addEventListener("scroll", moved, { capture: true, passive: true });
  return () => document.removeEventListener("scroll", moved, { capture: true });
}

/** The tops watched now, each with the measure that sets its height and the way to have its observer report it afresh. */
const watched = new Map<HTMLElement, { size: () => void; afresh: () => void }>();
/** Whether the top's height is held where it is (holdFrameTop). */
let heightHeld = false;

/**
 * The frame's top on a phone (frame/shell-chrome.tsx `.frame-top`: the date, the bell, a call, the shell's status, a pane's name and
 * strip), which stands fixed over the page as the window scrolls it (mobile.css, "The window scrolls"). Watched here for
 * two things the stylesheet cannot know:
 * - its height, as `--frame-top` on the document: the column starts that far down under it, Settings' strip sticks that
 *   far down, and the document's scroll stops that far under the window's top when it brings something into view
 *   (scroll-padding: a row the arrows reach, a field that takes focus, a pane that arrives);
 * - whether the page has gone under it (`data-under`): only then does its edge fade over what passes under it, so at
 *   rest the page under it is drawn whole.
 * On a desk the top is no box (display: contents) and the window never scrolls: it measures 0 and nothing goes under it.
 * Answers how to stop watching.
 */
export function watchFrameTop(top: HTMLElement): () => void {
  const doc = document.documentElement;
  const under = () => {
    const now = window.scrollY > 0;
    if (now !== top.hasAttribute("data-under")) top.toggleAttribute("data-under", now);
  };
  const size = () => doc.style.setProperty("--frame-top", `${top.offsetHeight}px`);
  window.addEventListener("scroll", under, { passive: true });
  const sized = new ResizeObserver(() => {
    if (!heightHeld) size();
  });
  sized.observe(top);
  under();
  size();
  // Watched anew, an observer reports the box's size as the frame is next laid out, changed or not (a second observe of the
  // same box is nothing in Chromium, so it is let go first).
  const afresh = () => {
    sized.unobserve(top);
    sized.observe(top);
  };
  watched.set(top, { size, afresh });
  return () => {
    window.removeEventListener("scroll", under);
    sized.disconnect();
    watched.delete(top);
  };
}

/**
 * The frame's top measured now, in the draw that changed it, rather than when its observer next reports: a page put back
 * where it stood under the top (kit motion/held-list.ts) is placed against the top's height as it will be painted, and
 * the observer's answer came after, a frame late, with the page a strip's height out.
 */
export function measureFrameTop(): void {
  for (const { size } of watched.values()) size();
}

/** The tops watched now: what a list put back where it stood keeps its row under (kit/motion/held-list.ts). */
export function frameTopsWatched(): HTMLElement[] {
  return [...watched.keys()];
}

/**
 * Whether the frame's top is drawn in the page's flow, no box of its own (display: contents: wider than a phone), rather
 * than standing over the page as a phone's does. There, what it draws takes the page's room: a list's head drawn again
 * under a row's page carried back (holdFrameTop holds only a top that stands over the page) moves the page by all of it.
 * Opening a person from People at 768 and 887 px wide, the page slid in under People's head and strip, 120 px down, and
 * moved up 76 px as it landed and the person's own head came back (production, 24 Nov 2026).
 */
export function frameTopInTheFlow(): boolean {
  for (const top of watched.keys()) if (top.getClientRects().length === 0) return true;
  return false;
}

/**
 * The top's height held where it is (`on`), whatever the top draws, until it is let go and measured again: while a thumb
 * carries a row's page back, the frame draws its chrome again under that page (kit motion/held-list.ts showHeld), and the
 * page, which starts under the top, would have moved down by all of it under the finger. Only a measure asked for by name
 * (measureFrameTop) is taken while it is held.
 *
 * Let go, it is measured by its observer as the frame is next laid out, never in the draw that lets it go: that draw takes
 * away the list's head drawn under the page a moment before the page's own comes back, and the top, measured between the
 * two, was 10 px; a person's page pushed in moved 34 px up as it landed and down again a frame later, and each height
 * written to the document restyles every box on the page (a slow phone, 24 Nov 2026: 43 to 66 ms a time).
 */
export function holdFrameTop(on: boolean): void {
  if (heightHeld === on) return;
  heightHeld = on;
  if (on) {
    // Held at the height it is drawn at now: a page pushed in drew its own head in the draw that held it.
    measureFrameTop();
    return;
  }
  // Its observer asked afresh: what it reported while the top was held was not written, and the top may stand now at the
  // size it last reported (a carry that lands on the list's head, a turn of the phone), which it would not report again.
  for (const { afresh } of watched.values()) afresh();
}
