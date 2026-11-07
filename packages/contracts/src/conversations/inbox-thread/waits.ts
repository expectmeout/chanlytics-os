/** Inbox thread: waits. */

import { needsYouCount, threadWait, threadWaits, type WaitingThread, type Waits } from "../../waits/waits";
import { replyWaitsOnYou, standingOfThread } from "../standing";
import { isOptedOut, type ConversationDto } from "../thread-dto";
import { mayRing } from "../../consent/consent";
import { REPLY_DRAFT_WORDS } from "../../need-you/reply-drafts";
import { emailStoppedWords } from "../thread-contact";
import { DRAFTED_TODO, waitsOnAPerson, type EscalationDto } from "../escalations";
import type { InboxThreadVM } from "../inbox-thread-vm";
import { moveWaits, threadMoveNow, threadMoveOf } from "../../waits/thread-move";

/** Archived, and set aside while it stays so: a new message that came in anyway reopens it, an ordinary thread again. */
export const archivedOf = (dto: ConversationDto): Pick<InboxThreadVM, "archived" | "setAside"> =>
  dto.state === "archived" ? { archived: true, ...(dto.set_aside_at ? { setAside: true } : {}) } : { archived: false };

/**
 * Where a thread sits and who owes it work — the single implementation.
 *
 * Exported so the sidebar badge and Today's brief can agree without either one
 * re-deriving it. /metrics' `escalations_open` is NOT this number: it counts
 * open escalations, including ones a teammate has already claimed, so it reads
 * high exactly when someone is doing the work.
 */
export function threadStanding(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  now = new Date(),
): { state: InboxThreadVM["state"]; takenOver: boolean; needsYou: boolean; claimedByOther: boolean } {
  // One rule for the Inbox, People and Today (standing.ts). Snoozed wins over
  // escalated, and that ordering is the whole point.
  //
  // Snoozing used to RESOLVE the open escalation, because otherwise the thread
  // would have stayed in "Needs you" and the snooze would have done nothing.
  // The cost was the customer's request: at wake the thread reappeared as
  // "Handled" under the banner "Answered by the receptionist — no one asked
  // for you", while the person who had asked for a human was still waiting.
  // Snooze now leaves the escalation open and hides the thread by STATE, so
  // "come back to this later" means the request comes back too.
  const result = standingOfThread(dto, escalation, now.getTime());
  const state: InboxThreadVM["state"] =
    result.standing === "snoozed" ? "snoozed" : result.flagged ? "escalated" : "done";
  return {
    state,
    takenOver: result.takenOver,
    needsYou: result.standing === "needs_you",
    claimedByOther: result.claimedByOther,
  };
}

/**
 * Whether a thread waits on you NOW, read off the wire: the rule puts it in Needs you (thread-move.ts), whether a person
 * was asked for, nobody answered them or a reply of ours never reached them, or the receptionist's reply is counting
 * down and can still be stopped. The Inbox reads the same answer off its view model (rules.ts ixWaitsOnYou) for its chip,
 * its list and the sidebar's badge, with the one thing only a tab knows, a hold made in it; this is that count for a
 * page that holds the wire. Today published threadStanding alone, and overwrote the Inbox's badge with a number
 * that left the drafts out on every refresh: 21 on the chip, 19 on the badge (the 2 Oct 2026 audit). Both are
 * waits.ts threadWait now, the one rule of a thread that waits, handed the thread as the wire holds it.
 */
export function conversationWaitsOnYou(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  now = new Date(),
): boolean {
  return threadWait(waitingThread(dto, escalation, now), now.getTime()) !== null;
}

/** A conversation off the wire as the count reads it (waits.ts WaitingThread), by the rule (thread-move.ts). */
function waitingThread(dto: ConversationDto, escalation: EscalationDto | null, now: Date): WaitingThread {
  const nowMs = now.getTime();
  return moveWaits(threadMoveNow(threadMoveOf(dto, escalation, nowMs), nowMs));
}

