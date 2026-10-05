/**
 * What the dashboard's Live page may do to a call in progress, at the provider: end it, whisper a sentence into it, or
 * hand it to the business's own line. api/admin/{stop-call,whisper,hand-over}.ts knock (the per-call token, the body,
 * the audience each names); each verb here is everything its door does after that.
 *
 * Each is one call to the provider's API, and the Live page offers exactly what that API does: the provider's own
 * dashboard can also listen to a call's audio and put a person on the line from a browser microphone, and its API
 * offers neither. The provider key lives on the edge and nowhere else, so a verb refuses (503, no_provider_key) before
 * it reads anything else; the dashboard's routes proved the call is the member's under RLS and checked the role before
 * they knocked, and the verb proves it again with the service role (refusedCall, live-call-door.ts: the token names the
 * workspace, and the call must be its). The words and the numbers an operator sends stay out of the log; the outcome
 * and the length are what a search needs.
 */
import { json, refuse } from "../http.js";
import { refusedCall } from "./live-call-door.js";
import { stopCall, updateLiveCall } from "../packages/channels.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import { frameWhisper, frameHandOver, isE164 } from "../packages/contracts.js";
import type { Admitted } from "../admin-auth.js";

/**
 * End a live call from the dashboard.
 *
 * POST /v2/stop-call at the provider: the one way a hosted agent's call is
 * ended from outside it. The provider's own dashboard can also end a call,
 * and can listen to its audio and put a person on the line from a browser
 * microphone; neither of those two is offered by its API, which is why the
 * Live page offers what is -- a sentence into the call, a hand-over to the
 * business's own line, and this.
 */
export async function stopLiveCall(
  auth: Admitted,
  aud: string,
  body: Partial<{ call_id?: string }>,
): Promise<Response> {
  const L = logger();
  if (!env.RETELL_API_KEY) return refuse(503, "no_provider_key");
  const callId = String(body.call_id || "");
  if (!/^call_[A-Za-z0-9]{8,}$/.test(callId)) return refuse(400, "bad_request", "call_id required");
  const notYours = await refusedCall(auth, aud, callId);
  if (notYours) return notYours;

  const r = await stopCall({ apiKey: env.RETELL_API_KEY }, callId);
  L.info("admin_stop_call", { call_id: callId, ok: r.ok, status: r.status });
  if (!r.ok) return json(502, { ok: false, error: "provider_refused", status: r.status });
  return json(200, { ok: true });
}

/**
 * Whisper to the phone receptionist mid-call.
 *
 * A sentence injected into the agent's context that only the agent hears and
 * works into its next answer (Retell update-live-call). Beside it the API
 * offers an end (stop-call.ts) and, through the same update, the hand-over
 * (hand-over.ts); listening to the audio and a person joining from a
 * microphone are the provider's own dashboard's, not the API's.
 */
export async function whisperToCall(
  auth: Admitted,
  aud: string,
  body: Partial<{ call_id?: string; text?: string; trigger?: boolean }>,
): Promise<Response> {
  const L = logger();
  /** One answer's worth. A whisper is worked into the next thing said. */
  const MAX_CHARS = 500;
  if (!env.RETELL_API_KEY) return refuse(503, "no_provider_key");
  const callId = String(body.call_id || "");
  const text = String(body.text || "").trim();
  if (!/^call_[A-Za-z0-9]{8,}$/.test(callId) || !text || text.length > MAX_CHARS) {
    return refuse(400, "bad_request", "call_id + text (1-500 chars) required");
  }
  const notYours = await refusedCall(auth, aud, callId);
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

/**
 * Hand a live call to the business.
 *
 * The receptionist is told the owner is picking up, and transfers the caller
 * to the business's own line with the tool it already has -- transfer_to_staff,
 * a warm transfer to the workspace's handoff number. The same hand-off a
 * caller gets when they ask for a person, asked for by the owner instead. The
 * provider's dashboard can put a person on the line from a browser microphone;
 * its API cannot, so this is the take-over a hosted agent allows.
 *
 * Two things ride in one update. The line, as an override of the call's
 * handoff_number variable: the tool dials the variable, which was filled at
 * call start from the profile, and a line added since -- or a call that began
 * before there was one -- would otherwise dial nothing. And the directive,
 * composed HERE from contracts and never taken from the body: the dashboard
 * cannot send platform-voiced text of its own into a call. It is triggered,
 * unlike a whisper, because a hand-over is an instruction to act now, not a
 * thought to keep in mind.
 */
export async function handOverCall(
  auth: Admitted,
  aud: string,
  body: Partial<{ call_id?: string; line?: string }>,
): Promise<Response> {
  const L = logger();
  if (!env.RETELL_API_KEY) return refuse(503, "no_provider_key");
  const callId = String(body.call_id || "");
  const line = String(body.line || "").trim();
  if (!/^call_[A-Za-z0-9]{8,}$/.test(callId) || !isE164(line)) {
    return refuse(400, "bad_request", "call_id + line (E.164) required");
  }
  const notYours = await refusedCall(auth, aud, callId);
  if (notYours) return notYours;

  const r = await updateLiveCall({ apiKey: env.RETELL_API_KEY }, callId, {
    additionalContext: frameHandOver(),
    triggerResponse: true,
    variables: { handoff_number: line },
  });
  // The line is the business's own and stays out of the log; the outcome is
  // what a search needs.
  L.info("admin_hand_over", { call_id: callId, ok: r.ok, status: r.status });
  if (!r.ok) return json(502, { ok: false, error: "provider_refused", status: r.status });
  return json(200, { ok: true });
}
