/**
 * Slice 3 call-history backfill: Retell list-calls -> the canonical `calls`
 * table, thread notes, and usage.voice_seconds. Internal admin endpoint
 * (x-diag-key), retired once history is imported.
 *
 * Safety: the agent filter is NOT optional. The live account holds 432 calls
 * across 8 agents; only the tenant's own agent may be imported. Idempotent via
 * ingest_call's (tenant_id, retell_call_id) upsert, so re-runs converge.
 * Driver enforces the prod-script bar (dry-run default, JSONL snapshot, --apply).
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import {
  listCalls,
  getCall,
  needsHydration,
  normalizeCall,
  callSummaryLine,
  fetchRecording,
  type RetellCall,
} from "../../lib/workspace/channels.js";
import { ingestCall, recordCallNote, linkCallMessage, setCallRecording } from "../../lib/workspace/db.js";

export const config = { maxDuration: 60 };

const REC_EXT: Record<string, string> = {
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3",
  "audio/mp4": "m4a", "application/octet-stream": "wav",
};

export async function GET(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/backfill-calls");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const apply = url.searchParams.get("mode") === "apply";
  const tenantSlug = url.searchParams.get("tenant") || "melanys-beauty-salon"; // trade-word: the one workspace this admin backfill was written for; pass ?tenant= for any other
  const withRecordings = url.searchParams.get("recordings") !== "0";
  const maxCalls = Number(url.searchParams.get("max") || 200);

  const db = pg();
  if (!db) return json(400, { ok: false, error: "PG_WRITES not enabled" });
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) return json(400, { ok: false, error: "RETELL_API_KEY missing" });

  const { data: tenant } = await db.from("tenants").select("id").eq("slug", tenantSlug).single();
  if (!tenant) return json(404, { ok: false, error: "tenant not found" });

  const { data: channels } = await db
    .from("tenant_channels")
    .select("external_id")
    .eq("tenant_id", tenant.id)
    .eq("kind", "voice")
    .eq("status", "active");
  const agentIds = (channels ?? []).map((c) => c.external_id);
  if (!agentIds.length) return json(400, { ok: false, error: "tenant has no voice channel" });

  const collected: RetellCall[] = [];
  for (const agentId of agentIds) {
    let key: string | undefined;
    for (let page = 0; page < 20 && collected.length < maxCalls; page++) {
      const res = await listCalls({ apiKey }, { agentId, limit: 100, paginationKey: key, includeTotal: page === 0 });
      collected.push(...res.calls);
      if (!res.nextKey) break;
      key = res.nextKey;
    }
  }

  const report: Array<Record<string, unknown>> = [];
  for (const raw of collected.slice(0, maxCalls)) {
    const n = normalizeCall(raw);
    const row: Record<string, unknown> = {
      call_id: n.retellCallId,
      from: n.fromE164 ?? n.fromRaw,
      started: n.startedAtIso,
      seconds: n.durationMs ? Math.round(n.durationMs / 1000) : 0,
      status: n.status,
      has_summary: !!n.summary,
      has_recording: !!n.recordingUrl,
    };
    if (apply) {
      try {
        // v3 list omits transcripts — hydrate before writing so the thread note
        // and the transcript view are complete on the first pass.
        let full: RetellCall = raw;
        let nn = n;
        if (needsHydration(raw)) {
          const detail = await getCall({ apiKey }, n.retellCallId);
          if (detail) { full = detail; nn = normalizeCall(detail); row.hydrated = true; }
        }
        const res = await ingestCall(db, tenant.id, nn, full);
        row.imported = res.is_new ? "new" : "existing";
        row.conversation = !!res.conversation_id;

        if (res.conversation_id) {
          const msgId = await recordCallNote(db, {
            tenantId: tenant.id,
            conversationId: res.conversation_id,
            contactId: res.contact_id,
            body: callSummaryLine(nn),
            externalId: `call:${nn.retellCallId}`,
            channelTsIso: nn.startedAtIso,
          });
          if (msgId) await linkCallMessage(db, tenant.id, res.call_id, msgId);
          row.noted = !!msgId;
        }

        if (withRecordings && nn.recordingUrl && res.recording_state !== "stored") {
          const got = await fetchRecording(nn.recordingUrl);
          if (got.ok) {
            const ext = REC_EXT[got.mime || ""] || "wav";
            const path = `${tenant.id}/calls/${res.call_id}.${ext}`;
            const { error } = await db.storage.from("media").upload(path, got.bytes, {
              contentType: got.mime || "audio/wav",
              upsert: true,
            });
            if (!error) {
              await setCallRecording(db, tenant.id, res.call_id, {
                storage_path: path,
                fetch_state: "stored", mime: got.mime, bytes: got.bytes.byteLength,
              });
              row.recording = "stored";
            } else {
              row.recording = `failed: ${error.message}`;
            }
          } else {
            row.recording = "unreachable";
          }
        }
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e);
      }
    }
    report.push(row);
  }

  return json(200, {
    ok: true,
    mode: apply ? "apply" : "dry",
    tenant: tenantSlug,
    agents: agentIds,
    found: collected.length,
    calls: report,
  });
}
