/**
 * Chanlytics Messaging — WhatsApp Cloud API webhook (app: Chanlytics AI).
 * GET = Meta verification handshake. POST = signature-validated event receiver.
 *
 * Production engine: inbound message -> guardrailed Claude brain -> reply,
 * with history, human-pause (coexistence echoes), rate caps, staleness guard,
 * and escalation alerts via Resend.
 *
 * Shape: this file is the webhook — verification, the signature, routing by
 * phone number id, statuses and echoes. The message path is
 * lib/whatsapp/inbound.ts, the edge's adapter onto the receptionist verb in
 * packages/core/src/inbound; its Postgres bookkeeping lib/whatsapp/persist.ts;
 * the people it tells lib/whatsapp/alerts.ts; its pure decisions
 * packages/core/src/inbound/steps.ts.
 *
 * Contract (frozen during Meta App Review): process-then-200 in-invocation
 * under maxDuration 60; Meta retries + dedupe make replays safe.
 *
 * THE MEMORY IS POSTGRES, and there is no other. History, the pause and the
 * rate cap are the same rows the dashboard reads and writes, and the dedupe
 * is ingest_inbound's atomic is_new claim — a unique index two concurrent
 * lambdas cannot both miss. A read that cannot be made has nowhere to fall
 * back to, so the thread is handed to a human (state_unavailable) rather than
 * answered from an invented empty history. The PgSink no-ops when Postgres is
 * unconfigured, so the frozen send order holds with no database at all; what
 * does not hold is the receptionist answering, which is the point.
 * wa_replied logs carry ingest_ms/post_ms (blueprint latency budget).
 *
 * Env: WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_ACCESS_TOKEN,
 *      WHATSAPP_PHONE_ID, WHATSAPP_TEST_ALLOWLIST (optional, comma list),
 *      ANTHROPIC_API_KEY, RESEND_API_KEY + LEAD_TO/LEAD_FROM,
 *      SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import crypto from "node:crypto";
import { phoneTail } from "../lib/packages/contracts.js";
import { WABA_FIELDS, handleWabaChange, notificationsFor } from "../lib/whatsapp/waba-events.js";
import { json, text } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import type { WaChangeValue } from "../lib/packages/channels.js";
import { resolveChannelDetailed, recordStatusByExternalId, recordEchoAndPause, emitEvent } from "../lib/packages/db.js";
import type { Json, RoutedChannel } from "../lib/packages/db.js";
import { loadTenantRuntime } from "../lib/tenant-runtime.js";
import { handleInbound } from "../lib/whatsapp/inbound.js";
import { pgSafe, IngestFailed } from "../lib/whatsapp/persist.js";
import { alertUnroutable } from "../lib/whatsapp/alerts.js";
import { PAUSE_MS } from "../lib/packages/core.js";
import { env } from "../lib/env.js";
import { logger, errField } from "../lib/log.js";

const L = logger();

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN) {
    return text(200, q.get("hub.challenge") || "");
  }
  return text(403, "verification failed");
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  // fail-closed: a missing secret is a config error, never a verification skip
  const secret = env.META_APP_SECRET;
  if (!secret) {
    L.error("wa_missing_app_secret");
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
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    /* ack anyway */
  }
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
            ? await handleWabaChange(db, wabaId, { field, value: v as unknown as Record<string, unknown> }, (tid) =>
                notificationsFor(db, tid),
              )
            : "unrouted";
          L.info("wa_waba_event", { field, waba_id: wabaId || null, outcome });
          continue;
        }
        const phoneNumberId = v.metadata?.phone_number_id;
        const isEnvDefault = !!phoneNumberId && phoneNumberId === (env.WHATSAPP_PHONE_ID || "");
        if (db && phoneNumberId) {
          const { channel: routed, lookupFailed } = await resolveChannelDetailed(db, "whatsapp", phoneNumberId);
          if (routed) {
            tenantId = routed.tenantId;
            routedChannel = routed;
          } else if (lookupFailed) {
            // The database did not answer. That is an infra blip, not a
            // decision: nothing is recorded and nothing is said, and the 503
            // below has the provider redeliver once the read works.
            routingFailed = true;
            L.error("wa_routing_lookup_failed", { phone_number_id: phoneNumberId });
          } else {
            // The database ANSWERED and this channel is not active — disabled,
            // deleted, or never ours. That is a deliberate state, so we neither
            // reply nor persist. A log line disappears; a metric built on
            // messages_in would undercount this traffic invisibly and forever.
            unroutable = true;
            L.error("wa_unroutable", { phone_number_id: phoneNumberId });
            await emitEvent(db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", "ingest", null, null, {
              channel: "whatsapp",
              phone_number_id: phoneNumberId,
            } as Json).catch(() => {});
          }
        }
        if (field === "messages" && v.messages && routingFailed) {
          // The database did not answer. Nothing can be recorded and nothing
          // can be said in anyone's voice, so this is NOT acknowledged: the
          // 503 below has Meta redeliver, and the ingest's is_new gate makes
          // that retry a no-op once one lands. The environment's own number is
          // no exception: it once rode a blip out on a baked copy of its
          // profile, and now waits for the read like every other workspace.
          unrecorded += v.messages.length;
          L.error("wa_skip_routing_failed", {
            phone_number_id: phoneNumberId,
            messages: v.messages.length,
          });
          await alertUnroutable("whatsapp_unreadable", phoneNumberId, v.messages.length);
        } else if (field === "messages" && v.messages && unroutable) {
          // Customers are texting a line whose channel is switched off. Nobody
          // is answering them and nothing is being recorded, so this has to
          // reach a human — throttled, because the alternative is one email per
          // inbound message for as long as the channel stays off.
          L.error("wa_skip_unroutable", {
            phone_number_id: phoneNumberId,
            messages: v.messages.length,
          });
          await alertUnroutable("whatsapp", phoneNumberId, v.messages.length);
        } else if (field === "messages" && v.messages) {
          for (const m of v.messages) {
            // A tail and a type, never the number or the words: the row under RLS
            // holds those, and a log is read by whoever reads logs.
            L.info("wa_inbound", { from_tail: phoneTail(m.from), type: m.type, id: m.id });
            // Per MESSAGE, not per batch. Any throw used to unwind to the one
            // outer catch below, which returns 200 — so a single failure meant
            // Meta never retried AND every remaining message in the batch was
            // never handled at all. The message itself is already persisted by
            // then, so it stays visible for reconciliation.
            try {
              await handleInbound(m, v, tenantId, routedChannel, isEnvDefault);
            } catch (e) {
              if (e instanceof IngestFailed) unrecorded += 1;
              L.error("wa_inbound_failed", { id: m.id, error: errField(e) });
            }
          }
        } else if (field === "messages" && v.statuses) {
          await Promise.all(
            (v.statuses ?? []).map(async (s) => {
              L.info("wa_status", { id: s.id, status: s.status, to_tail: phoneTail(s.recipient_id), errors: s.errors });
              if (db && tenantId && s.id && s.status && ["sent", "delivered", "read", "failed"].includes(s.status)) {
                await pgSafe("status", () =>
                  recordStatusByExternalId(
                    db,
                    tenantId!,
                    s.id!,
                    s.status as "sent" | "delivered" | "read" | "failed",
                    s.errors ? ({ errors: s.errors } as unknown as Json) : undefined,
                  ),
                );
              }
            }),
          );
        } else if (field === "smb_message_echoes") {
          // The owner (or staff) replied from the WhatsApp Business app -> pause the bot on that thread
          try {
            // The pause is the tenant's own setting, the one Settings shows as
            // "stays paused for N hours". This path had no runtime loaded and
            // paused for a hard-coded day whatever the owner had chosen. One
            // read per echo batch, never per echo.
            const echoRt = db && routedChannel ? await loadTenantRuntime(db, routedChannel) : null;
            const echoLimits = echoRt?.policy["reply"]?.limits ?? {};
            const echoPauseMs = echoLimits.pause_hours ? echoLimits.pause_hours * 3600 * 1000 : PAUSE_MS;
            for (const echo of v.message_echoes || []) {
              const to = echo.to;
              if (to) {
                // The Postgres row IS the pause: the conversation the echo
                // arrived on, in the tenant whose channel carried it, never a
                // global phone-number bucket.
                if (db && tenantId) {
                  await pgSafe("echo", () =>
                    recordEchoAndPause(db, {
                      tenantId,
                      customerPhoneDigits: to,
                      body: echo.text?.body ?? null,
                      externalId: echo.id ?? null,
                      pausedUntilIso: new Date(Date.now() + echoPauseMs).toISOString(),
                    }),
                  );
                }
                L.info("wa_paused_by_echo", { to_tail: phoneTail(to) });
              }
            }
          } catch (e) {
            L.error("echo_handling_error", { error: errField(e) });
          }
        } else if (field === "history") {
          L.info("wa_history_sync_batch");
        } else {
          L.info("wa_event", { field });
        }
      }
    }
  } catch (e) {
    L.error("wa_webhook_error", { error: errField(e) });
  }
  // A message the database did not accept is not acknowledged: Meta retries
  // any non-200 with decreasing frequency for up to seven days, and the
  // ingest's is_new gate makes the redelivery of the others a no-op.
  if (unrecorded > 0) return json(503, { ok: false, unrecorded });
  return json(200, { ok: true });
}
