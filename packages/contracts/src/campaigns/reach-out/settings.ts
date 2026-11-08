/**
 * How it reaches out (decision 0113): Settings' page of what a cold email is written from. The section is the config's
 * (`reach_out`, config-schema.ts), and what each writer reads of it is section.ts; the page's words, its rules and its
 * read are here, so the page and Ask say one thing. Apart, since a contracts module rides whole into every page that
 * imports it: a lead's card reads the signature, and needs none of the page's words.
 */
import type { ReplyOffer } from "../../config/workspace-config/config-rules";
import { MAILBOX_RAMP } from "../../email/mailbox-standing";
import { mayDraftReply } from "./reply-draft";
import { REACH_OUT_REPLY_DAYS } from "./replies/intents";
import { SEND_DAY_FRAME } from "./timetable";
import { ASK_FIRST_WORDS_MAX, ASK_LATER_WORDS_MAX, REACH_OUT_WORDS_MAX } from "./words/limits";

/** A whole hour of the day, from minutes past midnight, as a clock face says it: 9, 5. */
const clockHour = (minutes: number): number => ((Math.floor(minutes / 60) + 11) % 12) + 1;

/** The rules every cold email keeps, as the page states them: read from the numbers the code keeps. */
export function reachOutRuleLines(): string[] {
  const [first, ...later] = MAILBOX_RAMP.map((s) => s.perDay);
  const lastRise = later.pop();
  return [
    "Says only what their listing or website shows, never a guess",
    "No prices, discounts or dates",
    "No link in the first email, one at most after",
    `Under ${REACH_OUT_WORDS_MAX} words, no line in capitals. Ask keeps its own to ${ASK_FIRST_WORDS_MAX}, follow-ups to ${ASK_LATER_WORDS_MAX}`,
    `Arrives ${clockHour(SEND_DAY_FRAME.from)} to ${clockHour(SEND_DAY_FRAME.to)} their time, while they're open`,
    `A new mailbox sends ${first} a day, then ${later.join(", ")} and ${lastRise}, a week apart`,
    `Listens ${REACH_OUT_REPLY_DAYS} days for a reply, and stops the moment one comes`,
  ];
}

/** What the answer to an interested lead offers, as the row says it. */
export const REPLY_OFFER_WORDS: Record<ReplyOffer, { choice: string; ends: string }> = {
  booking_link: { choice: "Your booking link", ends: "offering your booking link" },
  call: { choice: "A call with you", ends: "offering a call with you" },
  answer: { choice: "Just the answer", ends: "answering what they asked, and nothing more" },
};

export interface WritesBackRow {
  id: "reply_offer" | "not_now" | "said_no" | "wrong_person" | "away";
  label: string;
  value: string;
  /** Code decides it, whatever the owner says: the row has no act, only the lock. */
  fixed: boolean;
}

/** What an answer offering the booking link ends with where How it answers has none: the answer, and no link. */
const NO_BOOKING_LINK = "answering what they asked: there is no booking link to offer yet";

/**
 * What a reply from a lead sets off, by what it was read as (contracts readingPlan, replies/reading.ts): the one table
 * of effects, said as the page says it. Only what the answer offers is the owner's to choose. With Autonomy's Replies
 * quiet nothing is drafted (mayDraftReply), and the rows say so themselves: a phone hides a filled row's hint. The
 * booking link is offered only where the receptionist has one (drafts/writer.ts), so with none the row says so.
 */
export function writesBackRows(offer: ReplyOffer | undefined, mode: string, hasBookingLink: boolean): WritesBackRow[] {
  const chosen = offer ?? "booking_link";
  const ends = chosen === "booking_link" && !hasBookingLink ? NO_BOOKING_LINK : REPLY_OFFER_WORDS[chosen].ends;
  const drafted = mayDraftReply(mode);
  const later = "A step on Today says to write again on the day they named";
  return [
    {
      id: "reply_offer",
      label: "Interested, or a question",
      value: drafted
        ? `Your sequence stops for them. An answer is drafted for you to send, ${ends}`
        : "Your sequence stops for them. Nothing is drafted while Autonomy › Replies stays quiet",
      fixed: false,
    },
    { id: "not_now", label: "Not now", value: drafted ? `A thanks is drafted. ${later}` : later, fixed: true },
    {
      id: "said_no",
      label: "No",
      value: "Marked Said no. Their address and their company are never written to again",
      fixed: true,
    },
    { id: "wrong_person", label: "Wrong person", value: "A step on Today names who to write to instead", fixed: true },
    { id: "away", label: "Away", value: "Waits, and writes again the day they're back", fixed: true },
  ];
}

