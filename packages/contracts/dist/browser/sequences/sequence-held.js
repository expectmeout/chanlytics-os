import { holdDoors, isReachOutHold } from "../reach-out/reach-out-words.js";
const HELD_CHOICE_WORDS = {
  include: "Send as written",
  rewrite: "Rewrite the opening",
  skip: "Skip this email",
  not_a_fit: "Not a fit"
};
export function heldChoicesOf(hold, place) {
  const doors = isReachOutHold(hold) ? holdDoors(hold) : ["include", "skip"];
  return doors.filter((d) => d !== "skip" || (place ?? 1) > 1).map((d) => [d, HELD_CHOICE_WORDS[d]]);
}
