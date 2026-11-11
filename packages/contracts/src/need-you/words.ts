/**
 * Today's Need you, with Ask (decision 0071): the queue and Ask for you as one section. Each row comes with what Ask
 * prepared for it (a reply written ahead, a call's brief, a confirmation, a rebook), one press that does it, Not now that
 * brings it back, and the undo held in the row for as long as its door keeps one: a send's grace (core SEND_GRACE_MS, the
 * receipt's `cancelable_until`) counted down to the second in the row, where a toast offered four seconds of it.
 *
 * Pure: the page and the tests read the same words and the same clock. The times Not now offers are the business's, read
 * in its zone (shared/zone/math.ts), never the device's.
 */
import { clockInZone, dayPlusInZone, localToUtcMs } from "../shared/zone/math";
import { shortName } from "../conversations/thread-contact";
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
  /** One line under the act on a phone's sheet: what it does, in eight words (the phone pass, 3 Nov 2026: two lines). */
  actHint: "Moves them out of People. Their mail stays.",
} as const;

/**
 * What the section says, row by row. What Ask prepared is headed by what it is, then whose (the refined canvas, 31 Oct
 * 2026): "Reply · Ask's draft" over words that go to them, which the member types in where they stand; "Call notes ·
 * only you see these" over words that are read and never sent, which is why nothing there is typed in.
 */
