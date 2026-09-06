/**
 * The Postgres bookkeeping of one inbound WhatsApp message: ingest first (the
 * customer's message is never lost to a later failure), the memory read, the
 * held draft, and the sink every branch of inbound.ts reports through. Every
 * method no-ops when Postgres is unconfigured and never throws into the
 * handling path.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { pg } from "../pg.js";
import { fetchMediaBytes, type NormalizedInbound } from "../workspace/channels.js";
import {
  ingestInbound,
  markProcessed,
  recordOutbound,
  pauseConversation,
  emitEvent,
  readThreadState,
  type IngestResult,
} from "../workspace/db.js";
import type { Database, Json } from "../workspace/db.js";
import { upsertEscalation, type EscalationOutcome } from "../workspace/jobs.js";
import { waCfgFor, type TenantRuntime } from "../tenant-runtime.js";
import { queueDraft } from "../draft-queue.js";
import type { BrainMeta } from "../workspace/contracts.js";
import type { ThreadState } from "../store.js";
import { logger, errField } from "../log.js";

/** Sentinel for "Postgres couldn't answer" — distinct from "empty thread", so
 *  a database blip falls back to Blob instead of giving the bot amnesia and
 *  re-greeting a customer mid-conversation. */
export const PG_MISS: ThreadState = { history: [], seen: [], pausedUntil: -1, replies: [] };

/** Postgres-sourced thread state, or PG_MISS if it can't be produced. */
export async function pgThread(
  db: ReturnType<typeof pg>,
  tenantId: string | null,
  ing: IngestResult | null,
): Promise<ThreadState> {
  if (!db || !tenantId || !ing) return PG_MISS;
  try {
    const s = await readThreadState(db, tenantId, ing.conversation_id, ing.paused_until);
    return { history: s.history, seen: s.seen, pausedUntil: s.pausedUntil, replies: s.replies };
  } catch (e) {
    console.error("pg_thread_read_failed", e instanceof Error ? e.message : e);
    return PG_MISS;
  }
}

// Credential resolution moved to tenant-runtime (waCfgFor) once a second send
// path needed it; this alias keeps the call sites below unchanged.
const waCfg = waCfgFor;

/**
 * Write the receptionist's reply as a DRAFT and schedule it to fire.
 *
 * Returns false when it could not be queued, and the caller then sends
 * immediately. That fallback is deliberate: an un-vetoed reply is a worse
 * outcome than a vetoed one, and no reply at all is worse than both. A missing
 * QSTASH_TOKEN, an unreachable database, a scheduling failure — none of them
 * should leave a customer waiting on an answer that was already written.
 */
export async function queueReply(
  db: ReturnType<typeof pg>,
  tenantId: string | null,
  ing: IngestResult | null,
  toPhone: string,
  body: string,
  delayMs: number,
  L: ReturnType<typeof logger>,
  /** Why the draft waits: the hold window, or the confidence dial. */
  source: "veto_window" | "low_confidence" = "veto_window",
  /** What the row remembers about the answer (contracts/brain.ts). */
  brainMeta?: BrainMeta,
): Promise<boolean> {
  if (!db || !tenantId || !ing) {
    L.warn("wa_queue_unavailable", {
      has_db: !!db, has_tenant: !!tenantId, has_ingest: !!ing, has_qstash: !!process.env.QSTASH_TOKEN,
    });
    return false;
  }
  // One writer for a held draft (lib/draft-queue.ts): the steer endpoint
  // queues the same row and the same job when an owner has one rewritten.
  const id = await queueDraft(
    db,
    { tenantId, conversationId: ing.conversation_id, contactId: ing.contact_id, toPhone, body, delayMs, source, brainMeta },
    L,
  );
  return !!id;
}

/** Additive PG ingest — never throws into the handling path. */
export async function pgIngest(tenantId: string | null, n: NormalizedInbound): Promise<IngestResult | null> {
  const db = pg();
  if (!db || !tenantId) return null;
  try {
    return await ingestInbound(db, {
      tenantId,
      channel: "whatsapp",
      identityExternalId: n.waId,
      phoneE164: n.phoneDigits ? `+${n.phoneDigits.replace(/^\+/, "")}` : null,
      waProfileName: n.profileName,
      messageExternalId: n.messageId,
      type: n.type,
      body: n.body,
      channelTs: n.channelTsIso,
      media: n.media ? (n.media as unknown as Json) : null,
      meta: { raw_type: n.rawType } as Json,
      optOut: n.optOut,
      optIn: n.optIn,
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "ingest_pg_failed", tenant_id: tenantId, error: errField(e) }));
    return null;
  }
}

export async function pgSafe<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error(`pg_${label}_failed`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "video/mp4": "mp4", "application/pdf": "pdf",
};

