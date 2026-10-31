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
 *
 * The same read says what an email from the box is signed with for the member reading (decision 0081, `signed`), drafted
 * or not, which the box says under the words before Send: the newest kept drafts' threads with the first reads, any other
 * thread by itself.
 */
import { THREAD_CHANNEL_WORDS, draftHasWords, draftIsCurrent, type ReplyDraftDto } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { surfaceValue } from "../../surface-values";
import type { Thread } from "../types";

/**
 * Their newest message, which a kept draft must answer (contracts today-queue writesOf), while it is the thread's newest
 * word: null where they wrote none, or where someone answered since. A draft is kept until they write again, so a reply
 * sent from Gmail or by a teammate left it standing, and the box offered the same answer to send a second time.
 */
function newestTheirs(thread: Pick<Thread, "timeline">): string | null {
  const last = [...(thread.timeline ?? [])].reverse().find((e) => e.type === "msg");
  return last && last.type === "msg" && last.from === "client" ? (last.messageId ?? null) : null;
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

/** Whether the box's reply goes by email: only an email is signed. */
const byEmail = (thread: Thread): boolean => !!thread.real && thread.replyVia === THREAD_CHANNEL_WORDS.email;

/** The thread's own drafts read (GET conversations/drafts by its id); null where it was refused or failed. Never throws. */
async function threadDraftsOf(thread: Thread) {
  const read = await Promise.resolve()
    .then(() => api()("GET conversations/drafts", { query: { ids: thread.conversationId } }))
    .catch(() => null);
  return read && read.ok ? read.data : null;
}

/** What an email from the box is signed with, as a drafts read says it; null where it says none, or by another wire. */
function signedIn(read: NonNullable<Awaited<ReturnType<typeof threadDraftsOf>>>, thread: Thread): string | null {
  // An answer from before the read said it (a server a deploy behind this page) says nothing of it.
  const signed: Readonly<Record<string, string>> | undefined = read.signed;
  return byEmail(thread) ? (signed?.[thread.conversationId ?? ""] ?? null) : null;
}

/**
 * What the box takes from Ask's kept drafts for a real thread: the words of the reply kept for their newest message (the
 * newest kept drafts' answer where they have one, else the thread's own read; null where there is none to put in the box,
 * or the read was refused), and, where the thread's own read was asked, what an email from it is signed with, so the box
 * asks the read once for both.
 */
export async function keptReplyOf(thread: Thread): Promise<{ words: string | null; signed?: string | null }> {
  const now = keptReplyNow(thread);
  if (now !== undefined) return { words: now };
  const forId = newestTheirs(thread);
  if (!forId) return { words: null };
  const read = await threadDraftsOf(thread);
  return {
    words: keptWords(
      read?.drafts.find((d) => d.kind === "reply"),
      forId,
    ),
    ...(read ? { signed: signedIn(read, thread) } : {}),
  };
}

/**
 * What an email from a real thread's box is signed with, as the newest kept drafts say it: null where it goes by another
 * wire or nothing signs it, undefined where they cannot say (not read yet, or the thread is not among theirs), and the
 * thread's own read must (signedOf).
 */
export function signedNow(thread: Thread): string | null | undefined {
  const id = thread.conversationId;
  if (!byEmail(thread) || !id) return null;
  // They say it on every reply they hold, current or not (ReplyDraftDto `signed`): one with none, nothing signs it.
  const kept = surfaceValue("reply_drafts")?.drafts.find((d) => d.conversation_id === id && d.kind === "reply");
  return kept ? (kept.signed ?? null) : undefined;
}

/**
 * What an email from a real thread's box is signed with, by the thread's own read: asked only where nothing said it and
 * the box has words, since an empty box says no signature. Null where nothing signs it, or the read was refused or failed:
 * the box then says no signature, and the send signs as its freeze decides.
 */
export async function signedOf(thread: Thread): Promise<string | null> {
  const read = await threadDraftsOf(thread);
  return read ? signedIn(read, thread) : null;
}
