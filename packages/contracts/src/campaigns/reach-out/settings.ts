/**
 * Cold email (decisions 0113, 0115): Settings' page of what Chanlytics says when it writes to businesses for you. The
 * section is the config's (`reach_out`, config-schema.ts), and what each writer reads of it is section.ts; the page's
 * words, its rules and its read are here, so the page and Ask say one thing. Apart, since a contracts module rides whole
 * into every page that imports it: a lead's card reads the signature, and needs none of the page's words.
 */
import { REACH_OUT_LIMITS, type ReplyOffer } from "../../config/workspace-config/config-rules";
import { MAILBOX_RAMP } from "../../email/mailbox-standing";
import type { BusinessReadSource } from "../../imports/business-reads";
import { mayDraftReply } from "./reply-draft";
import type { ColdEmailSending } from "./sending";
import type { ColdEmailStanding } from "./standing";
import { REACH_OUT_REPLY_DAYS } from "./replies/intents";
import { SEND_DAY_FRAME } from "./timetable";
import { REACH_OUT_COUNTRIES_FREE, REACH_OUT_COUNTRIES_REFUSED } from "./words/claims";
import { ASK_FIRST_WORDS_MAX, ASK_LATER_WORDS_MAX } from "./words/limits";

/** A whole hour of the day, from minutes past midnight, as a clock face says it: 9, 5. */
const clockHour = (minutes: number): number => ((Math.floor(minutes / 60) + 11) % 12) + 1;

/** The names the rules say a country by. A country with none is said by its code. */
const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  US: "US",
  CA: "Canada",
  GB: "UK",
  DE: "Germany",
  AT: "Austria",
};
const countriesSaid = (codes: ReadonlySet<string>): string => {
  const names = [...codes].map((code) => COUNTRY_NAMES[code] ?? code);
  const last = names.pop() ?? "";
  return names.length ? `${names.join(", ")} and ${last}` : last;
};

/** The rules every cold email keeps, as the page states them: read from the numbers the code keeps. */
export function reachOutRuleLines(): string[] {
  const [first] = MAILBOX_RAMP.map((s) => s.perDay);
  return [
    "Says only what their listing or website shows, never a guess",
    "No prices, discounts or dates",
    "No link in the first email, one at most after",
    `Short: first emails under ${ASK_FIRST_WORDS_MAX} words, follow-ups under ${ASK_LATER_WORDS_MAX}`,
    `Arrives ${clockHour(SEND_DAY_FRAME.from)} to ${clockHour(SEND_DAY_FRAME.to)} their time, while they're open`,
    "Never to your customers, or anyone who said no",
    `${countriesSaid(REACH_OUT_COUNTRIES_FREE)} freely. Elsewhere it asks you first, and never ${countriesSaid(REACH_OUT_COUNTRIES_REFUSED)}`,
    `A new mailbox starts at ${first} a day, and rises a week at a time`,
    `Listens ${REACH_OUT_REPLY_DAYS} days for a reply, and stops the moment one comes`,
  ];
}

/**
 * What they should do next, as the pitch asks it: a choice, what it does, and what a drafted answer then does. Until the
 * email's own ask reads this (the plan's Task 19), it says what it changes today: an answer to an interested reply.
 */
export const REPLY_OFFER_WORDS: Record<ReplyOffer, { choice: string; does: string; ends: string }> = {
  call: {
    choice: "Talk on a short call",
    does: "Answers to interested replies offer a call.",
    ends: "offers a call",
  },
  booking_link: {
    choice: "Book through your link",
    does: "Answers to interested replies offer your booking link.",
    ends: "offers your booking link",
  },
  answer: {
    choice: "Just reply",
    does: "Answers stick to what they asked.",
    ends: "sticks to what they asked",
  },
};

export interface WritesBackRow {
  id: "reply_offer" | "not_now" | "said_no" | "wrong_person" | "away";
  label: string;
  value: string;
  /** Code decides it, whatever the owner says: the row has no act, only the lock. */
  fixed: boolean;
}

