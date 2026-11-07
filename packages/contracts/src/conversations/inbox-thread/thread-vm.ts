/** Inbox thread: thread vm. */

import { formatPhoneDisplay } from "../../shared/phone";
import { replyWhy, type ReplyWhyVM } from "../../config/brain";
import { replyWindow } from "../../config/policy/prices";
import { windowClockOf } from "../../config/policy/reply-limits";
import { HELD_WORDS, readingOf } from "../standing";
import { messageAt, type ConversationDto, type MessageDto } from "../thread-dto";
import { agentFor, answerWireOf, isChatMessage, writtenChannelOf, THREAD_CHANNEL_WORDS } from "../thread-channel";
import { contactName, contactMeta, initialsOf } from "../thread-contact";
import { shortTime, bubbleTime, inboxThreadClock, type ThreadMoments } from "../thread-clock";
import { clockDate, clockHistoryDay, clockTime } from "../../shared/clock";
import { mediaVM } from "../message-media";
import {
  emailFilesLeftOf,
  emailLeftOutOf,
  emailFromNameOf,
  emailPartsOf,
  emailSignatureLine,
  emailSignedWithOf,
  emailSubjectsOf,
} from "../message-email";
import { replyLeftAsOf } from "../../campaigns/reach-out/reply-words";
import { bookingRequestCardOf } from "../../calendar/visit/booking-request";
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
} from "../message-words";
import { messageVia, messageAuthor, messageWhy, lastWordLine, type MessageAuthor } from "../message-author";
import {
  openHoldAct,
  reasonLabelOf,
  reasonLineOf,
  reasonShort,
  reasonSummaryOf,
  type EscalationDto,
} from "../escalations";
import type { InboxThreadVM } from "../inbox-thread-vm";
import { moveComesTo, threadMoveOf } from "../../waits/thread-move";
import { archivedOf, replyFacts, threadStanding } from "./waits";

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
  message: MessageDto,
  changed: ReadonlyMap<string, string>,
): {
  body: string;
  subject?: string;
  fromName?: string;
  leftOut?: string;
  filesLeft?: number;
  quoted?: string;
  footer?: string;
  signature?: { line: string; full: string };
} {
  if (message.channel !== "email") return { body: messageText(message) };
  const fromName = emailFromNameOf(message);
  const parts = emailPartsOf(messageText(message), fromName);
  const subject = changed.get(message.id);
  const leftOut = emailLeftOutOf(message.meta) ?? replyLeftAsOf(message.meta);
  const filesLeft = emailFilesLeftOf(message.meta);
  // Theirs is found in their words; ours is what the mailbox signed it with, kept as it left (00487).
  const signed = parts.signature ?? emailSignedWithOf(message);
  return {
    body: parts.said,
    ...(subject ? { subject } : {}),
    ...(fromName ? { fromName } : {}),
    ...(leftOut ? { leftOut } : {}),
    ...(filesLeft ? { filesLeft } : {}),
    ...(parts.quoted ? { quoted: parts.quoted } : {}),
    ...(parts.footer ? { footer: parts.footer } : {}),
    ...(signed ? { signature: { line: emailSignatureLine(signed), full: signed } } : {}),
  };
}

