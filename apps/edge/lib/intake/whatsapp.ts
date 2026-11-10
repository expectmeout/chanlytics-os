/**
 * Chanlytics Messaging — WhatsApp Cloud API webhook (app: Chanlytics AI).
 * GET = Meta verification handshake. POST = signature-validated event receiver.
 *
 * The door is api/whatsapp.ts: `door(receiveWhatsappEvent)`, which names the request the platform's way (log.ts).
 * Everything a delivery does is here, in the order the door had it: the signature is checked against the app secret
 * (fail-closed), each change routed by its phone number id or its WABA, and each message recorded and its answer
 * scheduled as a job (./answer-later.ts) before Meta is answered.
 *
 * Production engine: inbound message -> guardrailed Claude brain -> reply,
 * with history, human-pause (coexistence echoes), rate caps, staleness guard,
 * and every hold told to the owner from its event (decision 0043). Each change of
 * a delivery is done on its own (handleChange): a change that throws costs only
 * what it carried, which Meta is asked to send again.
 *
 * Shape: this file is the webhook — verification, the signature, routing by
 * phone number id, and echoes; the statuses are lib/whatsapp/receipts.ts. What
 * a kept WhatsApp Business app shares (its contacts, its chats' history:
 * decision 0073, R21) is handed on by the kept delivery's key, and brought in
 * parts by lib/imports/whatsapp-history.ts. The
 * message path is lib/inbound/arrival.ts, the edge's adapter onto the
 * receptionist verb in packages/core/src/inbound; its Postgres bookkeeping
 * lib/inbound/persist.ts; the people it tells lib/inbound/alerts.ts; its
 * pure decisions packages/core/src/inbound/steps.ts.
 *
 * Contract: a message is recorded and its answer scheduled, then Meta is told
 * 200 (decision 0031, Phase 3: every message since 3 Nov 2026, as a text has
 * been since 00347); the model's turn runs in the message's job, never inside
 * Meta's request. Meta retries anything else, and the replay gate makes a
 * redelivery safe.
 *
 * THE MEMORY IS POSTGRES, and there is no other. History, the pause and the
 * rate cap are the same rows the dashboard reads and writes, and the dedupe
 * is ingest_inbound's atomic is_new claim — a unique index two concurrent
 * lambdas cannot both miss. A read that cannot be made has nowhere to fall
 * back to, so the thread is handed to a human (state_unavailable) rather than
 * answered from an invented empty history. With no database a message cannot be
 * recorded, so it is not acknowledged either: Meta sends it again.
 * wa_replied logs carry ingest_ms/post_ms (blueprint latency budget).
 *
 * Env: WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, ANTHROPIC_API_KEY,
 *      RESEND_API_KEY + LEAD_TO/LEAD_FROM,
 *      SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { heldTenantId } from "@chanlytics/contracts";
import { metaSignatureValid, META_SIGNATURE_HEADER, type WaChangeValue } from "@chanlytics/channels/whatsapp";
import { phoneTail, pauseMsOf, WAITING_REASONS, recordOrEmpty } from "@chanlytics/contracts";
import { WABA_FIELDS, accountOf, handleWabaChange, findNotifications } from "../whatsapp/waba-events.js";
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { digestId, keepDelivery, signatureHeaders } from "../shared/keep-event.js";
import { resolveChannelDetailed, recordEchoAndPause, type RoutedChannel } from "@chanlytics/db/channels";
import { emitEvent } from "@chanlytics/db/events";
import { loadTenantRuntime } from "../shared/tenant-runtime.js";
import { recordWhatsapp } from "./answer-later.js";
import { planWhatsappChange, type WaChangePlan, type WaRouting } from "../whatsapp/delivery-plan.js";
import { handDeliveryOn } from "../imports/history-import.js";
import { recordReceipts } from "../whatsapp/receipts.js";
import { runPgSafe, IngestFailed } from "../inbound/persist.js";
import { alertUnroutable } from "../inbound/alerts.js";
import { env } from "../shared/env.js";
import { logger, errField } from "../shared/log.js";
import type { TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";

const L = logger();

/**
 * Meta's signature over the raw body, with the app's secret (channels metaSignatureValid, the one check both Meta
 * webhooks ask), or the one being retired while a rotation is under way (META_APP_SECRET_PREVIOUS). Fail-closed: a
 * missing secret is a config error, never a verification skip, and the old secret alone opens nothing.
 */
