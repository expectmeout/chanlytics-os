/**
 * ThreadCard/ConversationVM viewmodels (Blueprint §7): pure mapping from API
 * DTOs into the exact shapes the mockup surfaces render. Fed fields only —
 * nothing invented: summaries are factual lines, never fabricated analysis.
 *
 * This module is the Conversations page's row and transcript (`toConversationVM`). The Inbox's thread is
 * inbox-thread.ts and a call's row call-vm.ts; the wire they read is thread-dto.ts, and the words they share
 * are the thread-* and message-* modules beside them.
 */
import { replyWhy, type ReplyWhyVM } from "../config/brain";
import { messageAt, type ConversationDto } from "./thread-dto";
import { agentFor, writtenChannelOf, threadChannelOf } from "./thread-channel";
import { contactName, isIdentifierName, initialsOf } from "./thread-contact";
import { shortTime, bubbleTime } from "./thread-clock";
import { mediaVM, type MediaVM } from "./message-media";
import { messageStatusLabel, reachedCustomer, messageWords } from "./message-words";
import { messageAuthor, lastWordLine, type MessageAuthor } from "./message-author";

/* ---- the mockup's conversation shape ---- */

export interface ConversationMessageVM {
  from: "client" | "agent";
  /** Where it happened. A call note is not a WhatsApp bubble, and the
   *  viewer must not draw it as one -- and neither is a text or an email. */
  channel: "whatsapp" | "sms" | "email" | "phone";
  at: string;
  text: string;
  /** The attachment, when the message is one. */
  media?: MediaVM;
  /** Why the receptionist said it, when the row remembers. */
  why?: ReplyWhyVM;
  /** Who sent it, for our messages: "the receptionist", "your team", "a broadcast (Spring offer)",
   *  "the Win-back playbook" (messageAuthor). Absent for the customer's words and a call note. */
  by?: string;
  /** "Canceled before sending", "Sending…" — absent when there is nothing to
   *  say, which for an ordinary sent message is the honest answer. */
  statusLabel?: string;
  /** False when these words never reached the customer. The bubble must not
   *  read as part of the conversation, because it was not. */
  reachedCustomer?: boolean;
}

export interface ConversationVM {
  id: string;
  who: string;
  /** First name, or the whole thing when it is a number. */
  whoShort: string;
  initials: string;
  clientId: string | null;
  /** The Inbox thread this chat is: `th-` and the conversation's id, the id the Inbox routes by. */
  threadId: string;
  /** Who sent the last message that reached them, when it was ours; null when they wrote last. */
  answeredBy: MessageAuthor["kind"] | null;
  /** The wire this conversation's words travelled: the last written one, or the phone when that is all there is. */
  channel: "whatsapp" | "sms" | "email" | "phone";
  agent: { glyph: string; name: string };
  at: string;
  outcome: "escalated" | "handled" | "open";
  snippet: string;
  summary: { headline: string; bullets: string[] };
  messages: ConversationMessageVM[];
  /** Epoch ms of the previewed message — the SORT key. Rows were being
   *  ordered by localeCompare on display strings ("Aug 26" vs "3:22 AM"),
   *  which is not an ordering at all. */
  ts: number;
  live?: boolean;
  /** False when the customer has only ever phoned. Their calls already have
   *  their own rows, so a chat row with nothing to preview is pure duplication. */
  hasChat: boolean;
}

