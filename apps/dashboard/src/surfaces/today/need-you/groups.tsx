/**
 * Need you's parts around its rows (Today in three zones, 2 Nov 2026): each group under its own small head (Up next,
 * Waiting on you, To decide, To do, Older; contracts need-you/groups.ts) with a press at its foot to what it could not hold,
 * and the old ones let go at once, each handed back to the receptionist with one Undo for all of them.
 */
import { useId, type ReactNode } from "react";
import { NEED_YOU_WORDS as W, type TodayQueueRowVM } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/bridge/verbs/commit";
import { routeDoor } from "../../frame-verbs";
import { Icon } from "../../kit/icon/icon";
import { doorGlyph } from "../shell";

/**
 * A group of Need you's rows under its small head, on a desk and a phone alike (one list, 9 Nov 2026: a phone drew five
 * cards): its words, how many where it says so, and at its foot a press to what it could not hold.
 */
export function NeedYouGroup({
  title,
  count,
  bare = false,
  more = null,
  foot = null,
  testid,
  children,
}: {
  title: string;
  count: number | null;
  /** No head drawn, its name for a reader alone: its rows say what the head would. */
  bare?: boolean;
  /** What the group could not hold: how many, in words, and where they are. */
  more?: { label: string; to: string } | null;
  /** An act on the group's rows as a whole, at its foot over the press to the rest (To do's Mark all kept). */
  foot?: ReactNode;
  testid: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div
      className="ny-group"
      role="group"
      aria-labelledby={bare ? undefined : id}
      aria-label={bare ? title : undefined}
      data-testid={testid}
    >
      {bare ? null : (
        <div className="ny-group-head">
          <span className="ny-group-title" id={id}>
            {title}
          </span>
          {count !== null ? <span className="ny-group-n tabular">{count}</span> : null}
        </div>
      )}
      <div className="tq-list">
        {children}
        {foot}
        {more ? (
          <a className="ny-more" {...routeDoor(more.to)} data-testid={`${testid}-more`}>
            {more.label}
            <Icon name={doorGlyph()} size={11} />
          </a>
        ) : null}
      </div>
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
