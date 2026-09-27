/**
 * Why a run failed, in the owner's words, and what to do about it. Moved whole from broadcasts.ts (Reach out Part
 * 2.5), which re-exports it.
 */
/**
 * Why a whole broadcast stopped, in the owner's words: the codes the send job writes (core messages/broadcast.ts)
 * and the one the job ledger writes when a run died and none took it up again (jobs settle.ts). Spelled out, as
 * HELD_REASONS is, so the bundler can see through it.
 */
export const BROADCAST_FAILURE_WORDS: Record<string, string> = {
  paused: "the workspace was paused",
  template_not_approved: "WhatsApp no longer approves its template",
  wire_unavailable: "WhatsApp could not be reached",
  run_interrupted: "its send stopped partway and did not start again",
  throttled: "WhatsApp kept limiting how fast this number may send",
};

/**
 * How to get past each reason a run stops, in one sentence: a failed run says
 * what to do next, not only what went wrong. These are the words for a run that
 * reached nobody; one that reached some first says so (BROADCAST_FAILURE_FIX_AFTER).
 */
export const BROADCAST_FAILURE_FIX: Record<string, string> = {
  paused: "Unpause it under Settings, then send it again.",
  template_not_approved: "Open it in Templates — it can be resubmitted.",
  wire_unavailable: "Nothing was charged and nobody was written to. Try again.",
  run_interrupted: "Nobody got it, so sending it again reaches nobody twice.",
  throttled: "Nobody got it. WhatsApp lifts these limits on its own; send it again later.",
};

/**
 * The same, for a run that reached some people before it stopped. Nothing sends
 * to "the rest": a broadcast sent again enrols its whole list (createBroadcast
 * leaves out nobody it already reached), so the words say who that includes
 * rather than promise a resend that skips them.
 */
const BROADCAST_FAILURE_FIX_AFTER: Record<string, (n: number) => string> = {
  paused: (n) =>
    `Unpause it under Settings. Sending it again reaches the whole list, ${n === 1 ? "the one" : `the ${n}`} who got it included.`,
  wire_unavailable: (n) =>
    `The first ${n === 1 ? "one" : n} got it, then WhatsApp stopped answering. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  run_interrupted: (n) =>
    `${n === 1 ? "One" : n} got it and the rest did not. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  throttled: (n) =>
    `The first ${n === 1 ? "one" : n} got it, then WhatsApp limited the number. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
};

/** The next step past a failed run's reason, by how many it reached first; null for a code nobody has written words for. */
export function broadcastFailureFix(failure: string | null | undefined, reached = 0): string | null {
  if (!failure) return null;
  const after = reached > 0 ? BROADCAST_FAILURE_FIX_AFTER[failure] : undefined;
  return after ? after(reached) : BROADCAST_FAILURE_FIX[failure] || null;
}

/** A failed broadcast's reason: its words, a code nobody has written words for yet, or none recorded. */
export function broadcastFailureWords(failure: string | null | undefined): string {
  if (!failure) return "no reason was recorded";
  return BROADCAST_FAILURE_WORDS[failure] ?? "it could not finish";
}
