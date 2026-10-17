import { count } from "./counts.js";
export function blockShareWords(chars, total) {
  const SHARES = [
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
    [9 / 10, "nine tenths"]
  ];
  if (!(typeof chars === "number" && chars > 0) || !(typeof total === "number" && total > 0)) return null;
  const f = Math.min(1, chars / total);
  if (f >= 0.95) return "nearly everything it reads";
  if (f < 0.075) return "less than a tenth of everything it reads";
  const [share, words] = SHARES.reduce((best, s) => Math.abs(s[0] - f) < Math.abs(best[0] - f) ? s : best);
  return `${Math.abs(share - f) > 0.03 ? "about " : ""}${words} of everything it reads`;
}
export function promptCostWords(chars, total) {
  const share = blockShareWords(chars, total);
  return `${count(chars)} characters${share ? ` \u2014 ${share}` : ""}.`;
}
export function promptTotalWords(total) {
  return `${count(total)} ${total === 1 ? "character" : "characters"} in all.`;
}
export const PROMPT_READERS = {
  whatsapp: "Every WhatsApp message, word for word",
  voice: "Every phone call, composed when the call starts"
};
export const PROMPT_NOW = {
  label: {
    whatsapp: "Today's date and time",
    voice: "Today's date and time"
  },
  // Sent apart from the prompt so the prompt stays the same from one message to the next (its cache holds), which is
  // why the sheet draws it apart; what an owner needs of that is when it is rebuilt.
  why: {
    whatsapp: "Added to every message",
    voice: "Added to every call"
  }
};
