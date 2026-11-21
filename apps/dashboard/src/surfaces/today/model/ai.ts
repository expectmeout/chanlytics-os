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
} as const;