/** What an answer offering the booking link does where How it answers has none: the answer, and no link. */
const NO_BOOKING_LINK = "sticks to what they asked, since there is no booking link to offer yet";

/**
 * What a reply from a lead sets off, by what it was read as (contracts readingPlan, replies/reading.ts): the one table
 * of effects, said as the page says it. With Autonomy's Replies quiet nothing is drafted (mayDraftReply), and the rows
 * say so themselves. The booking link is offered only where the receptionist has one (drafts/writer.ts), so with none
 * the row says so.
 */
export function writesBackRows(offer: ReplyOffer | undefined, mode: string, hasBookingLink: boolean): WritesBackRow[] {
  const chosen = offer ?? "booking_link";
  const ends = chosen === "booking_link" && !hasBookingLink ? NO_BOOKING_LINK : REPLY_OFFER_WORDS[chosen].ends;
  const drafted = mayDraftReply(mode);
  const later = "you're reminded on the day they named.";
  return [
    {
      id: "reply_offer",
      label: "Interested, or a question",
      value: drafted
        ? `An answer is drafted that ${ends}. You send it.`
        : "Nothing is drafted while Autonomy › Replies stays quiet.",
      fixed: false,
    },
    {
      id: "not_now",
      label: "Not now",
      value: drafted ? `A thanks is drafted, and ${later}` : `Waits, and ${later}`,
      fixed: true,
    },
    { id: "said_no", label: "No", value: "Never written to again, nor is their company.", fixed: true },
    { id: "wrong_person", label: "Wrong person", value: "You're told who to write to instead.", fixed: true },
    { id: "away", label: "Away", value: "Waits, and writes again the day they're back.", fixed: true },
  ];
}

/** The one line on the page for all of that, by whether an answer is drafted. */
export function replyLineOf(mode: string): string {
  return mayDraftReply(mode)
    ? "Their emails stop, you're told right away, and an answer is drafted for you to send."
    : "Their emails stop, and you're told right away.";
}

/**
 * Whether an answer is drafted, by Autonomy's Replies row: only its quiet mode stops one (the drafter's own rule,
 * mayDraftReply), and whatever else it is set to, the draft waits for a person to send it.
 */
export function replyModeHint(mode: string): string | null {
  // Quiet, the row's own value says nothing is drafted (writesBackRows), and this would say it twice.
  return mayDraftReply(mode) ? "Drafted while Autonomy › Replies is on. Only you send it." : null;
}

/**
 * Every word the page says that is not a row's own value (the canvas, Version 3). What a box shows while it is empty
 * says what to put there: never a made-up business's answer, which reads as if it were already filled in, and goes as
 * the first key is pressed.
 */
