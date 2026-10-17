/**
 * The frame's top on a phone (app-shell.jsx `.frame-top`: the date, the bell, a call, the shell's status, a pane's name and
 * strip), which stands fixed over the page as the window scrolls it (mobile.css, "The window scrolls"). Its height is
 * what the stylesheet cannot know, so it is measured here into `--frame-top` on the document: the column starts that
 * far down under it, Settings' strip sticks that far down, and the document's scroll stops that far under the window's
 * top when it brings something into view (scroll-padding: a row the arrows reach, a field that takes focus, a pane that
 * arrives). On a desk the top is no box (display: contents) and measures 0. Answers how to stop watching.
 */
export function watchFrameTop(top: HTMLElement): () => void {
  const doc = document.documentElement;
  const size = () => doc.style.setProperty("--frame-top", `${top.offsetHeight}px`);
  const sized = new ResizeObserver(size);
  sized.observe(top);
  size();
  return () => sized.disconnect();
}
