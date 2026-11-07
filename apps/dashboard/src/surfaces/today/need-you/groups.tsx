/**
 * Need you's parts around its rows (Today in three zones, 2 Nov 2026): each group under its own small head (Up next,
 * Waiting on you, To decide, To do, Older; contracts need-you/groups.ts), and the old ones let go at once, each handed back
 * to the receptionist with one Undo for all of them.
 */
import { useId, type ReactNode } from "react";
import { NEED_YOU_WORDS as W, type TodayQueueRowVM } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/bridge/verbs/commit";
import { Panel } from "../../kit/panel/panel";

/**
 * A group of Need you's rows under its small head: its words, and how many where it says so. On a phone its rows are a
 * pane of their own under the head (`pane`; the canvas of 2 Nov 2026), on a desk rows in Need you's pane.
 */
export function NeedYouGroup({
  title,
  count,
  pane = false,
  testid,
  children,
}: {
  title: string;
  count: number | null;
  pane?: boolean;
  testid: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="ny-group" role="group" aria-labelledby={id} data-testid={testid}>
      <div className="ny-group-head">
        <span className="ny-group-title" id={id}>
          {title}
        </span>
        {count !== null ? <span className="ny-group-n tabular">{count}</span> : null}
      </div>
      {pane ? (
        <Panel size="flush" className="tq-list ny-pane">
          {children}
        </Panel>
      ) : (
        <div className="tq-list">{children}</div>
      )}
    </div>
  );
}

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
