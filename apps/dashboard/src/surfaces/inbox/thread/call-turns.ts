/**
 * An ended call's turns, read by its id as its card opens (the strips review, 18 Oct 2026). A list leaves them on the
 * server (GET calls without ids says how many there were: CallVM.turnsToRead), since they were most of that read by
 * weight and it is made again with every message the workspace hears; GET calls?ids= answers the call whole. Kept for the
 * tab once read: an ended call's words do not change.
 */
import { useEffect, useState } from "react";
import { toCallVM } from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import type { CallLine } from "../types";

const turnsKept = new Map<string, CallLine[]>();

/** The call's lines once read, else null; asked for while `wanted` (its card is open and the row came without them). */
export function useCallTurns(callId: string | null | undefined, wanted: boolean): CallLine[] | null {
  const [, landed] = useState(0);
  useEffect(() => {
    if (!wanted || !callId || turnsKept.has(callId)) return undefined;
    let live = true;
    read("GET calls", { query: { ids: callId } }).then(
      (d) => {
        const dto = d.calls[0];
        // The zone only words the call's times, never its lines.
        if (dto) turnsKept.set(callId, toCallVM(dto, "UTC").transcript);
        if (live) landed((n) => n + 1);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [callId, wanted]);
  return callId ? (turnsKept.get(callId) ?? null) : null;
}
