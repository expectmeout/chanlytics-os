/**
 * What the board asks of the browser (moved from legacy/pages/calendar.jsx, decision 0015): whether the screen is a phone's
 * and whether a field has the keys. The date picker is the kit's (kit/datepicker), not the browser's.
 */

/** A phone opens on the agenda: a week grid is four times a phone's width. */
export const crPhone = (): boolean => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

/** Whether a field has the keys: the board's arrows and T are not the board's while a person is typing. */
export const crTyping = (): boolean => {
  const el = document.activeElement;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      (el as HTMLElement).isContentEditable)
  );
};
