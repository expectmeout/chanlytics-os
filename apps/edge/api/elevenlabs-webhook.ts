import { json, refuse } from "../lib/shared/http.js";
import { pg } from "../lib/shared/pg.js";
import { logger, errField, door } from "../lib/shared/log.js";
import {
  askVoiceWebhookConfigured,
  askVoiceWebhookSigned,
  endAskVoiceConversation,
  eraseAskVoiceConversation,
  type AskVoiceEnd,
} from "../lib/voice/ask-voice.js";
import { MAX_BODY_BYTES, parseEvent, timings } from "../lib/voice/post-call-event.js";

export const POST = door(async function POST(request: Request): Promise<Response> {
  if (!askVoiceWebhookConfigured()) return refuse(404, "no_provider_key");
  const log = logger({ door: "elevenlabs-webhook" });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return refuse(413, "too_large");
  if (!(await askVoiceWebhookSigned(request.headers, rawBody, Date.now()))) {
    log.warn("elevenlabs_webhook_bad_signature");
    return refuse(401, "bad_signature");
  }

  const event = parseEvent(rawBody);
  if (!event) {
    log.warn("elevenlabs_webhook_not_json");
    return refuse(400, "bad_request");
  }
  if (event.type !== "post_call_transcription") {
    log.info("elevenlabs_webhook_ignored", { type: typeof event.type === "string" ? event.type.slice(0, 60) : null });
    return json(200, { ok: true });
  }
  const conversationId = event.data?.conversation_id;
  if (typeof conversationId !== "string" || !conversationId) {
    log.warn("elevenlabs_webhook_not_json", { why: "no conversation_id" });
    return refuse(400, "bad_request");
  }

  const db = pg();
  if (!db) return refuse(503, "no_database");
  const durationS = Math.max(0, Math.round(Number(event.data?.metadata?.call_duration_secs) || 0));
  let ended: AskVoiceEnd;
  try {
    ended = await endAskVoiceConversation(db, conversationId, durationS, new Date().toISOString());
  } catch (e) {
    log.error("elevenlabs_webhook_unreadable", { conversation_id: conversationId, error: errField(e) });
    return refuse(503, "no_database");
  }
  if (ended.kind === "unknown") {
    log.info("elevenlabs_webhook_unknown", { conversation_id: conversationId });
    return json(200, { ok: true });
  }
  const otherLog = logger({ door: "elevenlabs-webhook", tenant_id: ended.row.tenant_id });
  if (ended.kind === "repeated") {
    // The minutes were written at the first delivery; the erase is asked for again, in case it was the step that
    // failed then (a delete of what is gone already is the vendor's 404, a line and no more).
    otherLog.info("elevenlabs_webhook_repeated", { conversation_id: conversationId });
    const again = await eraseAskVoiceConversation(conversationId);
    if (again && again.outcome !== "ok" && again.status !== 404) {
      otherLog.warn("ask_voice_conversation_not_erased", {
        conversation_id: conversationId,
        outcome: again.outcome,
        status: again.status,
      });
    }
    return json(200, { ok: true });
  }

  const turns = event.data?.transcript ?? [];
  otherLog.info("ask_voice_session_ended", {
    conversation_id: conversationId,
    duration_s: durationS,
    turns: turns.filter((t) => t.role === "agent").length,
    ttfb_ms: timings(turns, "convai_llm_service_ttfb"),
    ttf_sentence_ms: timings(turns, "convai_llm_service_ttf_sentence"),
    termination: event.data?.metadata?.termination_reason ?? null,
  });

  const erased = await eraseAskVoiceConversation(conversationId);
  if (erased && erased.outcome !== "ok") {
    otherLog.warn("ask_voice_conversation_not_erased", {
      conversation_id: conversationId,
      outcome: erased.outcome,
      status: erased.status,
    });
  }
  return json(200, { ok: true });
});
