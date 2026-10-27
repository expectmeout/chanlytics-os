/**
 * The Inbox's thread: where it stands and who owes it work (`threadStanding`), and the view model the page
 * draws (`toInboxThreadVM`) in the shape inbox-thread-vm.ts declares, with a quiet thread's last word. Its
 * words come from the thread-*, message-* and escalations modules beside it.
 */
import { formatPhoneDisplay } from "../shared/phone";
import { replyWhy, type ReplyWhyVM } from "../config/brain";
import { replyWindow, windowClockOf } from "../config/policy";
import { needsYouCount, threadWait, threadWaits, type WaitingThread, type Waits } from "../waits/waits";
import { HELD_WORDS, readingOf, replyWaitsOnYou, standingOfThread } from "./standing";
import { messageAt, isOptedOut, type ConversationDto, type MessageDto } from "./thread-dto";
import { mayRing } from "../consent/consent";
import { agentFor, answerWireOf, isChatMessage, writtenChannelOf, THREAD_CHANNEL_WORDS } from "./thread-channel";
import { contactName, contactMeta, emailStoppedWords, initialsOf } from "./thread-contact";
import { shortTime, bubbleTime, inboxThreadClock, waitedSince, type ThreadMoments } from "./thread-clock";
import { clockDate, clockHistoryDay, clockTime } from "../shared/clock";
import { mediaVM } from "./message-media";
import { emailLeftOutOf, emailFromNameOf, emailPartsOf, emailSignatureLine, emailSubjectsOf } from "./message-email";
import { replyLeftAsOf } from "../reach-out/reach-out-reply-words";
import {
  sentFactsOf,
  reachedCustomer,
  lastExchanged,
  isHeldDraft,
  heldDraftOf,
  draftSendsAtMs,
  messageWords,
  messageText,
  clipAtWord,
} from "./message-words";
import { messageVia, messageAuthor, messageWhy, lastWordLine, type MessageAuthor } from "./message-author";
import { openHoldAct, reasonLabelOf, reasonSummaryOf, waitsOnAPerson, type EscalationDto } from "./escalations";
import type { InboxThreadVM } from "./inbox-thread-vm";

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
  const v = standingOfThread(dto, escalation, now.getTime());
  const state: InboxThreadVM["state"] = v.standing === "snoozed" ? "snoozed" : v.flagged ? "escalated" : "done";
  return { state, takenOver: v.takenOver, needsYou: v.standing === "needs_you", claimedByOther: v.claimedByOther };
}

/**
 * Whether a thread waits on you NOW, read off the wire: it needs a person and nobody has it (threadStanding), or the
 * receptionist's reply is counting down and can still be stopped (standing.ts replyWaitsOnYou, which People's
 * Needs you reads as well). The Inbox reads the same two facts off its view model (rules.ts ixWaitsOnYou) for its chip,
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

/** A conversation off the wire as the count reads it (waits.ts WaitingThread): its standing, and its held draft's deadline. */
function waitingThread(dto: ConversationDto, escalation: EscalationDto | null, now: Date): WaitingThread {
  const draft = heldDraftOf(dto.messages);
  return {
    needsYou: threadStanding(dto, escalation, now).needsYou,
    send: draft ? { endsAtMs: draftSendsAtMs(draft) } : null,
  };
}

/**
 * How the threads wait on you, over the threads a page holds and the open escalations: each thread read by
 * conversationWaitsOnYou, and an open escalation whose thread the page did not hold counted as a hold (unknown is not
 * handled). The Inbox and Today both read such a thread by its id (heldThreadIds), so a held thread is judged by its own
 * standing and only one whose read failed is counted unread. THE threads' part of the one count (waits.ts
 * needsYouCount, which adds the runs waiting for a word), so Today's headline and the badge cannot differ, and neither
 * drops a customer flagged before the newest page.
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
function replyFacts(
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
} as const;

/** The wire one message travelled: a call's note is the phone, and words are the channel they were written on. */
const wireOf = (m: Pick<MessageDto, "type" | "channel">): InboxThreadVM["primaryChannel"] =>
  m.type === "call_summary" ? "phone" : writtenChannelOf(m.channel);

