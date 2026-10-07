import "server-only";
import { deployment } from "../env";
import type { EdgeAnswerCode } from "@chanlytics/contracts";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeAnswer, type EdgeReason } from "../edge";

/** A live call waits on nobody: the edge's own call to the provider is bounded at 8 s (voice-retell), this just above. */
const LIVE_CALL_TIMEOUT_MS = 15_000;

/** Why a live call was not reached: the edge's code, with the provider's status when the door gave one ("provider 404"). */
type LiveCallOutcome = { ok: true } | { ok: false; reason: EdgeReason | `${EdgeAnswerCode} ${number}` };

function unreached(r: EdgeAnswer): LiveCallOutcome {
  const status = typeof r.body?.status === "number" ? r.body.status : null;
  const reason = edgeReasonOf(r);
  return { ok: false, reason: status && r.body?.error ? `${r.body.error} ${status}` : reason };
}

/**
 * Who asks, for which workspace: the token names both, and the edge acts only on a call of that workspace. The
 * route has already proved the call is the member's under RLS; the edge proves it again, with the token's workspace
 * and not the body's call id alone.
 */
interface LiveCallAsker {
  workspace: string;
  user: string;
}

/**
 * Whisper to the phone receptionist mid-call, through the edge — the
 * provider key lives there. Same production guard as the pause mirror: a
 * preview must never speak into a real customer's call. Returns a reason
 * instead of throwing so the route can answer in a sentence.
 */
export async function whisperLiveCall(
  retellCallId: string,
  whisper: { text: string; trigger: boolean },
  asker: LiveCallAsker,
): Promise<LiveCallOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/whisper",
    { call_id: retellCallId, text: whisper.text, trigger: whisper.trigger },
    { ...asker, timeoutMs: LIVE_CALL_TIMEOUT_MS },
  );
  if (edgeAnswered(r)) return { ok: true };
  return unreached(r);
}

/**
 * End a live call: the edge speaks to the provider's stop-call. The same
 * production guard as the whisper -- a preview must never end a real
 * customer's call -- and a reason instead of a throw, so the route answers
 * in a sentence.
 */
export async function stopLiveCall(retellCallId: string, asker: LiveCallAsker): Promise<LiveCallOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/stop-call",
    { call_id: retellCallId },
    { ...asker, timeoutMs: LIVE_CALL_TIMEOUT_MS },
  );
  if (edgeAnswered(r)) return { ok: true };
  return unreached(r);
}

/**
 * Pass a live call to the business's own line: the edge tells the
 * receptionist the owner is picking up and overrides the line its transfer
 * tool dials. Same guard, same shape of answer.
 */
export async function handOverLiveCall(
  retellCallId: string,
  line: string,
  asker: LiveCallAsker,
): Promise<LiveCallOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/hand-over",
    { call_id: retellCallId, line },
    { ...asker, timeoutMs: LIVE_CALL_TIMEOUT_MS },
  );
  if (edgeAnswered(r)) return { ok: true };
  return unreached(r);
}
