/**
 * Chanlytics Messaging — WhatsApp Cloud API webhook (app: Chanlytics AI).
 * GET = Meta verification handshake. POST = signature-validated event receiver.
 *
 * The door is api/whatsapp.ts: `door(receiveWhatsappEvent)`, which names the request the platform's way (log.ts).
 * Everything a delivery does is here, in the order the door had it: the signature is checked against the app secret
 * (fail-closed), each change routed by its phone number id or its WABA, and the message path run process-then-200.
 *
 * Production engine: inbound message -> guardrailed Claude brain -> reply,
 * with history, human-pause (coexistence echoes), rate caps, staleness guard,
 * and escalation alerts via Resend.
 *
 * Shape: this file is the webhook — verification, the signature, routing by
 * phone number id, and echoes; the statuses are lib/whatsapp/receipts.ts. The
 * message path is lib/whatsapp/inbound.ts, the edge's adapter onto the
 * receptionist verb in packages/core/src/inbound; its Postgres bookkeeping
 * lib/whatsapp/persist.ts; the people it tells lib/whatsapp/alerts.ts; its
 * pure decisions packages/core/src/inbound/steps.ts.
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
import { phoneTail, pauseMsOf } from "../packages/contracts.js";
import { WABA_FIELDS, accountOf, handleWabaChange, notificationsFor } from "./waba-events.js";
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { digestId, keepDelivery, signatureHeaders } from "../intake/keep.js";
import type { WaChangeValue } from "../packages/channels.js";
import { resolveChannelDetailed, recordEchoAndPause, emitEvent, type RoutedChannel } from "../packages/db.js";
import { loadTenantRuntime } from "../tenant-runtime.js";
import { handleInbound } from "./inbound.js";
import { recordReceipts } from "./receipts.js";
import { pgSafe, IngestFailed } from "./persist.js";
import { alertUnroutable } from "./alerts.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";

const L = logger();

/** Meta's signature over the raw body, with the app's secret. Fail-closed: a missing secret is a config error, never a verification skip. */
function signedByMeta(request: Request, raw: string): boolean {
  const secret = env.META_APP_SECRET;
  if (!secret) {
    L.error("wa_missing_app_secret");
    return false;
  }
  const sig = String(request.headers.get("x-hub-signature-256") || "");
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Kept as it came, before the verdict (decision 0032, 00336). Meta names no delivery, and a batch may span
 * workspaces: the key is the body's digest, and the workspace is none.
 */
async function keepMetaDelivery(request: Request, raw: string): Promise<void> {
  const ledger = pg();
  if (!ledger) return;
  await keepDelivery(ledger, {
    provider: "meta",
    id: digestId(raw),
    door: "/api/whatsapp",
    url: request.url,
    tenantId: null,
    headers: signatureHeaders(request, ["x-hub-signature-256"]),
    body: raw,
  });
}

export async function receiveWhatsappEvent(request: Request): Promise<Response> {
  const raw = await request.text();
  if (!signedByMeta(request, raw)) return refuse(401, "bad_signature");
  await keepMetaDelivery(request, raw);

  interface WebhookBody {
    entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: WaChangeValue }> }>;
  }
  let body: WebhookBody = {};
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    /* ack anyway */
  }
  // Messages (and failure receipts, whose thread could not be flagged) the database did not accept in this batch: the
  // one thing this handler must not acknowledge.
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
          // What the notice was addressed to; which account it is about is the function's to say (a partner's notice is
          // addressed to the partner's portfolio and names the account itself).
          const entryId = String(entry.id || "");
          const value = v as unknown as Record<string, unknown>;
          const outcome = await handleWabaChange(db, entryId, { field, value }, (tid) => notificationsFor(db, tid));
          L.info("wa_waba_event", { field, waba_id: accountOf(entryId, value)?.waba ?? null, outcome });
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
            await emitEvent(db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", null, null, {
              channel: "whatsapp",
              phone_number_id: phoneNumberId,
            }).catch(() => {});
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
          unrecorded += await recordReceipts(db, tenantId, v.statuses);
        } else if (field === "smb_message_echoes") {
          // The owner (or staff) replied from the WhatsApp Business app -> pause the bot on that thread
          try {
            // The pause is the tenant's own setting, the one Settings shows as
            // "stays paused for N hours". This path had no runtime loaded and
            // paused for a hard-coded day whatever the owner had chosen. One
            // read per echo batch, never per echo.
            const echoRt = db && routedChannel ? await loadTenantRuntime(db, routedChannel) : null;
            const echoPauseMs = pauseMsOf(echoRt?.policy["reply"]?.limits);
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
