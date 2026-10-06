/**
 * Chanlytics Messaging -- ElevenLabs' post-call webhook: a voice conversation with Ask is over (door D,
 * docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.6; docs/decisions/0026-a-provider-calls-the-dashboard.md).
 *
 * THIS FILE IS THE WIRE. The delivery is proved by its signature over the raw body (lib/voice/ask-voice.ts over the
 * port's verifyElevenLabsWebhook, the vendor's HMAC: 401 without it); only a `post_call_transcription` is read, and of
 * it the conversation's id, its minutes and each turn's timing. The session row the conversation names
 * (ask_voice_sessions, written by the dashboard's voice route as the member) is ended with its minutes, once however
 * often the vendor redelivers, and the turns' timings are one log line (ask_voice_session_ended: how long the brain
 * door took to its first byte and its first sentence, in ms, per turn), which is all this door keeps of what was said.
 * Then the vendor's record is erased, since the transcript names customers and the minutes are written; an erase that
 * failed is a log line, never a retry of the delivery. A conversation this database does not know (another agent's,
 * a row already swept) is 200 and a line, never a retry storm; a database that is down, or one that could not be
 * read or written, is 503, so the delivery comes back. A deployment without the webhook's secret has no such door: 404.
 *
 * The one webhook door the intake ledger leaves out (provider_events, decision 0031, 00335): its body is the
 * transcript, which names customers, and this door keeps nothing of what was said. A delivery it could not take is
 * its 503, which the vendor delivers again.
 */
import { json, refuse } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { logger, errField, door } from "../lib/log.js";
import {
  askVoiceWebhookConfigured,
  askVoiceWebhookSigned,
  endAskVoiceConversation,
  eraseAskVoiceConversation,
  type AskVoiceEnd,
} from "../lib/voice/ask-voice.js";

/** A whole conversation's transcript rides in the event; a long one is still well under this. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** The parts of the vendor's event this door reads (the sources note, §8); everything else is left unread. */
interface PostCallEvent {
  type?: string;
  data?: {
    conversation_id?: string;
    status?: string;
    transcript?: Array<{
      role?: string;
      conversation_turn_metrics?: { metrics?: Record<string, { elapsed_time?: number }> } | null;
    }>;
    metadata?: { call_duration_secs?: number; termination_reason?: string };
  };
}

/** The body as the vendor's event, or null for one that is not JSON or not an object. */
function parseEvent(raw: string): PostCallEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** One of the vendor's per-turn timings, in whole milliseconds, for every turn that carries it. */
function timings(turns: NonNullable<PostCallEvent["data"]>["transcript"], name: string): number[] {
  return (turns ?? [])
    .map((t) => t.conversation_turn_metrics?.metrics?.[name]?.elapsed_time)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map((v) => Math.round(v * 1000));
}

export const POST = door(async function POST(request: Request): Promise<Response> {
  if (!askVoiceWebhookConfigured()) return refuse(404, "no_provider_key");
  const L = logger({ door: "elevenlabs-webhook" });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return refuse(413, "too_large");
  if (!(await askVoiceWebhookSigned(request.headers, rawBody, Date.now()))) {
    L.warn("elevenlabs_webhook_bad_signature");
    return refuse(401, "bad_signature");
  }

  const event = parseEvent(rawBody);
  if (!event) {
    L.warn("elevenlabs_webhook_not_json");
    return refuse(400, "bad_request");
  }
  if (event.type !== "post_call_transcription") {
    L.info("elevenlabs_webhook_ignored", { type: typeof event.type === "string" ? event.type.slice(0, 60) : null });
    return json(200, { ok: true });
  }
  const conversationId = event.data?.conversation_id;
  if (typeof conversationId !== "string" || !conversationId) {
    L.warn("elevenlabs_webhook_not_json", { why: "no conversation_id" });
    return refuse(400, "bad_request");
  }

  const db = pg();
  if (!db) return refuse(503, "no_database");
  const durationS = Math.max(0, Math.round(Number(event.data?.metadata?.call_duration_secs) || 0));
  let ended: AskVoiceEnd;
  try {
    ended = await endAskVoiceConversation(db, conversationId, durationS, new Date().toISOString());
  } catch (e) {
    L.error("elevenlabs_webhook_unreadable", { conversation_id: conversationId, error: errField(e) });
    return refuse(503, "no_database");
  }
  if (ended.kind === "unknown") {
    L.info("elevenlabs_webhook_unknown", { conversation_id: conversationId });
    return json(200, { ok: true });
  }
  const T = logger({ door: "elevenlabs-webhook", tenant_id: ended.row.tenant_id });
  if (ended.kind === "repeated") {
    // The minutes were written at the first delivery; the erase is asked for again, in case it was the step that
    // failed then (a delete of what is gone already is the vendor's 404, a line and no more).
    T.info("elevenlabs_webhook_repeated", { conversation_id: conversationId });
    const again = await eraseAskVoiceConversation(conversationId);
    if (again && again.outcome !== "ok" && again.status !== 404) {
      T.warn("ask_voice_conversation_not_erased", {
        conversation_id: conversationId,
        outcome: again.outcome,
        status: again.status,
      });
    }
    return json(200, { ok: true });
  }

  const turns = event.data?.transcript ?? [];
  T.info("ask_voice_session_ended", {
    conversation_id: conversationId,
    duration_s: durationS,
    turns: turns.filter((t) => t.role === "agent").length,
    ttfb_ms: timings(turns, "convai_llm_service_ttfb"),
    ttf_sentence_ms: timings(turns, "convai_llm_service_ttf_sentence"),
    termination: event.data?.metadata?.termination_reason ?? null,
  });

  const erased = await eraseAskVoiceConversation(conversationId);
  if (erased && erased.outcome !== "ok") {
    T.warn("ask_voice_conversation_not_erased", {
      conversation_id: conversationId,
      outcome: erased.outcome,
      status: erased.status,
    });
  }
  return json(200, { ok: true });
});
