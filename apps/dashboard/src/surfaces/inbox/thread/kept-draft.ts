/**
 * Need you's drafted reply in the thread's own box (the live walk's INBOX-2, 27 Oct 2026). The strip over an emailed
 * thread's composer says a reply is drafted "to change or send from here", and the box was empty: the draft lived on
 * Today alone. Ask's draft for the thread (decision 0071, 00475) is read as Today reads it (GET conversations/drafts),
 * asked for where none answers their newest message by a member who acts (POST conversations/[id]/draft), and put in an
 * empty box once. Nothing is sent by it: the box's own Send sends what the box holds, every word open to change first.
 */
import { draftHasWords, draftIsCurrent, type ReplyDraftDto } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import type { Thread } from "../types";

/** Their newest message, which a kept draft must answer (contracts today-queue writesOf): null where they wrote none. */
export function newestTheirs(thread: Pick<Thread, "timeline">): string | null {
  const theirs = [...(thread.timeline ?? [])].reverse().find((e) => e.type === "msg" && e.from === "client");
  return theirs && theirs.type === "msg" ? (theirs.messageId ?? null) : null;
}

/** A kept reply's words, where it answers that message and holds any. */
const wordsOf = (d: ReplyDraftDto | null | undefined, forId: string): string | null =>
  d && d.kind === "reply" && draftIsCurrent(d, forId) && draftHasWords(d) ? d.words.text : null;

/**
 * The words of Ask's reply for a real thread: the one kept for their newest message, else, where `mayWrite`, one asked
 * for now. Null where there is none to put in the box (a thread of the mockup's, no message of theirs, a read refused).
 */
export async function keptReplyOf(thread: Thread, mayWrite: boolean): Promise<string | null> {
  if (!thread.real) return null;
  const forId = newestTheirs(thread);
  if (!forId) return null;
  const id = thread.conversationId;
  const read = await api()("GET conversations/drafts", { query: { ids: id } }).catch(() => null);
  const kept = read && read.ok ? (read.data.drafts.find((d) => d.kind === "reply") ?? null) : null;
  const words = wordsOf(kept, forId);
  if (words || !mayWrite) return words;
  const made = await api()("POST conversations/[id]/draft", {
    params: { id },
    body: { kind: "reply" },
    refresh: false,
  }).catch(() => null);
  return made && made.ok ? wordsOf(made.data, forId) : null;
}
