/**
 * Ask's drafts, written when a reply becomes owed (decision 0093, amending 0071 E2): a reply to what they wrote last, or
 * the brief for a call back, kept on the thread (conversation_drafts, through its doors) until they write again, so every
 * page opens with the words already there and every tab and teammate reads the same draft for one model call.
 *
 * A draft is the receptionist's brain in its draft voice (edge drafts/writer.ts): everything the receptionist knows,
 * written for the person who will send it. It is text: nothing is sent by drafting it, and it goes only through the
 * reply's own door on a press. This module is what the pages read; what the server decides by is reply-draft-owed.ts.
 */
import { MIN_MS } from "../shared/time";
import type { CallBrief } from "../new-conversation/person-draft";
import type { DraftWhy } from "../campaigns/reach-out/reply-draft";
import { entryOf } from "../shared/unknown";

/** What a thread is drafted: a reply to its last message, or the brief for a call back. */
export const REPLY_DRAFT_KINDS = ["reply", "brief"] as const;
export type ReplyDraftKind = (typeof REPLY_DRAFT_KINDS)[number];

/**
 * The edition of what a draft is written by (the draft audience's rules in compose.ts, and the code's checks: edge
 * drafts/writer.ts). Kept on every draft: a draft from an earlier edition is no draft, and the sweep writes it again
 * within minutes. Moved with any change to them: #2081 changed the pitch's rule and left the edition alone, so the
 * sentences written before it stood. 5: the receptionist's brain writes every reply (decision 0093).
 */
export const REPLY_DRAFT_RULES = 5;

/**
 * Where a draft stands (conversation_drafts.state, 00538): being written, ready to use, not a customer's so no reply was
 * written, a question Ask could not answer itself (a draft kept before 0093; the receptionist's brain asks none), or
 * not written, and why.
 */
export const REPLY_DRAFT_STATES = ["writing", "ready", "pitch", "asks", "failed"] as const;
export type ReplyDraftState = (typeof REPLY_DRAFT_STATES)[number];

/** What asked for a draft: the thread's hold, a reply to a sequence, a member's change to one. */
export const REPLY_DRAFT_SOURCES = ["hold", "reach_out", "rewrite"] as const;
export type ReplyDraftSource = (typeof REPLY_DRAFT_SOURCES)[number];

/** Why a draft was not written (conversation_drafts.why_failed): a gate's word, or that it would have named money. */
export type ReplyDraftWhy = DraftWhy | "named_money";

/** What each why says on the page, and whether Try again can change it. */
const DRAFT_FAILED_WORDS: Readonly<Record<ReplyDraftWhy, { words: string; again: boolean }>> = {
  no_receptionist: { words: "Set up your receptionist to have replies drafted.", again: false },
  off: { words: "Drafts are off for this workspace.", again: false },
  budget: { words: "Today's drafting budget is used up.", again: false },
  may_not_spend: { words: "Drafts wait while this workspace is paused.", again: false },
  not_drafted: { words: "Couldn't draft this one.", again: true },
  named_money: { words: "It touches a price or a refund, so this one's yours.", again: true },
};

/** What a draft that was not written says, and whether it can be asked again: a why this build does not know is the last. */
export function draftFailedWords(reason: string | null | undefined): { words: string; again: boolean } {
  return entryOf(DRAFT_FAILED_WORDS, reason) ?? DRAFT_FAILED_WORDS.not_drafted;
}

/** A thread's draft over the reply box (decision 0093), in each state it is in; and a thread set aside, on its dock. */
export const REPLY_DRAFT_WORDS = {
  draftReadyRest: "use it, change it, or write your own",
  useDraft: "Use draft",
  useDraftLabel: "Use Ask's draft",
  drafting: "Drafting a reply…",
  tryAgain: "Try again",
  /** What Use draft says it replaced, for a few seconds: what you typed, a press away. */
  undoDraft: "Undo",
  undoDraftLabel: "Put back what you typed",
  /** Said once, to a screen reader, as a draft lands. */
  draftLanded: "Draft ready",
  /** The other way on a thread set aside, which brings it back to you with a draft. */
  replyAnyway: "Reply anyway",
  /** Said a moment, with its Undo, as Not a customer lands. */
  notACustomerDone: "Set as not a customer. Their mail stays out.",
} as const;

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
  /**
   * What they wrote was not a customer's (a sales pitch, a vendor, a newsletter), in one sentence, and no reply was
   * written for it. Absent from a server a deploy behind, and from a draft kept before the rules said it.
   */
  pitch?: string;
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
  /** Where it stands. Absent from a server a deploy behind, and from a row before 00538: `draftViewOf` reads its words. */
  state?: ReplyDraftState;
  /** What the drafter handed the model, as Why this? says it: said by code from its own prompt, never by the model. */
  used?: readonly string[];
  /** Why it was not written, where `state` is failed (ReplyDraftWhy). */
  why_failed?: string | null;
}

