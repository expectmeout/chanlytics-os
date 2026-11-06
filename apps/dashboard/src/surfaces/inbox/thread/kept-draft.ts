/**
 * A thread's draft as the Inbox reads it (decision 0093): the one row every page reads (today/need-you/drafts.ts), for the
 * thread's newest message. Nothing is drafted here and nothing is sent by it: it enters the box only on a press of Use draft
 * (composer.tsx), and the box's own Send sends what the box holds.
 *
 * The same read says what an email from the box is signed with for the member reading (decision 0081, `signed`), drafted
 * or not, which the box says under the words before Send: the newest kept drafts' threads with the first reads, any other
 * thread by itself.
 */
import { THREAD_CHANNEL_WORDS, type ReplyDraftView } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { surfaceValue } from "../../surface-values";
import { draftViewNow, type DraftWant } from "../../today/need-you/drafts";
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

/** The draft a real thread's box reads: a reply to their newest message; none on a thread nobody needs to answer. */
export function draftWantOfThread(thread: Thread): DraftWant | null {
  if (!thread.real || !thread.conversationId) return null;
  const forMessageId = newestTheirs(thread);
  if (!forMessageId) return null;
  return {
    conversationId: thread.conversationId,
    kind: "reply",
    forMessageId,
    // Owed where the hold asks for a reply and one can go (contracts replyDraftOwed, as the thread says it).
    expected:
      thread.state === "escalated" && thread.holdAct === "reply" && thread.windowOpen !== false && !thread.optedOut,
    askedAtMs: thread.lastAtMs ?? null,
  };
}

const NO_DRAFT: ReplyDraftView = { state: "none" };

/** What a real thread's draft is now: read by its row, its dock and its box. */
export const threadDraftNow = (thread: Thread): ReplyDraftView => {
  const want = draftWantOfThread(thread);
  return want ? draftViewNow(want) : NO_DRAFT;
};

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
