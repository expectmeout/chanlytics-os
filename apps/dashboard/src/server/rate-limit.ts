/**
 * Request limits, per signed-in user, per serverless instance.
 *
 * Nothing limited any route (review F45): an operator's session could send
 * a customer thirty templates a minute, mint invitations without end, or
 * hammer the two plpgsql aggregates. These are ceilings a person never
 * reaches in honest use and a script reaches at once.
 *
 * Best-effort, on purpose. The store is this instance's memory: there is no
 * shared counter, so a burst spread across instances is limited per instance
 * rather than in total. That is still the shape abuse takes — one session,
 * one instance, many requests — and it costs nothing per request. When a
 * shared limiter is wanted, the store behind `takeRate` changes and the
 * routes do not: the signature is the contract.
 *
 * Refusals are the envelope's own `rate_limited` (429) with a retry hint, so
 * the client shows a sentence, never a raw status.
 */
import { AppError } from "@chanlytics/contracts";

export interface RateRule {
  limit: number;
  windowMs: number;
  /** What the refusal calls the thing being limited. */
  noun: string;
}

/** One rule per bucket. Named by what the route DOES, not by its path. */
export const RATE = {
  /** Invitations send real email. */
  invite: { limit: 10, windowMs: 3_600_000, noun: "invitations" },
  /** A reply reaches a real person. */
  reply: { limit: 30, windowMs: 60_000, noun: "replies" },
  /** Irreversible, and a job per erasure. */
  erase: { limit: 5, windowMs: 3_600_000, noun: "erasures" },
  /** A sentence into a live call. */
  whisper: { limit: 20, windowMs: 60_000, noun: "whispers" },
  /** metrics_summary and report_series, both plpgsql aggregates. */
  aggregate: { limit: 60, windowMs: 60_000, noun: "report requests" },
  /** Whole-config writes and policy flips. */
  settings: { limit: 30, windowMs: 60_000, noun: "settings changes" },
  /** A new tenant, its rows and its provisioning. */
  create_workspace: { limit: 5, windowMs: 3_600_000, noun: "new workspaces" },
  /** A person's receptionist mode. */
  person_mode: { limit: 60, windowMs: 60_000, noun: "receptionist changes" },
  consent: { limit: 60, windowMs: 60_000, noun: "consent changes" },
  lists: { limit: 60, windowMs: 60_000, noun: "list changes" },
  broadcast: { limit: 10, windowMs: 60_000, noun: "broadcasts" },
  playbook: { limit: 30, windowMs: 60_000, noun: "playbook changes" },
  /** A person added by hand — from an appointment, before they ever write. */
  person_create: { limit: 60, windowMs: 3_600_000, noun: "people added" },
  /** A person's name or the notes the receptionist reads. */
  person_edit: { limit: 60, windowMs: 60_000, noun: "profile edits" },
  /** A whole thread, a whole call, or everyone, as a file. */
  export: { limit: 10, windowMs: 60_000, noun: "exports" },
  /** A question to the workspace assistant: a model turn, tools and all. */
  ask: { limit: 20, windowMs: 60_000, noun: "questions" },
} as const satisfies Record<string, RateRule>;

export type RateBucket = keyof typeof RATE;

const hits = new Map<string, number[]>();
/** Past this many live keys the map is swept; a long-lived instance must not grow forever. */
const SWEEP_AT = 5_000;

function human(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/**
 * Count this request against the bucket, or refuse it.
 *
 * `actor` is the signed-in user id — the limit follows the person, not the
 * workspace, so a busy team is not throttled by one of its members.
 */
export function takeRate(actor: string, bucket: RateBucket, now: number = Date.now()): void {
  const rule: RateRule = RATE[bucket];
  const key = `${bucket}:${actor}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  if (recent.length >= rule.limit) {
    const retryAfterS = Math.max(1, Math.ceil((recent[0] + rule.windowMs - now) / 1000));
    throw new AppError(
      "rate_limited",
      `Too many ${rule.noun} in a short time — try again in ${human(retryAfterS)}.`,
      429,
      { retry_after_s: retryAfterS },
    );
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > SWEEP_AT) {
    for (const [k, times] of hits) {
      if (!times.some((t) => now - t < 3_600_000)) hits.delete(k);
    }
  }
}

/** Tests only: forget every count. */
export function resetRates(): void {
  hits.clear();
}
