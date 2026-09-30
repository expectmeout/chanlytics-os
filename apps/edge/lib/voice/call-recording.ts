/**
 * The recording copy, and the retention purge that ends it, in one place.
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
 * used to be a state a row could stay in forever. A copy that could not be
 * made for a reason that is nobody's word on the recording — the CDN or the
 * bucket being down — spends no attempt: the row is written as it was, which
 * alone moves its updated_at (00007's trigger) and sends it to the back of
 * the queue for the next tick. The provider URL itself is
 * never written to the row: calls is in the realtime publication, so every
 * column reaches every member's browser.
 *
 * Two more things share the bucket's paths and so live here: `sniffAudioType` (what the bytes are, since the CDN's word
 * is not to be trusted) and `purgeExpiredRecordings`, which removes audio past RECORDING_RETENTION_DAYS and leaves
 * the transcript and the summary.
 *
 * Cross-workspace: the purge reads and clears every workspace's expired audio in one pass; the copy acts on the one
 * call it is handed and names that call's workspace.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { fetchRecording } from "../packages/channels.js";
import { setCallRecording } from "../packages/db.js";
import { DAY_MS, RECORDING_RETENTION_DAYS } from "../packages/contracts.js";
import { logger } from "../log.js";

export const RECORDING_MAX_ATTEMPTS = 3;
/** The webhook's budget: the agent allows 20 s for the whole event and the upsert has already spent some. */
export const WEBHOOK_COPY_TIMEOUT_MS = 6_000;
/** The sweep can afford to wait for a long recording. */
export const SWEEP_COPY_TIMEOUT_MS = 20_000;
/**
 * How long an outage may hold a copy without spending its tries. A deferral is
 * no try (the provider or the bucket could not answer), but a file that fails
 * that way for ever would say "still processing" for ever and wake the sweep
 * every five minutes: past this, since the call ended, a deferral counts, and
 * the copy ends "couldn't be saved" within RECORDING_MAX_ATTEMPTS more.
 */
export const RECORDING_DEFER_LIMIT_MS = 2 * DAY_MS;

const REC_EXT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

/**
 * What the audio is, read from its first bytes. Retell's CDN serves a call's
 * WAV as `binary/octet-stream`, and the copy used to take its word: every
 * recording in the bucket was stored, served and recorded as octet-stream, and
 * a browser that goes by the type (Safari above all) will not play audio that
 * is not typed as audio. The provider's word counts only when it names audio;
 * anything else is what Retell records in. tooling/scripts/ops/recordings-retype.mjs
 * carries a copy of this rule for the recordings stored before it.
 */
export function sniffAudioType(bytes: ArrayBuffer, given: string | null): string {
  const b = new Uint8Array(bytes.slice(0, 12));
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  return given && given.startsWith("audio/") ? given : "audio/wav";
}

/** stored; retry (a try spent, more to come); failed (the last spent, or a refusal for good); deferred (no try spent: the CDN or the bucket could not answer for the file just now). */
export type CopyOutcome = "stored" | "retry" | "failed" | "deferred";

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
  const rows = (data ?? []) as {
    id: string;
    tenant_id: string;
    recording: { storage_path?: string; mime?: string | null } | null;
  }[];
  if (!rows.length) return { candidates: 0, purged: 0, error: null };
  const paths = rows
    .map((r) => r.recording?.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length) {
    const r = await ports.remove(paths);
    if (r.error) return { candidates: rows.length, purged: 0, error: r.error };
  }
  // Written here rather than through setCallRecording, which logs its error and
  // returns: right for a webhook, where a recording marker is not worth a 500,
  // and wrong for this, whose whole output is a count. `purged: rows.length`
  // was the count of rows we had TRIED, reported as the count we had marked --
  // so a database refusing every write read as a clean purge, and the audio
  // being gone with the rows still saying "stored" was invisible from the one
  // number the sweep publishes.
  let purged = 0;
  let failure: string | null = null;
  for (const row of rows) {
    // Replaces the whole value: the path and the size go with the audio.
    const marked = await db
      .from("calls")
      .update({
        recording: {
          fetch_state: "purged",
          purged_at: ports.now.toISOString(),
          retention_days: RECORDING_RETENTION_DAYS,
          mime: row.recording?.mime ?? null,
        },
      })
      .eq("id", row.id)
      .eq("tenant_id", row.tenant_id);
    // One bad row does not hold the rest of the batch: the audio is already
    // gone for all of them, and a row still marked `stored` comes back next
    // tick, where the removal is a no-op and only the marker is retried.
    if (marked.error) failure ??= marked.error.message;
    else purged += 1;
  }
  return { candidates: rows.length, purged, error: failure };
}

/** A refusal the provider will not change its mind about. A 404 is NOT one:
 *  the CDN publishes the file a little after call_ended. */
