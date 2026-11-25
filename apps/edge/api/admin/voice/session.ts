/**
 * POST /api/admin/voice/session — the agent's conversation token for one member's voice conversation with Ask
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.2; under admin/voice/, as the WhatsApp doors are under
 * admin/whatsapp/, since the admin folder holds its twenty).
 *
 * The dashboard's voice route has verified the member and written the session's row; it asks here, with the signed
 * admin token that names the workspace and the person, for the one thing it may not hold: a token minted with the
 * provider's key (lib/voice/ask-voice.ts). The door asks first whether the workspace may spend (a paused, ended or
 * unbilled one spends nothing: 402, as the model gateway answers it), then mints, and writes nothing of its own: the
 * row is the dashboard's and the minutes come back through the post-call webhook. A vendor that could not be
 * reached, or said "not now" (a 429 is its concurrency or rate limit), is 503 provider_unreachable; one that refused
 * is 502 provider_refused. Body: { tenant_id, user_id }.
 */
import { json, refuse } from "../../../lib/shared/http.js";
import { authorizeAdmin, workspaceAndPersonFor } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { mayUseModelFor } from "../../../lib/ai/model.js";
import { askVoiceConfigured, mintAskVoiceSession } from "../../../lib/voice/ask-voice.js";
import { VOICE_IS_OFF, VOICE_SESSION_DOOR } from "@chanlytics/contracts";
import { logger, adminDoor } from "../../../lib/shared/log.js";

const L = logger();

const AUD = "/api/admin/voice/session";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  if (!askVoiceConfigured()) return refuse(503, "no_provider_key");

  const read = await readBody(request, VOICE_SESSION_DOOR);
  if (!read.ok) return read.response;
  const body = read.body;
  const asker = workspaceAndPersonFor(auth, body);
  if (!asker.ok) return asker.response;
  const { tenantId } = asker;

  if (!(await mayUseModelFor("ask", tenantId))) {
    L.warn("voice_session_refused", { tenant_id: tenantId, why: "may_not_spend" });
    return refuse(402, "payment_required", VOICE_IS_OFF);
  }

  const minted = await mintAskVoiceSession();
  if (!minted) return refuse(503, "no_provider_key");
  if (minted.outcome !== "ok") {
    L.warn("voice_session_refused", {
      tenant_id: tenantId,
      why: minted.outcome,
      status: minted.status,
      error: minted.error.slice(0, 200),
    });
    return minted.outcome === "unreachable"
      ? refuse(503, "provider_unreachable", `Voice didn't answer (${minted.status || "timeout"})`)
      : refuse(502, "provider_refused", `Voice said no (${minted.status})`);
  }
  // The token travels to the browser through the dashboard and is never logged: the conversation's id is what a
  // search needs, and it is what the webhook names.
  L.info("voice_session_minted", { tenant_id: tenantId, conversation_id: minted.conversationId });
  return json(200, { ok: true, token: minted.token, conversation_id: minted.conversationId });
});
