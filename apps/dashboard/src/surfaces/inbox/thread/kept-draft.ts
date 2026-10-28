/**
 * Need you's drafted reply in the thread's own box (the live walk's INBOX-2, 27 Oct 2026). The strip over an emailed
 * thread's composer says a reply is drafted "to change or send from here", and the box was empty: the draft lived on
 * Today alone. Ask's draft for the thread (decision 0071, 00475), kept as Need you drew its row, is read as Today reads
 * it (GET conversations/drafts) and put in an empty box once, where it answers their newest message. Nothing is drafted
 * here and nothing is sent by it: the box's own Send sends what the box holds, every word open to change first.
 *
 * The workspace's newest kept drafts come with the Inbox's first reads (the reply_drafts surface, which its first draw waits
 * for), so the box draws with the words in its first frame: it was read by the thread once the box had drawn, and the
 * words came a beat later. A thread whose draft is not among them is read by itself, as before.
 */
import { draftHasWords, draftIsCurrent, type ReplyDraftDto } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { surfaceValue } from "../../surface-values";
import type { Thread } from "../types";

/** Their newest message, which a kept draft must answer (contracts today-queue writesOf): null where they wrote none. */
function newestTheirs(thread: Pick<Thread, "timeline">): string | null {
  const theirs = [...(thread.timeline ?? [])].reverse().find((e) => e.type === "msg" && e.from === "client");
  return theirs && theirs.type === "msg" ? (theirs.messageId ?? null) : null;
}

/** A kept reply's words, where it answers their newest message and has words to put in the box. */
function keptWords(kept: ReplyDraftDto | undefined, forId: string): string | null {
  return kept && draftIsCurrent(kept, forId) && draftHasWords(kept) ? kept.words.text : null;
}

/**
 * The words of the reply Ask kept for a real thread's newest message from them, as the workspace's newest kept drafts
 * say it: null where there is none to put in the box (a thread of the mockup's, no message of theirs, none kept among
 * drafts that are all the workspace keeps), undefined where they cannot say (not read yet, or the thread's is older than
 * the newest they hold), and the thread's own read must (keptReplyOf).
 */
export function keptReplyNow(thread: Thread): string | null | undefined {
  if (!thread.real) return null;
  const forId = newestTheirs(thread);
  if (!forId) return null;
  const held = surfaceValue("reply_drafts");
  const kept = held?.drafts.find((d) => d.conversation_id === thread.conversationId && d.kind === "reply");
  if (kept) return keptWords(kept, forId);
  return held?.complete ? null : undefined;
}

/**
 * The words of the reply Ask kept for a real thread's newest message from them: the newest kept drafts' answer where they
 * have one, else the thread's own read. Null where there is none to put in the box, or the read was refused.
 */
export async function keptReplyOf(thread: Thread): Promise<string | null> {
  const now = keptReplyNow(thread);
  if (now !== undefined) return now;
  const forId = newestTheirs(thread);
  if (!forId) return null;
  const read = await api()("GET conversations/drafts", { query: { ids: thread.conversationId } }).catch(() => null);
  return keptWords(read && read.ok ? read.data.drafts.find((d) => d.kind === "reply") : undefined, forId);
}
