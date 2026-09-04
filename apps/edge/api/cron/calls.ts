/**
 * Call reconciliation: close out calls the webhook never told us had ended.
 *
 * `calls.status = 'ongoing'` is written from Retell's own call_status and is
 * only ever cleared by a LATER webhook. So a single lost `call_ended` — a
 * deploy mid-call, a provider blip, a 500 on our side — leaves that row
 * 'ongoing' forever. `isLiveCall()` stops a phantom being RENDERED after
 * CALL_HEARTBEAT_MS, but the row itself stays wrong: metrics count it, the
 * partial index carries it, and anyone querying status directly still sees a
 * call in progress that hung up last week.
 *
 * This is the half that makes the row honest. The provider is the authority on
 * whether a call is still up, so we ask it rather than inferring.
 *
 * Called by pg_cron via pg_net (migration 00020), same shape and same Vault
 * secret as the deadman sweep. Idempotent by construction: it re-ingests
 * whatever Retell reports, and ingest_call is an upsert — a lost or duplicated
 * request finds the same candidates next tick.
 *
 * Deliberately NOT time-based on its own. A sweep that guessed "ongoing for
 * more than N minutes means ended" would eventually mark a genuinely long call
 * as finished and file a summary for a conversation still in progress.
 */
import crypto from "node:crypto";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { logger, errField } from "../../lib/log.js";
import { getCall, normalizeCall } from "../../lib/workspace/channels.js";
import { ingestCall } from "../../lib/workspace/db.js";
import { copyRecording, RECORDING_MAX_ATTEMPTS, SWEEP_COPY_TIMEOUT_MS } from "../../lib/call-recording.js";

/** Only look at rows that have had time to settle — a call that started
 *  seconds ago is not evidence of anything, and asking about it wastes a
 *  provider round trip per tick. */
const SETTLE_MS = 5 * 60 * 1000;

/** A bound per tick. A backlog drains over successive runs rather than turning
 *  one cron tick into a hundred sequential API calls. */
const MAX_PER_TICK = 25;

/** Recording copies retried per tick. Each may wait SWEEP_COPY_TIMEOUT_MS,
 *  so the two together stay inside this function's own budget. */
const MAX_RECORDINGS_PER_TICK = 3;

export const config = { maxDuration: 60 };

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "calls" });
  const db = pg();
  if (!db) {
    L.error("calls_sweep_no_db");
    return json(503, { ok: false, error: "no_database" });
  }

  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error: keyErr } = await db.rpc("get_cron_sweep_key");
  if (keyErr || !expected) {
    L.error("calls_sweep_key_unavailable", { error: keyErr?.message });
    return json(503, { ok: false, error: "key_unavailable" });
  }
  if (!presented || !secretsMatch(presented, expected as unknown as string)) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    // Without the provider there is no authority to reconcile against, and
    // guessing is the one thing this sweep exists not to do.
    L.error("calls_sweep_no_retell_key");
    return json(503, { ok: false, error: "no_provider_credentials" });
  }

  const { data: stale, error } = await db
    .from("calls")
    .select("id, tenant_id, retell_call_id, updated_at")
    .eq("status", "ongoing")
    .lt("updated_at", new Date(Date.now() - SETTLE_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(MAX_PER_TICK);
  if (error) {
    L.error("calls_sweep_query_failed", { error: error.message });
    return json(500, { ok: false, error: "query_failed" });
  }

  let closed = 0;
  let stillLive = 0;
  let unknown = 0;

  for (const row of stale ?? []) {
    try {
      const fresh = await getCall({ apiKey }, row.retell_call_id);
      if (!fresh) {
        // The provider has no record of it. Not proof it ended, so the row is
        // left alone and counted — a rising number here means our call ids and
        // theirs have diverged, which is a different and worse problem than a
        // dropped webhook.
        unknown++;
        L.warn("calls_sweep_unknown_to_provider", { call: row.retell_call_id });
        continue;
      }
      const n = normalizeCall(fresh);
      if (n.status === "ongoing") {
        // A genuinely long call. Re-ingesting still refreshes updated_at, which
        // is what keeps isLiveCall() honest for calls that outlive the heartbeat
        // window without producing turn events.
        stillLive++;
      } else {
        closed++;
      }
      await ingestCall(db, row.tenant_id, n, fresh);
    } catch (e) {
      // One bad row must not abandon the rest of the batch.
      L.error("calls_sweep_row_failed", { call: row.retell_call_id, error: errField(e) });
    }
  }

  // ---- recordings that did not finish copying inside the webhook's budget ----
  // Same settle rule: the row's own updated_at moved on the last attempt, so
  // waiting five minutes IS the back-off. After RECORDING_MAX_ATTEMPTS the
  // copy is marked failed by copyRecording and stops being a candidate.
  const recordings = { candidates: 0, stored: 0, retry: 0, failed: 0 };
  const { data: pendingRec, error: recErr } = await db
    .from("calls")
    .select("id, tenant_id, recording")
    .in("status", ["ended", "error"])
    .filter("recording->>fetch_state", "eq", "pending")
    .lt("updated_at", new Date(Date.now() - SETTLE_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(MAX_RECORDINGS_PER_TICK * 2);
  if (recErr) L.error("calls_sweep_recordings_query_failed", { error: recErr.message });
  for (const row of pendingRec ?? []) {
    const rec = (row.recording ?? {}) as { provider_url?: string; attempts?: number };
    if (!rec.provider_url || (rec.attempts ?? 0) >= RECORDING_MAX_ATTEMPTS) continue;
    if (recordings.candidates >= MAX_RECORDINGS_PER_TICK) break;
    recordings.candidates++;
    const outcome = await copyRecording(db, {
      tenantId: row.tenant_id,
      callId: row.id,
      providerUrl: rec.provider_url,
      attempts: rec.attempts ?? 0,
      timeoutMs: SWEEP_COPY_TIMEOUT_MS,
    });
    recordings[outcome]++;
  }

  L.info("calls_sweep_done", {
    candidates: stale?.length ?? 0, closed, still_live: stillLive, unknown,
    recordings: JSON.stringify(recordings),
  });
  return json(200, { ok: true, candidates: stale?.length ?? 0, closed, stillLive, unknown, recordings });
}
