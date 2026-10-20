/**
 * Keys on a control (moved from legacy/components/data-bits.jsx, the one-system plan's step 2).
 *
 * A span or div drawn as a control is a button to a keyboard with role="button", a tab stop and keyPress(fn) as its
 * onKeyDown: Enter and Space, pressed on the element itself and never typed in a field inside it. A real button is better
 * where one fits. useHotkey is the shared hotkey hook: suppress-while-typing is handled here, and matcher(e, typing) ->
 * true means preventDefault + handler(e).
 */
import { useEffect } from "react";
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

/** A key the page answers to, everywhere it is on screen, except while a field is being typed in (`typing`). */
export const useHotkey = (
  matcher: (e: KeyboardEvent, typing: boolean) => boolean,
  handler: (e: KeyboardEvent) => void,
): void => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = (target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || target.isContentEditable;
      if (matcher(e, typing)) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
};