/**
 * The row's preview: the last thing that happened between them. A call's note counts, since a contact who has only ever
 * phoned has nothing else; a team's note does not, nor our words that never reached them.
 */
function previewOf(messages: readonly MessageDto[]): { text: string; channel: InboxThreadVM["previewChannel"] } {
  const last = [...messages]
    .reverse()
    .find((m) => m.type !== "note" && (m.direction === "inbound" || reachedCustomer(m.status)));
  return last ? { text: messageWords(last).slice(0, 110), channel: wireOf(last) } : { text: "", channel: null };
}

/**
 * The customer's own words where the decision is made. The reason's sentence
 * says why a person is needed; this says what they asked: the last thing they
 * wrote, which is what they are waiting on, or for a call back what the call
 * left behind -- the details the call back's sentence promises.
 */
function askOf(escalation: EscalationDto | null, lastInbound: MessageDto | undefined): InboxThreadVM["ask"] {
  if (!escalation) return null;
  if (escalation.reason === "callback") {
    const text = escalation.details?.trim();
    return text ? { kind: "call", label: "From the call", text, quoted: false, channel: "phone" } : null;
  }
  if (!lastInbound) return null;
  const wrote = lastInbound.type === "text";
  return {
    kind: wrote ? "wrote" : "sent",
    label: wrote ? "They wrote" : "They sent",
    text: messageWords(lastInbound),
    quoted: wrote,
    channel: wireOf(lastInbound),
  };
}

/** What the thread says of its reader: the dot, when the customer was last heard from, and their mark's stamp. */
function inboxReading(dto: ConversationDto): Pick<InboxThreadVM, "unread" | "heardAtMs" | "markAtMs"> {
  const { unseen, heardAtMs, markAtMs } = readingOf(dto.last_inbound_at, dto);
  return { unread: unseen, heardAtMs, markAtMs };
}

/** A thread's two clocks, each its wire's window reads (contracts windowClockOf). */
const clocksOf = (dto: ConversationDto) => ({ whatsapp: dto.last_wa_inbound_at, instagram: dto.last_ig_inbound_at });

/**
 * A bubble's words: a message's own, or an email's in its parts (emailPartsOf): what they wrote, its subject where it
 * changes from the thread's, the chain it quoted and the signature under it, and what the intake left out. Only an email
 * quotes and signs; a WhatsApp message that happens to start a line with ">" is words.
 */
function bubbleWordsOf(
  m: MessageDto,
  changed: ReadonlyMap<string, string>,
): { body: string; subject?: string; leftOut?: string; quoted?: string; signature?: { line: string; full: string } } {
  if (m.channel !== "email") return { body: messageText(m) };
  const parts = emailPartsOf(messageText(m), emailFromNameOf(m));
  const subject = changed.get(m.id);
  const leftOut = emailLeftOutOf(m.meta) ?? replyLeftAsOf(m.meta);
  return {
    body: parts.said,
    ...(subject ? { subject } : {}),
    ...(leftOut ? { leftOut } : {}),
    ...(parts.quoted ? { quoted: parts.quoted } : {}),
    ...(parts.signature ? { signature: { line: emailSignatureLine(parts.signature), full: parts.signature } } : {}),
  };
}

/** What the thread's emails are about, for its head; nothing on a thread with no email subject. */
const headSubjectOf = (thread: string | null): Pick<InboxThreadVM, "emailSubject"> =>
  thread ? { emailSubject: thread } : {};

