/**
 * A hold handed back to the receptionist from a row of Need you, whatever page draws it (moved from need-you/groups.tsx,
 * 17 Nov 2026, so the Inbox's Needs you lets a person past a week go where it lists them, without loading Today's groups):
 * one press for each of them, what it came to, and its one Undo.
 */
import { NEED_YOU_WORDS as W, type TodayQueueRowVM } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/bridge/verbs/commit";

/** What the old rows came to, handed back: how many went, how many were refused, and the one undo for all of them. */
export interface HandedBack {
  done: number;
  refused: number;
  undo: (() => Promise<void>) | null;
}

/**
 * Hand each old hold back to the receptionist, one press for all of them: its hold resolved and its thread the
 * receptionist's again (core handBack, as a call back's Reached does), which answers them if they write. The surfaces are
 * read once, after the last; what was handed back comes back with one undo for all of it.
 */
export async function handBackAll(rows: readonly TodayQueueRowVM[]): Promise<HandedBack> {
  const threads = rows.filter((r): r is TodayQueueRowVM & { conversationId: string } => !!r.conversationId);
  const undos: Record<string, unknown>[] = [];
  let refused = 0;
  for (const [i, row] of threads.entries()) {
    const r = await commitVerb(
      "thread_verb",
      { verb: row.closes ?? "hand_back", conversation_id: row.conversationId, who: row.who },
      { refresh: i === threads.length - 1 },
    );
    if (r.ok && r.undo) undos.push(r.undo);
    else if (!r.ok) refused += 1;
  }
  return {
    done: undos.length,
    refused,
    undo: undos.length
      ? async () => {
          for (const [i, u] of undos.entries()) await undoVerb("thread_verb", u, { refresh: i === undos.length - 1 });
        }
      : null,
  };
}

/** What the old rows' press says once it is done: "2 marked done", and the ones refused beside it. */
export const handedBackWords = (h: HandedBack): string =>
  [h.done ? W.oldDone.done(h.done) : "", h.refused ? W.oldDone.failed(h.refused) : ""].filter(Boolean).join(" · ");
