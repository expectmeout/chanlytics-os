/**
 * Today's Need you, with Ask (decision 0071): the queue and Ask for you as one section. Each row comes with what Ask
 * prepared for it (a reply written ahead, a call's brief, a confirmation, a rebook), one press that does it, Not now that
 * brings it back, and the undo held in the row for as long as its door keeps one: a send's grace (core SEND_GRACE_MS, the
 * receipt's `cancelable_until`) counted down to the second in the row, where a toast offered four seconds of it.
 *
 * Pure: the page and the tests read the same words and the same clock. The times Not now offers are the business's, read
 * in its zone (calendar/zone-math.ts), never the device's.
 */
import { clockInZone, dayPlusInZone, localToUtcMs } from "../calendar/zone-math";
import { HOUR_MS } from "../shared/time";

/** Seconds in a minute, for a countdown said in minutes. */
const MINUTE_S = 60;

/** The seconds left on a countdown as the row says them: "12s" under a minute, "9:42" from a minute up. */
function leftWords(seconds: number): string {
  if (seconds < MINUTE_S) return `${seconds}s`;
  return `${Math.floor(seconds / MINUTE_S)}:${String(seconds % MINUTE_S).padStart(2, "0")}`;
}

/** What the section says, row by row. */
export const NEED_YOU_WORDS = {
  door: "Open Inbox",
  drafted: "Ask drafted",
  drafting: "Ask is writing…",
  couldNot: "Ask couldn't write this one.",
  asks: (question: string) => `Ask needs to know: ${question}`,
  edit: "Edit",
  editDraft: (who: string) => `Ask's draft to ${who}. Press to change it.`,
  yourWords: (who: string) => `Your words to ${who}`,
  yours: "Your words",
  writeItMyself: "Write it myself",
  cancel: "Cancel",
  send: "Send",
  sendTo: (address: string) => `Send to ${address}`,
  pickTemplate: "Choose a template",
  notNow: "Not now",
  notNowFor: (who: string) => `Not now: when ${who} comes back`,
  sendingIn: (seconds: number) => `Sending in ${leftWords(seconds)}`,
  sendingTo: (who: string, wire: string) => `to ${who} · ${wire}`,
  undo: "Undo",
  sent: "Sent",
  open: "Open",
  wake: "Wake",
  canceled: "Not sent. Your words are kept.",
  back: (when: string) => `back ${when}`,
  backSooner: (who: string) => `Back sooner if ${who} writes again.`,
  windowCloses: (clock: string) => `Their WhatsApp window closes at ${clock}; after it only a template reaches them.`,
  windowClosed: "Their WhatsApp window has closed: only an approved template reaches them now. Your words go with you.",
  viewer: "Only an owner or operator can send.",
  openThread: "Open thread",
  more: (n: number) => `${n} more in the Inbox`,
  seeAll: "See all",
  brief: { title: "Ask's brief for the call", say: "Say", ask: "Ask", avoid: "Leave out" },
  call: {
    call: "Call",
    how: "How did it go?",
    reached: "Reached them",
    noAnswer: "No answer",
    didNot: "Didn't call",
    reachedDone: "Reached · off your list",
    again: "Call again tomorrow · in your steps",
    againStep: "Call them back again",
  },
  held: {
    title: "Your receptionist's reply",
    goesAlone: "Sends on its own",
    sendsIn: (seconds: number) => `Sends in ${leftWords(seconds)}`,
    by: (wire: string) => `Your receptionist · ${wire}`,
    stop: "Stop",
    held: "Held for you",
    heldReply: "Your receptionist's reply, held",
    change: "Change it with Ask",
    changeLabel: "What should change",
    changeHint: "Shorter, warmer, ask for a day…",
    rewrite: "Rewrite",
    rewritten: "Rewritten. The new draft waits its turn.",
    gone: "It went before it could be stopped.",
  },
  booked: { confirmation: "Confirmation, drafted", dontSend: "Don't send" },
  visit: {
    rebook: "Ask drafted · the rebook",
    rebookAbout: (word: string, when: string) =>
      `They missed their ${word} ${when}. Say sorry we missed them, and ask whether they would like another time. Use the booking link where one helps.`,
    rebookSent: "Missed · rebook sent",
    noWay: (why: string) => `Nothing to send a rebook by. ${why}`,
    change: "Change",
  },
  step: { moved: (day: string) => `Moved to ${day}`, moveFor: "Not now: move this step" },
  review: {
    draft: "Draft a reply",
    drafted: "Ask drafted · public",
    post: "Post",
    postingIn: (seconds: number) => `Posting in ${leftWords(seconds)}`,
    where: "public on Google",
    posted: "Posted on Google",
    toAnswer: "To answer",
    stars: (n: number) => `${n} star${n === 1 ? "" : "s"}`,
  },
  idea: { tag: "Ask's idea", notToday: "Not today", openInAsk: "Open in Ask", approve: "Approve", gone: "Not today" },
} as const;

/** A time Not now offers: its words, the instant, and that instant on the business's clock ("2:00 PM", "Mon 9:00 AM"). */
export interface NotNowChoice {
  key: "hour" | "afternoon" | "evening" | "tomorrow" | "week";
  label: string;
  /** The instant, ISO: what the snooze's door takes as `until`. */
  until: string;
  /** The instant on the business's clock, beside the label. */
  when: string;
  /** How it is said once chosen: "Not now · back tomorrow at 9:00 AM". */
  back: string;
}

