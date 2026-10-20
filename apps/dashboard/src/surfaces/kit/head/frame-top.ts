/** The tops watched now, each with the measure that sets its height. */
const watched = new Map<HTMLElement, () => void>();
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
  watched.set(top, size);
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
  for (const size of watched.values()) size();
}

/** The tops watched now: what a list put back where it stood keeps its row under (kit/motion/held-list.ts). */
export function frameTopsWatched(): HTMLElement[] {
  return [...watched.keys()];
}

/**
 * The top's height held where it is (`on`), whatever the top draws, until it is let go and measured again: while a thumb
 * carries a row's page back, the frame draws its chrome again under that page (kit motion/held-list.ts showHeld), and the
 * page, which starts under the top, would have moved down by all of it under the finger. Only a measure asked for by name
 * (measureFrameTop) is taken while it is held.
 */
export function holdFrameTop(on: boolean): void {
  if (heightHeld === on) return;
  // Held at the height it is drawn at now: a page pushed in drew its own head in the draw that held it.
  measureFrameTop();
  heightHeld = on;
}
