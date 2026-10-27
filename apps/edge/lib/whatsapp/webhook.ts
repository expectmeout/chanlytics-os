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
 * phone number id, and echoes; the statuses are lib/whatsapp/receipts.ts. What
 * a kept WhatsApp Business app shares (its contacts, its chats' history:
 * decision 0073, R21) is handed on by the kept delivery's key, and brought in
 * parts by lib/imports/whatsapp-history.ts. The
 * message path is lib/whatsapp/inbound.ts, the edge's adapter onto the
 * receptionist verb in packages/core/src/inbound; its Postgres bookkeeping
 * lib/whatsapp/persist.ts; the people it tells lib/whatsapp/alerts.ts; its
 * pure decisions packages/core/src/inbound/steps.ts.
 *
 * Contract (frozen during Meta App Review): process-then-200 in-invocation
 * under maxDuration 60; Meta retries + dedupe make replays safe. A workspace
 * the edge names in WHATSAPP_ANSWERS_AS_JOBS takes the other road instead
 * (record, schedule the answer, 200: lib/whatsapp/answer-later.ts); unset,
 * which is the default, nothing here changes.
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
import { metaSignatureValid, META_SIGNATURE_HEADER, type WaChangeValue } from "../packages/channels.js";
import { phoneTail, pauseMsOf, WAITING_REASONS } from "../packages/contracts.js";
import { WABA_FIELDS, accountOf, handleWabaChange, notificationsFor } from "./waba-events.js";
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { digestId, keepDelivery, signatureHeaders } from "../intake/keep.js";
import { resolveChannelDetailed, recordEchoAndPause, emitEvent, type RoutedChannel } from "../packages/db.js";
import { loadTenantRuntime } from "../tenant-runtime.js";
import { answerHereOrLater } from "./answer-later.js";
import { handDeliveryOn } from "../imports/history-import.js";
import { recordReceipts } from "./receipts.js";
import { pgSafe, IngestFailed } from "./persist.js";
import { alertUnroutable } from "./alerts.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";

const L = logger();

/**
 * Meta's signature over the raw body, with the app's secret (channels metaSignatureValid, the one check both Meta
 * webhooks ask). Fail-closed: a missing secret is a config error, never a verification skip.
 */
function signedByMeta(request: Request, raw: string): boolean {
  const secret = env.META_APP_SECRET;
  if (!secret) {
    L.error("wa_missing_app_secret");
    return false;
  }
  return metaSignatureValid(raw, request.headers.get(META_SIGNATURE_HEADER), [secret]);
}

/**
 * Kept as it came, before the verdict (decision 0032, 00336). Meta names no delivery, and a batch may span
 * workspaces: the key is the body's digest, and the workspace is none. Says the key and whether the copy was taken:
 * the kept app's history is brought from that copy, so one not taken is not acknowledged.
 */
async function keepMetaDelivery(request: Request, raw: string): Promise<{ key: string; kept: boolean }> {
  const key = digestId(raw);
  const ledger = pg();
  if (!ledger) return { key, kept: false };
  const kept = await keepDelivery(ledger, {
    provider: "meta",
    id: key,
    door: "/api/whatsapp",
    url: request.url,
    tenantId: null,
    headers: signatureHeaders(request, ["x-hub-signature-256"]),
    body: raw,
  });
  return { key, kept };
}

/** What a kept WhatsApp Business app shares as its number connects (decision 0073, R21): its contacts, and its chats. */
const HISTORY_FIELDS: ReadonlySet<string> = new Set(["history", "smb_app_state_sync"]);

/**
 * What a kept WhatsApp Business app shares (decision 0073, R21): its contacts (`smb_app_state_sync`) or a chunk of its
 * chats (`history`), handed to the history job by the kept delivery's key, which brings it in parts. How many the door
 * must not acknowledge (0 or 1): one whose number could not be routed, whose copy was not taken, or whose part could not
 * be scheduled, is Meta's to send again, and the same bytes are the same run (handDeliveryOn), so a redelivery schedules
 * nothing twice. A number no workspace holds has nothing to bring. The database's to keep, as a message is.
 */
async function handHistory(
  db: ReturnType<typeof pg>,
  named: string | undefined,
  delivery: { key: string; kept: boolean },
  at: { tenantId: string | null; unroutable: boolean; routingFailed: boolean; phoneNumberId: string | undefined },
): Promise<number> {
  const field = String(named);
  if (at.routingFailed) {
    L.error("wa_skip_routing_failed", { phone_number_id: at.phoneNumberId, [field]: 1 });
    return 1;
  }
  const tenantId = at.unroutable ? null : at.tenantId;
  if (!db || !tenantId) {
    L.info("wa_history_unroutable", { field });
    return 0;
  }
  const log = logger({ tenant_id: tenantId });
  if (!delivery.kept) {
    log.error("wa_history_not_kept", { field });
    return 1;
  }
  try {
    const source = field === "history" ? "whatsapp_history" : "whatsapp_contacts";
    await handDeliveryOn(db, { tenantId, source, deliveryKey: delivery.key });
    log.info("wa_history_handed", { field });
    return 0;
  } catch (e) {
    log.error("wa_history_not_handed", { field, error: errField(e) });
    return 1;
  }
}

