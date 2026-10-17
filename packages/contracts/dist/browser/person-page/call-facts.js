import { neverConnected } from "../conversations/call-dto.js";
import { clipAtWord } from "../conversations/message-words.js";
import { clockDate } from "../shared/clock.js";
import { isPersonsName } from "./signer.js";
const STEP_WORDS_MAX = 200;
export function callFactsOf(calls, notNames, tz, nowMs) {
  const theirs = calls.filter((k) => k.direction === "inbound" && !neverConnected(k) && !!k.started_at).map((k) => ({ k, at: Date.parse(k.started_at ?? "") })).filter((x) => Number.isFinite(x.at)).sort((a, b) => b.at - a.at);
  const day = (at) => clockDate(at, tz, nowMs);
  const named = theirs.find(({ k }) => {
    const n = k.caller_name?.replace(/\s+/g, " ").trim();
    return !!n && isPersonsName(n, notNames);
  });
  const spelled = theirs.find(({ k }) => !!k.caller_email?.trim());
  const newest = theirs[0];
  const step = newest?.k.follow_up?.trim();
  return {
    name: named ? { callId: named.k.id, name: (named.k.caller_name ?? "").replace(/\s+/g, " ").trim(), day: day(named.at) } : null,
    email: spelled ? { callId: spelled.k.id, email: (spelled.k.caller_email ?? "").trim(), day: day(spelled.at) } : null,
    step: newest && step ? { callId: newest.k.id, body: clipAtWord(step, STEP_WORDS_MAX), day: day(newest.at), atMs: newest.at } : null
  };
}
