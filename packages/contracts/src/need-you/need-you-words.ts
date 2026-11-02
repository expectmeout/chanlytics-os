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

/**
 * "Not a person", said where a program's mail taken for a person is met (decision 0080): on their row here, on their
 * page and on their thread's Actions (mailbox-senders.ts MAILBOX_SENDERS_WORDS reads it). Kept in this module, which
 * every workspace load carries for Today, so offering it on a row moves nothing of the senders' list into that load.
 */
export const NOT_A_PERSON_WORDS = {
  act: "Not a person…",
  actHint: "A notice or a newsletter: its mail stays in your mailbox, and it leaves People",
} as const;

/**
 * What the section says, row by row. What Ask prepared is headed by what it is, then whose (the refined canvas, 31 Oct
 * 2026): "Reply · drafted by Ask" over words that go to them, which the member types in where they stand; "Call notes ·
 * only you see these" over words that are read and never sent, which is why nothing there is typed in.
 */
export const NEED_YOU_WORDS = {
  door: "Open Inbox",
  reply: "Reply",
  drafted: "drafted by Ask",
  drafting: "Ask is writing…",
  couldNot: "Ask couldn't write this one.",
  asks: (question: string) => `Ask needs to know: ${question}`,
  edit: "Edit",
  editDraft: (who: string) => `Change the reply to ${who}`,
  /** While the member types in the words: what the head says, and the press that leaves them as they are. */
  editing: "editing",
  done: "Done",
  /** Once the member's words differ from what Ask drafted: Ask's words back in their place. */
  useAsks: "Use Ask's draft",
  /** The signature an email reply leaves with (00487), under the draft: what is sent is what is seen. */
  changeSignature: "Change",
  changeSignatureTip: "Change what this mailbox signs with, in Settings › Connections",
  yourWords: (who: string) => `Your reply to ${who}`,
  yours: "your words",
  /** Where the member writes it from nothing: what stands in the empty words. */
  writeHere: (who: string) => `Write to ${who}…`,
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
  /** A lead who tried their own receptionist (decision 0079): Today's row. */
  tried: {
    status: "Tried their receptionist",
    claimed: "made it theirs",
    sentence: "Opened it and tried it",
    someone: "A lead",
    open: "Open the lead",
    part: (n: number) => `${n} lead${n === 1 ? "" : "s"} tried their preview`,
  },
  more: (n: number) => `${n} more in the Inbox`,
  seeAll: "See all",
  /**
   * Need you's groups (the redesign of 1 Nov 2026, need-you-groups.ts): the one thing to do first, who waits on you, what
   * waits for your OK, and who has waited past a week, folded at the end.
   */
  group: { next: "Up next", waiting: "Waiting on you", ok: "Your OK", old: "Over a week" },
  /** The strip that cuts Need you by what each row asks of you, and its name to a screen reader. */
  filter: { label: "Need you, by what it asks of you", all: "All", reply: "Reply", call: "Call", approve: "Approve" },
  /** How many need you, as the head says it before anything else: the badge's number. */
  count: (n: number) => (n === 1 ? "1 needs you." : `${n} need you.`),
  /** The same count said after a line that is down, which leads. */
  countAsWell: (n: number) => (n === 1 ? "1 needs you as well." : `${n} need you as well.`),
  /** Every row past a week marked done at once, asked first: they leave Need you until they write again. */
  oldDone: {
    act: "Mark all done",
    question: (n: number) => (n === 1 ? "Mark this one done?" : `Mark all ${n} done?`),
    detail: "They leave Need you. A new message from them brings them back.",
    yes: "Mark done",
    done: (n: number) => (n === 1 ? "Marked done" : `${n} marked done`),
    failed: (n: number) => (n === 1 ? "One couldn't be marked done" : `${n} couldn't be marked done`),
  },
  /** Over a call back that waited past a week, before its notes: Ask's word that it may be let go. */
  staleCall: "A call back this old is rarely still wanted. If the number means nothing to you, mark it done.",
  /** The two lines at Need you's foot, each opening in place: your own to-dos, and what Ask found worth a look. */
  todo: {
    title: "To do",
    reviews: (n: number) => (n === 1 ? "1 review to answer" : `${n} reviews to answer`),
  },
  found: {
    title: "Ask found",
    ideas: (n: number, first: string) => (n === 1 ? first : `${n} ideas`),
    calls: (n: number) => (n === 1 ? "a call worth a listen" : `${n} calls worth a listen`),
  },
  /**
   * A call's notes, for the member on the call and never sent: its head, then each part on a key column. "Find out", not
   * "Ask": the assistant is Ask, and "Ask Ask what they…" read as a stutter.
   */
  brief: {
    title: "Call notes",
    only: "only you see these",
    say: "Open with",
    points: "Mention",
    ask: "Find out",
    avoid: "Avoid",
  },
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
    heldReply: "written by your receptionist",
    change: "Change it with Ask",
    changeLabel: "What should change",
    changeHint: "Shorter, warmer, ask for a day…",
    rewrite: "Rewrite",
    rewritten: "Rewritten. The new draft waits its turn.",
    gone: "It went before it could be stopped.",
  },
  booked: { confirmation: "Confirmation", dontSend: "Don't send" },
  visit: {
    rebook: "Rebook",
    rebookAbout: (word: string, when: string) =>
      `They missed their ${word} ${when}. Say sorry we missed them, and ask whether they would like another time. Use the booking link where one helps.`,
    rebookSent: "Missed · rebook sent",
    noWay: (why: string) => `Nothing to send a rebook by. ${why}`,
    change: "Change",
  },
  step: { moved: (day: string) => `Moved to ${day}`, moveFor: "Not now: move this step" },
  review: {
    draft: "Draft a reply",
    drafted: "Public reply",
    post: "Post",
    postingIn: (seconds: number) => `Posting in ${leftWords(seconds)}`,
    where: "public on Google",
    posted: "Posted on Google",
    toAnswer: "To answer",
    stars: (n: number) => `${n} star${n === 1 ? "" : "s"}`,
  },
  /** An idea of Ask's morning: its tag, its presses, and Details, which a new campaign's rules fold behind. */
  idea: {
    tag: "Ask's idea",
    notToday: "Not today",
    openInAsk: "Open in Ask",
    approve: "Approve",
    gone: "Not today",
    details: "Details",
  },
  /**
   * The sheet that walks Need you on a phone (the phone canvas, 28 Oct 2026): where it stands in the list, the way to the
   * one before and the next, what it says once everyone is answered, and Change it with Ask on Ask's own draft.
   */
  walk: {
    of: (at: number, n: number) => `Need you · ${at} of ${n}`,
    read: "Read",
    before: "The one before",
    next: "The next one",
    close: "Close",
    their: "Their words",
    clear: "That's everyone",
    clearSub: "Nobody is waiting on you now.",
    back: "Back to Today",
    todos: (n: number) => `${n} to-do${n === 1 ? "" : "s"} left`,
    quick: ["Shorter", "Warmer", "Ask for a day"],
    rewriting: "Ask is rewriting…",
  },
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

