/**
 * The prompt sheet's words: how much of everything the receptionist reads one block is, the whole prompt's
 * length, who reads it, and what is sent beside it.
 */
import { count } from "./counts";

/**
 * How much of everything the receptionist reads one block of its prompt is: "a quarter of everything it reads". `chars`
 * is the block's own share of the prompt (PromptBlockVM.chars) and `total` the whole prompt's length, on one channel.
 * Rough on purpose, the nearest of a few named shares, and "about" when even the nearest is some way off: a
 * percentage would be a number nobody reads. Null when there is no block, or no prompt, to measure.
 *
 * The shares are inside the function: a table at the top of the module was kept, whole, in each of the four dists
 * that bundle contracts and never call this.
 */
export function blockShareWords(chars: number, total: number): string | null {
  const SHARES: ReadonlyArray<readonly [number, string]> = [
    [1 / 10, "a tenth"],
    [1 / 5, "a fifth"],
    [1 / 4, "a quarter"],
    [1 / 3, "a third"],
    [2 / 5, "two fifths"],
    [1 / 2, "half"],
    [3 / 5, "three fifths"],
    [2 / 3, "two thirds"],
    [3 / 4, "three quarters"],
    [4 / 5, "four fifths"],
    [9 / 10, "nine tenths"],
  ];
  if (!(typeof chars === "number" && chars > 0) || !(typeof total === "number" && total > 0)) return null;
  const f = Math.min(1, chars / total);
  if (f >= 0.95) return "nearly everything it reads";
  if (f < 0.075) return "less than a tenth of everything it reads";
  const [share, words] = SHARES.reduce((best, s) => (Math.abs(s[0] - f) < Math.abs(best[0] - f) ? s : best));
  return `${Math.abs(share - f) > 0.03 ? "about " : ""}${words} of everything it reads`;
}

/**
 * What one block of the prompt costs, whole: "1,190 characters — a quarter of everything it reads." The prompt sheet
 * draws a block's cost as its share and nothing else (the owner's rule, 22 Sep: a count is technical data), and this
 * sentence is where the exact count still lives: the accessible description, and the tip, of the entry that draws the
 * share. One sentence for both, so the count and the share cannot disagree.
 */
export function promptCostWords(chars: number, total: number): string {
  const share = blockShareWords(chars, total);
  return `${count(chars)} characters${share ? ` — ${share}` : ""}.`;
}

/** The whole prompt's length, for the prompt sheet's contents to be described by: "4,345 characters in all." */
export function promptTotalWords(total: number): string {
  return `${count(total)} ${total === 1 ? "character" : "characters"} in all.`;
}

/**
 * Who reads the composed prompt, and how often, one phrase per channel: the told section at rest and the prompt
 * sheet's head. It was typed in the page (settings.jsx's PROMPT_READERS), and a test kept a hand copy of it.
 *
 * A plain literal of strings: nothing in it runs, so the four dists that never draw the tab leave it out.
 */
export const PROMPT_READERS = {
  whatsapp: "Every WhatsApp message, word for word",
  voice: "Every phone call, composed when the call starts",
} as const;

/**
 * What is sent beside the prompt: the clock, the closures that land today and the calendar's openings, rebuilt for
 * every message and at the start of every call (server/prompt-preview.ts `now`, the edge's `describeNow`). `why` is the
 * sentence PromptPreview kept beside it, word for word, since it is the reason the two are drawn apart -- per channel
 * in its last word only, because a call's clock is composed once, when the call starts, not for every message.
 */
export const PROMPT_NOW = {
  label: {
    whatsapp: "Sent alongside it, rebuilt for every message",
    voice: "Sent alongside it, rebuilt for every call",
  },
  why: {
    whatsapp:
      "Shown separately because it is sent separately — folding a value that changes every minute into the block above would throw away the prompt cache on every message.",
    voice:
      "Shown separately because it is sent separately — folding a value that changes every minute into the block above would throw away the prompt cache on every call.",
  },
} as const;