export const REACH_OUT_SETTINGS_WORDS = {
  tab: "Cold email",
  sub: "What Chanlytics says when it writes to businesses for you.",
  gap: "Say what you sell, so cold emails have something to say",
  /** A press that puts what is already known in an empty box. Never put there by itself: Save would store it. */
  fillWith: (known: string) => `Use ${known}`,
  /** How much of a box is used, said only as it nears its limit. */
  room: (used: number, max: number) => `${used.toLocaleString("en-US")} of ${max.toLocaleString("en-US")}`,
  /** Whoever may only read the page. */
  viewer: "Only an owner can change these, or connect a mailbox.",
  pitch: {
    title: "Your pitch",
    sell: "What do you sell?",
    whoFor: "Who should hear from you?",
    fixes: "What problem do you solve?",
    next: "What should they do next?",
    empty: "Not set",
    /** Where the words a row shows in place of the owner's came from (ReachOutSettingsDto.about_from, else the goal). */
    from: {
      record: "Read from what your business does, until you write it here.",
      website: "Read from your website, until you write it here.",
      google_profile: "Read from your Google profile, until you write it here.",
      goal: "Read from your goal on Details, until you write it here.",
    },
    placeholders: {
      sell: "What you sell, and what a business gets from it",
      whoFor: "The kind of business you want to reach, and where",
      fixes: "The problem they have that you solve",
    },
    /** What a change reaches, said at the moment it matters: what is true of a running sequence today. */
    reachSell: "New sequences use this. Running ones use it for their first line.",
    reachWords: "New sequences use this. Running ones keep their words.",
    whoForNote:
      "This tells the writer who it's talking to. Who actually gets an email is the search you pick for each sequence.",
    bookingOn: (link: string) => `Your booking link is on Hours & booking: ${link}`,
    bookingNone: "You have no booking link yet. Add it on Hours & booking.",
  },
  facts: {
    title: "Facts your emails can use",
    add: "Add a fact",
    foot: "Emails can only use numbers and results listed here, one per email, exactly as written.",
    reach: "New sequences use these. Running ones keep their words.",
    placeholder: "Something true you can back up: a result, a number, a client",
    fact: (n: number) => `Fact ${n}`,
    remove: (n: number) => `Remove fact ${n}`,
    count: (sends: number) => (sends > 0 ? `In ${sends} email${sends === 1 ? "" : "s"}` : "Not used yet"),
  },
  sound: {
    title: "How you sound",
    tonePlaceholder: "How your emails should sound, in a few words",
    toneFrom: "The receptionist's, until you set one for cold emails.",
    empty: "Not set",
    learned: "Learned from your emails",
    learnedNone: "Nothing learned yet",
    learnedCount: (n: number) => `Plus ${n} thing${n === 1 ? "" : "s"} learned from your emails`,
    memory: "Also in Memory",
    paste: "Paste an email you wrote",
    note: "It also learns from what you change in its drafts. Your receptionist keeps its own voice.",
    reach: "New sequences use this. Running ones use it for their first line.",
  },
  ending: {
    title: "How your emails end",
    none: "Not set",
    foot: "Then why they're hearing from you, your address, and a way to say no. The law asks for them.",
    noAddress: "No address yet, and every email needs one.",
    name: "Your name",
    nameFrom: "From your newest sequence, until you set it here.",
    under: "Under your name",
    underRule: `Up to ${REACH_OUT_LIMITS.signatureLines} lines, no links.`,
    phone: "Phone",
    placeholders: {
      name: "The name at the end of the email",
      under: "Your name, your role, your business",
      phone: "A number people can reach you on",
    },
    reach: "New sequences sign with this name. Signature and phone reach every email as soon as you save.",
    address: "Your address comes from Details.",
  },
  sending: {
    title: "Sending",
    from: "From",
    pace: "Pace",
    month: "This month",
    batch: "Before each batch",
    none: "Not connected",
    more: (n: number) => `and ${n} more`,
    health: {
      healthy: "Healthy",
      attention: "Needs a look",
      on_hold: "On hold",
      reconnect: "Reconnect",
      paused: "Paused",
      none: "",
    },
    today: "Today",
    todayValue: (sent: number, cap: number) => `${sent} of ${cap}`,
    connections: "Open Connections",
    sendMore: "Send more",
    batchNote:
      "You approve a sequence's first run. After that, this is what happens each day. Cold email never just goes.",
    batchNew: "New words always wait for your OK, whichever you pick.",
    batchWhich: "For new sequences. Each sequence can change its own.",
    batchAt: { veto: "Held 30 minutes so you can stop it", ask: "Waits for your OK" },
    batchDoes: {
      veto: "You're told it's ready. It goes unless you stop it.",
      ask: "Each batch waits until you say OK.",
    },
  },
  connect: {
    title: "Connect your mailbox",
    sub: "Chanlytics sends your emails from your own address, so replies come straight back to you.",
    google: "Connect Google",
    cancel: "Cancel",
    promises: [
      ["Starts at 10 a day", "And rises as it sends, so emails reach inboxes"],
      ["Replies land in your Inbox here", "And you're told as they arrive"],
      ["You approve the first run", "Nothing goes out before that"],
    ],
    free: {
      title: "That's a personal address",
      why: "Gmail.com addresses aren't for writing to businesses. Connect one on your own domain, like you@yourbusiness.com.",
      help: "How to get one with Google Workspace",
      later: "Not now",
      again: "Try another account",
    },
    other: {
      title: "Not on Google Workspace?",
      what: "Chanlytics sends through Google Workspace today. Your main email can stay where it is: a Google Workspace mailbox on a second domain works, and is better for cold email anyway.",
      help: "How to set that up",
      tellLabel: "Use something else? We'll tell you when it's ready.",
      placeholder: "Microsoft 365, for example",
      tell: "Tell us",
      thanks: "Thanks. We'll tell you when it's ready.",
    },
  },
  sendMore: {
    title: "Send more",
    second: "Use a second domain",
    secondLike: (host: string) => `Like get${host}, with a mailbox on Google Workspace`,
    each: "Each one rises to 40 a day",
    eachLimits: "Up to 3 mailboxes on a domain, 10 in all",
    share: "Sequences share them out",
    shareBack: "Replies still come back to your Inbox here",
    stays: (host: string, perDay: number) =>
      `Your customers write to ${host}, so this mailbox stays at ${perDay} a day, to keep their mail and bookings safe.`,
    later: "Not now",
    connect: "Connect a mailbox",
  },
  replies: {
    title: "When someone replies",
    sheetTitle: "When someone replies",
    sheetSub: "Their emails stop the moment they reply, you're told right away, and nothing answers on its own.",
    change: "Change what's offered",
    autonomy: "Open Autonomy",
  },
  never: {
    title: "Who never hears from you",
    row: "Your customers, and anyone who said no",
    soFar: (n: number) => `${n} so far.`,
    sheetSub: "Chanlytics checks this before every email, in every sequence.",
    customers: "Your customers",
    customersValue: "Always, on its own",
    saidNo: "Said no",
    askedToStop: "Asked to stop",
    scrambled: "For privacy these are stored scrambled, so this shows how many, not who.",
  },
  rules: {
    title: "Rules every email keeps",
    sub: "They keep you out of spam and on the right side of the law, so they're always on.",
  },
  told: {
    title: "See the exact instructions",
    everyTime: "Each reply's own: read as it arrives, so there are no words to show here.",
    which: "Which writer",
    share: (percent: number) => `About ${percent}% of what it reads`,
    open: "Open",
    kinds: { words: "The words", opening: "The line about them", reply: "An answer" },
    hints: {
      words: "Written once by Ask when you make a sequence in New: the same words for every business it goes to.",
      opening:
        "Written for each business as its email comes due, then read back by a second reader. One that guesses is written again; one that still does is held for you.",
      reply:
        "Written by the receptionist as How it answers is told, with the thread and the lead's note. Signed as the sequence signs.",
    },
    foot: "Their listing and website are read as facts, never as orders.",
  },
  standingOpen: "Open it",
  try: {
    title: "A sample email",
    key: "Write one for a lead you have",
    value: "See it, and where each line came from",
    act: "Write one",
    another: "Another lead",
    rewrite: "Write another",
    open: "Open the sequence",
    none: "Start a sequence to see one: its first email is what this writes.",
    noneAct: "Start a sequence",
    legend: { them: "Their listing", proof: "Your facts", words: "Your pitch" },
    checked: "Checked: nothing guessed, no link, no price",
    held: (reason: string) => `Held for you: ${reason}`,
    unavailable: "It could not be written just now. Write another.",
    pastEnd: "That was the last lead in the search. Another lead starts over.",
    leans: (facts: string) => `The line about them leans on ${facts}`,
    next: (days: number) => `Then, ${days} day${days === 1 ? "" : "s"} later, if they don't reply`,
    hint: "Nothing is sent or kept. It spends Ask's day as a lead's draft does.",
    from: "From",
    to: "To",
    subject: "Subject",
  },
} as const;