/** A draft's seconds left as a clock says them (the head's "Sends in 0:42", the draft's own line): minutes and seconds. */
export function countdownClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
  const personName = contactName(dto);
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
  const timeline: InboxThreadVM["timeline"] = dto.messages.map((message) => {
    // A note the platform wrote on the thread is a line between the words, not a bubble: drawn as a bubble it read
    // "by WhatsApp Receptionist · Delivered", a reply the customer never got (the 2 Oct 2026 audit).
    if (message.type === "note") {
      return {
        type: "event" as const,
        kind: "note",
        at: bubbleTime(messageAt(message), tz, now),
        body: `Note: ${messageText(message)}`,
      };
    }
    const onPhone = message.type === "call_summary";
    const media = mediaVM(message);
    const reason = messageWhy(message);
    return {
      type: "msg" as const,
      messageId: message.id,
      from: message.sender === "customer" ? ("client" as const) : ("agent" as const),
      channel: onPhone ? "phone" : writtenChannelOf(message.channel),
      ...bubbleWhen(messageAt(message), tz, now),
      ...bubbleWordsOf(message, subjects.changed),
      ...(media ? { media } : {}),
      ...(reason ? { why: reason } : {}),
      // Who said it, per BUBBLE. The thread carries one agent identity, and the
      // pane rendered that under every agent row — so a phone call summary was
      // signed "by WhatsApp Receptionist", crediting the wrong assistant with
      // work it did not do. The bubble already knows its own channel.
      ...(message.sender !== "customer"
        ? (() => {
            const a = agentFor(onPhone ? "phone" : writtenChannelOf(message.channel));
            return { agentName: a.name, agentGlyph: a.glyph };
          })()
        : {}),
      ...(message.sender === "human" ? { byYou: true } : {}),
      // The words Conversations says too (messageAuthor): a person's reply is the team's.
      ...(message.sender === "human" && messageAuthor(message)
        ? { byWords: (messageAuthor(message) as MessageAuthor).words }
        : {}),
      ...(messageVia(message) ? { via: messageVia(message)! } : {}),
      // What became of it: the words for its status, why it failed (one sentence for the owner, drawn under "Didn't send"),
      // and whether the words left (the receptionist's failed reply was drawn as a sent bubble, I1). Said in message-words.ts,
      // so this pane and the Conversations pane cannot describe the same message differently.
      ...(message.sender !== "customer" && message.status ? { status: message.status, ...sentFactsOf(message) } : {}),
      // A held draft is not a sent message and must not read as one.
      ...(isHeldDraft(message) ? { pending: true as const, sendsAtMs: draftSendsAtMs(message) } : {}),
    };
  });
  if (escalation) {
    // insert chronologically — appending would read "reply, then flagged"
    const idx = dto.messages.findIndex((m) => m.created_at > escalation.created_at);
    const entry = {
      type: "event" as const,
      kind: "flag",
      at: shortTime(escalation.created_at, tz, now),
      // A quiet mark, its reason a clause: the dock says what is owed, its Why? the details (holdWordsOf). The label and the
      // details quoted here said it a third time, printed under the dock on a phone (the thread canvas, 1 Nov 2026).
      body: `Held for you — ${reasonShort(escalation.reason)}`,
    };
    if (idx === -1) timeline.push(entry);
    else timeline.splice(idx, 0, entry);
  }

  // The moments its times are said from, and their words by this read's clock: one rule with a page that says them again
  // for a thread read earlier (thread-clock.ts inboxThreadClock).
  const moments = threadMoments(dto, escalation, state);
  const ask = askOf(escalation, lastInbound);

  const moveWords = moveWordsOf(dto, escalation, state, tz, now);
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
    who: personName,
    whoMeta: contactMeta(dto, THREAD_CHANNEL_WORDS[primaryChannel]),
    avatar: initialsOf(personName),
    state,
    takenOver,
    needsYou,
    claimedByOther,
    assigneeUserId: dto.assignee_user_id ?? null,
    ask,
    ...archivedOf(dto),
    ...moveWords,
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
          : moveWords.lastWord
            ? moveWords.lastWord.text
            : "The receptionist answered this on its own. Nothing is owed.",
    ...holdWordsOf(escalation, claimedByOther, tz, now.getTime()),
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
 * What the dock says of an open hold: its one line (escalations.ts reasonLineOf), and under its Why? the reason's whole
 * sentence and what the hold noted (the cause of a failed send, the words of a flag by hand). An email's hold notes what
 * the email claimed to be (core email-ingest EMAIL_REVIEW_WORDS), the reason's sentence said for that email, so it is said
 * in its place. A call back's details are its to-do, which is the line. A request's hold carries its booking's card.
 * Nothing with no hold, or on a thread a teammate has: its reply box says what a reply does.
 */
