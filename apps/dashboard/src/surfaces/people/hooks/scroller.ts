/**
 * The box that scrolls (moved from legacy/pages/people.jsx ldScroller, decision 0015): on a desktop the table's own
 * (pl-table-scroll), on a phone the pane itself.
 */
export const ldScroller = (pane: HTMLElement | null): HTMLElement | null => {
  if (!pane) return null;
  const inner = pane.querySelector?.<HTMLElement>(".pl-table-scroll");
  return inner && inner.scrollHeight > inner.clientHeight ? inner : pane;
};