/** What Need you has prepared and what cannot wait, as the head's sentence says it after the count. */
export interface NeedYouSayFacts {
  /** Replies drafted and waiting for a press. */
  replies: number;
  /** Briefs for a call, drafted. */
  briefs: number;
  /** Drafts still being written. */
  writing: number;
  /** The first WhatsApp window to close among the rows, who and when on the business's clock; null when none is. */
  firstWindow: { who: string; at: string } | null;
  /** The first reply your receptionist sends on its own unless stopped, by whom it answers; null when none counts down. */
  held: { who: string } | null;
}

const oneOrCount = (n: number, one: string, many: string) => `${n === 1 ? "a" : n} ${n === 1 ? one : many}`;

/**
 * What the head says after how many need you (the redesign of 1 Nov 2026): what Ask prepared, then the one thing that
 * cannot wait, in one sentence ("Ask drafted 3 replies, and Dana's reply window closes at 11:52 AM."). A reply that goes
 * on its own leads, since it goes in minutes, before a window that closes in hours. Null when Ask prepared nothing,
 * writes nothing and nothing closes: the head says the count alone, and the rows say the rest.
 */
export function needYouSay(f: NeedYouSayFacts): string | null {
  const held = f.held ? `Your receptionist answers ${f.held.who} on its own unless you stop it.` : "";
  const ready = [
    f.replies ? oneOrCount(f.replies, "reply", "replies") : "",
    f.briefs ? oneOrCount(f.briefs, "call brief", "call briefs") : "",
  ].filter(Boolean);
  const drafted = ready.length ? `Ask drafted ${ready.join(" and ")}` : f.writing ? "Ask is drafting your replies" : "";
  const window = f.firstWindow ? `${f.firstWindow.who}'s reply window closes at ${f.firstWindow.at}` : "";
  const then = drafted && window ? `${drafted}, and ${window}.` : drafted || window ? `${drafted || window}.` : "";
  return [held, then].filter(Boolean).join(" ") || null;
}