/**
 * How the threads wait on you, over the threads a page holds and the open escalations: each thread read by
 * conversationWaitsOnYou, and an open escalation whose thread the page did not hold counted as a hold (unknown is not
 * handled). The Inbox and Today both read such a thread by its id (heldThreadIds), so a held thread is judged by its own
 * standing and only one whose read failed is counted unread. The threads' part of what waits on you (waits.ts
 * needsYouCount, which adds the runs waiting for a word, for the pages that say the parts apart), and no page drops a
 * customer flagged before the newest page.
 */
export function threadWaitsOf(
  conversations: readonly ConversationDto[],
  escalations: ReadonlyArray<EscalationDto & { conversation_id: string }>,
  now: Date,
): Pick<Waits, "holds" | "sends"> {
  // A hold that waits on nobody (a customer who asked to stop, opened before decision 0048) is not counted, held or not.
  const open = new Map(
    escalations.filter((e) => e.state === "open" && waitsOnAPerson(e.reason)).map((e) => [e.conversation_id, e]),
  );
  const held = new Set(conversations.map((c) => c.id));
  return threadWaits({
    threads: conversations.map((c) => waitingThread(c, open.get(c.id) ?? null, now)),
    unreadHolds: [...open.keys()].filter((id) => !held.has(id)).length,
    nowMs: now.getTime(),
  });
}

/** How many threads wait on you (threadWaitsOf's holds and held sends, as one number). */
export function threadsWaitingOnYou(
  conversations: readonly ConversationDto[],
  escalations: ReadonlyArray<EscalationDto & { conversation_id: string }>,
  now: Date,
): number {
  return needsYouCount({ ...threadWaitsOf(conversations, escalations, now), runs: 0 });
}

/**
 * The most threads one read by id asks for: GET conversations takes a list of ids this long (its route's limit), and a
 * page reads a held thread past the newest hundred by its id in one such read.
 */
export const HELD_BY_ID_MAX = 100;

/**
 * The threads of open holds a page does not hold, by id, for one read by id (HELD_BY_ID_MAX of them): the holds that wait
 * on a person first, then the rest (a customer's STOP, a hand-back), each thread once. One rule for the Inbox and Today,
 * so both ask the same ids and their reads are one; ordered so the limit never drops a waiting customer for a STOP.
 */
export function heldThreadIds(
  listed: ReadonlySet<string>,
  open: ReadonlyArray<{ conversation_id: string; reason: string; state?: string }>,
): string[] {
  const ids = new Set<string>();
  const holds = open.filter((e) => (e.state ?? "open") === "open" && !listed.has(e.conversation_id));
  for (const e of holds) if (waitsOnAPerson(e.reason)) ids.add(e.conversation_id);
  for (const e of holds) ids.add(e.conversation_id);
  return [...ids].slice(0, HELD_BY_ID_MAX);
}

/**
 * Whether a thread's held draft is still waiting, as its view model carries it: the draft is there and its deadline is
 * ahead, by the one rule the Inbox's Needs you reads (replyWaitsOnYou). A queued draft past its deadline is going out
 * in the owner's name, not waiting on them; Ask counts and names a held draft by this, as the Inbox does.
 */
export function heldDraftWaits(vm: Pick<InboxThreadVM, "heldDraft">, nowMs: number): boolean {
  return !!vm.heldDraft && replyWaitsOnYou({ endsAtMs: vm.heldDraft.sendsAtMs }, nowMs);
}

/**
 * What the reply box needs to know of the person before it offers a way to write: that they asked to stop (nothing can be
 * sent), whether they said yes to offers (which templates can go), and that mail to their address has stopped, which only
 * matters where the reply goes by email (a thread on WhatsApp or by text is not held by a bounced address).
 */
export function replyFacts(
  dto: ConversationDto,
  primaryChannel: InboxThreadVM["primaryChannel"],
  tz: string,
  now: Date,
): Pick<InboxThreadVM, "optedOut" | "dnc" | "offersOk" | "emailStopped"> {
  return {
    optedOut: isOptedOut(dto),
    dnc: !mayRing(dto.contact),
    offersOk: dto.contact.marketing_consent === "opted_in",
    emailStopped: primaryChannel === "email" ? emailStoppedWords(dto.contact, tz, now) : null,
  };
}

/**
 * What a snoozed thread's band says: what a snooze is on a real thread (hidden, not paused: the receptionist keeps
 * answering, and a new message brings it back), then the request still open on it, in its reason's label (the row's
 * subject), which is still waiting. The page built this sentence, and joined a label that says two things to it under a
 * second dash.
 */
