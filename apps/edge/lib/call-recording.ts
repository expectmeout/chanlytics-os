/**
 * The recording copy, in one place.
 *
 * Retell serves call audio from an UNSIGNED public CDN URL, so the audio is
 * copied into the private bucket — where a customer's call is not one guessed
 * link away, and where it outlives the provider's retention. Two callers:
 *
 *   - the webhook makes the first attempt on a SHORT budget. Retell's delivery
 *     timeout is 20 s on this agent and the upsert has already spent some of
 *     it, so the fetch AND the upload are bounded, and a copy that does not
 *     finish is left pending rather than fought for;
 *   - the reconcile sweep (api/cron/calls) retries what is still pending, with
 *     a fresh URL from the provider.
 *
 * Attempts are counted on the row. After RECORDING_MAX_ATTEMPTS the copy is
 * marked failed and nothing wakes for it again — "Recording still processing"
 * used to be a state a row could stay in forever. The provider URL itself is
 * never written to the row: calls is in the realtime publication, so every
 * column reaches every member's browser.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import { fetchRecording } from "./workspace/channels.js";
import { setCallRecording } from "./workspace/db.js";
import { RECORDING_RETENTION_DAYS } from "./workspace/contracts.js";

export const RECORDING_MAX_ATTEMPTS = 3;
/** The webhook's budget: the agent allows 20 s for the whole event and the upsert has already spent some. */
export const WEBHOOK_COPY_TIMEOUT_MS = 6_000;
/** The sweep can afford to wait for a long recording. */
export const SWEEP_COPY_TIMEOUT_MS = 20_000;

const REC_EXT: Record<string, string> = {
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3",
  "audio/mp4": "m4a", "application/octet-stream": "wav",
};

export type CopyOutcome = "stored" | "retry" | "failed";

/** What the purge needs from the world: the clock, and the bucket's remove. */
export interface PurgePorts {
  now: Date;
  /** storage.from("media").remove(paths): a path already gone is the desired end state, not a failure. */
  remove(paths: string[]): Promise<{ removed: string[]; error: string | null }>;
}

export interface PurgeOutcome {
  candidates: number;
  purged: number;
  error: string | null;
}

/**
 * Recordings past their retention are removed, on the schedule the privacy
 * page states -- which, until this, nothing enforced: the page promised
 * ninety days and the bucket kept everything. The audio goes; the row keeps
 * the transcript and the summary, and its recording becomes a marker that says
 * the audio was removed on schedule and when, so the call reads honestly
 * ("Recording removed after 90 days") instead of as "still processing".
 *
 * One storage call for the batch, then the rows, oldest first. A removal
 * that fails leaves every row as it was, so the next tick tries the same
 * batch again; a row whose path was never written is marked without a
 * removal, because there is nothing to remove. Bounded per tick: a backlog
 * drains over successive runs.
 */
export async function purgeExpiredRecordings(
  db: SupabaseClient<Database>,
  ports: PurgePorts,
  limit = 50,
): Promise<PurgeOutcome> {
  const cutoff = new Date(ports.now.getTime() - RECORDING_RETENTION_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("calls")
    .select("id, tenant_id, recording")
    .filter("recording->>fetch_state", "eq", "stored")
    .lt("started_at", cutoff)
    .order("started_at", { ascending: true })
    .limit(limit);
  if (error) return { candidates: 0, purged: 0, error: error.message };
  const rows = (data ?? []) as { id: string; tenant_id: string; recording: { storage_path?: string; mime?: string | null } | null }[];
  if (!rows.length) return { candidates: 0, purged: 0, error: null };
  const paths = rows.map((r) => r.recording?.storage_path).filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length) {
    const r = await ports.remove(paths);
    if (r.error) return { candidates: rows.length, purged: 0, error: r.error };
  }
  for (const row of rows) {
    // Replaces the whole value: the path and the size go with the audio.
    await setCallRecording(db, row.tenant_id, row.id, {
      fetch_state: "purged",
      purged_at: ports.now.toISOString(),
      retention_days: RECORDING_RETENTION_DAYS,
      mime: row.recording?.mime ?? null,
    });
  }
  return { candidates: rows.length, purged: rows.length, error: null };
}

/** A refusal the provider will not change its mind about. A 404 is NOT one:
 *  the CDN publishes the file a little after call_ended. */
const PERMANENT_REFUSALS = new Set([401, 403, 410]);

/** Bound a promise that offers no cancellation of its own. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, bound]).finally(() => clearTimeout(timer));
}

export async function copyRecording(
  db: SupabaseClient<Database>,
  p: { tenantId: string; callId: string; providerUrl: string; attempts?: number | null; timeoutMs: number },
): Promise<CopyOutcome> {
  const attempt = (p.attempts ?? 0) + 1;
  const exhausted = attempt >= RECORDING_MAX_ATTEMPTS;
  const settle = async (state: "stored" | "pending" | "failed", extra: Record<string, unknown>) =>
    setCallRecording(db, p.tenantId, p.callId, { fetch_state: state, attempts: attempt, ...extra });
  try {
    const got = await fetchRecording(p.providerUrl, { timeoutMs: p.timeoutMs });
    if (!got.ok) {
      if (PERMANENT_REFUSALS.has(got.status)) {
        // The provider answered and will keep answering the same way.
        await settle("failed", { error: `provider_refused_${got.status}` });
        return "failed";
      }
      // Not published yet, or a provider blip: worth another look, within the bound.
      await settle(exhausted ? "failed" : "pending", { error: `provider_${got.status}` });
      return exhausted ? "failed" : "retry";
    }
    const ext = REC_EXT[got.mime || ""] || "wav";
    const path = `${p.tenantId}/calls/${p.callId}.${ext}`;
    const { error } = await withTimeout(
      db.storage.from("media").upload(path, got.bytes, { contentType: got.mime || "audio/wav", upsert: true }),
      p.timeoutMs,
      "storage upload",
    );
    if (error) throw new Error(error.message);
    await settle("stored", { storage_path: path, mime: got.mime, bytes: got.bytes.byteLength });
    return "stored";
  } catch (e) {
    // A timeout, a network error, a storage error: transient until proven
    // otherwise, so the row stays pending and the sweep tries again — a
    // bounded number of times.
    const message = String(e instanceof Error ? e.message : e).slice(0, 200);
    console.error("call_recording_copy_failed", JSON.stringify({ call: p.callId, attempt, exhausted, message }));
    await settle(exhausted ? "failed" : "pending", { error: message });
    return exhausted ? "failed" : "retry";
  }
}