type Echo = NonNullable<WaChangeValue["message_echoes"]>[number];

/**
 * The owner (or staff) replied from the WhatsApp Business app: each echo is kept as a person's words and pauses the
 * receptionist on its thread, for the workspace's own hours. How many the database did not keep, which must come again
 * (0 when every one was kept): an echo that is not on the record is a thread the receptionist goes on answering over
 * the owner, so the door does not acknowledge it, and Meta's redelivery is safe (recordEchoAndPause: one wamid is one
 * row, and an echo already kept pauses nothing twice). A number no workspace holds, or no database, keeps nothing and
 * owes nothing: no redelivery could change that.
 */
async function recordEchoes(db: ReturnType<typeof pg>, routed: RoutedChannel | null, echoes: Echo[]): Promise<number> {
  if (!db || !routed) return 0;
  const tenantId = routed.tenantId;
  const owed = echoes.filter((e) => !!e.to);
  let kept = 0;
  try {
    // The pause is the tenant's own setting, the one Settings shows as
    // "stays paused for N hours". This path had no runtime loaded and
    // paused for a hard-coded day whatever the owner had chosen. One
    // read per echo batch, never per echo.
    const echoRt = await loadTenantRuntime(db, routed);
    const echoPauseMs = pauseMsOf(echoRt.policy["reply"]?.limits);
    for (const echo of owed) {
      const to = echo.to ?? "";
      // The Postgres row IS the pause: the conversation the echo
      // arrived on, in the tenant whose channel carried it, never a
      // global phone-number bucket.
      const landed = await pgSafe("echo", () =>
        recordEchoAndPause(db, {
          tenantId,
          customerPhoneDigits: to,
          body: echo.text?.body ?? null,
          externalId: echo.id ?? null,
          pausedUntilIso: new Date(Date.now() + echoPauseMs).toISOString(),
          // A reply typed in the Business app settles the holds it answers, as a dashboard reply does (00438, S7-5).
          settles: WAITING_REASONS,
        }),
      );
      // A write that threw has said so (pg_echo_failed), and one the database refused in its own words (record_echo_*).
      if (landed !== true) continue;
      kept += 1;
      L.info("wa_paused_by_echo", { to_tail: phoneTail(to) });
    }
  } catch (e) {
    L.error("echo_handling_error", { error: errField(e) });
  }
  return owed.length - kept;
}

export async function receiveWhatsappEvent(request: Request): Promise<Response> {
  const raw = await request.text();
  if (!signedByMeta(request, raw)) return refuse(401, "bad_signature");
  const delivery = await keepMetaDelivery(request, raw);

  interface WebhookBody {
    entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: WaChangeValue }> }>;
  }
  let body: WebhookBody = {};
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    /* ack anyway */
  }
  // Messages, failure receipts whose thread could not be flagged, owners' echoes the database did not keep, and any of
  // the three whose number could not be routed, in this batch: the one thing this handler must not acknowledge.
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
              await answerHereOrLater(m, v, tenantId, routedChannel, isEnvDefault);
            } catch (e) {
              if (e instanceof IngestFailed) unrecorded += 1;
              L.error("wa_inbound_failed", { id: m.id, error: errField(e) });
            }
          }
        } else if ((field === "messages" && v.statuses) || field === "smb_message_echoes") {
          // A receipt and an owner's echo are the database's to keep, as a message is, so one whose number could not
          // be routed is not acknowledged either: the 503 below has Meta send it again, and each is safe to receive
          // twice (receipts.ts; recordEchoAndPause). Acknowledged, a failed receipt went unflagged and an echo unkept,
          // so the receptionist went on answering over the owner, and Meta never sent either again.
          const echoes = field === "smb_message_echoes" ? (v.message_echoes ?? []) : null;
          if (routingFailed) {
            const n = echoes ? echoes.length : (v.statuses?.length ?? 0);
            unrecorded += n;
            L.error("wa_skip_routing_failed", { phone_number_id: phoneNumberId, [echoes ? "echoes" : "receipts"]: n });
          } else if (echoes) unrecorded += await recordEchoes(db, routedChannel, echoes);
          else unrecorded += await recordReceipts(db, tenantId, v.statuses ?? []);
        } else if (HISTORY_FIELDS.has(String(field))) {
          unrecorded += await handHistory(db, field, delivery, { tenantId, unroutable, routingFailed, phoneNumberId });
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
