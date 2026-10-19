/**
 * One sequence's reads as its record draws them (verbs.ts): painted at once from the last answer this tab holds and read
 * again behind, and read again each time its row in the list's surface moves (surface.ts), which hears every change of a
 * sequence, its batches, its sends and its replies, so a record on screen never says less than the list beside it. The
 * list keeps a row that did not change as the object it was (shareUnchanged), so a send in another sequence, or a list read
 * that found nothing new, reads nothing here. What is shown is always the id asked for: a read is kept with the id it
 * answers, so a record opened from another's never paints the other while its own is read. One of its batches is read
 * through the batch's own door, as its run's sheet reads it (useBatchRead), and follows the list while it can still move.
 */
import { useEffect, useRef, useState } from "react";
import { runStillMoving, type BroadcastDetailDto } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { useSurface } from "../../use-surface";
import { broadcasts } from "../broadcasts/verbs";

/** What a read is now: not answered yet, its answer, or why it could not be read. */
type Read<T> = { state: "reading" } | { state: "read"; data: T } | { state: "failed"; why: string };

const asRead = <T>(r: ApiResult<T> | null): Read<T> =>
  r === null ? { state: "reading" } : r.ok ? { state: "read", data: r.data } : { state: "failed", why: r.message };

const READING = { state: "reading" } as const;

/** When a record's read is read again beside the list: a press that moved it, and whether its answer can still move. */
interface ReadAgain<T> {
  /** Changed by a press that moved it: read again. */
  again?: number;
  /** Whether an answer can still move: one that cannot is not read again as the list moves. Absent: every answer can. */
  moves?: (data: T) => boolean;
}

/**
 * A read of `id` (null: none open), through `read` and painted from `peek`: again whenever the list is read again, and
 * when `again` changes (a press that moved it). The same id read again keeps what it shows until the answer lands;
 * another id shows its own, from what the tab holds of it or reading. Where `moves` is given, an answer it says can no
 * longer move is not read again as the list moves: as it opens, and after a press, alone.
 */
export function useSequenceRead<T>(
  id: string | null,
  read: (id: string) => Promise<ApiResult<T>>,
  peek: (id: string) => ApiResult<T> | null,
  { again = 0, moves }: ReadAgain<T> = {},
): Read<T> {
  const list = useSurface("sequences");
  // What it follows: its sequence's own row, where the list has one by the id asked for, else the whole list (an id that
  // names a part of one, a batch's or a step's, or a sequence the list has not read yet).
  const follows = (id && list?.sequences.find((s) => s.id === id)) || list;
  const [now, setNow] = useState<{ id: string | null; read: Read<T> }>(() => ({
    id,
    read: id ? asRead(peek(id)) : READING,
  }));
  // What the last read was asked for, and what it answered: a new id, or a press, is always read. Judged from this answer,
  // never the tab's cache, which any write empties: a day that can no longer move is not read again after one either.
  const asked = useRef<{ id: string; again: number; answer: { data: T } | null } | null>(null);
  useEffect(() => {
    if (!id) return undefined;
    const last = asked.current;
    const opened = last?.id !== id || last.again !== again;
    if (!opened && moves && last?.answer && !moves(last.answer.data)) return undefined;
    if (opened) asked.current = { id, again, answer: null };
    let live = true;
    setNow((was) => (was.id === id && was.read.state === "read" ? was : { id, read: asRead(peek(id)) }));
    void read(id).then((r) => {
      const latest = asked.current;
      if (r.ok && latest?.id === id) latest.answer = { data: r.data };
      if (live) setNow({ id, read: asRead(r) });
    });
    return () => {
      live = false;
    };
    // Its row is a new object only when it changed (the list's shareUnchanged): the record follows it.
  }, [id, follows, again, read, peek, moves]);
  if (!id) return READING;
  // Between a new id and its read, what is held is the last id's: the new one paints from the tab's own answer, or reads.
  return now.id === id ? now.read : asRead(peek(id));
}

/** Whether a batch's answer can still move: underway, or ended within the reply window (contracts runStillMoving). */
const batchMoves = (d: BroadcastDetailDto) => runStillMoving(d.broadcast, Date.now());

/**
 * One of the sequence's batches (null: none), read through the batch's own door, GET broadcasts/[id]: what its run's sheet
 * in Sent reads, with its cache, so a day opened in History and then its sheet paint from one answer, and say one thing.
 * Read as it opens, and again as the list moves only while it can still move, the door's own rule (its sheet's, and
 * on-demand-reads.json's): a day of History past the reply window is read once, never again at every send of the
 * workspace. History's day, a lead step's next email and the step editor's people read it so.
 */
export function useBatchRead(id: string | null): Read<BroadcastDetailDto> {
  return useSequenceRead(id, broadcasts.detail, broadcasts.peekDetail, { moves: batchMoves });
}
