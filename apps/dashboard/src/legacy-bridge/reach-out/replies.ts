/**
 * The replies to a workspace's reach-outs, as the shell's pages read them (Reach out Part 5, PR 7): the readings of the
 * last thirty days as `__REPLIES`, and `__replies`, the undo and the words the Inbox draws them in (contracts
 * reach-out-reply-words.ts), handed over as `__reachOuts` hands its words. Its own surface, so the moments' read
 * (surface-data.ts) takes nothing more; it is read again when a reading is kept, drafted or undone.
 */
import {
  replyChipOf,
  replyFromLineOf,
  replyLeftAsOf,
  replyStripOf,
  type ReachOutRepliesDto,
  type ReachOutReplyDto,
} from "@chanlytics/contracts";
import { api, read } from "../api";
import type { SurfaceOverride } from "../surface-data";

type WithReplies = Window & { __REPLIES?: ReachOutRepliesDto | null };

/**
 * The readings as `__REPLIES` ({ replies, mailbox }), set the moment they are read, newest first. Null when they could
 * not be read: the Inbox then draws the thread without them, never a reading it did not read.
 */
export const repliesOverride: SurfaceOverride = {
  key: "reach_out_replies",
  globals: ["__REPLIES"],
  events: ["surface:reach_out_replies"],
  refreshOnTables: ["reach_out_replies"],
  apply: async () => {
    const w = window as WithReplies;
    try {
      w.__REPLIES = await read("GET reach-out-replies");
    } catch (e) {
      w.__REPLIES = null;
      window.dispatchEvent(new CustomEvent("surface:reach_out_replies"));
      throw e;
    }
  },
};

/** A thread's id as the readings name it: the shell's list names a thread `th-<id>`. */
const conversationOf = (threadId: string): string => String(threadId).replace(/^th-/, "");

/** The newest reading on a thread, from the surface as last read; null when it has none, or none could be read. */
function readingOf(threadId: string): ReachOutReplyDto | null {
  const all = (window as WithReplies).__REPLIES;
  const id = conversationOf(threadId);
  return all ? (all.replies.find((r) => r.conversation_id === id) ?? null) : null;
}

/** A thread as the strip reads it: its id and its timeline's bubbles, oldest first. */
interface StripThread {
  id: string;
  timeline?: Array<{ messageId?: string; byYou?: boolean }>;
}

/** The business's zone, as the shell's clock holds it. */
const businessZone = (): string => (window.__clock ? window.__clock.zone() : "UTC");

export const replies = {
  /** "Read as no · undo": the door's answer, `{ ok }` or its refusal in contracts' words. */
  undo: (messageId: string) => api()("POST reach-out-replies/[id]/undo", { params: { id: messageId } }),
  /** The newest reading on a thread. */
  readingOf,
  /** The receptionist's draft for a thread's newest reading, once written; "" when there is none. */
  draftOf: (threadId: string): string => {
    const r = readingOf(threadId);
    return r && !r.undone && r.draft_state === "written" && r.draft ? r.draft : "";
  },
  /** The strip above a thread's composer, in the business's calendar. */
  stripOf: (r: ReachOutReplyDto) => replyStripOf(r, Date.now(), businessZone()),
  chipOf: replyChipOf,
  /** The composer's line for a thread: where an answer goes out from, or null. */
  fromLineOf: (threadId: string): string | null => {
    const all = (window as WithReplies).__REPLIES;
    const r = readingOf(threadId);
    return all && r ? replyFromLineOf(r.reply_from, all.mailbox) : null;
  },
  leftAsOf: replyLeftAsOf,
  /**
   * What the strip above a thread's composer draws: its newest reading's strip and the composer's line, or null when
   * it has no reading, or a person has answered since (their reply is newer than the reading: it has been dealt with).
   */
  stripFor: (thread: StripThread) => {
    const r = readingOf(thread.id);
    if (!r) return null;
    const timeline = thread.timeline ?? [];
    const at = timeline.findIndex((e) => e.messageId === r.message_id);
    if (at >= 0 && timeline.slice(at + 1).some((e) => e.byYou)) return null;
    const all = (window as WithReplies).__REPLIES;
    return {
      reading: r,
      strip: replyStripOf(r, Date.now(), businessZone()),
      fromLine: all ? replyFromLineOf(r.reply_from, all.mailbox) : null,
    };
  },
};

declare global {
  interface Window {
    __replies?: typeof replies;
  }
}

export function installReplies(): void {
  window.__replies = replies;
}
