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
 * secret as the deadman sweep. Since 00149 the request is recorded, so this
 * answer is judged by sweep_health(): anything but a 2xx inside 65 s is a
 * sweep that is not working. Idempotent by construction: it re-ingests
 * whatever Retell reports, and ingest_call is an upsert — a lost or duplicated
 * request finds the same candidates next tick.
 *
 * Deliberately NOT time-based on its own. A sweep that guessed "ongoing for
 * more than N minutes means ended" would eventually mark a genuinely long call
 * as finished and file a summary for a conversation still in progress.
 */
import { json } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger, errField } from "../../lib/log.js";
import { getCall, normalizeCall, callSummaryLine, type NormalizedCall } from "../../lib/workspace/channels.js";
import { ingestCall, recordCallNote, linkCallMessage, setCallRecording } from "../../lib/workspace/db.js";
import { copyRecording, purgeExpiredRecordings, RECORDING_MAX_ATTEMPTS, SWEEP_COPY_TIMEOUT_MS } from "../../lib/call-recording.js";

/** Only look at rows that have had time to settle — a call that started
 *  seconds ago is not evidence of anything, and asking about it wastes a
 *  provider round trip per tick. */
const SETTLE_MS = 5 * 60 * 1000;

/** A call live longer than this is asked about even when it is still
 *  producing turns: the Live page tells the owner it is being checked. */
const OVERLONG_MS = 30 * 60 * 1000;

/** How long after call_ended a call without an analysis still gets a line
 *  in the customer's thread — the webhook writes it on call_analyzed. */
const NOTE_GRACE_MS = 15 * 60 * 1000;
const MAX_NOTES_PER_TICK = 10;

/** A bound per tick. A backlog drains over successive runs rather than turning
 *  one cron tick into a hundred sequential API calls. */
const MAX_PER_TICK = 25;

/** Recording copies retried per tick. Each may wait SWEEP_COPY_TIMEOUT_MS,
 *  so the two together stay inside this function's own budget. */
const MAX_RECORDINGS_PER_TICK = 2;

/** Recordings removed per tick once past their retention: one storage call
 *  and one row update each. Every five minutes, so a backlog of any size
 *  drains within a day. */
const MAX_PURGE_PER_TICK = 50;