/** How long a draft may say it is being written before the page stops believing it: the job's tries and more. */
export const DRAFT_WRITING_STALE_MS = 5 * MIN_MS;

/** A thread's draft as every page reads it (`draftViewOf`): one answer for Today, the Inbox's row, the box and the card. */
export type ReplyDraftView =
  | { state: "none" }
  | { state: "writing" }
  | { state: "ready"; draft: ReplyDraftDto }
  | { state: "pitch"; what: string }
  | { state: "asks"; question: string }
  | { state: "failed"; why: string; again: boolean };

/** One object each, as a store's snapshot must be. */
const DRAFT_NONE: ReplyDraftView = { state: "none" };
const DRAFT_WRITING: ReplyDraftView = { state: "writing" };

/** Where a kept row stands: its own state, or, on a row from before there was one, what its words say. */
function keptStateOf(d: ReplyDraftDto): ReplyDraftState {
  if (d.state) return d.state;
  if (draftHasWords(d)) return "ready";
  if ((d.words.pitch ?? "").trim()) return "pitch";
  return d.words.asks.length ? "asks" : "failed";
}

/**
 * What a thread's draft is, for every page (decision 0093). `kept` is the row the read answered for the thread and kind;
 * `forMessageId` their newest message; `expected` whether a draft is owed here (a hold that asks for a reply, where one
 * can go), so a thread whose row has not landed yet says it is being written, and one that owes none says nothing.
 * `askedAtMs` is when they wrote it: a draft that has not come by DRAFT_WRITING_STALE_MS after it is not said to be on its
 * way (a reach-out's reading decided against one, say), and the sweep or the reading still lands one if it is owed.
 */
export function draftViewOf(
  kept: ReplyDraftDto | null | undefined,
  fields: { forMessageId: string | null; expected: boolean; askedAtMs: number | null; nowMs: number },
): ReplyDraftView {
  if (!kept || !draftIsCurrent(kept, fields.forMessageId)) {
    const onItsWay =
      fields.expected && fields.askedAtMs !== null && fields.nowMs - fields.askedAtMs <= DRAFT_WRITING_STALE_MS;
    return onItsWay ? DRAFT_WRITING : DRAFT_NONE;
  }
  switch (keptStateOf(kept)) {
    case "writing": {
      if (fields.nowMs - Date.parse(kept.made_at) <= DRAFT_WRITING_STALE_MS) return DRAFT_WRITING;
      const stale = draftFailedWords("not_drafted");
      return { state: "failed", why: stale.words, again: stale.again };
    }
    case "ready":
      return { state: "ready", draft: kept };
    case "pitch":
      return { state: "pitch", what: (kept.words.pitch ?? "").trim() };
    case "asks":
      return { state: "asks", question: kept.words.asks[0] ?? "" };
    default: {
      const failed = draftFailedWords(kept.why_failed);
      return { state: "failed", why: failed.words, again: failed.again };
    }
  }
}

/** Whether a kept draft still answers the thread: it was written for the customer's newest message. */
export function draftIsCurrent(
  replyDraft: Pick<ReplyDraftDto, "for_message_id">,
  forMessageId: string | null,
): boolean {
  return replyDraft.for_message_id === forMessageId;
}

/** Whether a kept draft holds words to send (or a brief to read), not only a question Ask could not answer itself. */
export function draftHasWords(replyDraft: Pick<ReplyDraftDto, "kind" | "words">): boolean {
  return replyDraft.kind === "brief" ? replyDraft.words.brief !== null : replyDraft.words.text.trim().length > 0;
}
