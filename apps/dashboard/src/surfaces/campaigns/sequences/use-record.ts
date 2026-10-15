/**
 * One sequence's reads as its record draws them (verbs.ts): painted at once from the last answer this tab holds and read
 * again behind, and read again each time the list's surface is (surface.ts), which hears every change of a sequence, its
 * batches, its sends and its replies, so a record on screen never says less than the list beside it. What is shown is
 * always the id asked for: a read is kept with the id it answers, so a record opened from another's never paints the
 * other while its own is read.
 */
import { createContext, useEffect, useState } from "react";
import type { ApiResult } from "@/client/api";
import { useSurface } from "../../use-surface";

/** What a read is now: not answered yet, its answer, or why it could not be read. */
type Read<T> = { state: "reading" } | { state: "read"; data: T } | { state: "failed"; why: string };

const asRead = <T>(r: ApiResult<T> | null): Read<T> =>
  r === null ? { state: "reading" } : r.ok ? { state: "read", data: r.data } : { state: "failed", why: r.message };

const READING = { state: "reading" } as const;

/**
 * A read of `id` (null: none open), through `read` and painted from `peek`: again whenever the list is read again, and
 * when `again` changes (a press that moved it). The same id read again keeps what it shows until the answer lands;
 * another id shows its own, from what the tab holds of it or reading.
 */
export function useSequenceRead<T>(
  id: string | null,
  read: (id: string) => Promise<ApiResult<T>>,
  peek: (id: string) => ApiResult<T> | null,
  again = 0,
): Read<T> {
  const list = useSurface("sequences");
  const [now, setNow] = useState<{ id: string | null; read: Read<T> }>(() => ({
    id,
    read: id ? asRead(peek(id)) : READING,
  }));
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    setNow((was) => (was.id === id && was.read.state === "read" ? was : { id, read: asRead(peek(id)) }));
    void read(id).then((r) => {
      if (live) setNow({ id, read: asRead(r) });
    });
    return () => {
      live = false;
    };
    // The list's value is a new object at each read of it: the record follows it.
  }, [id, list, again, read, peek]);
  if (!id) return READING;
  // Between a new id and its read, what is held is the last id's: the new one paints from the tab's own answer, or reads.
  return now.id === id ? now.read : asRead(peek(id));
}

/**
 * The record's foot, where a step opened to be changed puts its Cancel and Save (step-editor.tsx): the element the pane's
 * foot holds while one is open, and how the editor says it is open (`hold`), so a phone's Save stands at the thumb and not
 * under a screen of fields. None outside a record: the editor then keeps its foot under its fields.
 */
interface RecordFoot {
  el: HTMLElement | null;
  hold: (on: boolean) => void;
}
export const RecordFootContext = createContext<RecordFoot | null>(null);