export function toInboxThreadVM(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  /** The workspace's zone: every time in the thread is said by its clock. */
  tz: string,
  now = new Date(),
): InboxThreadVM {
  const who = contactName(dto);
  // takenOver = a human claimed it (assignee set by take-over/reply) — the pane
  // then shows the owned-thread strip + hand-back instead of the take banner.
  const { state, takenOver, needsYou, claimedByOther } = threadStanding(dto, escalation, now);
  const draftMsg = heldDraftOf(dto.messages);
  const heldDraft = draftMsg
    ? { messageId: draftMsg.id, body: messageText(draftMsg), sendsAtMs: draftSendsAtMs(draftMsg) }
    : null;
  const reasonLabel = escalation ? reasonLabelOf(escalation.reason) : null;
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  // The wire a reply goes out on, as the reply route picks it (replyWireOf): where they last wrote. A text thread said
  // WhatsApp, its window read closed, and its composer offered only templates, which the route refuses on a text; an
  // out-of-office from their address made a WhatsApp thread read as email.
  const chatChannel = answerWireOf(dto.messages);
  // replyWindow(), the rule the reply route enforces, on the wire it sends on. This decides whether the composer tells
  // the operator they can write freely; with two expressions those answers drift the moment either moves, and the
  // operator is told they can send something the server refuses. A text has no window, so the composer is open.
  const win = replyWindow(chatChannel, windowClockOf(chatChannel, clocksOf(dto)), now).open;
  // The channels the thread has actually used: a call note is the phone, any
  // other row is WhatsApp. A caller with no thread on WhatsApp gets phone
  // verbs, not a notice about a reply window that never opened.
  const hasCalls = dto.messages.some((m) => m.type === "call_summary");
  const hasChat = !!dto.last_wa_inbound_at || dto.messages.some(isChatMessage);
  const primaryChannel: InboxThreadVM["primaryChannel"] = hasChat || !hasCalls ? chatChannel : "phone";
  // Every wire the thread's written words travelled, the one a reply goes out on first: with more than one, a bubble
  // that came another way than the reply goes says its own (the page names a bubble's channel only then).
  const written = [...new Set(dto.messages.filter(isChatMessage).map((m) => writtenChannelOf(m.channel)))];
  const channels = [
    ...(hasChat || !hasCalls ? [chatChannel, ...written.filter((c) => c !== chatChannel)] : []),
    ...(hasCalls ? ["phone"] : []),
  ];

  const subjects = emailSubjectsOf(dto.messages);
  const timeline: InboxThreadVM["timeline"] = dto.messages.map((m) => {
    // A note the platform wrote on the thread is a line between the words, not a bubble: drawn as a bubble it read
    // "by WhatsApp Receptionist · Delivered", a reply the customer never got (the 2 Oct 2026 audit).
    if (m.type === "note") {
      return {
        type: "event" as const,
        kind: "note",
        at: bubbleTime(messageAt(m), tz, now),
        body: `Note: ${messageText(m)}`,
      };
    }
    const onPhone = m.type === "call_summary";
    const media = mediaVM(m);
    const why = messageWhy(m);
    return {
      type: "msg" as const,
      messageId: m.id,
      from: m.sender === "customer" ? ("client" as const) : ("agent" as const),
      channel: onPhone ? "phone" : writtenChannelOf(m.channel),
      ...bubbleWhen(messageAt(m), tz, now),
      ...bubbleWordsOf(m, subjects.changed),
      ...(media ? { media } : {}),
      ...(why ? { why } : {}),
      // Who said it, per BUBBLE. The thread carries one agent identity, and the
      // pane rendered that under every agent row — so a phone call summary was
      // signed "by WhatsApp Receptionist", crediting the wrong assistant with
      // work it did not do. The bubble already knows its own channel.
      ...(m.sender !== "customer"
        ? (() => {
            const a = agentFor(onPhone ? "phone" : writtenChannelOf(m.channel));
            return { agentName: a.name, agentGlyph: a.glyph };
          })()
        : {}),
      ...(m.sender === "human" ? { byYou: true } : {}),
      // The words Conversations says too (messageAuthor): a person's reply is the team's.
      ...(m.sender === "human" && messageAuthor(m) ? { byWords: (messageAuthor(m) as MessageAuthor).words } : {}),
      ...(messageVia(m) ? { via: messageVia(m)! } : {}),
      // What became of it: the words for its status, why it failed (one sentence for the owner, drawn under "Didn't send"),
      // and whether the words left (the receptionist's failed reply was drawn as a sent bubble, I1). Said in message-words.ts,
      // so this pane and the Conversations pane cannot describe the same message differently.
      ...(m.sender !== "customer" && m.status ? { status: m.status, ...sentFactsOf(m) } : {}),
      // A held draft is not a sent message and must not read as one.
      ...(isHeldDraft(m) ? { pending: true as const, sendsAtMs: draftSendsAtMs(m) } : {}),
    };
  });
  if (escalation) {
    // insert chronologically — appending would read "reply, then flagged"
    const idx = dto.messages.findIndex((m) => m.created_at > escalation.created_at);
    const entry = {
      type: "event" as const,
      kind: "flag",
      at: shortTime(escalation.created_at, tz, now),
      // Why it was flagged, and the details that say more -- except a call back's, which are the band's own sentence (the
      // to-do): quoted here as well, they were said a third time. Any other reason's details, the cause of a failed send,
      // are said only here.
      body: `Flagged for a human — ${reasonLabel}${escalation.details && escalation.reason !== "callback" ? ` · “${clipAtWord(escalation.details, 120)}”` : ""}`,
    };
    if (idx === -1) timeline.push(entry);
    else timeline.splice(idx, 0, entry);
  }

  // The moments its times are said from, and their words by this read's clock: one rule with a page that says them again
  // for a thread read earlier (thread-clock.ts inboxThreadClock).
  const moments = threadMoments(dto, escalation, state);
  const ask = askOf(escalation, lastInbound);

  const { lastWord, unanswered } = quietWordsOf(dto, state, tz, now);
  const preview = previewOf(dto.messages);

  return {
    id: `th-${dto.id}`,
    real: true,
    conversationId: dto.id,
    clientId: dto.contact.id || null,
    escalationId: escalation?.id ?? null,
    holdAct: openHoldAct(escalation),
    windowOpen: win,
    ...replyFacts(dto, primaryChannel, tz, now),
    who,
    whoMeta: contactMeta(dto, THREAD_CHANNEL_WORDS[primaryChannel]),
    avatar: initialsOf(who),
    state,
    takenOver,
    needsYou,
    claimedByOther,
    assigneeUserId: dto.assignee_user_id ?? null,
    ask,
    archived: dto.state === "archived",
    lastWord,
    unanswered,
    heldDraft,
    ...(heldDraft
      ? {
          veto: {
            window: Math.max(1, Math.round((heldDraft.sendsAtMs - new Date(draftMsg!.created_at).getTime()) / 1000)),
            draft: heldDraft.body,
            endsAtMs: heldDraft.sendsAtMs,
            messageId: heldDraft.messageId,
            ...(replyWhy(draftMsg!.meta) ? { why: replyWhy(draftMsg!.meta) as ReplyWhyVM } : {}),
          },
        }
      : {}),
    channels,
    primaryChannel,
    replyVia: THREAD_CHANNEL_WORDS[primaryChannel],
    hasChat,
    phone: dto.contact.phone_e164 ?? null,
    phoneDisplay: formatPhoneDisplay(dto.contact.phone_e164),
    proposalUrl: dto.contact.proposal_url?.trim() || null,
    agent: agentFor(primaryChannel),
    // The list's row says each thing once: why a person is needed (this), whose it is (its pill), how long they have
    // waited (beside the name) and what they asked (ask). A thread nobody needs to act on has no reason, and its row is
    // the last thing that happened. The subject said "A teammate is answering this" under a pill naming the teammate,
    // "You're answering this one" under "You have it", and a quiet thread's last words twice when they wrote last.
    subject: reasonLabel ?? "",
    ...headSubjectOf(subjects.thread),
    preview: preview.text,
    previewChannel: preview.channel,
    // A thread a teammate has is theirs to answer: the reason's sentence ("they're
    // waiting on you") would tell everyone else the opposite of what is true.
    summary: claimedByOther
      ? HELD_WORDS.theirs.sentence
      : escalation
        ? // A call back's to-do is its one sentence: "They phoned and the receptionist couldn't finish it." sat beneath the
          // call it describes, over "From the call: <the to-do>". Without a to-do, the reason's sentence.
          escalation.reason === "callback" && escalation.details?.trim()
          ? escalation.details.trim()
          : reasonSummaryOf(escalation.reason)
        : takenOver
          ? HELD_WORDS.yours.sentence
          : lastWord
            ? lastWord.text
            : "The receptionist answered this on its own. Nothing is owed.",
    ...moments,
    ...inboxThreadClock(moments, tz, now.getTime()),
    // The dot is the reader's own (standing.ts isUnseen, 00349; inbox-thread-vm.ts says what it meant before).
    ...inboxReading(dto),
    pinned: false,
    tags: [],
    priority: "P2",
    timeline,
  };
}

