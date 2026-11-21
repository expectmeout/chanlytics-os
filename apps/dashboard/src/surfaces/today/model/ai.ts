/**
 * AI's own work on Today, in words (Working for you, 21 Nov 2026, W1 to W3, W13, W21): its state under the head's sentence,
 * what it did since you last looked, and the one sheet for its work. The AI is called AI (docs/words.md), and a number is a
 * sentence: "Since 9:40 AM AI answered 6 people and booked 2."
 */
import type { AiDidVM } from "@chanlytics/contracts";

const some = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What AI did since a time, as the head says it; null where it did nothing since. */
function sinceSentence(time: string, answered: number, booked: number): string | null {
  const did = [
    answered > 0 ? `answered ${some(answered, "person", "people")}` : "",
    booked > 0 ? `booked ${booked}` : "",
  ].filter(Boolean);
  return did.length ? `Since ${time} AI ${did.join(" and ")}.` : null;
}

export const AI_WORDS = {
  /** The press under the head's sentence: AI's state, and who it is talking to now. */
  pill: {
    on: "AI is on",
    talking: (n: number): string => `AI is on · talking to ${n} now`,
    stopped: "Everything is paused",
  },
  since: sinceSentence,
  sheet: {
    kicker: "AI",
    on: "AI is on",
    stopped: "Everything is paused",
    onSub: "It answers your customers and holds what needs you.",
    stoppedSub: "Nothing goes out on its own until you resume. Your own replies still send.",
    now: "Right now",
    nowNone: "Nobody is writing just now.",
    sinceHead: (time: string): string => `Since ${time}`,
    todayHead: "Today",
    didNone: "Nothing yet today.",
    next: "Next",
    how: "How AI works for you",
    door: "Change in Autonomy",
    stop: "Stop everything",
    resume: "Resume",
    stopNote: "Pauses every send and holds replies for you, at once.",
    cancel: "Stop",
    cancelled: "Stopped. It won’t go out.",
    nowWord: "now",
    did: {
      booked: "Booked",
      held: "Held for you",
      set_aside: "Set aside",
    } satisfies Record<AiDidVM["kind"], string>,
    open: "Open",
    sends: (n: number): string => `To ${some(n, "person", "people")}`,
  },
  /** Tonight's sends, a line once the day is over (W5): how many, the first's name and time, and the Stop in AI's sheet. */
  tonight: (n: number): string => `Tonight AI sends ${some(n, "message", "messages")}`,
  tonightSaid: (title: string, at: string): string => `${title}, at ${at}. Stop any one.`,
  /** Once a week, what AI did (W9): the card's words, and what Got it says back. */
  week: {
    kind: "AI’s week",
    label: "What AI did this week",
    gotIt: "Got it",
    reports: "See Reports",
    /** Said back as Got it is pressed: when the next one comes. */
    kept: "Next week’s comes on Monday.",
    messages: (n: number): string => `${n} ${n === 1 ? "message" : "messages"}`,
    calls: (n: number): string => `${n} ${n === 1 ? "call" : "calls"}`,
    booked: (n: number): string => `${n} booked`,
  },
  /** Let AI do more (W10): a kind AI still asks about whose drafts all went as written, and what one press changes. */
  more: {
    name: (label: string): string => `Let AI do more with ${label.toLowerCase()}?`,
    sub: (n: number, days: number): string => `You sent all ${n} of its drafts as written in ${days} days.`,
    letIt: "Let AI",
    notNow: "Not now",
    /** Said back in the rule's own words (POLICY_MODE_WORDS `does`): "Replies now: Writes it, holds it, …". */
    said: (label: string, does: string): string => `${label} now: ${does}`,
  },
} as const;
