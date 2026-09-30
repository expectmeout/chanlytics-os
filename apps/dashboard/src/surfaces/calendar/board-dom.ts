/**
 * What the board asks of the browser (moved from legacy/pages/calendar.jsx, decision 0015): whether the screen is a phone's,
 * whether a field has the keys, and the date field's picker.
 */
import type { SyntheticEvent } from "react";

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

/**
 * The range opens the browser's own date picker: a click on a date field only focuses its first number. A touch opens the
 * picker by itself, and a browser that will not open it still takes a typed date.
 */
export const crOpenPicker = (e: SyntheticEvent<HTMLInputElement>): void => {
  const el = e.currentTarget;
  if (!el || typeof el.showPicker !== "function") return;
  if (e.type === "click" && window.matchMedia && !window.matchMedia("(pointer: fine)").matches) return;
  try {
    el.showPicker();
  } catch {
    /* not allowed here; the field still takes a typed date */
  }
};