/** The hour of the afternoon and of the evening Not now offers, and of the morning it comes back on. */
const AFTERNOON_HOUR = 14;
const EVENING_HOUR = 18;
const MORNING_HOUR = 9;

/** A clock time in the zone: "2:00 PM". */
function clockWords(tz: string, atMs: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(atMs);
}

/** A weekday and a clock time in the zone: "Mon 9:00 AM". */
function dayClockWords(tz: string, atMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(atMs);
}

/** The instant of a wall-clock hour on the day `days` after today, in the zone. */
function hourOn(tz: string, nowMs: number, days: number, hour: number): number {
  const d = dayPlusInZone(tz, nowMs, days);
  return localToUtcMs(tz, d.y, d.m, d.d, hour, 0);
}

/** How many days ahead the next Monday after tomorrow is: the week Not now offers is the one after the next morning. */
function daysToNextMonday(tz: string, nowMs: number): number {
  for (let days = 2; days <= 8; days++) if (dayPlusInZone(tz, nowMs, days).weekday === "mon") return days;
  return 7;
}

/**
 * What Not now offers a person waiting, on the business's clock: an hour from now; this afternoon (2 PM) while the
 * morning lasts, or this evening (6 PM) while the afternoon does; tomorrow at nine; and the next week's Monday at nine.
 * Their next message brings the thread back sooner (the snooze's own rule, 00005), which the menu says under them.
 */
export function notNowChoices(tz: string, nowMs: number): NotNowChoice[] {
  const hour = clockInZone(tz, nowMs).hh;
  const choices: NotNowChoice[] = [];
  const inAnHour = nowMs + HOUR_MS;
  choices.push({
    key: "hour",
    label: "In 1 hour",
    until: new Date(inAnHour).toISOString(),
    when: clockWords(tz, inAnHour),
    back: `at ${clockWords(tz, inAnHour)}`,
  });
  if (hour < AFTERNOON_HOUR - 1) {
    const at = hourOn(tz, nowMs, 0, AFTERNOON_HOUR);
    choices.push({
      key: "afternoon",
      label: "This afternoon",
      until: new Date(at).toISOString(),
      when: clockWords(tz, at),
      back: `at ${clockWords(tz, at)}`,
    });
  } else if (hour < EVENING_HOUR - 1) {
    const at = hourOn(tz, nowMs, 0, EVENING_HOUR);
    choices.push({
      key: "evening",
      label: "This evening",
      until: new Date(at).toISOString(),
      when: clockWords(tz, at),
      back: `at ${clockWords(tz, at)}`,
    });
  }
  const tomorrow = hourOn(tz, nowMs, 1, MORNING_HOUR);
  choices.push({
    key: "tomorrow",
    label: "Tomorrow",
    until: new Date(tomorrow).toISOString(),
    when: clockWords(tz, tomorrow),
    back: `tomorrow at ${clockWords(tz, tomorrow)}`,
  });
  const week = hourOn(tz, nowMs, daysToNextMonday(tz, nowMs), MORNING_HOUR);
  choices.push({
    key: "week",
    label: "Next week",
    until: new Date(week).toISOString(),
    when: dayClockWords(tz, week),
    back: `${dayClockWords(tz, week).replace(" ", " at ")}`,
  });
  return choices;
}

/** A second, as the countdown says what is left of a grace in whole ones. */
const COUNTDOWN_SECOND_MS = 1000;

/**
 * A send's grace as the row counts it: the whole seconds left (never 0 while it can still be stopped) and how much of
 * the grace is left, from the moment it was pressed to its `cancelable_until`, for the bar under the words. Read off the
 * receipt, so the row counts the server's window, not one of its own.
 */
export function sendCountdown(pressedMs: number, untilMs: number, nowMs: number): { seconds: number; share: number } {
  const whole = Math.max(1, untilMs - pressedMs);
  const left = Math.max(0, untilMs - nowMs);
  return { seconds: left > 0 ? Math.ceil(left / COUNTDOWN_SECOND_MS) : 0, share: Math.min(1, left / whole) };
}

/** What the section has prepared, as its one line counts it. */
export interface NeedYouSayFacts {
  /** Replies drafted and waiting for a press. */
  replies: number;
  /** Briefs for a call, drafted. */
  briefs: number;
  /** Drafts still being written. */
  writing: number;
  /** The person whose WhatsApp window closes first, among the rows; null when none is closing. */
  firstWindow: string | null;
  /** Replies your receptionist sends on its own unless stopped. */
  held: number;
}

const oneOrCount = (n: number, one: string, many: string) => `${n === 1 ? "a" : n} ${n === 1 ? one : many}`;

/**
 * Ask's one line over the rows: what it prepared, then the one thing that cannot wait. Null when it prepared nothing and
 * nothing is being written: the rows say the rest, and an empty queue says its own words (contracts today.ts).
 */
export function needYouSay(f: NeedYouSayFacts): string | null {
  const ready = [
    f.replies ? oneOrCount(f.replies, "reply", "replies") : "",
    f.briefs ? oneOrCount(f.briefs, "call brief", "call briefs") : "",
  ].filter(Boolean);
  // The one thing that cannot wait: a reply that goes on its own in minutes, before a window that closes in hours.
  const then = f.held
    ? ` Your receptionist sends ${f.held === 1 ? "one reply" : `${f.held} replies`} on its own unless you stop it.`
    : f.firstWindow
      ? ` ${f.firstWindow}'s window closes first.`
      : "";
  if (ready.length) return `I drafted ${ready.join(" and ")}.${then}`;
  if (f.writing) return NEED_YOU_WORDS.drafting;
  return then ? then.trim() : null;
}