/**
 * The moments a thread's times are said from (thread-clock.ts inboxThreadClock): when it last moved, when the hold it
 * waits on was opened, and when a snooze wakes.
 */
function threadMoments(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  state: InboxThreadVM["state"],
): ThreadMoments {
  const wakeAtMs = state === "snoozed" && dto.snooze_until ? Date.parse(dto.snooze_until) : Number.NaN;
  return {
    lastAtMs: dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    ...(escalation ? { escalatedAtMs: new Date(escalation.created_at).getTime() } : {}),
    ...(Number.isFinite(wakeAtMs) ? { wakeAtMs } : {}),
  };
}

/**
 * When a bubble was said, by the business's clock: its moment as the thread has always said it, and its day as the thread
 * heads a day's run with its time alone ("Thu Sep 17", "10:13 AM"). The thread heads each day once and gives a bubble its
 * time alone (the phone thread's canvas, D1): "Sep 17 · 10:13 AM" over every run said the day again and again.
 */
function bubbleWhen(iso: string, tz: string, now: Date): { at: string; day: string; time: string } {
  const at = bubbleTime(iso, tz, now);
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { at, day: "", time: "" };
  return { at, day: clockHistoryDay(ms, tz, now.getTime()), time: clockTime(ms, tz) };
}

/**
 * A quiet thread's one line: who had the last word, and whether a reply didn't send (lastWordOf, I1), or that what they
 * wrote was held and closed with nothing sent (unansweredOf). None for a thread that is not quiet, or archived.
 */
