/**
 * Every wait's rule, said once (decision 0064, step 2): whether what waits goes on its own or only with a person's word,
 * when the wait ends, and the one act that answers it. Ten things wait on the owner, and each was told in its own words
 * at its own place: a run's notice said "it waits until tonight", Today's row "Nothing sends until you say so", the veto
 * notice "Open the run to stop it before then", and the night skip said nothing at all. Every notice, Today's rows and
 * Ask now read the sentence from here (`waitEndsWords`), so a wait says how it ends the one way wherever it is shown.
 *
 *   reply         a reply counting down to go in the owner's name (the hold window, or the confidence dial)
 *   hold          a thread handed to a person: nothing more is said until someone answers
 *   batch_ask     a customer batch waiting for an OK: it waits until its day ends, then it is skipped and the owner told
 *   visit_ask     a visit's batch waiting for an OK: its words name the day, so it waits only until the day's sending
 *                 hours end, then it is skipped and reaches nobody (contracts runApprovalRefusal)
 *   freed_ask   a freed time's batch waiting for an OK (0082): it offers a time, so it waits only until that time comes,
 *                 then it is skipped (contracts runApprovalRefusal)
 *   batch_hold    a customer batch held for a stop: it goes at its time unless stopped
 *   leads_batch   a batch to leads waiting for an OK: it has no day to pass, so it waits until answered
 *   held_email    an email the check held in a going reach-out run: it waits for the owner's say
 *   to_send       an email handed to its owner to send from their own inbox (00429)
 *   review_ask    a review's reply written and held for an Approve (step 6)
 *   review_hold   a review's reply that posts at its time unless stopped (step 6)
 *   one_off       a message sent once, pressed for now: it goes at its time unless stopped (step 3)
 *
 * Pure: words and a table, no clock. The caller says the time a wait ends, in the business's words ("at 10:32 AM").
 */
import { clipAtWord } from "../shared/words";

export const WAIT_KINDS = [
  "reply",
  "hold",
  "batch_ask",
  "visit_ask",
  "freed_ask",
  "batch_hold",
  "leads_batch",
  "held_email",
  "to_send",
  "review_ask",
  "review_hold",
  "one_off",
] as const;
export type WaitKind = (typeof WAIT_KINDS)[number];

/** How a wait goes and ends: on its own at its time unless stopped, with an OK, or by the owner's own hand. */
export interface WaitRule {
  /** What makes it go: nothing (it goes at its time), a person's OK, or the person doing it. */
  goes: "on_its_own" | "with_your_ok" | "by_you";
  /**
   * When the wait ends without an answer: at its time (it goes), at the end of its day or of its day's sending hours (it
   * is skipped), or never.
   */
  ends: "at_its_time" | "end_of_its_day" | "end_of_sending_hours" | "end_of_its_time" | "never";
  /** The one act that answers it. */
  act: "stop" | "approve" | "answer" | "send";
}

/** Each wait's rule, by what waits: the table every notice and row says its expiry from. */
export const WAIT_RULES: Record<WaitKind, WaitRule> = {
  reply: { goes: "on_its_own", ends: "at_its_time", act: "stop" },
  hold: { goes: "by_you", ends: "never", act: "answer" },
  batch_ask: { goes: "with_your_ok", ends: "end_of_its_day", act: "approve" },
  visit_ask: { goes: "with_your_ok", ends: "end_of_sending_hours", act: "approve" },
  freed_ask: { goes: "with_your_ok", ends: "end_of_its_time", act: "approve" },
  batch_hold: { goes: "on_its_own", ends: "at_its_time", act: "stop" },
  leads_batch: { goes: "with_your_ok", ends: "never", act: "approve" },
  held_email: { goes: "by_you", ends: "never", act: "answer" },
  to_send: { goes: "by_you", ends: "never", act: "send" },
  review_ask: { goes: "with_your_ok", ends: "never", act: "approve" },
  review_hold: { goes: "on_its_own", ends: "at_its_time", act: "stop" },
  one_off: { goes: "on_its_own", ends: "at_its_time", act: "stop" },
};

/** A wait's rule. */
export function waitRuleOf(kind: WaitKind): WaitRule {
  return WAIT_RULES[kind];
}

/** The words of the act that answers each rule, as a button says it. */
export const WAIT_ACT_WORDS: Record<WaitRule["act"], string> = {
  stop: "Stop",
  approve: "Approve",
  answer: "Answer",
  send: "Send",
};

/**
 * How a wait ends, in one sentence without its full stop: "Goes at 10:32 AM unless you stop it", "Waits for your OK
 * until the end of its day; then it is skipped, and you are told", "Goes only if you approve it before 21:00 by your
 * clock; after that it is skipped, and it does not reach them", "Waits for your OK; nothing goes until you give it",
 * "Waits for you; nothing more goes until you answer", "Waits for you to send it from your own inbox". `at` is when one
 * that goes on its own goes, in the business's words ("at 10:32 AM", "today 10:30 AM"); without it, "at its time". For
 * one that ends with the sending hours it is the hour they end ("21:00", contracts SENDING_HOURS_WORDS.end).
 */
export function waitEndsWords(kind: WaitKind, at?: string | null): string {
  const r = WAIT_RULES[kind];
  if (r.ends === "at_its_time") return `Goes ${at ?? "at its time"} unless you stop it`;
  if (r.ends === "end_of_its_day")
    return "Waits for your OK until the end of its day; then it is skipped, and you are told";
  if (r.ends === "end_of_its_time")
    return `Goes only if you approve it before ${at ?? "the time it offers"}; after that it is skipped`;
  if (r.ends === "end_of_sending_hours") {
    const before = at ? `before ${at} by your clock` : "before the day's sending hours end";
    return `Goes only if you approve it ${before}; after that it is skipped, and it does not reach them`;
  }
  if (r.goes === "with_your_ok") return "Waits for your OK; nothing goes until you give it";
  if (r.act === "send") return "Waits for you to send it from your own inbox";
  return "Waits for you; nothing more goes until you answer";
}

/** How much of a held reply the owner's notice quotes: enough to know it on a phone's lock screen. */
const HELD_REPLY_QUOTE = 140;

/**
 * What the owner is told when the receptionist's reply waits to go in their name (decision 0064, step 2): who it answers,
 * what it says, and how its wait ends (waitEndsWords reply). `unsure` is the confidence dial's hold, where the hold window's is
 * the owner's own setting. `at` is when it goes, in the business's words ("at 10:32 AM").
 */
export function heldReplyNotice(n: { who: string; reply: string; at: string; unsure: boolean }): {
  subject: string;
  body: string;
} {
  const why = n.unsure ? "The receptionist was not sure of its reply" : "Your hold for replies is on";
  return {
    subject: `Reply to ${n.who} goes ${n.at}`,
    body: `${why}: “${clipAtWord(n.reply, HELD_REPLY_QUOTE)}”. ${waitEndsWords("reply", n.at)}, from the Inbox.`,
  };
}
