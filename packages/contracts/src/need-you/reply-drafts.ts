/**
 * Ask's drafts, written ahead for the threads waiting on a person (decision 0071, E2): a reply to what they wrote last, or
 * the brief for a call back, kept on the thread (conversation_drafts, through its door) until they write again, so Today
 * opens with the words already there and every tab and teammate reads the same draft for one model call.
 *
 * A draft is the person draft's (POST people/[id]/draft, server/new-conversation/person-draft.ts) asked as the thread's
 * own: the same rules (only the facts, no price the owner did not give, no invented day), the same refusal of a price,
 * one shape. It is text: nothing is sent by drafting it, and it goes only through the reply's own door on a press.
 */
import type { CallBrief } from "../new-conversation/person-draft";

/** What a thread is drafted: a reply to its last message, or the brief for a call back. */
export const REPLY_DRAFT_KINDS = ["reply", "brief"] as const;
export type ReplyDraftKind = (typeof REPLY_DRAFT_KINDS)[number];

/** How many threads one read of the kept drafts names: Today's rows and a little more. */
export const REPLY_DRAFTS_IDS_MAX = 20;

/**
 * How many of the workspace's newest kept drafts the read that names no thread answers: Today's, read with its own first
 * reads before it knows its rows (there were three or four a workspace on 27 Oct 2026, one a thread that waited on a person).
 * Past them, a row whose draft is not among them is read by its thread, as before.
 */
export const REPLY_DRAFTS_NEWEST_MAX = 40;

/**
 * What a draft holds: the words (and a subject for an email), or the brief, or what Ask needed to know and could not
 * find in the facts (`asks`, said in the row instead of words; the owner writes it themself).
 */
export interface ReplyDraftWords {
  text: string;
  subject: string;
  brief: CallBrief | null;
  asks: string[];
}

/** A draft kept on a thread, as the read and the write answer it. */
export interface ReplyDraftDto {
  conversation_id: string;
  kind: ReplyDraftKind;
  /** The customer's message it answers: a draft for an older one is written again, since they have said more. */
  for_message_id: string | null;
  words: ReplyDraftWords;
  made_at: string;
  /**
   * The words an email reply from it is signed with, for the member reading, where a mailbox the business connected signs
   * it: the one it leaves from (00487), or, from the hosted address, theirs (decision 0081).
   */
  signed?: string;
}

/** What the thread's row tells Ask it is about, by kind: the plan the person draft writes from (its `about`). */
export interface ReplyDraftFacts {
  /** Why the receptionist handed it over, in words ("Asked for a person", "A booking it couldn't make"). */
  reason: string | null;
  /** What the phone receptionist left for a call back, or nothing. */
  details: string | null;
}

/**
 * The plan a thread's draft is written from, in the owner's voice, as the person draft takes it (`about`). A reply answers
 * what they wrote last and asks the owner nothing: where a fact is missing it says the owner will find out and come back
 * today, since the person is waiting now and the owner can still change every word before it goes.
 */
export function replyDraftAbout(
  kind: ReplyDraftKind,
  f: ReplyDraftFacts,
  /** The draft written again as the member asks: what it said, and how they want it changed. */
  change: { was: string | null; how: string } | null = null,
): string {
  const asked = change
    ? [
        change.was ? `Write your last draft again. It said: "${change.was}"` : "Write it again.",
        `Change it this way: ${change.how}`,
      ].join(" ")
    : null;
  if (kind === "brief") {
    return [
      "Call them back.",
      f.details ? `The phone receptionist left this for the call: ${f.details}` : null,
      "Prepare what I should say and ask on the call.",
      asked,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    "Reply to what they wrote last. They are waiting on a person.",
    f.reason ? `My receptionist handed it to me because: ${f.reason}.` : null,
    "Answer it from the facts you have. Do not ask me anything: where a fact is missing, say I will find out and get back to them today.",
    asked,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Whether a kept draft still answers the thread: it was written for the customer's newest message. */
export function draftIsCurrent(d: Pick<ReplyDraftDto, "for_message_id">, forMessageId: string | null): boolean {
  return d.for_message_id === forMessageId;
}

/** Whether a kept draft holds words to send (or a brief to read), not only a question Ask could not answer itself. */
export function draftHasWords(d: Pick<ReplyDraftDto, "kind" | "words">): boolean {
  return d.kind === "brief" ? d.words.brief !== null : d.words.text.trim().length > 0;
}
