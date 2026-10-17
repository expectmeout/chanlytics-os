export const HAND_KINDS = ["call", "note"];
export const HAND_WORDS_MAX = 280;
export function handOf(v) {
  if (!v || typeof v !== "object") return null;
  const h = v;
  if (!HAND_KINDS.includes(h.kind) || typeof h.words !== "string") return null;
  const words = h.words.trim();
  return words ? { kind: h.kind, words } : null;
}
export function handStepWords(kind, business, words) {
  const who = business.trim() || "This business";
  return kind === "call" ? `Call ${who}: ${words.trim()}` : `${who}: ${words.trim()}`;
}
