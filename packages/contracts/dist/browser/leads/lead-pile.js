import { plural } from "../shared/words.js";
export const LEAD_PILE_WORDS = {
  start: "Go through them",
  startTip: "One lead at a time: add it to a sequence, put it off, or say it isn't a fit.",
  head: (search) => `Going through \u201C${search}\u201D`,
  target: "Adds go to",
  newList: "A new list",
  later: "Later",
  laterTip: "Put it off for now. Nothing is written to them, and it comes back at the end of the pile.",
  laterDone: "Put off for later",
  notFit: "Not a fit",
  add: (target) => `Add to \u201C${target}\u201D`,
  call: "Call",
  hold: "Add to a new list",
  held: (n) => `${plural(n, "lead", "leads")} for a new list`,
  writeHeld: (n) => `Write to the ${n}`,
  leave: "Done for now",
  end: "That's the pile",
  endSub: (later) => later > 0 ? `${plural(later, "lead", "leads")} put off for later. Go through them now?` : "Every lead here is decided.",
  laterAgain: "Go through the later ones",
  undo: "Undo",
  undoGone: "That was already undone",
  /** A sequence's Add leads named where this pass's adds go: the door says so, and so does the page before a search. */
  startFor: (target) => target ? `Pick leads for \u201C${target}\u201D` : "Pick leads for its sequence",
  askSearch: (target) => `Open a search to pick its leads for ${target ? `\u201C${target}\u201D` : "the sequence you came from"}.`,
  askLetGo: "Not now",
  /** The end of the pile, with a sequence its adds went to: the way to it. */
  openTarget: (target) => `Open \u201C${target}\u201D`,
  /** The reason a Not a fit was last given, marked among the five. */
  lastWhy: "Your last reason",
  /** The pile's one line for a screen reader and the eye, after each press: what was done, and who is up. */
  next: (name) => `Next: ${name}`,
  lastOne: "That was the last one."
};
export const LEAD_PILE_SAID = {
  add: (lead, target) => `Added ${lead} to \u201C${target ?? ""}\u201D`,
  hold: (lead) => `${lead} held for a new list`,
  later: (lead) => `${lead} put off for later`,
  not_a_fit: (lead) => `${lead} marked not a fit`,
  keep: (lead) => `Kept ${lead}`,
  exclude: (lead) => `Left ${lead} out`
};
export function leadPileProgressOf(c, now) {
  const later = now ? now.later : c.later;
  const left = now ? now.left : c.left;
  const decided = now ? Math.max(0, c.total - left - later) : c.added + (c.elsewhere ?? 0) + c.closed;
  const parts = [`${decided} of ${c.total} decided`];
  if (later > 0) parts.push(`${later} for later`);
  return { text: parts.join(" \xB7 "), share: c.total > 0 ? decided / c.total : 0, done: left === 0 };
}
export function leadPileOpen(r, pile) {
  const undecided = pile.cls === "review" ? r.cls === "review" : r.stage === "ready" && !r.chainId;
  return undecided && (pile.pass === "first" ? !r.laterAt : !!r.laterAt);
}
export const LEAD_PILE_UNDO_KEY = "z";
export function leadPileRailOf(p) {
  const later = {
    act: "later",
    label: LEAD_PILE_WORDS.later,
    key: "l",
    look: "secondary",
    right: "approve"
  };
  if (p.cls === "review")
    return [
      { act: "exclude", label: "Leave out", key: "n", look: "secondary", right: "find" },
      later,
      { act: "keep", label: "Keep", key: "a", look: "primary", right: "find" }
    ];
  return [
    { act: "not_a_fit", label: LEAD_PILE_WORDS.notFit, key: "n", look: "secondary", right: "approve" },
    later,
    p.call ? { act: "call", label: LEAD_PILE_WORDS.call, key: "a", look: "primary", right: "approve" } : p.target ? { act: "add", label: LEAD_PILE_WORDS.add(p.target), key: "a", look: "primary", right: "approve" } : { act: "hold", label: LEAD_PILE_WORDS.hold, key: "a", look: "primary", right: "approve" }
  ];
}
export const LEAD_BACK_WORDS = {
  head: "Back today",
  tip: "They asked to hear from you on a day that has come. Nothing writes to them by itself: write to them yourself.",
  line: (name, day) => `${name} asked to hear from you ${day}`,
  more: (n) => `${n} more`
};
