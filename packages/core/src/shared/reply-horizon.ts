/**
 * How late a message is, the one statement of it: the receptionist's steps ask it of what came in, and the send door asks it of a draft it held.
 */
export const STALE_MS = 10 * 60 * 1000; // "late" — worth noting in the log
export const STALE_REPLY_MS = 2 * 60 * 60 * 1000; // past this a person answers, not the bot

/**
 * How late a message is, and what that means. Inside the reply horizon the
 * customer is still in the conversation they started, and answering late
 * beats not answering; beyond it an automated reply would arrive out of
 * nowhere, so a person picks it up. Meta redelivers for days, so an outage
 * longer than the horizon must never turn its backlog into silence.
 */
export function ageVerdict(
  timestampS: string | number | undefined,
  now = Date.now(),
): { ageMs: number; verdict: "fresh" | "late" | "stale" } {
  const ageMs = timestampS ? now - Number(timestampS) * 1000 : 0;
  return { ageMs, verdict: ageMs > STALE_REPLY_MS ? "stale" : ageMs > STALE_MS ? "late" : "fresh" };
}

/**
 * Whether words for a message sent at `atMs` (epoch ms) would reach the customer past the reply horizon if they left
 * at `now`: what the send door asks of the receptionist's held draft (deliver.ts). The verdict above, from the same
 * horizon, so a reply held through an outage is a person's exactly as a message that came in that late is. A moment
 * nobody knows (null) is not late.
 */
export function pastReplyHorizon(atMs: number | null, now: number): boolean {
  return atMs !== null && ageVerdict(atMs / 1000, now).verdict === "stale";
}
