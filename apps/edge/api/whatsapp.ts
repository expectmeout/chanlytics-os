/**
 * Chanlytics Messaging — WhatsApp Cloud API webhook (app: Chanlytics AI).
 * GET = Meta verification handshake. POST = signature-validated event receiver.
 *
 * Production engine: inbound message -> guardrailed Claude brain -> reply,
 * with per-thread dedupe, history, human-pause (coexistence echoes), rate caps,
 * staleness guard, and escalation alerts via Resend.
 *
 * Shape: this file is the webhook — verification, the signature, routing by
 * phone number id, statuses and echoes. The message path is
 * lib/whatsapp/inbound.ts; its Postgres bookkeeping lib/whatsapp/persist.ts;
 * the people it tells lib/whatsapp/alerts.ts; its pure decisions
 * lib/whatsapp/steps.ts.
 *
 * Contract (frozen during Meta App Review): process-then-200 in-invocation
 * under maxDuration 60; Meta retries + dedupe make replays safe. The HTTP
 * surface is unchanged by Gate 1b — only where memory is read from moves.
 *
 * Postgres dual-write (PG_WRITES=on): additive, fail-safe, batched — the
 * PgSink no-ops when unconfigured so the frozen Blob/send order never depends
 * on PG. wa_replied logs carry ingest_ms/post_ms (blueprint latency budget).
 *
 * GATE 1b (PG_READS=on): Postgres becomes the SOURCE of the bot's memory —
 * history, pause, and rate cap all come from the same rows the dashboard reads
 * and writes, which retires the Blob mirror and the class of drift bugs that
 * came with it. Reversible by an env flip (no redeploy); Blob keeps being
 * written underneath, which is what makes the rollback safe. A Postgres read
 * failure falls back to Blob rather than giving the bot amnesia. PG_READS
 * implies PG dedupe: PG-sourced memory has no `seen` list, and ingest_inbound's
 * atomic is_new claim is a stronger gate than that array ever was.
 *
 * RETIRED STORE (BLOB_SHADOW=off): Blob is neither read nor written. Postgres
 * is the only memory; a Postgres miss has nowhere to fall back to, so the
 * thread is handed to a human (state_unavailable) rather than answered from an
 * invented empty history. Under it, PG_READS=off is no longer a rollback.
 *
 * Env: WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_ACCESS_TOKEN,
 *      WHATSAPP_PHONE_ID, WHATSAPP_TEST_ALLOWLIST (optional, comma list),
 *      ANTHROPIC_API_KEY, RESEND_API_KEY + LEAD_TO/LEAD_FROM,
 *      BLOB_READ_WRITE_TOKEN, PG_WRITES + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
 *      PG_READS (Gate 1b), PG_DEDUPE (optional, implied by PG_READS),
 *      BLOB_SHADOW ('off' retires Blob; Postgres is the only memory).
 */
import crypto from "node:crypto";
import { WABA_FIELDS, handleWabaChange, notificationsFor } from "../lib/waba-events.js";
import { getThread, saveThread, storeBackend, threadNamespace } from "../lib/store.js";
import { json, text } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import type { WaChangeValue } from "../lib/workspace/channels.js";
import { resolveChannelDetailed, recordStatusByExternalId, recordEchoAndPause, emitEvent } from "../lib/workspace/db.js";
import type { Json, RoutedChannel } from "../lib/workspace/db.js";
import { loadTenantRuntime } from "../lib/tenant-runtime.js";
import { handleInbound } from "../lib/whatsapp/inbound.js";
import { pgSafe, IngestFailed } from "../lib/whatsapp/persist.js";
import { alertUnroutable } from "../lib/whatsapp/alerts.js";
import { PAUSE_MS } from "../lib/whatsapp/steps.js";

