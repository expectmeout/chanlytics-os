/**
 * A forced break, FOR THE PROOF ONLY (footage sources, plan v4, P1: "a clip arrives after a forced break in the relay").
 * The relay itself has no way to break a download, on purpose. For the proof it is given a fetch that listens to the key
 * door's answer: where the door says `break_after_ms`, the download that follows is cut that long after Drive's first
 * line, so the fetcher at the other end is promised a clip's whole length and gets a connection that died part-way, as a
 * real fault would look.
 *
 * The cut is made on the pipe between Drive's bytes and the answer, which the runtime runs itself: no byte passes through
 * this code. (Stopping the fetch by its signal does nothing here: once a Worker hands a body on, the runtime carries it
 * past the signal. Rehearsed in the runtime on 17 Nov 2026.) An unbroken clip is not piped at all, and passes exactly as
 * in production.
 */
import type { RelayFetch } from "../src/relay";
import { isJsonObject } from "../src/wire";

/** The runtime's pipe of a known length, which keeps the answer's Content-Length; absent outside a Worker. */
declare const FixedLengthStream: undefined | (new (length: number) => TransformStream<Uint8Array, Uint8Array>);

/** A download's answer whose body ends in an error `afterMs` from now, its status and headers as Drive gave them. */
function brokenAfter(reply: Response, afterMs: number): Response {
  if (!reply.body || !reply.ok) return reply;
  const length = Number(reply.headers.get("content-length"));
  const through =
    typeof FixedLengthStream === "function" && Number.isInteger(length) && length > 0
      ? new FixedLengthStream(length)
      : new TransformStream<Uint8Array, Uint8Array>();
  const stop = new AbortController();
  // A stopped pipe rejects, and that is the break itself: the answer's body carries the error to the fetcher.
  reply.body.pipeTo(through.writable, { signal: stop.signal }).catch(() => undefined);
  setTimeout(() => stop.abort(), afterMs);
  return new Response(through.readable, { status: reply.status, headers: reply.headers });
}

/** One request's fetch: the door's answer is read for a break, and the download after it is cut when its time comes. */
export function fetchWithBreaks(inner: RelayFetch, keyDoorUrl: string): RelayFetch {
  let breakAfterMs: number | null = null;
  return async (input, init) => {
    if (input === keyDoorUrl) {
      const reply = await inner(input, init);
      // An answer that is not JSON names no break; the relay reads the answer itself, from the copy left to it.
      const answer: unknown = await reply
        .clone()
        .json()
        .catch(() => null);
      const after = isJsonObject(answer) ? answer.break_after_ms : null;
      breakAfterMs = typeof after === "number" && after > 0 ? after : null;
      return reply;
    }
    const reply = await inner(input, init);
    return breakAfterMs === null || !input.includes("alt=media") ? reply : brokenAfter(reply, breakAfterMs);
  };
}
