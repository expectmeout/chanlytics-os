import {
  HOLD_DOOR_WORDS,
  holdDoors,
  holdWords,
  isReachOutHold
} from "../reach-out/reach-out-words.js";
import { capitalize } from "../shared/words.js";
export function heldWhyOf(reason, detail) {
  const why = capitalize(holdWords(reason, detail));
  return reason === "check_unavailable" && !detail ? `${why}; it tries again on its own within the hour` : why;
}
export function heldChoicesOf(hold, place) {
  const doors = isReachOutHold(hold) ? holdDoors(hold) : ["include", "skip"];
  return doors.filter((d) => d !== "skip" || (place ?? 1) > 1).map((d) => [d, HOLD_DOOR_WORDS[d]]);
}
export const HELD_TAKE_OUT = "Take out";
export function heldAnswersOf(h, place) {
  const doors = isReachOutHold(h.reason) ? holdDoors(h.reason) : ["include", "skip"];
  const tried = h.reason === "check_unavailable" && !h.detail ? doors.filter((d) => d !== "rewrite") : doors;
  const first = (place ?? 1) <= 1;
  return tried.map((d, at) => {
    const door = d === "skip" && first ? "take_out" : d;
    const fixes = d === "rewrite" || h.reason === "customer_domain" && d === "skip";
    return { door, words: door === "take_out" ? HELD_TAKE_OUT : HOLD_DOOR_WORDS[d], lead: at === 0 && fixes };
  });
}
