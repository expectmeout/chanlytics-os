/** What ElevenLabs sends after a call, read. */

/** A whole conversation's transcript rides in the event; a long one is still well under this. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** The parts of the vendor's event this door reads (the sources note, §8); everything else is left unread. */
export interface PostCallEvent {
  type?: string;
  data?: {
    conversation_id?: string;
    status?: string;
    transcript?: Array<{
      role?: string;
      conversation_turn_metrics?: { metrics?: Record<string, { elapsed_time?: number }> } | null;
    }>;
    metadata?: { call_duration_secs?: number; termination_reason?: string };
  };
}

/** The body as the vendor's event, or null for one that is not JSON or not an object. */
export function parseEvent(raw: string): PostCallEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** One of the vendor's per-turn timings, in whole milliseconds, for every turn that carries it. */
export function timings(turns: NonNullable<PostCallEvent["data"]>["transcript"], name: string): number[] {
  return (turns ?? [])
    .map((t) => t.conversation_turn_metrics?.metrics?.[name]?.elapsed_time)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map((v) => Math.round(v * 1000));
}
