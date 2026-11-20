/**
 * A hold handed back to the receptionist from a row of Need you, whatever page draws it (moved from need-you/groups.tsx,
 * 17 Nov 2026, so the Inbox's Needs you lets a person past a week go where it lists them, without loading Today's groups):
 * one press for each of them, what it came to, and its one Undo.
 */
import { NEED_YOU_WORDS as W, type TodayQueueRowVM } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/bridge/verbs/commit";

/**
 * What the old rows came to: how many went, how many were refused, and the one undo for those it can bring back. A
 * conversation nobody answered has no hold to hand back and is archived (the row's `closes`), which has no undo: it is
 * counted with the rest all the same. It was left out of `done`, so thirty-seven marked done said "23 marked done", and
 * one such person alone said, in red, that they couldn't be marked done, having just been (19 Nov 2026).
 */
interface HandedBack {
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
  let done = 0;
  let refused = 0;
  for (const [i, row] of threads.entries()) {
    const answer = await commitVerb(
      "thread_verb",
      { verb: row.closes ?? "hand_back", conversation_id: row.conversationId, who: row.who },
      { refresh: i === threads.length - 1 },
    );
    if (!answer.ok) refused += 1;
    else {
      done += 1;
      if (answer.undo) undos.push(answer.undo);
    }
  }
  return {
    done,
    refused,
    undo: undos.length
      ? async () => {
          for (const [i, u] of undos.entries()) await undoVerb("thread_verb", u, { refresh: i === undos.length - 1 });
        }
      : null,
  };
}

/** What the old rows' press says once it is done: "2 marked done", and the ones refused beside it. */
export const handedBackWords = (handed: HandedBack): string =>
  [handed.done ? W.oldDone.done(handed.done) : "", handed.refused ? W.oldDone.failed(handed.refused) : ""]
    .filter(Boolean)
    .join(" · ");
