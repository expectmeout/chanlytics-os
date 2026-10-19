import { clipAtWord } from "../shared/words.js";
export const WAIT_KINDS = [
  "reply",
  "hold",
  "batch_ask",
  "batch_hold",
  "leads_batch",
  "held_email",
  "to_send",
  "review_ask",
  "review_hold",
  "one_off"
];
export const WAIT_RULES = {
  reply: { goes: "on_its_own", ends: "at_its_time", act: "stop" },
  hold: { goes: "by_you", ends: "never", act: "answer" },
  batch_ask: { goes: "with_your_ok", ends: "end_of_its_day", act: "approve" },
  batch_hold: { goes: "on_its_own", ends: "at_its_time", act: "stop" },
  leads_batch: { goes: "with_your_ok", ends: "never", act: "approve" },
  held_email: { goes: "by_you", ends: "never", act: "answer" },
  to_send: { goes: "by_you", ends: "never", act: "send" },
  review_ask: { goes: "with_your_ok", ends: "never", act: "approve" },
  review_hold: { goes: "on_its_own", ends: "at_its_time", act: "stop" },
  one_off: { goes: "on_its_own", ends: "at_its_time", act: "stop" }
};
export function waitRuleOf(kind) {
  return WAIT_RULES[kind];
}
export const WAIT_ACT_WORDS = {
  stop: "Stop",
  approve: "Approve",
  answer: "Answer",
  send: "Send"
};
export function waitEndsWords(kind, at) {
  const r = WAIT_RULES[kind];
  if (r.ends === "at_its_time") return `Goes ${at ?? "at its time"} unless you stop it`;
  if (r.ends === "end_of_its_day")
    return "Waits for your OK until the end of its day; then it is skipped, and you are told";
  if (r.goes === "with_your_ok") return "Waits for your OK; nothing goes until you give it";
  if (r.act === "send") return "Waits for you to send it from your own inbox";
  return "Waits for you; nothing more goes until you answer";
}
const HELD_REPLY_QUOTE = 140;
export function heldReplyNotice(n) {
  const why = n.unsure ? "The receptionist was not sure of its reply" : "Your hold for replies is on";
  return {
    subject: `Reply to ${n.who} goes ${n.at}`,
    body: `${why}: \u201C${clipAtWord(n.reply, HELD_REPLY_QUOTE)}\u201D. ${waitEndsWords("reply", n.at)}, from the Inbox.`
  };
}
