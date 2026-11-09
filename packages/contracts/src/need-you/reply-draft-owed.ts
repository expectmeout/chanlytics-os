/**
 * When a thread is owed a draft (decision 0093): the one question the hold's subscriber, the job, the sweep and the edge's
 * door all ask, and what the drafter checks of what it wrote. The server's alone: the pages read reply-drafts.ts.
 */
import { replyWindow } from "../config/policy/prices";
import { windowClockOf } from "../config/policy/reply-limits";
import { holdActOf } from "../conversations/escalations";
import type { ReplyDraftKind } from "./reply-drafts";

/** What the question reads of a thread (packages/db replyDraftFactsOf). */
interface DraftOwedFacts {
  /** The open hold's reason, or null with none. */
  holdReason: string | null;
  /** Their newest message: what a reply answers. A call-back's brief may have none. */
  forMessageId: string | null;
  /** The wire a reply goes by (answerWireOf), or null on a thread with no written wire: a call's. */
  wire: string | null;
  /** When they last wrote on the wires with a window (windowClockOf). */
  clocks: { whatsapp: string | null; instagram: string | null };
  /** They asked to stop (isOptedOutContact): nothing may be sent, so nothing is drafted. */
  optedOut: boolean;
  /** The thread was set aside as not a customer's (00539). */
  setAside: boolean;
  /** The receptionist's own reply is queued for their newest message: its countdown is that thread's draft. */
  queuedReply: boolean;
  /** Their newest message answers a reach-out: what it means is read (reply_read), and the reading says whether to draft. */
  reachOutReply: boolean;
  now: Date;
}

/**
 * The draft a thread is owed, or null. A hold that waits for a reply is owed one, where a reply can go; a call-back's a
 * brief, whatever the wire; a booking request's is written on its press (the card's Can't); a hold that asks for nothing
 * to be sent, none. WhatsApp past its window and a DM past its own have the approved message or nothing to answer with,
 * so words written ahead would be words that cannot go.
 */
export function replyDraftOwed(
  draftOwedFacts: DraftOwedFacts,
): { kind: ReplyDraftKind; forMessageId: string | null } | null {
  if (!draftOwedFacts.holdReason || draftOwedFacts.setAside || draftOwedFacts.optedOut || draftOwedFacts.reachOutReply)
    return null;
  const act = holdActOf(draftOwedFacts.holdReason);
  if (act === "call_back") return { kind: "brief", forMessageId: draftOwedFacts.forMessageId };
  if (act !== "reply" || !draftOwedFacts.forMessageId || !draftOwedFacts.wire || draftOwedFacts.queuedReply)
    return null;
  const clock = windowClockOf(draftOwedFacts.wire, draftOwedFacts.clocks);
  if (!replyWindow(draftOwedFacts.wire, clock, draftOwedFacts.now).open) return null;
  return { kind: "reply", forMessageId: draftOwedFacts.forMessageId };
}

/** The share of the day's tokens a draft written ahead may use up to: the rest is the receptionist's (decision 0093, D9). */
const DRAFT_HEADROOM = 0.85;

/**
 * Whether the day's tokens leave room for a draft nobody is waiting on: live replies keep the last of them. A member
 * waiting on their own Rewrite is held to the cap alone (tokenBudgetSpent).
 */
export function draftHeadroomSpent(cap: number, used: number): boolean {
  return cap > 0 && used >= cap * DRAFT_HEADROOM;
}

/** What Why this? says each thing the drafter handed the model is. */
export const DRAFT_USED_WORDS = {
  email: "their email",
  message: "their message",
  facts: "your facts",
  hours: "your hours",
  link: "your booking link",
  thread: "the thread",
  notes: "your notes on them",
} as const;

/**
 * A promise of our own follow-up by a time ("I'll get back to you today", "we'll call you tomorrow", "within the hour"), which
 * puts a commitment in the mouth of someone who has not made it. "We're open today until 6" is a fact, and is left alone.
 * Lower-cased words, in the languages a model most often answers in: the rule in the prompt is what holds the rest.
 */
const OUR_FOLLOW_UP =
  /\b(?:i|we|i'll|we'll|i will|we will|someone|the team)\b[^.!?\n]{0,40}\b(?:get back|come back|reply|respond|follow up|call|text|write|reach out|let you know|send|be in touch|confirm)\b[^.!?\n]{0,30}\b(?:today|tonight|tomorrow|this (?:morning|afternoon|evening|week)|by (?:noon|tonight|the end of|end of|eod)|within (?:the|an|a|\d+)|in (?:an|a|\d+) (?:hour|minute|day)s?|shortly|right away|asap)\b/;

/**
 * Whether a draft promises our own follow-up by a time the owner's own words (`given`: their instruction, what they kept)
 * did not. The brain is told not to: this is what is checked of what it wrote.
 */
export function promisesAFollowUpTime(text: string, given: string): boolean {
  const sentence = text.toLowerCase().replace(/’/g, "'");
  return OUR_FOLLOW_UP.test(sentence) && !OUR_FOLLOW_UP.test(given.toLowerCase().replace(/’/g, "'"));
}

/** Told once more where a draft promised a time anyway. */
export const NO_FOLLOW_UP_TIME =
  "Your last answer promised a time for coming back to them. Write it again and name no day or time for it: say you will find out and come back to them.";

/** A pitch's sentence is under this many words. */
const PITCH_WORDS_UNDER = 20;