export const NEED_YOU_WORDS = {
  door: "Inbox",
  drafted: "Ask's draft",
  drafting: "Ask is drafting…",
  couldNot: "Ask couldn't draft this one.",
  asks: (question: string) => `Ask needs to know: ${question}`,
  /**
   * What they wrote was not a customer's, so Ask wrote no reply: what it is, in Ask's one sentence. The verdict is said
   * here once; the sentence says only what it is (3 Nov 2026: "Not a customer, by the look of it: … not a customer or
   * prospect, so no reply" said it twice in five lines).
   */
  pitch: (text: string) => `Not a customer: ${text}`,
  editDraft: (personName: string) => `Change the reply to ${personName}`,
  done: "Done",
  /** Once the member's words differ from what Ask drafted: Ask's words back in their place. */
  useAsks: "Back to Ask's",
  /** The signature an email reply leaves with (00487), under the draft: what is sent is what is seen. */
  changeSignature: "Change",
  changeSignatureTip: "Change what this mailbox signs with, in Settings › Connections",
  yourWords: (personName: string) => `Your reply to ${personName}`,
  yours: "Yours now",
  /** Over the words while a send counts down. */
  goingTo: (personName: string) => `Going to ${shortName(personName)}`,
  /** Where the member writes it from nothing: what stands in the empty words. */
  writeHere: (personName: string) => `Write to ${personName}…`,
  writeItMyself: "Write it myself",
  cancel: "Cancel",
  send: "Send",
  sendTo: (address: string) => `Send to ${address}`,
  pickTemplate: "Choose a template",
  notNow: "Not now",
  notNowFor: (personName: string) => `Not now: when ${personName} comes back`,
  sendingIn: (seconds: number) => `Sending in ${leftWords(seconds)}`,
  sendingTo: (personName: string, wire: string) => `to ${personName} · ${wire}`,
  undo: "Undo",
  sent: "Sent",
  open: "Open",
  wake: "Wake",
  canceled: "Not sent. Your words are kept.",
  back: (when: string) => `back ${when}`,
  backSooner: (personName: string) => `Back sooner if ${personName} writes again.`,
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
  /**
   * What a group of Need you could not hold, said as a press at that group's foot (9 Nov 2026): the people past the five
   * drawn, what waits for your OK past its three, your own to-dos past theirs.
   */
  cut: {
    waiting: (n: number) => `${n} more waiting`,
    ok: (n: number) => `${n} more to decide`,
    todo: (n: number) => `${n} more to do`,
  },
  /**
   * Need you's groups (Today in three zones, 2 Nov 2026, need-you/groups.ts): the one thing to do first, who waits on you,
   * what waits for your OK or your answer, your own to-dos, and who has waited past a week, one row at the end.
   */
  group: { next: "Up next", waiting: "Waiting on you", ok: "To decide", todo: "To do", old: "Older" },
  /** Need you's foot, where threads were set aside as not a customer's (decision 0093): what one was, or how many. */
  setAside: (n: number, about: string | null) =>
    n === 1 ? `Set aside · ${about ?? "1 not a customer's"}` : `Set aside · ${n} not customers'`,
  setAsideOpen: "Look",
  /** How many need you, as the head says it before anything else: the badge's number. */
  count: (n: number) => (n === 1 ? "1 needs you." : `${n} need you.`),
  /** The same count said after a line that is down, which leads. */
  countAsWell: (n: number) => (n === 1 ? "1 needs you as well." : `${n} need you as well.`),
  /** How many rows were dealt with today, by the door: what clearing the list came to. */
  doneToday: (n: number) => `${n} done today`,
  /** Not today pressed: said in the toast, with the day it comes back on, beside its Undo. */
  restedUntil: (day: string) => `Not today. It comes back ${day}.`,
  /** Ends the head's sentence once nobody is left waiting on you (todayHeadLine). */
  end: "That's everyone.",
  /** A reply of yours that never reached them: what the row says, what its bubble says, what it may do, and its presses. */
  failed: {
    sentence: "Your reply didn't reach them.",
    on: (wire: string) => `Your reply didn't reach them on ${wire}.`,
    wire: "The line didn't take it.",
    why: "your reply didn't reach them",
    notReached: "Didn't reach them",
    retry: "Try again",
    later: "Try again later",
    tryWire: (wire: string) => `Try ${wire} again`,
  },
  /**
   * Whoever has waited past a week, at the end: a person by themself where there is one, how many and who where there
   * are more ("2 over a week" left out what was); a toll-free number says so beside it.
   */
  older: {
    row: (n: number) => `${n} waiting over a week`,
    wait: "over a week",
    tollFree: "toll-free",
  },
  /**
   * Every row past a week marked done at once, with one Undo: they leave Need you until they write again. The words name
   * no list: "They leave Need you" named a head a phone never draws, and read as the Inbox's "Needs you" misspelt
   * (3 Nov 2026).
   */
  oldDone: {
    act: "Mark all done",
    detail: "Off your list until they write again.",
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
    /** Over what came of the ideas approved lately, under the ideas still open. */
    cameOf: "What came of it",
  },
  /** Ask's line: what it asks for, and what it says of a mic and of a change on its way. */
  say: {
    tell: "Tell Ask what to change",
    tellMore: "Tell Ask what else",
    tellHeld: "Tell it what to change",
    changing: "Ask is changing it",
    letGo: "Let go to send",
    hold: "Hold to talk",
    send: "Send to Ask",
    micBlocked: "Your browser has the microphone turned off for this site. Allow it there, or type it.",
    micFailed: "Couldn't hear you. Try again, or type it.",
  },
  call: {
    how: "How did it go?",
    reached: "Reached them",
    noAnswer: "No answer",
    didNot: "Didn't call",
    reachedDone: "Reached · off your list",
    again: "Call again tomorrow · in your steps",
    againStep: "Call them back again",
    callWho: (who: string) => `Call ${who}`,
    callNow: "Call now",
    callAnyway: "Call anyway",
    play: "Play the call",
    pause: "Pause the call",
    readIt: "Read it",
    theirCall: (who: string) => `${/^[+\d(]/.test(who) ? "Their" : `${shortName(who)}'s`} call`,
    whenLong: (atMs: number, durationMs: number | null, tz: string) => {
      const at = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(atMs);
      if (!durationMs) return at;
      const s = Math.round(durationMs / 1000);
      return `${at} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    },
    onRecord: "On record",
    firstTime: "First time they have called.",
    neverHere: "Nothing on record yet.",
    lastHere: (when: string) => `Last here ${when}.`,
    nextHere: (when: string) => `Next: ${when}.`,
    selling: "This looks like someone selling to you, not a customer.",
    remember: "Say what to remember",
    rememberMore: "Say what else to remember",
    onTheirPage: "On their page",
    noPage: "They have no page yet, so there is nowhere to keep that.",
  },
  /** What a reach-out's reply leaves to press, once the sheet has said what was done. */
  read: { notAPerson: "Not a person", replyNow: "Reply now" },
  /** A lead search's question, answered in the sheet. */
  search: {
    change: "Or say what to change",
    changeAsk: (search: string, words: string) => `Change the lead search "${search}": ${words}`,
    nothingSpent: "Nothing is spent while it waits.",
    stop: "Stop here",
    keep: "Keep going",
    kept: "Carrying on",
    stopped: "Stopped. The ones already found are yours.",
  },
  held: {
    title: "Your receptionist's reply",
    goesAlone: "Sends on its own",
    sendsIn: (seconds: number) => `Sends in ${leftWords(seconds)}`,
    by: (wire: string) => `Your receptionist · ${wire}`,
    stopIt: "Stop it",
    held: "Held for you",
    heldReply: "Written by your receptionist",
    goesIn: (seconds: number) => `Going by itself in ${leftWords(seconds)}`,
    rewritten: "Rewritten. The new draft waits its turn.",
    gone: "It went before it could be stopped.",
  },
  /** A time asked for by text, answered in the sheet. */
  booked: {
    confirm: "Confirm and send",
    confirmAnyway: "Confirm anyway",
    anotherTime: "Another time",
    offerAnother: "Offer another time",
    anotherDay: "Another day",
    calendar: "Calendar",
    back: "Back",
    theyGet: "What they'll get",
    noneOpen: "Nothing open to offer on your calendar right now. Pick a day there, or say it to Ask.",
    telling: (who: string, seconds: number) => `Booked. Telling ${shortName(who)} in ${leftWords(seconds)}`,
    done: (when: string) => `Booked for ${when}`,
    offered: (who: string) => `Offered to ${shortName(who)}`,
    dontSend: "Don't send",
  },
  visit: {
    /** A visit's verb on its row: the sheet holds Kept and Missed. */
    asks: "Did they come?",
    didCome: (who: string) => `Did ${who} come?`,
    missedOffer: (who: string) => `${who} missed it. Offer another time?`,
    leaveIt: "Leave it",
    rebook: "Rebook",
    rebookAbout: (word: string, when: string) =>
      `They missed their ${word} ${when}. Say sorry we missed them, and ask whether they would like another time. Use the booking link where one helps.`,
    rebookSent: "Missed · rebook sent",
    /**
     * A Missed that a sequence answers (decision 0119): which one writes to them and when, so the row offers no second
     * message of its own. Change takes the word back, and the message with it.
     */
    follows: (name: string, when: string, asks: boolean) =>
      asks
        ? `“${name}” has a message for them ${when}, and asks you before it goes.`
        : `“${name}” offers them another time ${when}.`,
    /**
     * Every one of yesterday's left to mark, said kept at once (Today's Mark all kept, decision 0123's loose end): the
     * press, its question, and what it came to. A Kept cannot be taken back to unmarked, only changed to Missed, so the
     * question says so, and what follows.
     */
    allKept: {
      act: (n: number) => `Mark all ${n} kept`,
      ask: (n: number, many: string) => `Did all ${n} of yesterday's ${many} come?`,
      detail:
        "Each one marked kept is thanked, where a thank-you runs. Any of them can be changed to Missed afterwards, on the Calendar.",
      yes: "Mark them kept",
      no: "Not yet",
      done: (n: number) => (n === 1 ? "Marked kept" : `${n} marked kept`),
      refused: (n: number, why: string) => `${n === 1 ? "1 couldn't be marked" : `${n} couldn't be marked`}: ${why}`,
    },
    /** A Kept that a sequence answers (decision 0123): the thank-you waits for this word, and the row says when it goes. */
    thanks: (name: string, when: string, asks: boolean) =>
      asks
        ? `“${name}” has a thank-you for them ${when}, and asks you before it goes.`
        : `“${name}” thanks them ${when}.`,
    noWay: (reason: string) => `Nothing to send a rebook by. ${reason}`,
    change: "Change",
  },
  step: {
    moved: (day: string) => `Moved to ${day}`,
    moveFor: "Not now: move this step",
    write: (who: string) => `Say what to write to ${shortName(who)}`,
    sendDone: "Send, and it's done",
    /** A step that arrives with its note written (decision 0120, D7): what its row opens it with. */
    readNote: "Read the note",
    /** A not-now's check-back, written the morning its day came. */
    noteAgain: "The day they named has come, so the note is written.",
    /** A first note to the person a wrong person named: it goes from the owner's own mail, to someone new. */
    noteTo: (to: string) =>
      `Written to ${to}, the person they named. It goes from your own mail, so press Done once it has.`,
    openInMail: "Open in your mail",
  },
  review: {
    draft: "Draft a reply",
    drafted: "Public reply",
    post: "Post",
    postingIn: (seconds: number) => `Posting in ${leftWords(seconds)}`,
    where: "public on Google",
    posted: "Posted on Google",
    toAnswer: "To answer",
    stars: (n: number) => `${n} star${n === 1 ? "" : "s"}`,
    say: "Say what to answer",
  },
  /** An idea of Ask's morning: its tag, its presses, and Details, which a new campaign's rules fold behind. */
  idea: {
    tag: "Ask's idea",
    /** What Ask noticed from the workspace's own facts (decision 0087): no idea of a model's, so it says so. */
    noticed: "Ask noticed",
    notToday: "Not today",
    openInAsk: "Open in Ask",
    approve: "Approve",
    gone: "Not today",
    /** A press refused because what the idea was about has moved on: nothing more to do here. */
    moved: "Already changed",
    details: "Details",
  },
  /**
   * The sheet that walks Need you on a phone (one sheet, 9 Nov 2026): where it stands in the list, the way to the one before and
   * the next, pulling up for the whole conversation, and what it says at its end.
   */
  walk: {
    of: (at: number, n: number) => `${at} of ${n}`,
    before: "The one before",
    next: "The next one",
    close: "Close",
    pullUp: "Pull up for the whole conversation",
    pullDown: "Back down",
    openWhole: (personName: string) => `Open ${personName}`,
    openInbox: "Open in Inbox",
    clear: "That's today's",
    doneCount: (n: number) => (n === 1 ? "1 done" : `${n} done`),
    back: "Back to Today",
    todos: (n: number) => `${n} to-do${n === 1 ? "" : "s"} left`,
    older: {
      go: "Go through them",
      says: (n: number) =>
        n === 1
          ? "1 older one has waited over a week. It may need nothing from you."
          : `${n} older ones have waited over a week. Most need nothing from you.`,
    },
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
  /** Drafts still being written. */
  writing: number;
  /** The first WhatsApp window to close among the rows, who and when on the business's clock; null when none is. */
  firstWindow: { who: string; at: string } | null;
  /** The first reply your receptionist sends on its own unless stopped, by whom it answers; null when none counts down. */
  held: { who: string } | null;
}

/**
 * What the head says after how many need you (the redesign of 1 Nov 2026): what Ask prepared, then the one thing that
 * cannot wait, in one sentence ("Ask has 3 replies ready, and Dana's window closes at 11:52 AM."). A reply that goes
 * on its own leads, since it goes in minutes, before a window that closes in hours. Null when Ask prepared nothing,
 * writes nothing and nothing closes: the head says the count alone, and the rows say the rest.
 */
export function needYouSay(needYouSayFacts: NeedYouSayFacts): string | null {
  // A first name, as the canvas says them ("Sofia's window"), a number or an address whole (thread-contact.ts shortName);
  // a time that is tomorrow's says so before it.
  const when = (at: string) => (/^tomorrow /i.test(at) ? at.replace(/^tomorrow /i, "tomorrow at ") : `at ${at}`);
  const held = needYouSayFacts.held
    ? `Your receptionist answers ${shortName(needYouSayFacts.held.who)} on its own unless you stop it.`
    : "";
  const drafted = needYouSayFacts.replies
    ? `Ask has ${needYouSayFacts.replies === 1 ? "a reply" : `${needYouSayFacts.replies} replies`} ready`
    : needYouSayFacts.writing
      ? "Ask is drafting your replies"
      : "";
  const window = needYouSayFacts.firstWindow
    ? `${shortName(needYouSayFacts.firstWindow.who)}'s window closes ${when(needYouSayFacts.firstWindow.at)}`
    : "";
  const then = drafted && window ? `${drafted}, and ${window}.` : drafted || window ? `${drafted || window}.` : "";
  return [held, then].filter(Boolean).join(" ") || null;
}
