/**
 * Who sent one of our messages: the receptionist, the team, or the broadcast or playbook run that sent it, and
 * a chat row's line saying who had the last word. The Inbox (inbox-thread.ts) and Conversations
 * (conversation-vm.ts) say it in these words. And the two things a row's `sender` does not say: a send written as a
 * person's that no person made (isAutomatedSend), and a message from a person's address that no person wrote
 * (isPersonsWords).
 */
import { replyWhy, type ReplyWhyVM } from "../config/brain";
import type { MessageDto } from "./thread-dto";

export interface MessageAuthor {
  kind: "receptionist" | "team" | "broadcast" | "playbook";
  /** How a bubble names them: "the receptionist", "your team", "a broadcast (Spring offer)". */
  words: string;
}

/** A key of a message's meta, read without trusting its shape (the column is free JSON). */
const metaKey = (meta: unknown, key: string): unknown =>
  meta !== null && typeof meta === "object" ? (meta as Record<string, unknown>)[key] : undefined;

/**
 * The sources of a send written as a person's (`sender: 'human'`) that no person made: a broadcast's or a playbook's
 * run, and a reach-out's step (`meta.source`, stamped by the run that sent it).
 */
const AUTOMATED_SEND_SOURCES: readonly string[] = ["broadcast", "reach_out"];

/**
 * Whether one of our messages is a campaign's send, whatever its row says wrote the words. THE statement of it in
 * TypeScript: the send door asks it (core deliver.ts: a campaign's email is no person speaking on the thread), and so
 * does a run's report (the dashboard's broadcasts reader: a later campaign is not the team's answer to a reply).
 * public.automated_send (00303) is its twin in SQL, read by first_replies and both reports: the two change together.
 */
export function isAutomatedSend(meta: unknown): boolean {
  const source = metaKey(meta, "source");
  return typeof source === "string" && AUTOMATED_SEND_SOURCES.includes(source);
}

/** What the email intake read a message as when it is not a person writing (channels email/intake.ts EmailClaim). */
const NOT_A_PERSONS_CLAIMS: readonly string[] = ["automated", "auto_reply", "report", "booking_notice"];

/**
 * Whether an inbound message's words are a person's own. The intake keeps what an email CLAIMS to be beside it
 * (`meta.email.claim`), and a message of any other kind has no claim and is somebody's words: an out-of-office, a
 * list's mail or a form's notification is a program writing from their address, which is not the person answering.
 * THE statement of it in TypeScript, read where a run counts who replied (the dashboard's broadcasts reader) and where
 * a reply is addressed (replyChannelOf); public.message_is_a_persons_words (00299) is its twin in SQL, read by
 * has_relationship and the people list: the two change together.
 */
export function isPersonsWords(meta: unknown): boolean {
  const claim = metaKey(metaKey(meta, "email"), "claim");
  return !(typeof claim === "string" && NOT_A_PERSONS_CLAIMS.includes(claim));
}

/**
 * Which run sent one of our messages, read off the row the send wrote (core messages/broadcast.ts): a playbook's run,
 * named for its playbook, or a broadcast someone sent, named for itself. Null for every other message. The thread's
 * bubble, `messageAuthor` and a person's page read it here, and nowhere else reads the meta.
 */
export function messageVia(m: Pick<MessageDto, "meta">): { kind: "broadcast" | "playbook"; name: string } | null {
  if (m.meta?.source !== "broadcast") return null;
  return m.meta.playbook_name
    ? { kind: "playbook", name: String(m.meta.playbook_name) }
    : { kind: "broadcast", name: String(m.meta.broadcast_name ?? "broadcast") };
}

/**
 * Who sent one of our messages, in the words the Inbox and Conversations both use.
 *
 * A person's reply is the team's: the row does not record which member sent
 * it, and the Inbox said "by you" for all of them. A broadcast or a playbook
 * run is named from the run. The customer's words and a call note have no
 * author here.
 */
export function messageAuthor(m: MessageDto): MessageAuthor | null {
  if (m.sender === "customer" || m.sender === "system" || m.type === "call_summary") return null;
  const via = messageVia(m);
  if (via) {
    return via.kind === "playbook"
      ? // A playbook named "The month's offer" is not "the The month's offer playbook".
        { kind: "playbook", words: `${/^the\s/i.test(via.name) ? "" : "the "}${via.name} playbook` }
      : { kind: "broadcast", words: m.meta?.broadcast_name ? `a broadcast (${via.name})` : "a broadcast" };
  }
  return m.sender === "ai" ? { kind: "receptionist", words: "the receptionist" } : { kind: "team", words: "your team" };
}

/** A chat row's second line: that a person has the thread, or who had the last word. */
export function lastWordLine(needsHuman: boolean, last: MessageDto | null, author: MessageAuthor | null): string {
  if (needsHuman) return "Receptionist paused — a human has this thread";
  if (!last) return "No messages yet";
  if (last.direction === "inbound") return "They wrote last — no reply yet";
  if (!author) return "Answered automatically";
  if (author.kind === "receptionist") return "Answered by the receptionist";
  if (author.kind === "team") return "Answered by your team";
  return `Last message: ${author.words}`;
}

/**
 * The reasoning beside a message, for the messages that have any: only the receptionist's own replies carry it. A
 * customer's inbound row carries an `intent` too since 00305 (what they were after, stamped when the receptionist read
 * it), and that is the topic of their words, not why anyone said anything. The Inbox, Conversations and Ask's thread
 * tool say it here.
 */
export function messageWhy(m: Pick<MessageDto, "sender" | "meta">): ReplyWhyVM | null {
  return m.sender === "ai" ? replyWhy(m.meta) : null;
}