/** Where a pitch's sentence parts into clauses: a comma, a semicolon or a colon, a spaced dash, a sentence's end. */
const CLAUSE_EDGE = /(\s*[;,:]\s*|\s+[—–-]\s+|(?<=[.!?])\s+)/;

/** A clause that says what the page already says beside the sentence: not a customer, not someone served, no reply. */
const SAYS_THE_VERDICT = [
  /\bnot (?:a |an |one of )?(?:your |their |the business's )?(?:customer|client|prospect)s?\b/i,
  /\bneither (?:a |an )?(?:customer|client|prospect)\b/i,
  /\bnot someone (?:you|they|the business) serves?\b/i,
  /\bno (?:reply|response|answer)\b/i,
  /\bno need to (?:reply|respond|answer)\b/i,
];

const tidyEnd = (s: string): string => s.replace(/[\s,;:—–-]+$/, "");

/**
 * What the sender was read to want, as the page says it beside "Not someone you serve?": a clause that says the verdict
 * is left out, and the clauses that fit under the word limit are kept; a first clause too long for it is cut, and says so
 * with an ellipsis. Held in code, since a rule told to a model did not hold: of the three pitches kept on 2 and 3 Nov 2026,
 * all ran to 20 words or more and two said "not a customer" after the page's own question. A sentence that is the verdict
 * alone keeps its words: that it is a pitch is worth more than how it is said.
 */
export function pitchKept(pitch: string): string {
  // The split keeps each edge between its clauses (CLAUSE_EDGE captures it), so a clause kept is joined as it was written.
  let kept = "";
  let words = 0;
  let edge = "";
  for (const [i, piece] of pitch.trim().split(CLAUSE_EDGE).entries()) {
    if (i % 2) {
      edge = piece;
      continue;
    }
    const clause = piece.trim();
    if (!clause || SAYS_THE_VERDICT.some((r) => r.test(clause))) continue;
    const parts = clause.split(/\s+/).length;
    if (kept && words + parts >= PITCH_WORDS_UNDER) break;
    kept = kept ? `${kept}${edge}${clause}` : clause;
    words += parts;
  }
  const sentence = kept || pitch.trim();
  const all = sentence.split(/\s+/);
  const within =
    all.length >= PITCH_WORDS_UNDER ? `${tidyEnd(all.slice(0, PITCH_WORDS_UNDER - 1).join(" "))}…` : tidyEnd(sentence);
  if (!within) return "";
  const ended = /[.!?…]$/.test(within) ? within : `${within}.`;
  return ended.charAt(0).toUpperCase() + ended.slice(1);
}

/** What a thread set aside says it was, where the reading said nothing of it: a program's mail has no words of its own. */
const NOTICE_SENTENCE = "A program's mail, with nobody behind it.";

/** The sentence a sender read as not writing to the business as a customer is kept with. */
export const setAsideSentence = (about: string | null | undefined): string => pitchKept(about ?? "") || NOTICE_SENTENCE;

/** The kinds of a sender's reading that set a thread aside (decision 0093): selling to the business, or a program's mail. */
export const setsAside = (kind: string): kind is "pitch" | "notice" => kind === "pitch" || kind === "notice";

/** What a send did with the draft that stood when it went (messages.meta.draft): the number Health says (decision 0093). */
type DraftUse = "as_written" | "edited" | "not_used";

/** How many of a draft's words must still stand for a reply to be it, edited, rather than a reply of the member's own. */
const EDITED_KEEPS = 0.5;

const wordsIn = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** What a reply did with the draft: sent as it was written, changed, or written apart from it. Coarse on purpose. */
export function draftUseOf(draft: string, sent: string): DraftUse {
  if (draft.trim() === sent.trim()) return "as_written";
  const theirs = new Set(wordsIn(sent));
  const words = wordsIn(draft);
  const kept = words.filter((w) => theirs.has(w)).length;
  return words.length && kept / words.length >= EDITED_KEEPS ? "edited" : "not_used";
}

/**
 * The one thing a model is still asked of a call back (his calls D13 and D14, 9 Nov 2026): whether the caller is selling to the
 * business. What they want, their call and their record are already stored, so no notes are written; the one real note in
 * production coached an owner through what looks like a sales call, and saying so is what would have helped. When unsure, no: a
 * customer told they look like a salesperson is the worse mistake.
 */
export const CALL_SELLING_RULES =
  "You read the record of a call to a small business. Say whether the caller is selling something to the business (marketing, a " +
  "listing, search rankings, card processing, a vendor's service, a scam about any of those) rather than being a customer, or " +
  "someone who wants what the business offers. When unsure, say no. `what` says in a few plain words what they are selling, " +
  "and is empty if they are not.";

/** The shape that read is answered in. */
export const CALL_SELLING_SCHEMA = /* @__PURE__ */ (() => ({
  type: "object",
  properties: { selling: { type: "boolean" }, what: { type: "string" } },
  required: ["selling", "what"],
  additionalProperties: false,
}))();

/** The most that read may take: one line. */
export const CALL_SELLING_MAX_TOKENS = 120;

/** The model's answer as what they are selling, or null where they are not, or it said nothing readable. */
export function callSellingOf(answer: unknown): string | null {
  const a = answer && typeof answer === "object" && !Array.isArray(answer) ? (answer as Record<string, unknown>) : {};
  if (a.selling !== true) return null;
  const what = typeof a.what === "string" ? a.what.trim() : "";
  return what || "someone selling to you";
}

/** The most a draft may take. */
export const DRAFT_MAX_TOKENS = 900;