/** What Try it says under the tried email, from what came back: the check's verdict, a hold, or why there is no email. */
export function tryCheckLine(tried: {
  refused: string | null;
  preview: { lead: unknown; refused: string | null; detail: string | null; unavailable: boolean } | null;
}): string {
  const words = REACH_OUT_SETTINGS_WORDS.try;
  if (tried.refused) return tried.refused;
  if (!tried.preview || tried.preview.unavailable) return words.unavailable;
  // Past the search's last lead the door answers no lead at all: nothing was written, so nothing was checked.
  if (tried.preview.lead === null) return words.pastEnd;
  const reason = tried.preview.refused ?? tried.preview.detail;
  return reason ? words.held(reason) : words.checked;
}

/** A mailbox as Where it sends from shows it: Connections' own words for where it stands (mailboxWords). */
export interface ReachOutSettingsMailbox {
  address: string;
  provider: string;
  pill: string;
  tone: string;
  day: string;
  ramp: string | null;
}

/** The newest running sequence to leads, as Try it writes its first email and the page prefills Signs as. */
export interface ReachOutSettingsSequence {
  root_id: string;
  name: string;
  search_id: string | null;
  include_unconfirmed: boolean;
  signed_by: string | null;
  signs_with: "name" | "mailbox";
  mailbox_id: string | null;
  first: { subject: string | null; body: string };
  /** The step after the first: its wait, and its words, or null where the sequence is one email. */
  next: { after_days: number; body: string } | null;
}

