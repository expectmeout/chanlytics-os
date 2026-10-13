/**
 * What their calls left that the page can use (canvas A, C10; R9): the name they gave, an address they spelled out, and
 * the next step the receptionist noted. Read from the call's own analysis (calls.caller_name, caller_email, follow_up,
 * on every call the person read holds), and only from a call they placed that reached anyone: on a call we placed, the
 * name is whoever answered. A name passes the signer's own gate (isPersonsName). Each is offered, never applied.
 */
import { neverConnected, type CallDto } from "../conversations/call-dto";
import { clipAtWord } from "../conversations/message-words";
import { clockDate } from "../shared/clock";
import { isPersonsName } from "./signer";

/** How much of a noted step the notice says. */
const STEP_WORDS_MAX = 200;

export interface CallFactsVM {
  name: { callId: string; name: string; day: string } | null;
  email: { callId: string; email: string; day: string } | null;
  /** The newest call's next step only: an older one was that call's, and a later call has spoken since. */
  step: { callId: string; body: string; day: string; atMs: number } | null;
}

type CallRow = Pick<
  CallDto,
  "id" | "direction" | "status" | "started_at" | "caller_name" | "caller_email" | "follow_up"
>;

/** The facts, each from the newest call that holds one; `notNames` are the names that are never theirs (the business, the team). */
export function callFactsOf(
  calls: readonly CallRow[],
  notNames: readonly (string | null | undefined)[],
  tz: string,
  nowMs: number,
): CallFactsVM {
  const theirs = calls
    .filter((k) => k.direction === "inbound" && !neverConnected(k) && !!k.started_at)
    .map((k) => ({ k, at: Date.parse(k.started_at ?? "") }))
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => b.at - a.at);
  const day = (at: number) => clockDate(at, tz, nowMs);
  const named = theirs.find(({ k }) => {
    const n = k.caller_name?.replace(/\s+/g, " ").trim();
    return !!n && isPersonsName(n, notNames);
  });
  const spelled = theirs.find(({ k }) => !!k.caller_email?.trim());
  const newest = theirs[0];
  const step = newest?.k.follow_up?.trim();
  return {
    name: named
      ? { callId: named.k.id, name: (named.k.caller_name ?? "").replace(/\s+/g, " ").trim(), day: day(named.at) }
      : null,
    email: spelled
      ? { callId: spelled.k.id, email: (spelled.k.caller_email ?? "").trim(), day: day(spelled.at) }
      : null,
    step:
      newest && step
        ? { callId: newest.k.id, body: clipAtWord(step, STEP_WORDS_MAX), day: day(newest.at), atMs: newest.at }
        : null,
  };
}