function quietWordsOf(
  dto: ConversationDto,
  state: InboxThreadVM["state"],
  tz: string,
  now: Date,
): Pick<InboxThreadVM, "lastWord" | "unanswered"> {
  if (state !== "done" || dto.state === "archived") return { lastWord: null, unanswered: null };
  const unanswered = unansweredOf(dto, tz, now);
  return { lastWord: unanswered ? UNANSWERED_WORD : lastWordOf(dto, tz, now), unanswered };
}

/**
 * Whether the customer had the last word: of the messages exchanged (lastExchanged), theirs is the newest. The threads the
 * conversations read asks a closed hold for (LastHoldDto), and the first thing unansweredOf asks, so the two agree.
 */
export function theyWroteLast(messages: readonly MessageDto[]): boolean {
  return lastExchanged(messages.filter(isChatMessage))?.direction === "inbound";
}

/** The bar's word for a thread whose customer was left with no answer (unansweredOf): amber, as Needs you is. */
const UNANSWERED_WORD: NonNullable<InboxThreadVM["lastWord"]> = {
  text: "They wrote last, and nobody has answered them.",
  tone: "warn",
  short: "Unanswered",
};

/** What a hold noted of their ask, as one line: its first sentence, clipped at a word. */
const heldAskLine = (details: string | null): string => {
  const text = details?.trim();
  if (!text) return "They're waiting on an answer.";
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return clipAtWord(first, 100);
};

