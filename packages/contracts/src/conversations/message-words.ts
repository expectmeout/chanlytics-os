/**
 * What a message says and what became of it: its words wherever they are shown, its send status in the
 * operator's words, whether it reached the customer, whether it is a held draft, and words clipped at a whole
 * word. Its attachment is message-media.ts, an email's quoted chain message-email.ts, its sender message-author.ts.
 */
import type { MessageDto } from "./thread-dto";
import { MEDIA_LABEL, mediaKind } from "./message-media";
import { splitQuotedReply } from "./message-email";

/** What an email's `delivered` receipt says: their mail server took it, which is as far as an email can be followed. */
const EMAIL_DELIVERED = "Reached their mail server";

/**
 * What happened to a message we tried to send, in the operator's words.
 *
 * ONE vocabulary. The Inbox had its own ternary and the Conversations pane had
 * nothing at all, so the same message read as "Canceled before sending" on one
 * screen and as an ordinary delivered reply on the other — and Conversations is
 * the screen whose entire job is "what is my receptionist saying to people".
 *
 * The wire is an input because one word does not mean one thing on every wire: a text's or a WhatsApp message's
 * "Delivered" is on their phone, but an email's receipt says only that the receiving mail server accepted it (the
 * provider's `delivered`), which is not the same as being in front of them. The email says what it knows. Every other
 * wire, and a row that names none, keeps the words it always had.
 */
export function messageStatusLabel(status: string | undefined, channel?: string | null): string | undefined {
  switch (status) {
    case "queued":
      return "Sending…";
    case "failed":
      return "Didn't send";
    case "canceled":
      return "Canceled before sending";
    case "read":
      return "Read";
    case "delivered":
      return channel === "email" ? EMAIL_DELIVERED : "Delivered";
    default:
      return undefined;
  }
}

/**
 * A message that is part of the conversation: words said on a wire. A call's note and a system note are not --
 * the first is the call's own row, the second a line the platform wrote on the thread, which read as "by WhatsApp
 * Receptionist · Delivered" and flipped the row's pill until the 2 Oct 2026 audit. The thread's "last word", its
 * channels and Conversations' preview all ask this one question.
 */
export function isChatMessage(m: Pick<MessageDto, "type">): boolean {
  return m.type !== "call_summary" && m.type !== "note";
}

/** Did the customer actually receive these words? */
export function reachedCustomer(status: string | undefined): boolean {
  return status !== "queued" && status !== "failed" && status !== "canceled";
}

const CALL_NOTE_PREFIX =
  /^\[voice call note [^\]]*\]\s*(Caller phoned the (?:salon|business) line\.\s*)?(Summary:\s*)?/; // trade-word: the older notes said "salon"; the newer say "business"

/**
 * A reply the receptionist has WRITTEN but not sent — it is sitting out its veto
 * window, and until that expires a human can withdraw or replace it.
 *
 * The distinction matters most in the UI: rendered as an ordinary agent bubble a
 * held draft looks exactly like a message the customer has already read, so an
 * operator would either ignore it or apologise for something that never went out.
 */
export function isHeldDraft(m: MessageDto): boolean {
  return m.status === "queued" && m.sender === "ai";
}

/** When a held draft is due to send, in epoch ms. */
export function draftSendsAtMs(m: MessageDto): number {
  const delay = typeof m.meta?.delay_ms === "number" ? m.meta.delay_ms : 0;
  return new Date(m.created_at).getTime() + delay;
}

/* What a message says, wherever it is shown: an email's own words, without the chain it quoted back
   (splitQuotedReply). One function, because each place that said it its own way drifted: the bubble split
   the chain, while the Conversations row previewed it and the status band's "They wrote" printed it whole. */
export function messageWords(m: MessageDto): string {
  return m.channel === "email" ? splitQuotedReply(messageText(m)).text : messageText(m);
}

export function messageText(m: MessageDto): string {
  if (m.type === "call_summary" && m.body) {
    // the body already names itself ("Inbound call · 3 min — …"); the legacy
    // Blob-era prefix is stripped for rows written before Slice 3
    return m.body.replace(CALL_NOTE_PREFIX, "").trim();
  }
  if (m.body) return m.body;
  if (m.type === "media") {
    // "Photo: the caption" over "[image attachment]": the thread draws the
    // attachment itself now, and this line is what sits above it.
    const label = MEDIA_LABEL[mediaKind(m.media?.mime_type, (m.meta && (m.meta.raw_type as string)) || null)];
    const caption = m.media?.caption?.trim();
    return caption ? `${label}: ${caption}` : label;
  }
  return `[${m.type}]`;
}

/** Words cut after a whole word, with an ellipsis, when they run past `max`; whole when they fit. */
export function clipAtWord(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : t.slice(0, max)).replace(/[\s,;:—-]+$/u, "")}…`;
}
