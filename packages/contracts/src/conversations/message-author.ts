/**
 * Who sent one of our messages: the receptionist, the team, or the broadcast or playbook run that sent it, and
 * a chat row's line saying who had the last word. The Inbox (inbox-thread.ts) and Conversations
 * (conversation-vm.ts) say it in these words.
 */
import type { MessageDto } from "./thread-dto";

export interface MessageAuthor {
  kind: "receptionist" | "team" | "broadcast" | "playbook";
  /** How a bubble names them: "the receptionist", "your team", "a broadcast (Spring offer)". */
  words: string;
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
export function lastWordLine(needsHuman: boolean, last: MessageDto | undefined, author: MessageAuthor | null): string {
  if (needsHuman) return "Receptionist paused — a human has this thread";
  if (!last) return "No messages yet";
  if (last.direction === "inbound") return "They wrote last — no reply yet";
  if (!author) return "Answered automatically";
  if (author.kind === "receptionist") return "Answered by the receptionist";
  if (author.kind === "team") return "Answered by your team";
  return `Last message: ${author.words}`;
}
