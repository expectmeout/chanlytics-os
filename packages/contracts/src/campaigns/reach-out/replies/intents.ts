/** Replies: intents. */

import { clipAtWord } from "../../../conversations/message-words";
import { isOneOf } from "../../../shared/unknown";

/** What a reply means, in the spec's order (§4.7). */
export const REPLY_INTENTS = ["interested", "question", "not_now", "no", "wrong_person", "away", "other"] as const;

export type ReplyIntent = (typeof REPLY_INTENTS)[number];

export const isReplyIntent = (value: unknown): value is ReplyIntent => isOneOf(REPLY_INTENTS, value);

/**
 * What an owner may say the business wrote back to an email they sent from their own inbox (00429): a person's reply,
 * so never away (an automatic reply's) and never other (the model's word for mail it could not place).
 */
export const OWNER_SAID_INTENTS = ["interested", "question", "not_now", "no", "wrong_person"] as const;

export type OwnerSaidIntent = (typeof OWNER_SAID_INTENTS)[number];

/** An intent as the notice, the strip and the chip say it after "Wrote back · ". */
export const REPLY_INTENT_WORDS: Record<ReplyIntent, string> = {
  interested: "interested",
  question: "a question",
  not_now: "not now",
  no: "no",
  wrong_person: "wrong person",
  away: "away",
  other: "something else",
};

/**
 * An intent as the Inbox's chip says it (the pill kind `reply`, shell/tone.ts): what the reply was read as, or "Wrote back"
 * when it was not. The sentence beside it ("Wrote back · interested") keeps REPLY_INTENT_WORDS.
 */
export const REPLY_CHIP_WORDS: Record<ReplyIntent, string> = {
  interested: "Interested",
  question: "Question",
  not_now: "Not now",
  no: "Said no",
  wrong_person: "Wrong person",
  away: "Away",
  other: "Wrote back",
};

/**
 * Text held to a bound in characters: whole when it fits, else cut after a whole word with an ellipsis, the ellipsis
 * inside the bound.
 */
export function withinChars(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : clipAtWord(t, max - 1);
}

/** One reading of one reply: the model's answer, parsed (parseReplyReading). */
export interface ReplyReading {
  intent: ReplyIntent;
  /** At most REPLY_SUMMARY_WORDS words, in English. */
  summary: string;
  /** YYYY-MM-DD: not_now's first day to write again; away's day back. Null for every other intent. */
  day: string | null;
  /** Who they said to write to, as they wrote it: wrong_person only. */
  referTo: string | null;
  /**
   * Who signed it, as the reader found it (0052), unchecked: the person page's gate (signerOf) keeps it only when it
   * stands word for word in their own lines and is one person's own name. Null when nobody signed.
   */
  signer: { name: string; title: string | null } | null;
}

/** Why a reply was not read: it is `other`, and it is read again later (G4). The table's CHECK holds the same list. */
export const REPLY_UNREADS = ["no_model", "may_not_spend", "day_spent", "model_failed"] as const;

export type Unread = (typeof REPLY_UNREADS)[number];

export const isUnread = (value: unknown): value is Unread => isOneOf(REPLY_UNREADS, value);

/** Replies a workspace reads a UTC day (G4), beside the check's REACH_OUT_CHECKS_PER_DAY. */
export const REACH_OUT_READS_PER_DAY = 200;

/** How long after a reach-out's email a reply to it is read (G5). */
export const REACH_OUT_REPLY_DAYS = 30;
