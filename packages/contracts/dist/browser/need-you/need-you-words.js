import { clockInZone, dayPlusInZone, localToUtcMs } from "../calendar/zone-math.js";
import { HOUR_MS } from "../shared/time.js";
const MINUTE_S = 60;
function leftWords(seconds) {
  if (seconds < MINUTE_S) return `${seconds}s`;
  return `${Math.floor(seconds / MINUTE_S)}:${String(seconds % MINUTE_S).padStart(2, "0")}`;
}
export const NEED_YOU_WORDS = {
  door: "Open Inbox",
  drafted: "Ask drafted",
  drafting: "Ask is writing\u2026",
  couldNot: "Ask couldn't write this one.",
  asks: (question) => `Ask needs to know: ${question}`,
  edit: "Edit",
  editDraft: (who) => `Ask's draft to ${who}. Press to change it.`,
  yourWords: (who) => `Your words to ${who}`,
  yours: "Your words",
  writeItMyself: "Write it myself",
  cancel: "Cancel",
  send: "Send",
  sendTo: (address) => `Send to ${address}`,
  pickTemplate: "Choose a template",
  notNow: "Not now",
  notNowFor: (who) => `Not now: when ${who} comes back`,
  sendingIn: (seconds) => `Sending in ${leftWords(seconds)}`,
  sendingTo: (who, wire) => `to ${who} \xB7 ${wire}`,
  undo: "Undo",
  sent: "Sent",
  open: "Open",
  wake: "Wake",
  canceled: "Not sent. Your words are kept.",
  back: (when) => `back ${when}`,
  backSooner: (who) => `Back sooner if ${who} writes again.`,
  windowCloses: (clock) => `Their WhatsApp window closes at ${clock}; after it only a template reaches them.`,
  windowClosed: "Their WhatsApp window has closed: only an approved template reaches them now. Your words go with you.",
  viewer: "Only an owner or operator can send.",
  openThread: "Open thread",
  more: (n) => `${n} more in the Inbox`,
  seeAll: "See all",
  brief: { title: "Ask's brief for the call", say: "Say", ask: "Ask", avoid: "Leave out" },
  call: {
    call: "Call",
    how: "How did it go?",
    reached: "Reached them",
    noAnswer: "No answer",
    didNot: "Didn't call",
    reachedDone: "Reached \xB7 off your list",
    again: "Call again tomorrow \xB7 in your steps",
    againStep: "Call them back again"
  },
  held: {
    title: "Your receptionist's reply",
    goesAlone: "Sends on its own",
    sendsIn: (seconds) => `Sends in ${leftWords(seconds)}`,
    by: (wire) => `Your receptionist \xB7 ${wire}`,
    stop: "Stop",
    held: "Held for you",
    heldReply: "Your receptionist's reply, held",
    change: "Change it with Ask",
    changeLabel: "What should change",
    changeHint: "Shorter, warmer, ask for a day\u2026",
    rewrite: "Rewrite",
    rewritten: "Rewritten. The new draft waits its turn.",
    gone: "It went before it could be stopped."
  },
  booked: { confirmation: "Confirmation, drafted", dontSend: "Don't send" },
  visit: {
    rebook: "Ask drafted \xB7 the rebook",
    rebookAbout: (word, when) => `They missed their ${word} ${when}. Say sorry we missed them, and ask whether they would like another time. Use the booking link where one helps.`,
    rebookSent: "Missed \xB7 rebook sent",
    noWay: (why) => `Nothing to send a rebook by. ${why}`,
    change: "Change"
  },
  step: { moved: (day) => `Moved to ${day}`, moveFor: "Not now: move this step" },
  review: {
    draft: "Draft a reply",
    drafted: "Ask drafted \xB7 public",
    post: "Post",
    postingIn: (seconds) => `Posting in ${leftWords(seconds)}`,
    where: "public on Google",
    posted: "Posted on Google",
    toAnswer: "To answer",
    stars: (n) => `${n} star${n === 1 ? "" : "s"}`
  },
  idea: { tag: "Ask's idea", notToday: "Not today", openInAsk: "Open in Ask", approve: "Approve", gone: "Not today" }
};
const AFTERNOON_HOUR = 14;
const EVENING_HOUR = 18;
const MORNING_HOUR = 9;
function clockWords(tz, atMs) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(atMs);
}
function dayClockWords(tz, atMs) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(atMs);
}
function hourOn(tz, nowMs, days, hour) {
  const d = dayPlusInZone(tz, nowMs, days);
  return localToUtcMs(tz, d.y, d.m, d.d, hour, 0);
}
function daysToNextMonday(tz, nowMs) {
  for (let days = 2; days <= 8; days++) if (dayPlusInZone(tz, nowMs, days).weekday === "mon") return days;
  return 7;
}
export function notNowChoices(tz, nowMs) {
  const hour = clockInZone(tz, nowMs).hh;
  const choices = [];
  const inAnHour = nowMs + HOUR_MS;
  choices.push({
    key: "hour",
    label: "In 1 hour",
    until: new Date(inAnHour).toISOString(),
    when: clockWords(tz, inAnHour),
    back: `at ${clockWords(tz, inAnHour)}`
  });
  if (hour < AFTERNOON_HOUR - 1) {
    const at = hourOn(tz, nowMs, 0, AFTERNOON_HOUR);
    choices.push({
      key: "afternoon",
      label: "This afternoon",
      until: new Date(at).toISOString(),
      when: clockWords(tz, at),
      back: `at ${clockWords(tz, at)}`
    });
  } else if (hour < EVENING_HOUR - 1) {
    const at = hourOn(tz, nowMs, 0, EVENING_HOUR);
    choices.push({
      key: "evening",
      label: "This evening",
      until: new Date(at).toISOString(),
      when: clockWords(tz, at),
      back: `at ${clockWords(tz, at)}`
    });
  }
  const tomorrow = hourOn(tz, nowMs, 1, MORNING_HOUR);
  choices.push({
    key: "tomorrow",
    label: "Tomorrow",
    until: new Date(tomorrow).toISOString(),
    when: clockWords(tz, tomorrow),
    back: `tomorrow at ${clockWords(tz, tomorrow)}`
  });
  const week = hourOn(tz, nowMs, daysToNextMonday(tz, nowMs), MORNING_HOUR);
  choices.push({
    key: "week",
    label: "Next week",
    until: new Date(week).toISOString(),
    when: dayClockWords(tz, week),
    back: `${dayClockWords(tz, week).replace(" ", " at ")}`
  });
  return choices;
}
const COUNTDOWN_SECOND_MS = 1e3;
export function sendCountdown(pressedMs, untilMs, nowMs) {
  const whole = Math.max(1, untilMs - pressedMs);
  const left = Math.max(0, untilMs - nowMs);
  return { seconds: left > 0 ? Math.ceil(left / COUNTDOWN_SECOND_MS) : 0, share: Math.min(1, left / whole) };
}
const oneOrCount = (n, one, many) => `${n === 1 ? "a" : n} ${n === 1 ? one : many}`;
export function needYouSay(f) {
  const ready = [
    f.replies ? oneOrCount(f.replies, "reply", "replies") : "",
    f.briefs ? oneOrCount(f.briefs, "call brief", "call briefs") : ""
  ].filter(Boolean);
  const then = f.held ? ` Your receptionist sends ${f.held === 1 ? "one reply" : `${f.held} replies`} on its own unless you stop it.` : f.firstWindow ? ` ${f.firstWindow}'s window closes first.` : "";
  if (ready.length) return `I drafted ${ready.join(" and ")}.${then}`;
  if (f.writing) return NEED_YOU_WORDS.drafting;
  return then ? then.trim() : null;
}