function holdWordsOf(
  escalation: EscalationDto | null,
  claimedByOther: boolean,
  tz: string,
  nowMs: number,
): Pick<InboxThreadVM, "holdLine" | "holdWhy" | "holdNote" | "request"> {
  if (!escalation || claimedByOther) return {};
  const details = escalation.details?.trim() || "";
  const sentence = reasonSummaryOf(escalation.reason);
  if (escalation.reason === "callback") return { holdLine: details || reasonLineOf("callback"), holdWhy: sentence };
  if (escalation.reason === "email_review" && details)
    return { holdLine: reasonLineOf(escalation.reason), holdWhy: details };
  return {
    holdLine: reasonLineOf(escalation.reason),
    holdWhy: sentence,
    ...(details && details !== sentence ? { holdNote: clipAtWord(details, 240) } : {}),
    // The booking a request hold asks to confirm, as its card draws it (the thread canvas, 1 Nov 2026).
    ...(escalation.reason === "booking_request" && escalation.request
      ? { request: bookingRequestCardOf(escalation.request, tz, nowMs) }
      : {}),
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
 * Whose move it is (thread-move.ts), and a quiet thread's one line: who had the last word, and whether a reply didn't send
 * (lastWordOf, I1), or that nobody has answered what they wrote. And the dock's words for that, where the thread is there or
 * the clock will bring it there. No words for a thread that is not quiet, or archived.
 */
function moveWordsOf(
  dto: ConversationDto,
  escalation: EscalationDto | null,
  state: InboxThreadVM["state"],
  tz: string,
  now: Date,
): Pick<InboxThreadVM, "move" | "lastWord" | "unanswered"> {
  const move = threadMoveOf(dto, escalation, now.getTime());
  if (state !== "done" || dto.state === "archived") return { move, lastWord: null, unanswered: null };
  return {
    move,
    lastWord: move.move === "unanswered" ? { text: UNANSWERED_LINE } : lastWordOf(dto, tz, now),
    unanswered: moveComesTo(move, "unanswered") ? unansweredOf(dto, tz, now) : null,
  };
}

/**
 * Whether the customer had the last word: of the messages exchanged (lastExchanged), theirs is the newest. The threads the
 * conversations read asks a closed hold for (LastHoldDto).
 */
export function theyWroteLast(messages: readonly MessageDto[]): boolean {
  return lastExchanged(messages.filter(isChatMessage))?.direction === "inbound";
}

/** The sentence for a thread whose customer was left with no answer. */
const UNANSWERED_LINE = "They wrote last, and nobody has answered them.";

/** What a hold noted of their ask, as one line: its first sentence, clipped at a word. */
const heldAskLine = (details: string | null): string => {
  const text = details?.trim();
  if (!text) return "They're waiting on an answer.";
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return clipAtWord(first, 100);
};

/**
 * Nobody has answered what they last wrote (thread-move.ts): the dock's words for it. Where a hold on it closed with nothing
 * sent, what the hold noted and when it closed: the receptionist never comes back to a message it held, so it waits for
 * good unless a person answers (Daniela Reyes, 20 Sep 2026: a price question handed back the next day, unanswered 26 days
 * on). Read only where the conversations read carried the hold (LastHoldDto). Else the plain fact.
 */
function unansweredOf(dto: ConversationDto, tz: string, now: Date): InboxThreadVM["unanswered"] {
  const last = lastExchanged(dto.messages.filter(isChatMessage));
  const hold = dto.last_hold;
  if (!last || !hold || !(Date.parse(hold.created_at) >= Date.parse(last.created_at)))
    return { line: UNANSWERED_LINE, closed: "" };
  const closedMs = hold.resolved_at ? Date.parse(hold.resolved_at) : Number.NaN;
  return {
    line: heldAskLine(hold.details),
    closed: Number.isFinite(closedMs)
      ? `Closed ${clockDate(closedMs, tz, now.getTime())} without a reply`
      : "Closed without a reply",
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
    if (failedBy) return { text: `Nothing has reached them — the message from ${failedBy} didn't send.`, at };
    return dto.messages.some((m) => m.type === "call_summary")
      ? { text: "The phone receptionist handled their call — no one asked for you." }
      : { text: "No messages yet." };
  }
  if (last.direction === "inbound") {
    return failedBy
      ? {
          text: `They wrote last, and the reply from ${failedBy} didn't send — as far as they know, nobody answered.`,
          at,
        }
      : { text: "They wrote last — no reply yet." };
  }
  const sentence = lastWordLine(false, last, messageAuthor(last));
  return failedBy
    ? { text: `${sentence} — the last message from ${failedBy} didn't send.`, at }
    : { text: `${sentence} — no one asked for you.` };
}
