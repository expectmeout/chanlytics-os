/**
 * One sequence's reads as its record draws them (verbs.ts): painted at once from the last answer this tab holds, read
 * again behind, and read again each time the list's surface is (surface.ts), which hears every change of a sequence, its
 * batches, its sends and its replies, so a record on screen never says less than the list beside it.
 */
import { useEffect, useState } from "react";
import type { ApiResult } from "@/client/api";
import { useSurface } from "../../use-surface";

/** What a read is now: not answered yet, its answer, or why it could not be read. */
type Read<T> = { state: "reading" } | { state: "read"; data: T } | { state: "failed"; why: string };

const asRead = <T>(r: ApiResult<T> | null): Read<T> =>
  r === null ? { state: "reading" } : r.ok ? { state: "read", data: r.data } : { state: "failed", why: r.message };

/**
 * A read of the sequence `id` (null: none open), through `read` and painted from `peek`: again whenever the list is read
 * again, and when `again` changes (a press that moved it).
 */
export function useSequenceRead<T>(
  id: string | null,
  read: (id: string) => Promise<ApiResult<T>>,
  peek: (id: string) => ApiResult<T> | null,
  again = 0,
): Read<T> {
  const list = useSurface("sequences");
  const [now, setNow] = useState<Read<T>>(() => (id ? asRead(peek(id)) : { state: "reading" }));
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    setNow((was) => (was.state === "read" ? was : asRead(peek(id))));
    void read(id).then((r) => {
      if (live) setNow(asRead(r));
    });
    return () => {
      live = false;
    };
    // The list's value is a new object at each read of it: the record follows it.
  }, [id, list, again, read, peek]);
  return now;
}
