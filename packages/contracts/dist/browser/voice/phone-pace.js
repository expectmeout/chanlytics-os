export const PHONE_PACES = ["slower", "a_bit_slower", "natural", "a_bit_faster", "faster"];
const PACE_SPEED = {
  slower: 0.85,
  a_bit_slower: 0.92,
  natural: 1,
  a_bit_faster: 1.08,
  faster: 1.15
};
export const PHONE_PACE_WORDS = {
  label: "Pace",
  options: {
    slower: "Slower",
    a_bit_slower: "A bit slower",
    natural: "Natural",
    a_bit_faster: "A bit faster",
    faster: "Faster"
  },
  gate: "change how fast it speaks",
  /** A pace not on the list, refused before it is sent: the edge would send no other. */
  unlisted: "Pick one of the five paces.",
  saved: (pace) => `Callers hear it ${PHONE_PACE_WORDS.options[pace].toLowerCase()} from their next call.`
};
export function phonePaceOf(stored) {
  return typeof stored === "string" && PHONE_PACES.includes(stored) ? stored : null;
}
export function phonePaceShown(stored) {
  return phonePaceOf(stored) ?? "natural";
}
export function phonePaceSpeed(stored) {
  const pace = phonePaceOf(stored);
  return pace && pace !== "natural" ? PACE_SPEED[pace] : null;
}