export function toConversationVM(dto: ConversationDto, tz: string, now = new Date()): ConversationVM {
  const who = contactName(dto);
  // An identifier is not split: "+1" is nobody's first name. The viewer
  // read "Latest from +1" for a person known only by number.
  const whoShort = isIdentifierName(who) ? who : who.split(" ")[0] || who;
  // The status travels with the bubble. It used to be dropped here, and the
  // conversations API filters nothing — so a queued draft still inside its veto
  // window, a send that failed, and a reply an operator canceled all arrived on
  // this surface indistinguishable from words the customer actually read. On a
  // live account that showed one message twice, identically, when one of the
  // two had been canceled before it ever left.
  const msgs = dto.messages.map((m): ConversationMessageVM => ({
    from: m.sender === "customer" ? "client" : "agent",
    // The row's own channel, not an assumption. Every bubble on this surface
    // was drawn as WhatsApp -- so a text conversation, live since the SMS
    // channel shipped, has been labelled WhatsApp on the Conversations page
    // this whole time, and an email one would be too. The Inbox has read the
    // column since I1 (toInboxThreadVM); these two view models had drifted.
    channel: m.type === "call_summary" ? "phone" : writtenChannelOf(m.channel),
    at: bubbleTime(messageAt(m), tz, now),
    text: messageWords(m),
    ...(mediaVM(m) ? { media: mediaVM(m) as MediaVM } : {}),
    ...(m.sender === "ai" && replyWhy(m.meta) ? { why: replyWhy(m.meta) as ReplyWhyVM } : {}),
    ...(messageAuthor(m) ? { by: (messageAuthor(m) as MessageAuthor).words } : {}),
    // Only for OUR messages. A customer's inbound message has no send status,
    // and labelling it would be inventing one.
    ...(m.sender !== "customer"
      ? {
          ...(messageStatusLabel(m.status) ? { statusLabel: messageStatusLabel(m.status) } : {}),
          reachedCustomer: reachedCustomer(m.status),
        }
      : {}),
  }));
  const lastInbound = [...dto.messages].reverse().find((m) => m.sender === "customer");
  // A call has its OWN row on this surface, so the chat row must summarise the
  // MESSAGING thread only. Including call notes made one call appear twice —
  // once as its own row, once as the preview of the thread sitting above it —
  // and, because a call note is direction:"inbound", it also flipped the pill
  // to "open" ("they spoke last, you owe a reply") for a customer who had
  // merely phoned and been handled.
  const chat = dto.messages.filter((m) => m.type !== "call_summary");
  const callNotes = dto.messages.length - chat.length;
  // The last thing that actually happened between them: a queued or cancelled
  // draft is not the thread's last word, and previewing it read "handled".
  const last = [...chat].reverse().find((m) => m.direction === "inbound" || reachedCustomer(m.status));
  // Who had that last word, when it was ours: the receptionist, the team, or a run. The row said
  // "Answered by the receptionist" whoever answered, and when the customer had spoken last.
  const lastAuthor = last && last.direction === "outbound" ? messageAuthor(last) : null;
  const paused = !!dto.paused_until && new Date(dto.paused_until) > now;
  const needsHuman = dto.state === "needs_human" || paused;
  // Honest pills: escalated when a human has it; open while the last word is
  // the customer's; handled only when the thread is actually answered/closed.
  const outcome: ConversationVM["outcome"] = needsHuman
    ? "escalated"
    : last?.direction === "inbound" || dto.state === "snoozed"
      ? "open"
      : "handled";
  return {
    id: dto.id,
    who,
    whoShort,
    initials: initialsOf(who),
    clientId: dto.contact.id || null,
    // The Inbox's id for this conversation (toInboxThreadVM): the door from a transcript to its thread.
    threadId: `th-${dto.id}`,
    answeredBy: lastAuthor ? lastAuthor.kind : null,
    // The wire the conversation's last written words travelled. A thread with
    // nothing but a call note is the phone, which is what it looks like.
    channel: threadChannelOf(dto.messages),
    agent: agentFor(threadChannelOf(dto.messages)),
    // The row's time and its preview must come from the SAME message —
    // last_message_at ignored call notes, so a row read "3:22 AM" beside a
    // preview imported at 2:15 PM.
    at: shortTime(last ? messageAt(last) : dto.last_message_at, tz, now),
    outcome,
    snippet: last ? messageWords(last).slice(0, 110) : "",
    hasChat: chat.length > 0,
    ts: last ? new Date(messageAt(last)).getTime() : dto.last_message_at ? new Date(dto.last_message_at).getTime() : 0,
    summary: {
      headline: lastInbound ? messageWords(lastInbound).slice(0, 110) : "No customer messages yet.",
      bullets: [
        `${chat.length} message${chat.length === 1 ? "" : "s"}${
          callNotes ? ` · ${callNotes} call${callNotes === 1 ? "" : "s"}` : ""
        }${dto.messages[0] ? ` · started ${shortTime(messageAt(dto.messages[0]), tz, now)}` : ""}`,
        lastWordLine(needsHuman, last, lastAuthor),
      ],
    },
    messages: msgs,
  };
}
