/** What a refusal from the edge means to Ask's speech door. */
import { AppError, MIN_MS, VOICE_IS_OFF } from "@chanlytics/contracts";
import { edgeReasonOf, edgeRefusalWords, type EdgeAnswer } from "@/server/shared/edge";

export const DOOR = "/api/admin/voice/speech";

/** The edge's call to the vendor, bounded under the route's own minute: the whole clip streams inside half of it. */
export const SPEECH_TIMEOUT_MS = MIN_MS / 2;

/** The edge's no, in the words the Line already knows: the gateway's refusals, answered the same way. */
export function refusalOf(edgeAnswer: EdgeAnswer): AppError {
  if (edgeAnswer.status === 402) {
    return new AppError("payment_required", edgeRefusalWords(edgeAnswer.body) ?? VOICE_IS_OFF, 402);
  }
  const reason = edgeReasonOf(edgeAnswer);
  return new AppError(
    "upstream_voice",
    reason === "no_provider_key"
      ? "Voice is not set up yet."
      : "Ask's voice could not be reached just now. Try again in a moment.",
    503,
    { reason },
  );
}