function signedByMeta(request: Request, raw: string): boolean {
  const secret = env.META_APP_SECRET;
  if (!secret) {
    L.error("wa_missing_app_secret");
    return false;
  }
  const previous = env.META_APP_SECRET_PREVIOUS;
  return metaSignatureValid(raw, request.headers.get(META_SIGNATURE_HEADER), previous ? [secret, previous] : [secret]);
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
  at: { tenantId: TenantId | null; unroutable: boolean; routingFailed: boolean; phoneNumberId: string | undefined },
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
      const landed = await runPgSafe("echo", () =>
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

/** One change of a delivery, as Meta sends it: what it is about (`field`) and what it carries. */
type Change = { field?: string; value?: WaChangeValue };

/**
 * One change of a delivery, done: routed by its number or its WABA, and its messages, receipts, echoes or history taken
 * in. How many of what it carried the database did not keep, which the door must not acknowledge (0 when all were).
 */
async function handleChange(
  entry: { id?: string },
  change: Change,
  delivery: { key: string; kept: boolean },
): Promise<number> {
  const changeValue = change.value || {};
  const field = change.field;
  const db = pg();
  // The account's own news (quality, limits, templates, reviews) is keyed
  // on the WABA, not on a number: routed by waba_id, kept as an event,
  // and alerted through the same path a failed send uses.
  if (db && field && WABA_FIELDS.has(field)) {
    // What the notice was addressed to; which account it is about is the function's to say (a partner's notice is
    // addressed to the partner's portfolio and names the account itself).
    const entryId = String(entry.id || "");
    const value = recordOrEmpty(changeValue);
    const outcome = await handleWabaChange(db, entryId, { field, value }, (tid) => findNotifications(db, tid));
    L.info("wa_waba_event", { field, waba_id: accountOf(entryId, value)?.waba ?? null, outcome });
    return 0;
  }
  const phoneNumberId = changeValue.metadata?.phone_number_id;
  const { routing, routed } = await routeByNumber(db, phoneNumberId);
  // What to do with it is the plan's (./delivery-plan.ts, run every way in its own test): taken in, owed, or said and
  // let go. Nothing the database could not keep is acknowledged.
  const echoes = field === "smb_message_echoes" ? (changeValue.message_echoes ?? []) : [];
  const plan = planWhatsappChange(
    field,
    { messages: changeValue.messages?.length ?? 0, statuses: changeValue.statuses?.length ?? 0, echoes: echoes.length },
    routing,
    HISTORY_FIELDS.has(String(field)),
  );
  await sayWhatWasLetGo(plan, field, changeValue, phoneNumberId);
  const tenantId = routed?.tenantId ?? null;
  if (plan.take === "messages" && db && routed) return plan.owed + (await takeMessages(db, routed, changeValue));
  if (plan.take === "echoes") return plan.owed + (await recordEchoes(db, routed, echoes));
  if (plan.take === "receipts") return plan.owed + (await recordReceipts(db, tenantId, changeValue.statuses ?? []));
  if (plan.take === "history")
    return (
      plan.owed +
      (await handHistory(db, field, delivery, {
        tenantId,
        unroutable: routing === "unroutable" && !!phoneNumberId,
        routingFailed: routing === "lookup_failed",
        phoneNumberId,
      }))
    );
  return plan.owed;
}

/**
 * Whose number a change was written to (Blueprint §3: phone_number_id -> workspace), as the plan reads it: routed, the
 * read failed (a blip, not a decision: nothing is kept and nothing said, and the door's 503 has Meta send it again),
 * unroutable (the database answered and the channel is not active: disabled, deleted or never ours, which is said and
 * kept as an event, since a log line disappears and a metric built on messages_in would undercount it for ever; or the
 * change names no number), or no database at all.
 */
async function routeByNumber(
  db: ReturnType<typeof pg>,
  phoneNumberId: string | undefined,
): Promise<{ routing: WaRouting; routed: RoutedChannel | null }> {
  if (!db) return { routing: "no_database", routed: null };
  if (!phoneNumberId) return { routing: "unroutable", routed: null };
  const { channel: routed, lookupFailed } = await resolveChannelDetailed(db, "whatsapp", phoneNumberId);
  if (routed) return { routing: "routed", routed };
  if (lookupFailed) {
    L.error("wa_routing_lookup_failed", { phone_number_id: phoneNumberId });
    return { routing: "lookup_failed", routed: null };
  }
  L.error("wa_unroutable", { phone_number_id: phoneNumberId });
  await emitEvent(db, heldTenantId("00000000-0000-0000-0000-000000000000"), "ingest.unroutable", null, null, {
    channel: "whatsapp",
    phone_number_id: phoneNumberId,
  }).catch(logAndGoOn("event ingest.unroutable"));
  return { routing: "unroutable", routed: null };
}

/**
 * What the plan let go, said by name with what the change carried (messages, an owner's echoes, or receipts), and the
 * customers nobody is answering told to the platform, once a window: the routing read failed, or the number is nobody's.
 */
async function sayWhatWasLetGo(
  plan: WaChangePlan,
  field: string | undefined,
  changeValue: WaChangeValue,
  phoneNumberId: string | undefined,
): Promise<void> {
  const echoes = field === "smb_message_echoes" ? (changeValue.message_echoes?.length ?? 0) : 0;
  const carried =
    field === "messages" && changeValue.messages?.length
      ? { messages: changeValue.messages.length }
      : echoes
        ? { echoes }
        : { receipts: changeValue.statuses?.length ?? 0 };
  if (plan.log === "wa_skip_routing_failed")
    L.error("wa_skip_routing_failed", { phone_number_id: phoneNumberId ?? null, ...carried });
  else if (plan.log === "wa_skip_unroutable")
    L.error("wa_skip_unroutable", { phone_number_id: phoneNumberId ?? null, ...carried });
  else if (plan.log === "wa_event") L.info("wa_event", { field });
  if (plan.alert) await alertUnroutable(plan.alert, phoneNumberId, changeValue.messages?.length ?? 0);
}

/**
 * A routed change's messages, each recorded and its answer scheduled as its job (./answer-later.ts recordWhatsapp). How
 * many the database did not keep, which the door must not acknowledge.
 */
async function takeMessages(
  db: NonNullable<ReturnType<typeof pg>>,
  routed: RoutedChannel,
  changeValue: WaChangeValue,
): Promise<number> {
  const messages = changeValue.messages ?? [];
  let owed = 0;
  for (const message of messages) {
    // A tail and a type, never the number or the words: the row under RLS holds those, and a log is read by whoever
    // reads logs.
    L.info("wa_inbound", { from_tail: phoneTail(message.from), type: message.type, id: message.id });
    // Per MESSAGE, not per batch: one that throws costs only itself. Only a message the database did not keep is owed;
    // anything later already happened after the words were recorded, and stays visible for reconciliation.
    try {
      await recordWhatsapp(db, message, changeValue, routed);
    } catch (e) {
      if (e instanceof IngestFailed) owed += 1;
      L.error("wa_inbound_failed", { id: message.id, error: errField(e) });
    }
  }
  return owed;
}

/**
 * What a change carried that a failure inside it leaves unkept, so the door asks for it again: its messages, receipts or
 * echoes, each safe to receive twice (the replay gate, the monotone receipt, one echo one row), and a history chunk,
 * which is the same run when it comes again. The account's own news is acknowledged: kept as an event, a second copy
 * would be a second event.
 */
function owedBy(change: Change): number {
  const changeValue = change.value ?? {};
  if (change.field === "messages") return (changeValue.messages?.length ?? 0) + (changeValue.statuses?.length ?? 0);
  if (change.field === "smb_message_echoes") return changeValue.message_echoes?.length ?? 0;
  return HISTORY_FIELDS.has(String(change.field)) ? 1 : 0;
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
        // Each change on its own: a throw in one used to unwind to the catch below, which acknowledged every change after
        // it unread, the way a throw in one message once cost the rest of its batch (handleChange's per-message try).
        try {
          unrecorded += await handleChange(entry, change, delivery);
        } catch (e) {
          const owed = owedBy(change);
          unrecorded += owed;
          L.error("wa_webhook_error", { field: change.field ?? null, owed, error: errField(e) });
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