const PERMANENT_REFUSALS = new Set([401, 403, 410]);

/** The CDN not answering for the file just now — a rate limit, a 5xx. Not its word on the recording, so not a try. */
const cdnUnavailable = (status: number): boolean => status === 429 || status >= 500;

/** Bound a promise that offers no cancellation of its own. Rejects as the fetch's own signal does, by name. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`${what} timed out after ${ms} ms`), { name: "TimeoutError" })),
      ms,
    );
  });
  return Promise.race([p, bound]).finally(() => clearTimeout(timer));
}

export async function copyRecording(
  db: SupabaseClient<Database>,
  p: {
    tenantId: string;
    callId: string;
    providerUrl: string;
    attempts?: number | null;
    timeoutMs: number;
    /** The outage has held this copy past RECORDING_DEFER_LIMIT_MS: a deferral spends a try. */
    deferralsSpend?: boolean;
  },
): Promise<CopyOutcome> {
  const L = logger({ tenant: p.tenantId });
  const attempt = (p.attempts ?? 0) + 1;
  const exhausted = attempt >= RECORDING_MAX_ATTEMPTS;
  const settle = async (state: "stored" | "pending" | "failed", extra: Record<string, unknown>) =>
    setCallRecording(db, p.tenantId, p.callId, { fetch_state: state, attempts: attempt, ...extra });
  // No try spent: the count stays, and the write alone (00007's trigger on
  // updated_at) sends the row to the back of the queue for the next tick.
  const defer = async (error: string, fields: Record<string, unknown>): Promise<CopyOutcome> => {
    if (p.deferralsSpend) {
      L.error("call_recording_copy_failed", { call: p.callId, attempt, exhausted, error, ...fields });
      await settle(exhausted ? "failed" : "pending", { error });
      return exhausted ? "failed" : "retry";
    }
    L.warn("call_recording_copy_failed", {
      call: p.callId,
      outcome: "deferred",
      attempts: p.attempts ?? 0,
      error,
      ...fields,
    });
    await setCallRecording(db, p.tenantId, p.callId, { fetch_state: "pending", attempts: p.attempts ?? 0, error });
    return "deferred";
  };
  try {
    const got = await fetchRecording(p.providerUrl, { timeoutMs: p.timeoutMs });
    if (!got.ok) {
      if (PERMANENT_REFUSALS.has(got.status)) {
        // The provider answered and will keep answering the same way.
        await settle("failed", { error: `provider_refused_${got.status}` });
        return "failed";
      }
      // The CDN could not answer for the file just now: nobody's word on it.
      if (cdnUnavailable(got.status)) return defer(`provider_${got.status}`, { status: got.status });
      // Not published yet (404), or another refusal of the request: the
      // CDN's word, worth another look, within the bound.
      await settle(exhausted ? "failed" : "pending", { error: `provider_${got.status}` });
      return exhausted ? "failed" : "retry";
    }
    const mime = sniffAudioType(got.bytes, got.mime);
    const ext = REC_EXT[mime] || "wav";
    const path = `${p.tenantId}/calls/${p.callId}.${ext}`;
    const { error } = await withTimeout(
      db.storage.from("media").upload(path, got.bytes, { contentType: mime, upsert: true }),
      p.timeoutMs,
      "storage upload",
    );
    if (error) {
      // The bucket refusing THIS file (a 4xx: too large, a policy) is a try
      // like any other, so such a copy ends failed instead of returning for
      // ever; the bucket being down (a 5xx, or no status at all) is not the
      // file's fault and spends none.
      const status = (error as { status?: unknown }).status;
      const message = String(error.message).slice(0, 200);
      const refused = typeof status === "number" && status >= 400 && status < 500;
      const slug = `storage_${typeof status === "number" ? status : "unreachable"}`;
      if (!refused) return defer(slug, { message });
      L.error("call_recording_copy_failed", { call: p.callId, attempt, exhausted, message, status });
      await settle(exhausted ? "failed" : "pending", { error: slug });
      return exhausted ? "failed" : "retry";
    }
    await settle("stored", { storage_path: path, mime, bytes: got.bytes.byteLength });
    return "stored";
  } catch (e) {
    // A timeout is the bound the copy was given, and counts: the sweep's own
    // twenty seconds is what a long recording gets, a bounded number of
    // times. Anything else thrown -- a refused connection, a reset, a client
    // that threw -- is a fault around the copy, not a word on it.
    const message = String(e instanceof Error ? e.message : e).slice(0, 200);
    if (!(e instanceof Error && e.name === "TimeoutError")) return defer(message, {});
    L.error("call_recording_copy_failed", { call: p.callId, attempt, exhausted, message });
    await settle(exhausted ? "failed" : "pending", { error: message });
    return exhausted ? "failed" : "retry";
  }
}