/**
 * Whether an answer is drafted, by Autonomy's Replies row: only its quiet mode stops one (the drafter's own rule,
 * mayDraftReply), and whatever else it is set to, the draft waits for a person to send it.
 */
export function replyModeHint(mode: string): string | null {
  // Quiet, the row's own value says nothing is drafted (writesBackRows), and this would say it twice.
  return mayDraftReply(mode) ? "Drafted while Autonomy › Replies is on. Only you send it." : null;
}

/** Every word the page says that is not a row's own value (the canvas, Version 3). */
export const REACH_OUT_SETTINGS_WORDS = {
  tab: "How it reaches out",
  gap: "Add what you offer, so cold emails have something to say",
  offer: {
    title: "What you offer",
    sub: "What every first email is about",
    offer: "Your offer",
    whoFor: "Who it's for",
    fixes: "What you fix for them",
    empty: "Not set",
    fromAbout: "Read from what your business does, until you write it here.",
    fromGoal: "Read from your goal on Details, until you write it here.",
    placeholders: {
      offer: "After-hours cleaning for dental offices, so every morning starts spotless.",
      whoFor: "Dental and medical clinics in Austin",
      fixes: "Cleaners who come in during opening hours, or miss rooms",
    },
  },
  proof: {
    title: "Proof you stand behind",
    sub: "The only claims it may make about you",
    add: "Add a claim",
    foot: "One per email, word for word. It never makes one up.",
    placeholder: "We clean 40 clinics across Austin today.",
    claim: (n: number) => `Claim ${n}`,
    remove: (n: number) => `Remove claim ${n}`,
    count: (sends: number) => (sends > 0 ? `In ${sends} email${sends === 1 ? "" : "s"}` : "Not used yet"),
  },
  writes: {
    title: "How it writes",
    sub: "Your voice in cold emails",
    tone: "Tone",
    tonePlaceholder: "Direct and friendly, no small talk",
    toneHint: "Cold emails only. How it answers keeps its own.",
    toneFrom: "The receptionist's, until you set one for cold emails.",
    voice: "How you write",
    voiceNone: "Nothing learned yet",
    voiceFrom: "Learned from how you write",
    memory: "Also in Memory",
    paste: "Paste an email",
  },
  signOff: {
    title: "Sign-off",
    sub: "Under every email",
    signedBy: "Signs as",
    signedByHint: "Or the name on the mailbox. A sequence can sign its own.",
    signedByFrom: "From your newest sequence, until you set it here.",
    signatureNone: "Not added",
    signature: "Signature",
    signatureHint: "Under its name, in every email Chanlytics sends. One you send yourself gets your mail app's.",
    placeholders: { signedBy: "Maya", signature: "Maya Ortiz, Owner, Brightline Cleaning", phone: "(512) 555-0148" },
    phone: "Phone in the signature",
    phoneNone: "Not added",
    foot: "At the bottom",
    footValue: "Your address, and a way to say no",
    footHint: "The law asks for both, so it's always added.",
    footAct: "Address on Details",
  },
  sendsFrom: {
    title: "Where it sends from",
    sub: "Your own mailbox, never ours",
    mailbox: "Mailbox",
    none: "Not connected",
    connections: "Connections",
    month: "This month",
    monthValue: (sent: number, of: number) =>
      `${sent.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} first emails`,
    byHand: "Without a mailbox",
    byHandValue: (perDay: number) => `To send hands you up to ${perDay} a day, and you send them`,
    toSend: "To send",
  },
  writesBack: {
    title: "When a lead writes back",
    sub: "Read as it arrives. Nothing replies on its own.",
    modeDoor: "Open Autonomy",
  },
  rules: { title: "Rules it always keeps", sub: "They keep your emails out of spam", mark: "Always on" },
  told: {
    title: "What it's told",
    sub: "What each writer reads, and its share",
    value: "Three writers: the sequence's words, the line about each business, and an answer to a reply",
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
  try: {
    title: "Try it on a lead",
    sub: "Before a business does",
    key: "Write one for a lead you have",
    value: "See it, where each line came from, and fix the row that wrote it",
    act: "Write one",
    another: "Another lead",
    rewrite: "Write another",
    open: "Open the sequence",
    none: "Start a sequence first: its first email is what Try it writes.",
    noneAct: "Start one in New",
    legend: { them: "Their listing", proof: "Your proof", words: "Your words" },
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
  /** What the business does, in its own words (business_records.about): what a cold email offers until the owner says. */
  about: string | null;
}
