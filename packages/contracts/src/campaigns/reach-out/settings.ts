/**
 * How it reaches out (decision 0113): Settings' page of what a cold email is written from, and what each writer reads
 * where the owner has said nothing yet. The section is the config's (`reach_out`, config-schema.ts); the page's words,
 * its rules and its read are here, so the page, Ask and the writers say one thing.
 *
 * Each writer reads the section with a fallback that is what it read before the page existed: the offer is what the
 * business does (business_records.about) and then the owner's goal; the tone is the receptionist's; the sign-off is
 * what the caller already knew. A workspace that never opens the page is written for exactly as before.
 */
import { REACH_OUT_LIMITS, type ReplyOffer } from "../../config/workspace-config/config-rules";
import { MAILBOX_RAMP } from "../../email/mailbox-standing";
import { mayDraftReply } from "./reply-draft";
import { REACH_OUT_REPLY_DAYS } from "./replies/intents";
import { REACH_OUT_WORDS_MAX, linksIn } from "./words/limits";

/** The config as the readers here take it: any parsed config, or a part of one. */
interface ReachOutReadable {
  reach_out?: {
    offer?: string;
    tone?: string;
    signed_by?: string;
    signature?: string;
    phone?: string;
    proof?: readonly string[];
    reply_offer?: ReplyOffer;
  };
  ask?: { goal?: string };
  brain?: { profile?: { tone?: string } };
}

const filled = (text: string | null | undefined): string | null => text?.trim() || null;

/** What a cold email offers: the owner's words on the page, else what the business does, else its goal. */
export function reachOutOfferOf(config: ReachOutReadable | null | undefined, about: string | null): string | null {
  return filled(config?.reach_out?.offer) ?? filled(about) ?? filled(config?.ask?.goal);
}

/** The tone a cold email is written in: its own, else the receptionist's. */
export function reachOutToneOf(config: ReachOutReadable | null | undefined): string | null {
  return filled(config?.reach_out?.tone) ?? filled(config?.brain?.profile?.tone);
}

/** The name a new sequence signs with: the page's, else what the caller knew (the member's first name, the last sequence's). */
export function reachOutSignedByOf(
  config: ReachOutReadable | null | undefined,
  otherwise: string | null,
): string | null {
  return filled(config?.reach_out?.signed_by) ?? filled(otherwise);
}

/**
 * What Sign-off puts under the name a cold email signs with: the Signature row's lines, the phone as the last; null where
 * both are empty. Every email Chanlytics sends carries it through the one ending rule (rules.ts coldEndingOf), which
 * keeps a mailbox's own signature in its place where the sequence signs with the mailbox.
 */
export function reachOutSignatureOf(config: ReachOutReadable | null | undefined): string | null {
  const lines = [...(config?.reach_out?.signature ?? "").split(/\r\n|\r|\n/), config?.reach_out?.phone ?? ""]
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

/** What may back a number in a step's own words: each claim the owner stands behind, and the business's name. */
export function reachOutBackingOf(config: ReachOutReadable | null | undefined, businessName: string | null): string[] {
  const claims = (config?.reach_out?.proof ?? []).map((c) => c.trim()).filter(Boolean);
  const name = filled(businessName);
  return name ? [...claims, name] : claims;
}

export type SignatureProblem = "too_long" | "too_many_lines" | "link";

/** What is wrong with a signature: longer than its limit, past its lines, or a link (the foot's link is code's). */
export function reachOutSignatureProblem(text: string): SignatureProblem | null {
  const t = text.trim();
  if (!t) return null;
  if (t.length > REACH_OUT_LIMITS.signature) return "too_long";
  if (t.split(/\r\n|\r|\n/).length > REACH_OUT_LIMITS.signatureLines) return "too_many_lines";
  return linksIn(t).length > 0 ? "link" : null;
}

/** The rules every cold email keeps, as the page states them: read from the numbers the code keeps. */
export function reachOutRuleLines(): string[] {
  const [first, ...later] = MAILBOX_RAMP.map((s) => s.perDay);
  const lastRise = later.pop();
  return [
    "Says only what their listing or website shows, never a guess",
    "No prices, discounts or dates",
    "No link in the first email, one at most after",
    `Under ${REACH_OUT_WORDS_MAX} words, no line in capitals. Ask keeps its own to 80, follow-ups to 50`,
    "Arrives 9 to 5 their time, while they're open",
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

/**
 * What a reply from a lead sets off, by what it was read as (contracts readingPlan, replies/reading.ts): the one table
 * of effects, said as the page says it. Only what the answer offers is the owner's to choose. With Autonomy's Replies
 * quiet nothing is drafted (mayDraftReply), and the rows say so themselves: a phone hides a filled row's hint.
 */
export function writesBackRows(offer: ReplyOffer | undefined, mode: string): WritesBackRow[] {
  const ends = REPLY_OFFER_WORDS[offer ?? "booking_link"].ends;
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

/** The refusal a row says under its box, by the limit it went past. */
export const REACH_OUT_REFUSAL_WORDS = {
  tooLong: (max: number) => `Keep it under ${max} characters.`,
  claims: `Up to ${REACH_OUT_LIMITS.claims} claims.`,
  signature: `${REACH_OUT_LIMITS.signatureLines} lines at most, and no link.`,
  unbacked:
    "Not written: it kept saying a number about your business that none of your claims backs. Add it to Proof you stand behind, on How it reaches out.",
} as const;

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
