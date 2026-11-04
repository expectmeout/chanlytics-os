/**
 * An ended call's turns, read by its id as its card opens (the strips review, 18 Oct 2026). A list leaves them on the
 * server (GET calls without ids says how many there were: CallVM.turnsToRead), since they were most of that read by
 * weight and it is made again with every message the workspace hears; GET calls?ids= answers the call whole. Kept for the
 * tab once read: an ended call's words do not change.
 *
 * A thread that opens with a call's lines shown reads them before it draws its conversation (useCallLinesFirst): drawn
 * first without them, the card grew by its lines a beat later and the thread was placed again, and the call jumped 230px
 * up the screen as it opened (Ruben's recording, 3 Nov 2026).
 */
import { useEffect, useRef, useState } from "react";
import { toCallVM } from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import type { CallLine } from "../types";

const turnsKept = new Map<string, CallLine[]>();
/** The reads out now, by call: the thread waiting for a call's lines and its card ask once between them. */
const turnsAsked = new Map<string, Promise<void>>();
/** How long a thread waits for its calls' lines before it draws without them: a read that hangs never holds it. */
const LINES_WAIT_MS = 1500;

/** Reads the call's lines, once at a time; settles when they are kept, or the read has failed or found no call. */
function readCallTurns(callId: string): Promise<void> {
  const asked = turnsAsked.get(callId);
  if (asked) return asked;
  const landed = read("GET calls", { query: { ids: callId } })
    .then(
      (d) => {
        const dto = d.calls[0];
        // The zone only words the call's times, never its lines.
        if (dto) turnsKept.set(callId, toCallVM(dto, "UTC").transcript);
      },
      () => undefined,
    )
    .finally(() => turnsAsked.delete(callId));
  turnsAsked.set(callId, landed);
  return landed;
}

/** The call's lines once read, else null; asked for while `wanted` (its card is open and the row came without them). */
export function useCallTurns(callId: string | null | undefined, wanted: boolean): CallLine[] | null {
  const [, landed] = useState(0);
  useEffect(() => {
    if (!wanted || !callId || turnsKept.has(callId)) return undefined;
    let live = true;
    void readCallTurns(callId).then(() => {
      if (live) landed((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [callId, wanted]);
  return callId ? (turnsKept.get(callId) ?? null) : null;
}

/**
 * Whether the thread `threadId` still waits for the lines of the calls it opens with: `owed` names each call whose lines
 * are still to be read, and "" a call not known yet, whose read the thread waits on as it comes in (thread.tsx
 * callsOpenedWith). Each is read once; a read that fails or finds nothing lets the thread go as surely as one that lands,
 * and LINES_WAIT_MS lets it go whatever is still out. Only a thread not yet drawn waits (`held` says what else holds it
 * back, its own read): a call that arrives while it is open reads its lines as its card opens, and the conversation on
 * the screen stays drawn.
 */
export function useCallLinesFirst(owed: readonly string[], threadId: string | null, held = false): boolean {
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set());
  const [late, setLate] = useState<string | null>(null);
  const drawn = useRef<string | null>(null);
  const unread = owed.filter((id) => id !== "" && !turnsKept.has(id) && !settled.has(id));
  const asking = unread.join(",");
  useEffect(() => {
    if (!asking) return undefined;
    let live = true;
    for (const id of asking.split(","))
      void readCallTurns(id).then(() => {
        if (live) setSettled((was) => new Set(was).add(id));
      });
    return () => {
      live = false;
    };
  }, [asking]);
  const waiting = (unread.length > 0 || owed.includes("")) && late !== threadId && drawn.current !== threadId;
  if (!waiting && !held) drawn.current = threadId;
  useEffect(() => {
    if (!waiting || !threadId) return undefined;
    const timer = setTimeout(() => setLate(threadId), LINES_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting, threadId]);
  return waiting;
}