/** All PG bookkeeping for one inbound message; every method no-ops when unconfigured. */
/**
 * `rt` is threaded in so the media download uses the TENANT's credentials.
 *
 * fetchMediaBytes ran on waCfg() with no argument — the environment pair —
 * while the runtime holding this tenant's own credentials was already in scope
 * at every call site. For tenant #2 that is a download attempted with another
 * business's token against their WABA, which cannot succeed: every voice note
 * and photo their customers send would fail to store.
 */
export function pgSink(
  db: SupabaseClient<Database> | null,
  tenantId: string | null,
  ing: IngestResult | null,
  rt?: TenantRuntime | null,
) {
  const on = !!(db && tenantId && ing);
  return {
    on,
    processed: () =>
      on ? pgSafe("processed", () => markProcessed(db!, tenantId!, ing!.message_id)) : Promise.resolve(),
    allowlistSkip: () =>
      on
        ? pgSafe("allowlist_evt", () =>
            emitEvent(db!, tenantId!, "ingest.allowlist_skip", "ingest", "message", ing!.message_id))
        : Promise.resolve(),
    /**
     * A veto window this workspace CONFIGURED did not happen, and the customer
     * has the receptionist's words already. The reply itself is fine — the
     * promise the setting made is what broke, and a setting that quietly stops
     * applying is the failure mode this project keeps finding.
     */
    vetoFallback: (delayMs: number, hasQstash: boolean) =>
      on
        ? pgSafe("veto_fallback_evt", () =>
            emitEvent(db!, tenantId!, "policy.veto_window_skipped", "policy", "conversation", ing!.conversation_id, {
              delay_ms: delayMs,
              // The usual cause, named: the edge cannot schedule without it.
              reason: hasQstash ? "scheduling_failed" : "scheduler_not_configured",
            } as Json))
        : Promise.resolve(),
    pause: (iso: string) =>
      on ? pgSafe("pause", () => pauseConversation(db!, tenantId!, ing!.conversation_id, iso)) : Promise.resolve(),
    outbound: (body: string, wamid: string | null, brainMeta?: BrainMeta) =>
      on
        ? pgSafe("outbound", () =>
            recordOutbound(db!, {
              tenantId: tenantId!, conversationId: ing!.conversation_id, contactId: ing!.contact_id,
              sender: "ai", body, externalId: wamid,
              ...(brainMeta ? { meta: brainMeta as unknown as Json } : {}),
            }))
        : Promise.resolve(),
    /** Tokens in and out, and the quality signal beside them (intent,
     *  confidence, latency, whether it waited or handed off). */
    usage: (u: Record<string, unknown>) =>
      on
        ? pgSafe("usage", () =>
            emitEvent(db!, tenantId!, "usage.llm_tokens", "usage", "conversation", ing!.conversation_id,
              u as unknown as Json))
        : Promise.resolve(),
    sendFailed: (httpStatus: number) =>
      on
        ? pgSafe("send_failed_evt", () =>
            emitEvent(db!, tenantId!, "message.send_failed", "message", "message", ing!.message_id,
              { http_status: httpStatus } as Json))
        : Promise.resolve(),
    /** Resolves to how the escalation landed — "opened" for a new one,
     *  "refreshed" when the thread already had one open — so a caller can
     *  alert once per hold rather than once per message. Undefined when
     *  Postgres is off or the write failed. */
    escalate: (reason: string, details: string): Promise<EscalationOutcome | undefined> =>
      on
        ? pgSafe("escalation", () =>
            upsertEscalation(db!, tenantId!, ing!.conversation_id, reason, details.slice(0, 400)))
        : Promise.resolve(undefined),
    /** Download from Meta, upload to storage, record where it went. Resolves
     *  to the bytes when they were fetched — a photo the receptionist looks
     *  at reads them — and to nothing on failure. */
    media: (n: NormalizedInbound) =>
      on && n.media
        ? pgSafe("media_fetch", async () => {
            const got = await fetchMediaBytes(waCfg(rt), n.media!.provider_media_id);
            const mediaOut = { ...n.media } as Record<string, unknown>;
            if (got) {
              const ext = MIME_EXT[got.mime || ""] || "bin";
              const path = `${tenantId}/${ing!.conversation_id}/${ing!.message_id}.${ext}`;
              const { error } = await db!.storage.from("media").upload(path, got.bytes, {
                contentType: got.mime || "application/octet-stream",
                upsert: true,
              });
              if (error) throw new Error(error.message);
              mediaOut.fetch_state = "stored";
              mediaOut.storage_path = path;
              mediaOut.mime_type = got.mime;
            } else {
              mediaOut.fetch_state = "failed";
            }
            await db!.from("messages").update({ media: mediaOut as Json })
              .eq("id", ing!.message_id).eq("tenant_id", tenantId!);
            return got;
          })
        : Promise.resolve(null),
  };
}

