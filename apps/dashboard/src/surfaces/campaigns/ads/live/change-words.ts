/**
 * What an ad made here's drawer says while its owner changes it (the Ads plan's 4.5 and 5.2): its sentence, the box a
 * tapped word opens with the hint under it, the press that names what it does (a raise names its most), what a change
 * on its way is said as, End's question, and Fix it for an ad Meta turned down. Every word follows docs/words.md.
 */

/** The sentence: who sees it, up to what in all, until when. Its three words are tapped to change them. */
export const CHANGE_SENTENCE = {
  within: "People within ",
  inAround: "People in and around ",
  across: "People across ",
  see: " see it, up to ",
  until: " in all, until ",
  end: ".",
  miles: (miles: number) => `${miles} ${miles === 1 ? "mile" : "miles"}`,
  word: { total: "the total", end_day: "the last day", miles: "the miles" },
  /** A word's name for a screen reader: what it is, and what it says. */
  said: (word: string, value: string) => `Change ${word}, ${value}`,
} as const;

/** The box a tapped word opens, its press and the hint under it. */
export const CHANGE_EDIT = {
  label: { total: "Total", end_day: "Last day", miles: "Miles" },
  milesUnit: "miles",
  raise: (total: string) => `Raise to ${total} in all`,
  lower: (total: string) => `Lower to ${total} in all`,
  runUntil: (day: string) => `Run until ${day}`,
  endOn: (day: string) => `End on ${day}`,
  within: (miles: string) => `Show within ${miles}`,
  cancel: "Keep it",
  hint: {
    total: (least: string) => `At least ${least} for this run`,
    totalMost: (least: string, most: string) => `At least ${least} · your most for an ad is ${most}`,
    raise: "Meta never spends more than the total in all",
    end_day: "The last day it runs",
    miles: "1 to 50 miles around the business",
    amountAfter: (time: string) => `Meta takes the next change of the total at ${time}`,
  },
  issue: {
    under_least: (amount: string) => `Meta takes at least ${amount} for this run`,
    under_spent: (amount: string) => `At least ${amount}: Meta keeps it above what's spent`,
    over_most: (amount: string) => `Your most for any ad is ${amount}`,
    not_whole: (amount: string) => `A whole amount: ${amount}`,
    too_soon: (day: string) => `It runs at least a whole day: ${day} or later`,
    too_long: (o: { day: string; least: string }) => `The total covers until ${o.day} · raise it to ${o.least} first`,
    miles: (miles: string) => `1 to 50 miles: ${miles}`,
  },
} as const;

/** A change of the owner's still on its way to Meta, said in the sentence's place under it. */
export const CHANGE_ON_WAY = {
  total: (amount: string) => `Changing the total to ${amount}…`,
  end_day: (day: string) => `Moving the last day to ${day}…`,
  miles: (miles: string) => `Changing to ${miles}…`,
  end: "Ending it…",
  unsure: "Couldn't confirm Meta took the change · Chanlytics is checking with Meta",
  inMeta: "Changed in Meta · this is what Meta holds now",
  wide: "Where it shows is changed in Meta",
} as const;

/** What a change press says it came to, in a toast. */
export const CHANGE_TOAST = {
  total: (amount: string) => `The total is now ${amount}`,
  end_day: (day: string) => `It runs until ${day}`,
  miles: (miles: string) => `Shown within ${miles}`,
  ended: (name: string) => `${name} has ended`,
  /** Kept, and sent as soon as Meta takes a change to the ad: Meta takes one every thirty seconds. */
  soon: {
    total: (amount: string) => `The total goes to ${amount} in a moment`,
    end_day: (day: string) => `The last day moves to ${day} in a moment`,
    miles: (miles: string) => `It goes to ${miles} in a moment`,
    end: "It ends in a moment",
  },
  unsure: "Couldn't confirm Meta took it · Chanlytics is checking",
  same: "Meta holds that already",
  tookBack: "Change taken back",
} as const;

/** Ending an ad for good: the question, what it does, and its two answers. */
export const CHANGE_END = {
  open: "End this ad",
  ask: (name: string) => `End ${name}?`,
  body: "It stops for good and can't be turned back on. Meta still bills what it already showed.",
  press: "End ad",
  keep: "Keep",
} as const;

/** Fix it, for an ad Meta turned down. */
export const FIX = {
  body: "AI rewrites its words from Meta's reason and opens them on New ad. Turn that on and this ad ends.",
  press: "Fix it",
  writing: "Rewriting…",
  again: "Ask Meta to look again",
} as const;
