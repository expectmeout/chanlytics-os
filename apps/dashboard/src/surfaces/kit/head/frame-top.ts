/**
 * The frame's top on a phone (app-shell.jsx `.frame-top`: the date, the bell, a call, the shell's status, a pane's name and
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
  const sized = new ResizeObserver(size);
  sized.observe(top);
  under();
  size();
  return () => {
    window.removeEventListener("scroll", under);
    sized.disconnect();
  };
}