/**
 * Whether what the customer last wrote was held for a person and the hold closed with nothing sent: their message is the
 * last one exchanged (nothing of ours reached them after it), and the newest closed hold opened on or after it. Such a
 * thread reads as Handled, and the receptionist never comes back to a message it held, so it waits for good unless a
 * person answers (Daniela Reyes, 20 Sep 2026: a price question handed back the next day, unanswered 26 days on). Read only
 * where the conversations read carried the hold (LastHoldDto); null everywhere else.
 */
function unansweredOf(dto: ConversationDto, tz: string, now: Date): InboxThreadVM["unanswered"] {
  const hold = dto.last_hold;
  if (!hold || !theyWroteLast(dto.messages)) return null;
  const last = lastExchanged(dto.messages.filter(isChatMessage));
  if (!last) return null;
  if (!(Date.parse(hold.created_at) >= Date.parse(last.created_at))) return null;
  const sinceMs = Date.parse(messageAt(last));
  const closedMs = hold.resolved_at ? Date.parse(hold.resolved_at) : Number.NaN;
  return {
    line: heldAskLine(hold.details),
    closed: Number.isFinite(closedMs)
      ? `Closed ${clockDate(closedMs, tz, now.getTime())} without a reply`
      : "Closed without a reply",
    waited: waitedSince(sinceMs, now.getTime()),
    sinceMs,
  };
}

/**
 * A quiet thread's one line in the Inbox: who had the last word, in Conversations' words (lastWordLine), and
 * whether a later message of ours didn't send. Every quiet thread read "Answered by the receptionist — no one
 * asked for you": over a customer who wrote last, and over a reply that never left (I1). A reply someone
 * canceled is not a failure: the customer is simply waiting.
 */
function lastWordOf(dto: ConversationDto, tz: string, now: Date): NonNullable<InboxThreadVM["lastWord"]> {
  const chat = dto.messages.filter(isChatMessage);
  const last = lastExchanged(chat);
  // Our words after it that never left: the newest that failed (a reply someone canceled is not a failure).
  const failed =
    [...chat.slice(last ? chat.indexOf(last) + 1 : 0)].reverse().find((m) => m.status === "failed") ?? null;
  const failedBy = failed ? (messageAuthor(failed)?.words ?? "us") : null;
  // When they were written, which the bar says beside "Didn't send" (the phone thread's canvas, A1).
  const at = failed ? shortTime(messageAt(failed), tz, now) : "";
  if (!last) {
    if (failedBy)
      return {
        text: `Nothing has reached them — the message from ${failedBy} didn't send.`,
        tone: "danger",
        short: "Didn't send",
        at,
      };
    return dto.messages.some((m) => m.type === "call_summary")
      ? { text: "The phone receptionist handled their call — no one asked for you.", tone: "ok", short: null }
      : { text: "No messages yet.", tone: "plain", short: null };
  }
  if (last.direction === "inbound") {
    return failedBy
      ? {
          text: `They wrote last, and the reply from ${failedBy} didn't send — as far as they know, nobody answered.`,
          tone: "danger",
          short: "Didn't send",
          at,
        }
      : { text: "They wrote last — no reply yet.", tone: "plain", short: null };
  }
  const said = lastWordLine(false, last, messageAuthor(last));
  return failedBy
    ? { text: `${said} — the last message from ${failedBy} didn't send.`, tone: "warn", short: "Didn't send", at }
    : { text: `${said} — no one asked for you.`, tone: "ok", short: null };
}
