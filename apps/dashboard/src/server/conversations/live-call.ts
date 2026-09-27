import "server-only";
import { deployment } from "../deployment";
import { edgeHeaders, edgeUrl } from "../edge";

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
  const r = await fetch(`${edgeUrl()}/api/admin/whisper`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/whisper"),
    body: JSON.stringify({ call_id: retellCallId, text, trigger }),
  });
  if (r.ok) return { ok: true };
  const j = (await r.json().catch(() => ({}))) as { error?: string; status?: number };
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
  const r = await fetch(`${edgeUrl()}/api/admin/stop-call`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/stop-call"),
    body: JSON.stringify({ call_id: retellCallId }),
  });
  if (r.ok) return { ok: true };
  const j = (await r.json().catch(() => ({}))) as { error?: string; status?: number };
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
  const r = await fetch(`${edgeUrl()}/api/admin/hand-over`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/hand-over"),
    body: JSON.stringify({ call_id: retellCallId, line }),
  });
  if (r.ok) return { ok: true };
  const j = (await r.json().catch(() => ({}))) as { error?: string; status?: number };
  return { ok: false, reason: j.error ? `${j.error}${j.status ? ` ${j.status}` : ""}` : `edge ${r.status}` };
}