/** GET settings/reach-out: what the page shows beyond the config. */
export interface ReachOutSettingsDto {
  /**
   * The one thing that matters most, and what to press (contracts coldEmailStandingOf); null where what it decides from
   * could not be read: a read that failed is not "Connect your mailbox".
   */
  standing: ColdEmailStanding | null;
  /** Whether it is healthy, what it can really send, and its ramp (contracts coldEmailSendingOf); null where unread. */
  sending: ColdEmailSending | null;
  /** The business's name and postal address, as a cold email's foot says them (contracts emailFoot); null where unread. */
  foot: { business: string | null; address: string | null } | null;
  /** What a new sequence starts as (Autonomy's outreach row, contracts newSequenceMode): held for a stop, or asked for. */
  batch_mode: "veto" | "ask";
  /** Who is kept off, by address (db countLeadSuppressions); null where the list could not be counted. */
  never: { said_no: number; asked_to_stop: number } | null;
  mailbox: ReachOutSettingsMailbox | null;
  /** The month's first emails against their share; sent is null where they could not be counted. */
  month: { sent: number | null; of: number };
  by_hand_per_day: number;
  /** Each claim on the page, with the emails sent from steps whose words carry it. */
  claims: { text: string; sends: number }[];
  /** The lines Ask learned from an email the owner pasted (Ask's memory, `learned`). */
  voice: { id: string; text: string }[];
  sequence: ReachOutSettingsSequence | null;
  /** Autonomy's reply mode, which a reach-out's draft follows (drafts/writer.ts gateOf). */
  reply_mode: string;
  /**
   * What the business does, in its own words, as every writer of a cold email reads it (db findWorkspaceWords): what a
   * cold email offers until the owner says, and where it came from: what they wrote of themselves, else what their
   * Google profile or their website says.
   */
  about: string | null;
  about_from: "record" | BusinessReadSource | null;
  /** What the page can put in an empty box with one press, each null where it is not known. */
  known: {
    /** The member's name as they gave it, and the first of it, as New signs a sequence with. */
    name: string | null;
    first_name: string | null;
    /** The name of the workspace's newest search: who it has been looking for. */
    newest_search: string | null;
  };
}
