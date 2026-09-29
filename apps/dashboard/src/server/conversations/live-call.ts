import "server-only";
import { deployment } from "../deployment";
import { callEdge, edgeAnswered } from "../edge";

/** A live call waits on nobody: the edge's own call to the provider is bounded at 8 s (voice-retell), this just above. */
const LIVE_CALL_TIMEOUT_MS = 15_000;

/**
 * Whisper to the phone receptionist mid-call, through the edge — the
 * provider key lives there. Same production guard as the pause mirror: a
 * preview must never speak into a real customer's call. Returns a reason
 * instead of throwing so the route can answer in a sentence.
 */
export async function whisperLiveCall(
  retellCallId: string,
  text: string,
  trigger: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/whisper",
    { call_id: retellCallId, text, trigger },
    { timeoutMs: LIVE_CALL_TIMEOUT_MS },
  );
  if (edgeAnswered(r)) return { ok: true };
  const j = (r.body ?? {}) as { error?: string; status?: number };
  return { ok: false, reason: j.error ? `${j.error}${j.status ? ` ${j.status}` : ""}` : `edge ${r.status}` };
}

/**
 * End a live call: the edge speaks to the provider's stop-call. The same
 * production guard as the whisper -- a preview must never end a real
 * customer's call -- and a reason instead of a throw, so the route answers
 * in a sentence.
 */
export async function stopLiveCall(retellCallId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge("/api/admin/stop-call", { call_id: retellCallId }, { timeoutMs: LIVE_CALL_TIMEOUT_MS });
  if (edgeAnswered(r)) return { ok: true };
  const j = (r.body ?? {}) as { error?: string; status?: number };
  return { ok: false, reason: j.error ? `${j.error}${j.status ? ` ${j.status}` : ""}` : `edge ${r.status}` };
}

/**
 * Pass a live call to the business's own line: the edge tells the
 * receptionist the owner is picking up and overrides the line its transfer
 * tool dials. Same guard, same shape of answer.
 */
export async function handOverLiveCall(
  retellCallId: string,
  line: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/hand-over",
    { call_id: retellCallId, line },
    { timeoutMs: LIVE_CALL_TIMEOUT_MS },
  );
  if (edgeAnswered(r)) return { ok: true };
  const j = (r.body ?? {}) as { error?: string; status?: number };
  return { ok: false, reason: j.error ? `${j.error}${j.status ? ` ${j.status}` : ""}` : `edge ${r.status}` };
}
