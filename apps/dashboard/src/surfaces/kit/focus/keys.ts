/**
 * Keys on a control (moved from legacy/components/data-bits.jsx, the one-system plan's step 2).
 *
 * A span or div drawn as a control is a button to a keyboard with role="button", a tab stop and keyPress(fn) as its
 * onKeyDown: Enter and Space, pressed on the element itself and never typed in a field inside it. A real button is better
 * where one fits.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** Enter and Space on the element itself, as a press. */
export const keyPress =
  (fn: (e: ReactKeyboardEvent<HTMLElement>) => void) =>
  (e: ReactKeyboardEvent<HTMLElement>): void => {
    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
      e.preventDefault();
      fn(e);
    }
  };
