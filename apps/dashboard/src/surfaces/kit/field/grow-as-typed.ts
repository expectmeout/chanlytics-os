/**
 * Where the browser cannot size a box by its words (kit.css .rec-input-words, `field-sizing`), the box grows as they are
 * typed, so nothing scrolls inside it. The box of sentences said in place (Field `shape="words"`) takes this beside it.
 */
import { useLayoutEffect, type RefObject } from "react";

export function useGrowAsTyped(box: RefObject<HTMLTextAreaElement | null>, text: string): void {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof CSS === "undefined" || CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [box, text]);
}
