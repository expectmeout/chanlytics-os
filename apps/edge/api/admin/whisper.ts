/**
 * Whisper to the phone receptionist mid-call.
 *
 * A sentence injected into the agent's context that only the agent hears and
 * works into its next answer (Retell update-live-call). Beside it the API
 * offers an end (stop-call.ts) and, through the same update, the hand-over
 * (hand-over.ts); listening to the audio and a person joining from a
 * microphone are the provider's own dashboard's, not the API's.
 *
 * Internal endpoint -- the per-call token, called by the dashboard's whisper
 * route AFTER RLS has proved the call belongs to the operator's workspace and
 * the role door has been checked there. The token names that workspace, and
 * the call must be its (lib/voice/live-call-door.ts). The provider key lives
 * here, so this is where the provider is spoken to. Body: { call_id, text,
 * trigger }.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { readBody } from "../../lib/admin-door.js";
import { refusedCall } from "../../lib/voice/live-call-door.js";
import { updateLiveCall } from "../../lib/packages/channels.js";
import { frameWhisper } from "../../lib/packages/contracts.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/log.js";

const L = logger();

/** One answer's worth. A whisper is worked into the next thing said. */
const MAX_CHARS = 500;

const AUD = "/api/admin/whisper";

export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  if (!env.RETELL_API_KEY) return refuse(503, "no_provider_key");

  const body = await readBody<{ call_id?: string; text?: string; trigger?: boolean }>(request);
  const callId = String(body.call_id || "");
  const text = String(body.text || "").trim();
  if (!/^call_[A-Za-z0-9]{8,}$/.test(callId) || !text || text.length > MAX_CHARS) {
    return refuse(400, "bad_request", "call_id + text (1-500 chars) required");
  }
  const notYours = await refusedCall(auth, AUD, callId);
  if (notYours) return notYours;

  const r = await updateLiveCall(
    { apiKey: env.RETELL_API_KEY },
    callId,
    // Framed as the owner's instruction, not loose context — see contracts/whisper.ts.
    { additionalContext: frameWhisper(text), triggerResponse: body.trigger === true },
  );
  // The words are the operator's and stay out of the log; the length and the
  // outcome are what a search needs.
  L.info("admin_whisper", { call_id: callId, chars: text.length, ok: r.ok, status: r.status });
  if (!r.ok) return json(502, { ok: false, error: "provider_refused", status: r.status });
  return json(200, { ok: true });
}