export function snoozedThreadWords(openRequest: string | null): string {
  const hidden = "Hidden from your queue. The receptionist still answers, and a new message brings it back.";
  return openRequest ? `${hidden} ${openRequest}. That's still waiting for you.` : hidden;
}

/**
 * What an open thread says around the conversation, on a phone first (the phone thread's canvas, 16 Oct 2026): the bar's
 * one fact about WhatsApp's window, the dock's acts over the reply box, the ask a hand back makes when what they wrote has
 * no answer, a reply box's words, a message that did not send, and the template box's.
 */
export const THREAD_PANE_WORDS = {
  /** WhatsApp's window, shut: the bar's one quiet fact, and why a press away. */
  chatClosed: "Chat closed",
  chatClosedWhy:
    "A day after their last message, WhatsApp delivers only an approved message. Sending one reopens the chat.",
  /** The closed chat's line at the dock's head (the thread canvas, 1 Nov 2026), and its press for why. */
  chatClosedLead: "Chat window closed",
  chatClosedRest: (first: string) => `only an approved template can reach ${first} now.`,
  why: "Why?",
  /** The template box: its choices' name to a screen reader, its send, and the call beside it. */
  templateChoices: "Template",
  sendTemplate: "Send template",
  /** Instagram's window, shut: a business may not write at all, and has no approved message to write with. */
  dmClosedWhy: "A day after their last message, Instagram lets you reply only once they write again.",
  /** The dock's acts on a thread left unanswered (THREAD_PANE_WORDS.unanswered). "No reply needed" archives it. */
  call: "Call",
  noReplyNeeded: "No reply needed",
  /** Asked in the dock before a hand back leaves what they wrote with nothing sent. */
  handBackAsk: (first: string) => `${first}'s message has no answer yet.`,
  handBackWhy: "Handing back sends nothing, and the receptionist won't come back to it.",
  answerFirst: "Answer first",
  handBackAnyway: "Hand back anyway",
  /** A thread you have, as the dock says it, with the one act it takes. */
  yours: "You have it.",
  yoursFact: "The receptionist is quiet",
  /** The reply box on a thread a teammate has: what a reply does. */
  takeFrom: (name: string) => `Reply to take it from ${name}…`,
  /** Our words that did not send: send them again as they were, or put them in the box. */
  sendAgain: "Send again",
  edit: "Edit",
  /** The template box: what sending one does, what it is filled with, and its picker's head and groups. */
  reopens: "Reopens the chat",
  blank: (label: string) => label.toLowerCase(),
  pickTitle: (first: string) => `Reopen the chat with ${first}`,
  pickSub: "After a day, WhatsApp delivers only an approved message.",
  fitsNow: "Fits now",
  others: "Others",
  /** A template of the sample data, said beside its name where its title said "(sample)" (inboxTemplates `sample`). */
  sample: "Sample",
  /**
   * The header's one control, a glyph (the thread canvas, 1 Nov 2026): its name for a pointer and a screen reader, and
   * the headings of its menu's groups -- the conversation, the person (by their first name), the deal, the file.
   */
  /**
   * An email in the conversation, drawn as one (the thread canvas, 1 Nov 2026): a long one folded to its first lines
   * with the way to the rest, and what is not its words folded under them, each its own press.
   */
  emailWhole: "Show whole email",
  emailLess: "Show less",
  emailSignature: "Signature",
  emailFooter: "Footer & unsubscribe link",
  emailEarlier: "Earlier in the thread",
  /** Who an email of theirs went to, after their name at its head ("Maya Chen to you"). */
  emailToYou: "to you",
  /** The files an email came with, whose names alone were kept: counted on a fold of their own, why on a pointer. */
  filesNotKept: (n: number) => (n === 1 ? "1 file not kept" : `${n} files not kept`),
  filesNotKeptWhy: "Files in emails aren't kept. Ask them to send it another way if you need it.",
  /** An owner's first message from someone: the way to say it is not someone the business serves, beside it. */
  firstEmail: (first: string) => `First message from ${first}. Not someone you serve?`,
  notACustomer: "Not a customer",
  /** The dock's lead where the receptionist's draft found what they wrote was not a customer's: what it is follows. */
  pitchLead: "Not someone you serve?",
  /** The quiet mark where the receptionist held the thread for a person, with its time (the reason is the dock's). */
  heldForYou: "Held for you",
  /** A head's state while a draft counts down to send ("Sends in 0:42"), and the draft's own line over it. */
  sendsIn: "Sends in",
  notSentYet: "Not sent yet",
  sendsInLower: "sends in",
  sendNow: "Send now",
  /** The draft's line while it does not count: paused while you are away, going, or held. */
  heldPaused: "paused while you're away",
  sendingNow: "Sending now…",
  heldStopped: "Held — it won't send",
  hold: "Hold",
  /** What its meter says to a screen reader, as it says the time left. */
  untilSends: (clock: string) => `${clock} until it sends`,
  /** The tip on the draft's line: what stops it. */
  heldTip: "This draft sends itself at zero. Edit, Hold or starting to type a reply stops it; Send now lets it go.",
  /** Under the reply box while a draft counts down: what typing does to it. */
  typingHolds: "Typing here holds the draft.",
  /** A draft's two tools: why it says what it says, and the receptionist writing it again as you ask. */
  whyThis: "Why this?",
  rewrite: "Rewrite",
  rewriting: "Rewriting…",
  rewriteAsk: "Tell it what to change…",
  rewriteLabel: "Tell the receptionist what to change",
  rewritten: "Rewritten — check it before you send",
  /** The reply box's send, said for its wire: an email's words, a chat's arrow alone. */
  sendEmail: "Send email",
  send: "Send",
  handBack: "Hand back",
  /**
   * A kept draft's Why this? (the thread canvas): the rule every kept draft is written by (contracts DRAFT_RULES), and
   * what it was handed (its `used`, said by code). Never a reason the model gave: a kept draft keeps none.
   */
  draftWhy:
    "Answers what they wrote last, from your business's facts. Where a fact is missing, it says you'll find out.",
  draftUsed: (used: readonly string[], signed: boolean) =>
    `Used: ${[...used, ...(signed ? ["your signature"] : [])].join(" · ")}`,
  /** The dock's lead over a hold whose draft is ready. */
  checkDraft: DRAFTED_TODO,
  ...REPLY_DRAFT_WORDS,
  /**
   * More's head: who it is about, how to reach them and since when (the person page's own words, people sinceWords:
   * "Since Aug 26"), and the way to their page. It lowered First contact's whole label, "first wrote aug 26", where every
   * other date reads "Aug 26" (3 Nov 2026).
   */
  personLine: (reach: string | null, since: string) => [reach, since].filter(Boolean).join(" · "),
  profile: "Profile",
  /**
   * More's acts on the person, under Contact: their receptionist, and the one that says they are no customer (decision
   * 0080), whose line says what it does in the words Today's Not a person says it (need-you/words.ts NOT_A_PERSON_WORDS).
   */
  receptionist: "Receptionist",
  notACustomerAct: "Not a customer…",
  notACustomerMeta: "Moves them out of People. Their mail stays.",
  /** The group of acts on who the conversation is with: "Contact", never their name again under the head that says it. */
  groupContact: "Contact",
  groupDealFile: "Deal and file",
  /** The conversation's own acts, as More and a desk's head say them. */
  snooze: "Snooze",
  snoozeMeta: "Until tomorrow, 10:00 AM",
  archive: "Archive",
  archiveMeta: "Closes it. A new message brings it back.",
  /** Over the reply box's words while they are Ask's draft, unchanged. Only words that send themselves are the receptionist's. */
  drafted: "Ask's draft",
  /** The handle on a phone's reply box, a button that opens it or folds it away, named by where it goes. */
  replyOpen: "Open the reply",
  replyFold: "Fold the reply away",
  more: "More",
  moreFor: (personName: string) => `More for the conversation with ${personName}`,
  groupConversation: "This conversation",
  groupDeal: "Deal",
  groupFile: "File",
  /** Under an email's words, what it will be signed with (emailSignedLine): where that is changed (decision 0081). */
  changeSignature: "Change",
  changeSignatureTip: "Change what your emails are signed with, in Settings › Connections",
} as const;
