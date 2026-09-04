/**
 * The recording copy, in one place.
 *
 * Retell serves call audio from an UNSIGNED public CDN URL, so the audio is
 * copied into the private bucket — where a customer's call is not one guessed
 * link away, and where it outlives the provider's retention. Two callers:
 *
 *   - the webhook makes the first attempt on a SHORT budget. Retell's delivery
 *     timeout is 10 s and a slow copy inside it earns a retry of the whole
 *     event, so the copy is bounded and a copy that does not finish is left
 *     pending rather than fought for;
 *   - the reconcile sweep (api/cron/calls) retries what is still pending.
 *
 * Attempts are counted on the row. After RECORDING_MAX_ATTEMPTS the copy is
 * marked failed and nothing wakes for it again — "Recording still processing"
 * used to be a state a row could stay in forever.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import { fetchRecording } from "./workspace/channels.js";
import { setCallRecording } from "./workspace/db.js";

export const RECORDING_MAX_ATTEMPTS = 3;
/** The webhook's budget: Retell allows 10 s for the whole event and the upsert has already spent some. */
export const WEBHOOK_COPY_TIMEOUT_MS = 6_000;
/** The sweep can afford to wait for a long recording. */
export const SWEEP_COPY_TIMEOUT_MS = 15_000;

const REC_EXT: Record<string, string> = {
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3",
  "audio/mp4": "m4a", "application/octet-stream": "wav",
};

export type CopyOutcome = "stored" | "retry" | "failed";

export async function copyRecording(
  db: SupabaseClient<Database>,
  p: { tenantId: string; callId: string; providerUrl: string; attempts?: number | null; timeoutMs: number },
): Promise<CopyOutcome> {
  const attempt = (p.attempts ?? 0) + 1;
  const base = { provider_url: p.providerUrl, attempts: attempt };
  try {
    const got = await fetchRecording(p.providerUrl, { timeoutMs: p.timeoutMs });
    if (!got) {
      // The provider answered and declined (404, 403). Not a blip: no retry.
      await setCallRecording(db, p.tenantId, p.callId, { ...base, fetch_state: "failed", error: "provider_refused" });
      return "failed";
    }
    const ext = REC_EXT[got.mime || ""] || "wav";
    const path = `${p.tenantId}/calls/${p.callId}.${ext}`;
    const { error } = await db.storage.from("media").upload(path, got.bytes, {
      contentType: got.mime || "audio/wav",
      upsert: true,
    });
    if (error) throw new Error(error.message);
    await setCallRecording(db, p.tenantId, p.callId, {
      ...base,
      storage_path: path,
      fetch_state: "stored",
      mime: got.mime,
      bytes: got.bytes.byteLength,
    });
    return "stored";
  } catch (e) {
    // A timeout, a network error, a storage error: transient until proven
    // otherwise, so the row stays pending and the sweep tries again — a
    // bounded number of times.
    const message = String(e instanceof Error ? e.message : e).slice(0, 200);
    const exhausted = attempt >= RECORDING_MAX_ATTEMPTS;
    console.error("call_recording_copy_failed", JSON.stringify({ call: p.callId, attempt, exhausted, message }));
    await setCallRecording(db, p.tenantId, p.callId, {
      ...base,
      fetch_state: exhausted ? "failed" : "pending",
      error: message,
    });
    return exhausted ? "failed" : "retry";
  }
}
