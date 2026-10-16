/**
 * A sequence's replies in the Inbox (decision 0060; the canvas's History board: Replied is a door to the Inbox). The
 * address `inbox/from:<sequence>[:<period>]` (contracts sequenceRepliesRoute) lists the threads that answered that
 * sequence over one of History's periods and nothing else, read by their conversations' ids (GET sequences/:id/replies,
 * by the rule History's days open onto). A line above the list says whose replies, over which days and how many, how
 * many of them the Inbox holds (its newest hundred: an older thread is not drawn as if it were here), and the way back to
 * every thread. A read that failed says so, and lists nothing in its place.
 */
import { useEffect, useState } from "react";
import { SEQUENCE_REPLIES_WORDS as W, type SequenceRepliesDto } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { EmptyState, FailedRead } from "../../kit/empty/empty";

/** What the Inbox asked of a sequence's replies: reading, failed, or the threads they came back on (`th-<conversation>`). */
export type SequenceRepliesRead =
  | { state: "reading" }
  | { state: "failed"; why: string | null }
  | { state: "ready"; data: SequenceRepliesDto; threads: ReadonlySet<string> };

/** The replies the address names, read once a sequence and a period are named; null where the address names none. */
export function useSequenceReplies(
  asked: { id: string; period: "30" | "90" | "all" } | null,
): SequenceRepliesRead | null {
  const [read, setRead] = useState<SequenceRepliesRead | null>(null);
  const id = asked?.id ?? null;
  const period = asked?.period ?? null;
  useEffect(() => {
    if (!id || !period) {
      setRead(null);
      return undefined;
    }
    let live = true;
    setRead({ state: "reading" });
    void api()("GET sequences/[id]/replies", { params: { id }, query: { period } }).then((r) => {
      if (!live) return;
      setRead(
        r.ok
          ? { state: "ready", data: r.data, threads: new Set(r.data.conversation_ids.map((c) => `th-${c}`)) }
          : { state: "failed", why: r.message || null },
      );
    });
    return () => {
      live = false;
    };
  }, [id, period]);
  return read;
}

/** The threads the list draws while a sequence's replies are asked for: none until they are read. */
export const onlyThreadsOf = (read: SequenceRepliesRead | null): ReadonlySet<string> | null =>
  read === null ? null : read.state === "ready" ? read.threads : new Set<string>();

/** The line above the list: whose replies, how many, how many are here, and the way back to every thread. */
export function SequenceRepliesLine({ read, held }: { read: SequenceRepliesRead; held: readonly { id: string }[] }) {
  const back = { label: W.leave, to: "inbox", testid: "inbox-from-leave" };
  if (read.state === "failed")
    return <FailedRead kind="line" what={W.failed} why={read.why} testid="inbox-from-failed" />;
  if (read.state === "reading")
    return <EmptyState kind="line" glyph="chat" title={W.reading} action={back} testid="inbox-from-reading" />;
  const n = read.data.conversation_ids.length;
  const here = held.filter((t) => read.threads.has(t.id)).length;
  return (
    <EmptyState
      kind="line"
      glyph="chat"
      title={W.line(read.data.name, read.data.period, n)}
      body={W.shown(here, n)}
      action={back}
      testid="inbox-from"
    />
  );
}
