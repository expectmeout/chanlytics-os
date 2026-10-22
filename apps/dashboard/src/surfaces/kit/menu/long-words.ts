import type { ReactNode } from "react";

/**
 * When an item's second line is a sentence and not a word (what the item will do, "Only places not already in your leads
 * count"): past this many letters it stands under the item's words, where beside them it took the line and squeezed the
 * words to nothing, one to a line (the Inbox's template picker, 21 Oct 2026). The kit's Menu at every width; the house's
 * MoreMenu on a phone (more-menu.tsx).
 */
const MENU_SHORT_WORDS = 20;

/** Whether a second line is a sentence, to be said under the words. */
export const longWords = (n: ReactNode) => typeof n === "string" && n.length > MENU_SHORT_WORDS;
