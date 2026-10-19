import { clockDate, wallClockAt } from "../shared/clock.js";
import {
  REPLY_CHIP_WORDS,
  REPLY_INTENT_WORDS,
  REPLY_REREADS
} from "./reach-out-replies.js";
export const REPLIES_PAGE = 200;
export const REPLY_UNDO_REFUSALS = {
  not_found: "Reply not found.",
  role: "Not allowed to act in this workspace.",
  not_a_no: "Only a no can be undone.",
  already: "Already undone.",
  too_late: "It's been more than seven days.",
  moved: "They unsubscribed since, and that stays."
};
export const isReplyUndoRefusal = (v) => typeof v === "string" && Object.prototype.hasOwnProperty.call(REPLY_UNDO_REFUSALS, v);
function replyDayWords(key, tz, now) {
  return clockDate(wallClockAt(tz, key, 12, 0), tz, now);
}
function replyAnswersOf(r) {
  if (!r.chain) return null;
  return `Answers ${!r.step || r.step <= 1 ? "your first email" : `email ${r.step}`} of \u201C${r.chain}\u201D`;
}
function draftLine(r) {
  if (r.draft_state === "written" && r.draft) {
    return r.intent === "not_now" ? "The receptionist drafted a line of thanks: it's in the reply box." : "The receptionist drafted an answer: it's in the reply box.";
  }
  return r.draft_state === "waiting" ? "The receptionist is drafting an answer." : null;
}
function saidNoLine(r) {
  if (r.claim === "auto_reply")
    return "Their automatic reply asked to be taken off your list. Nothing more will be written to them.";
  const address = r.said_no?.address;
  const domain = r.said_no?.domain;
  if (!address) return "Nothing more will be written to them.";
  return domain ? `Nothing more will be written to ${address} or anyone at ${domain}.` : `Nothing more will be written to ${address}.`;
}
function didLine(r, now, tz) {
  const step = r.step_day ? `A step is on Today for ${replyDayWords(r.step_day, tz, now)}.` : "A step is on Today.";
  switch (r.intent) {
    case "interested":
    case "question":
      return ["Talking now.", draftLine(r)].filter(Boolean).join(" ");
    case "not_now":
      return [step, draftLine(r)].filter(Boolean).join(" ");
    case "no":
      return saidNoLine(r);
    case "wrong_person":
      return `Not the right person. They said to write to ${r.refer_to ?? "someone else"}. A step is on Today.`;
    case "away":
      if (r.claim === "auto_reply" && r.until_at) {
        const back = clockDate(Date.parse(r.until_at), tz, now);
        return `Away until ${back} (an automatic reply). The sequence goes on after that.`;
      }
      return r.named_day ? `Away until ${replyDayWords(r.named_day, tz, now)}. A step is on Today for that day.` : step;
    default:
      return null;
  }
}
export function replyStripOf(r, now, tz) {
  const said = r.summary ? `\u201C${r.summary}\u201D` : null;
  const answers = replyAnswersOf(r);
  if (r.undone) {
    return {
      title: "Wrote back",
      said,
      answers,
      did: r.claim === "auto_reply" ? "Read as no, then undone. It was an automatic reply, so the sequence goes on." : "Read as no, then undone. The sequence stays stopped: they wrote back.",
      doors: []
    };
  }
  if (r.unread) {
    const last = r.rereads >= REPLY_REREADS;
    return {
      title: "Wrote back",
      said: null,
      answers,
      did: last ? "We couldn't read it." : "We couldn't read it yet: we'll try again.",
      doors: []
    };
  }
  const doors = [];
  if (r.draft_state === "written" && r.draft) doors.push("use_draft");
  if (r.can_undo) doors.push("undo");
  return {
    title: r.intent === "no" ? "Said no" : r.intent === "other" ? "Wrote back" : `Wrote back \xB7 ${REPLY_INTENT_WORDS[r.intent]}`,
    said,
    answers,
    did: didLine(r, now, tz),
    doors
  };
}
export function replyChipStateOf(r) {
  return r.unread || r.undone ? "other" : r.intent;
}
export function replyChipOf(r) {
  return REPLY_CHIP_WORDS[replyChipStateOf(r)];
}
export function replyFromLineOf(from, mailbox) {
  if (from.from === "own") return `Goes from ${from.address}.`;
  if (from.because === null) return null;
  const box = mailbox ?? "your mailbox";
  return from.because === "own_not_sending" ? `${from.own} isn't sending right now, so this goes from ${box}.` : `${from.own} was removed, so this goes from ${box}.`;
}
const bareAddress = (from) => {
  if (typeof from !== "string" || !from.trim()) return null;
  const m = /<([^<>]+)>\s*$/.exec(from);
  return (m ? m[1] : from).trim().toLowerCase();
};
export function replyLeftAsOf(meta) {
  const email = meta?.email;
  if (!email || email.left_as !== "mailbox") return null;
  const went = bareAddress(email.request?.from);
  const own = bareAddress(email.own_request?.from);
  if (!went) return null;
  if (!own) return `Went from ${went}.`;
  return email.left_as_why === "own_not_sending" ? `Went from ${went}: ${own} isn't sending right now.` : `Went from ${went}: ${own} could not send it.`;
}