export const config = { maxDuration: 60 };

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return text(200, q.get("hub.challenge") || "");
  }
  return text(403, "verification failed");
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  // fail-closed: a missing secret is a config error, never a verification skip
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("wa_missing_app_secret");
    return json(401, { ok: false, error: "bad_signature" });
  }
  const sig = String(request.headers.get("x-hub-signature-256") || "");
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(401, { ok: false, error: "bad_signature" });
  }

  interface WebhookBody {
    entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: WaChangeValue }> }>;
  }
  let body: WebhookBody = {};
  try { body = JSON.parse(raw) as WebhookBody; } catch { /* ack anyway */ }
  // Messages the database did not accept in this batch: the one thing this
  // handler must not acknowledge.
  let unrecorded = 0;

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const field = change.field;
        // Multi-tenant routing key (Blueprint §3): phone_number_id -> tenant.
        let tenantId: string | null = null;
        let routedChannel: RoutedChannel | null = null;
        let unroutable = false;
        let routingFailed = false;
        const db = pg();
        // The account's own news (quality, limits, templates, reviews) is keyed
        // on the WABA, not on a number: routed by waba_id, kept as an event,
        // and alerted through the same path a failed send uses.
        if (db && field && WABA_FIELDS.has(field)) {
          const wabaId = String(entry.id || "");
          const outcome = wabaId
            ? await handleWabaChange(db, wabaId, { field, value: v as unknown as Record<string, unknown> }, (tid) => notificationsFor(db, tid))
            : "unrouted";
          console.log("wa_waba_event", JSON.stringify({ field, waba_id: wabaId || null, outcome }));
          continue;
        }
        const phoneNumberId = v.metadata?.phone_number_id;
        const isEnvDefault = !!phoneNumberId && phoneNumberId === (process.env.WHATSAPP_PHONE_ID || "");
        if (db && phoneNumberId) {
          const { channel: routed, lookupFailed } = await resolveChannelDetailed(db, "whatsapp", phoneNumberId);
          if (routed) { tenantId = routed.tenantId; routedChannel = routed; }
          else if (lookupFailed) {
            // The database did not answer. That is an infra blip, not a
            // decision — the designated tenant rides it out on its baked
            // profile rather than going silent mid-conversation.
            routingFailed = true;
            console.error("wa_routing_lookup_failed", phoneNumberId);
          } else {
            // The database ANSWERED and this channel is not active — disabled,
            // deleted, or never ours. That is a deliberate state, so we neither
            // reply nor persist. A log line disappears; a metric built on
            // messages_in would undercount this traffic invisibly and forever.
            unroutable = true;
            console.error("wa_unroutable", phoneNumberId);
            await emitEvent(
              db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", "ingest", null, null,
              { channel: "whatsapp", phone_number_id: phoneNumberId } as Json,
            ).catch(() => {});
          }
        }
        if (field === "messages" && v.messages && unroutable) {
          // Customers are texting a line whose channel is switched off. Nobody
          // is answering them and nothing is being recorded, so this has to
          // reach a human — throttled, because the alternative is one email per
          // inbound message for as long as the channel stays off.
          console.error("wa_skip_unroutable", JSON.stringify({
            phone_number_id: phoneNumberId, messages: v.messages.length,
          }));
          await alertUnroutable("whatsapp", phoneNumberId, v.messages.length);
        } else if (field === "messages" && v.messages) {
          for (const m of v.messages) {
            console.log("wa_inbound", JSON.stringify({ from: m.from, type: m.type, id: m.id, text: m.text?.body ?? null }));
            // Per MESSAGE, not per batch. Any throw used to unwind to the one
            // outer catch below, which returns 200 — so a single failure meant
            // Meta never retried AND every remaining message in the batch was
            // never handled at all. The message itself is already persisted by
            // then, so it stays visible for reconciliation.
            try {
              await handleInbound(m, v, tenantId, routedChannel, isEnvDefault, routingFailed);
            } catch (e) {
              if (e instanceof IngestFailed) unrecorded += 1;
              console.error("wa_inbound_failed", m.id, e instanceof Error ? e.message : e);
            }
          }
        } else if (field === "messages" && v.statuses) {
          await Promise.all((v.statuses ?? []).map(async (s) => {
            console.log("wa_status", JSON.stringify({ id: s.id, status: s.status, to: s.recipient_id, errors: s.errors }));
            if (db && tenantId && s.id && s.status && ["sent", "delivered", "read", "failed"].includes(s.status)) {
              await pgSafe("status", () =>
                recordStatusByExternalId(db, tenantId!, s.id!, s.status as "sent" | "delivered" | "read" | "failed",
                  s.errors ? ({ errors: s.errors } as unknown as Json) : undefined));
            }
          }));
        } else if (field === "smb_message_echoes") {
          // The owner (or staff) replied from the WhatsApp Business app -> pause the bot on that thread
          try {
            // The pause is the tenant's own setting, the one Settings shows as
            // "stays paused for N hours". This path had no runtime loaded and
            // paused for a hard-coded day whatever the owner had chosen. One
            // read per echo batch, never per echo.
            const echoRt = db && routedChannel ? await loadTenantRuntime(db, routedChannel) : null;
            const echoLimits = echoRt?.policy["reply"]?.limits ?? {};
            const echoPauseMs = (echoLimits.pause_hours ? echoLimits.pause_hours * 3600 * 1000 : PAUSE_MS);
            for (const echo of v.message_echoes || []) {
              const to = echo.to;
              if (to) {
                // Same isolation rule: the echo belongs to the tenant whose
                // channel it arrived on, not to a global phone-number bucket.
                if (storeBackend() !== "off") {
                  const echoNs = threadNamespace(tenantId);
                  const t = await getThread(echoNs, to);
                  t.pausedUntil = Date.now() + echoPauseMs;
                  // A refused save means the Blob pause did NOT land, so the bot
                  // could answer over the human who just replied. Postgres below
                  // still records it, which under PG_READS=on is the source of
                  // truth — but this must not pass silently. Retired, there is
                  // no mirror to land: the Postgres row is the memory.
                  if (!(await saveThread(echoNs, to, t))) console.error("echo_pause_not_persisted", to);
                }
                if (db && tenantId) {
                  await pgSafe("echo", () =>
                    recordEchoAndPause(db, {
                      tenantId, customerPhoneDigits: to,
                      body: echo.text?.body ?? null, externalId: echo.id ?? null,
                      pausedUntilIso: new Date(Date.now() + echoPauseMs).toISOString(),
                    }));
                }
                console.log("wa_paused_by_echo", to);
              }
            }
          } catch (e) { console.error("echo_handling_error", e instanceof Error ? e.message : e); }
        } else if (field === "history") {
          console.log("wa_history_sync_batch");
        } else {
          console.log("wa_event", field);
        }
      }
    }
  } catch (e) {
    console.error("wa_webhook_error", e instanceof Error ? e.message : e);
  }
  // A message the database did not accept is not acknowledged: Meta retries
  // any non-200 with decreasing frequency for up to seven days, and the
  // ingest's is_new gate makes the redelivery of the others a no-op.
  if (unrecorded > 0) return json(503, { ok: false, unrecorded });
  return json(200, { ok: true });
}
