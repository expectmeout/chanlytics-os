/**
 * ElevenLabs Scribe, the wire (decision 0099, stage B, D8: one of the words' three shapes; its speech-to-text reference read
 * 7 Nov 2026): a video's sound sent whole, and what is said answered word by word with its time, its speaker and the sounds
 * that are not speech. `VIDEO_WORDS_MODEL=scribe` picks it; the one-call ear is the default.
 *
 * The bytes go with the request (the `file` part), the sound the digest already keeps, so no address of ours is handed out.
 * The answer comes in the same request; a long clip that outruns its bound is the digest step's to ask again. The account's
 * key is the one Ask's voice already uses. Nothing here knows a row or a workspace.
 */
import { answerObject, providerFetch } from "../shared/provider-fetch";
import type { ModelDeps } from "../ai/anthropic";

const SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";

export type ScribeAnswer =
  { ok: true; answer: Record<string, unknown> } | { ok: false; error: string; retryable: boolean };

/** What is said in a sound, by Scribe: the words with their times and speakers, and the sounds it tags. */
export async function transcribeWithScribe(
  key: string,
  request: { model: string; audio: { bytes: Uint8Array; mime: string; name: string }; timeoutMs: number },
  deps: ModelDeps = {},
): Promise<ScribeAnswer> {
  const form = new FormData();
  form.append("model_id", request.model);
  form.append("file", new Blob([request.audio.bytes.slice()], { type: request.audio.mime }), request.audio.name);
  form.append("diarize", "true");
  form.append("tag_audio_events", "true");
  form.append("timestamps_granularity", "word");
  const reply = await providerFetch(
    "elevenlabs",
    SCRIBE_URL,
    { method: "POST", headers: { "xi-api-key": key }, body: form, timeoutMs: request.timeoutMs },
    deps,
  );
  const body = answerObject(reply);
  if (reply.outcome !== "ok" || !body) {
    const detail =
      body && typeof body.detail === "object" && body.detail ? (body.detail as Record<string, unknown>) : null;
    const detailText = typeof detail?.message === "string" ? `: ${detail.message.slice(0, 200)}` : "";
    return {
      ok: false,
      error: reply.error ?? `status ${reply.status}${detailText}`,
      retryable: reply.outcome === "retryable" || reply.outcome === "unknown",
    };
  }
  return { ok: true, answer: body };
}