export const config = { maxDuration: 60 };

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "calls" });
  const db = pg();
  if (!db) {
    L.error("calls_sweep_no_db");
    return json(503, { ok: false, error: "no_database" });
  }

  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;

  // ---- recordings past their retention are removed, on the schedule the privacy page states ----
  // Before the provider check: this leg needs the bucket, not Retell, and a
  // deployment without the key must still keep the promise the page makes.
  const purge = await purgeExpiredRecordings(db, {
    now: new Date(),
    remove: async (paths) => {
      const { data, error } = await db.storage.from("media").remove(paths);
      return { removed: (data ?? []).map((o) => o.name), error: error?.message ?? null };
    },
  }, MAX_PURGE_PER_TICK);
  if (purge.error) L.error("calls_sweep_purge_failed", { error: purge.error, candidates: purge.candidates });
  else if (purge.candidates) L.info("calls_sweep_purged", { purged: purge.purged });

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
    // Two reasons to ask: nobody has heard from the call for SETTLE_MS, or it
    // has simply run past OVERLONG_MS — long calls happen, and the Live page
    // says such a call is being checked, which has to be true.
    .or(`updated_at.lt.${new Date(Date.now() - SETTLE_MS).toISOString()},started_at.lt.${new Date(Date.now() - OVERLONG_MS).toISOString()}`)
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
  // copy is marked failed (by copyRecording, or below when the provider has
  // no link to give) and stops being a candidate.
  const recordings = { candidates: 0, stored: 0, retry: 0, failed: 0 };
  const { data: pendingRec, error: recErr } = await db
    .from("calls")
    .select("id, tenant_id, retell_call_id, recording")
    .in("status", ["ended", "error"])
    .filter("recording->>fetch_state", "eq", "pending")
    .lt("updated_at", new Date(Date.now() - SETTLE_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(MAX_RECORDINGS_PER_TICK * 2);
  if (recErr) L.error("calls_sweep_recordings_query_failed", { error: recErr.message });
  for (const row of pendingRec ?? []) {
    const rec = (row.recording ?? {}) as { attempts?: number };
    if ((rec.attempts ?? 0) >= RECORDING_MAX_ATTEMPTS) continue;
    if (recordings.candidates >= MAX_RECORDINGS_PER_TICK) break;
    recordings.candidates++;
    // The URL is not kept on the row (it would reach every member's browser
    // over realtime); the provider hands out a fresh one by call id.
    const fresh = await getCall({ apiKey }, row.retell_call_id).catch(() => null);
    const url = fresh?.recording_url ?? null;
    if (!url) {
      L.warn("calls_sweep_recording_no_url", { call: row.retell_call_id });
      // No link to copy from is a try like any other: counted, so a recording
      // the provider never hands over ends "couldn't be saved" after
      // RECORDING_MAX_ATTEMPTS. Skipped and unwritten, it said "still
      // processing" for ever, and with its updated_at never moving it stood
      // first in line on every run.
      const attempt = (rec.attempts ?? 0) + 1;
      const exhausted = attempt >= RECORDING_MAX_ATTEMPTS;
      await setCallRecording(db, row.tenant_id, row.id, { fetch_state: exhausted ? "failed" : "pending", attempts: attempt, error: "provider_no_url" });
      recordings[exhausted ? "failed" : "retry"]++;
      continue;
    }
    const outcome = await copyRecording(db, {
      tenantId: row.tenant_id,
      callId: row.id,
      providerUrl: url,
      attempts: rec.attempts ?? 0,
      timeoutMs: SWEEP_COPY_TIMEOUT_MS,
    });
    recordings[outcome]++;
  }

  // ---- calls that ended without an analysis still get a line in the thread ----
  // The webhook writes the customer-thread note when the summary exists;
  // a call the provider never analyses would otherwise leave no trace there.
  const notes = { candidates: 0, written: 0 };
  const { data: unnoted, error: noteErr } = await db
    .from("calls")
    .select("id, tenant_id, retell_call_id, conversation_id, contact_id, direction, duration_ms, in_voicemail, summary, started_at")
    .in("status", ["ended", "error"])
    .is("message_id", null)
    .not("conversation_id", "is", null)
    .lt("ended_at", new Date(Date.now() - NOTE_GRACE_MS).toISOString())
    .order("ended_at", { ascending: true })
    .limit(MAX_NOTES_PER_TICK);
  if (noteErr) L.error("calls_sweep_notes_query_failed", { error: noteErr.message });
  for (const row of unnoted ?? []) {
    notes.candidates++;
    const line = callSummaryLine({
      direction: row.direction === "outbound" ? "outbound" : "inbound",
      durationMs: row.duration_ms,
      summary: row.summary,
      inVoicemail: row.in_voicemail,
    } as NormalizedCall);
    const msgId = await recordCallNote(db, {
      tenantId: row.tenant_id,
      conversationId: row.conversation_id as string,
      contactId: row.contact_id,
      body: line,
      externalId: `call:${row.retell_call_id}`,
      channelTsIso: row.started_at,
    });
    if (msgId) {
      await linkCallMessage(db, row.tenant_id, row.id, msgId);
      notes.written++;
    }
  }

  L.info("calls_sweep_done", {
    candidates: stale?.length ?? 0, closed, still_live: stillLive, unknown,
    recordings: JSON.stringify(recordings), notes: JSON.stringify(notes), purge: JSON.stringify(purge),
  });
  const counts = { candidates: stale?.length ?? 0, closed, stillLive, unknown, recordings, notes };
  // A purge that failed is the privacy page's ninety days not being kept, so
  // once the other legs have had their turn the answer says so: pg_net records
  // it and sweep_health() judges it (00149). The purge goes first, inside the
  // 200 characters of the answer that the platform's mail quotes.
  if (purge.error) return json(500, { ok: false, error: "purge_failed", purge, ...counts });
  return json(200, { ok: true, ...counts, purge });
}
