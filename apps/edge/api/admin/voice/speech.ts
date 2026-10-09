/**
 * POST /api/admin/voice/speech — words read aloud in Ask's one voice, for one member
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct 2026: door E, the one-way speech).
 *
 * Today's Listen and an answer's Read aloud are not conversations: nobody speaks back, so no agent, no microphone and
 * no session row. The dashboard's speech route has verified the member and bounded the text; it asks here, with the
 * signed admin token that names the workspace and the person, for the one thing it may not hold: audio made with the
 * provider's key (lib/voice/ask-voice.ts speakAskVoice). The door asks first whether the workspace may spend (as the
 * mint door does: a paused, ended or unbilled one spends nothing, 402), then streams the vendor's MP3 back as it
 * arrives, so the first word reaches the person about when the connection is up. A vendor that could not be reached,
 * or said "not now" (a 429), is 503 provider_unreachable; one that refused is 502 provider_refused. Body: { tenant_id,
 * user_id, text, purpose, before? } where purpose is `brief` or `answer`, for the log alone, and `before` is the words
 * read just before these in the clip this one follows (a reading's first sentence, asked for by itself so the first
 * word is not behind the whole): the vendor reads these as carrying on from them, and is not billed for them.
 */
import { refuse } from "../../../lib/http.js";
import { authorizeAdmin, personFor, workspaceFor } from "../../../lib/admin-auth.js";
import { readBody } from "../../../lib/admin-door.js";
import { mayUseModelFor } from "../../../lib/model.js";
import { askSpeechConfigured, speakAskVoice } from "../../../lib/voice/ask-voice.js";
import { ASK_SPEECH_MAX_CHARS, SPEECH_PURPOSES, UUID } from "../../../lib/packages/contracts.js";
import { logger, adminDoor } from "../../../lib/log.js";

const L = logger();

const AUD = "/api/admin/voice/speech";
const PURPOSES = new Set<string>(SPEECH_PURPOSES);

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const t0 = Date.now();
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  if (!askSpeechConfigured()) return refuse(503, "no_provider_key");

  const body = await readBody<{
    tenant_id?: string;
    user_id?: string;
    text?: string;
    purpose?: string;
    before?: string;
  }>(request);
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const userId = personFor(auth, body.user_id) ?? "";
  if (!UUID.test(tenantId) || !UUID.test(userId)) return refuse(400, "bad_request", "tenant_id and user_id required");
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
  if (!text) return refuse(400, "bad_request", "text required");
  if (text.length > ASK_SPEECH_MAX_CHARS)
    return refuse(413, "too_large", `text over ${ASK_SPEECH_MAX_CHARS} characters`);
  const purpose = PURPOSES.has(String(body.purpose)) ? String(body.purpose) : "answer";
  // What came before, bounded as the words are: its end is what the next clip carries on from.
  const before =
    typeof body.before === "string" ? body.before.replace(/\s+/g, " ").trim().slice(-ASK_SPEECH_MAX_CHARS) : "";

  if (!(await mayUseModelFor("ask", tenantId))) {
    L.warn("voice_speech_refused", { tenant_id: tenantId, why: "may_not_spend" });
    return refuse(402, "payment_required", "Voice is off while this workspace is paused or its plan has ended.");
  }

  const spoken = await speakAskVoice(text, before || undefined);
  if (!spoken) return refuse(503, "no_provider_key");
  if (spoken.outcome !== "ok") {
    L.warn("voice_speech_refused", {
      tenant_id: tenantId,
      why: spoken.outcome,
      status: spoken.status,
      error: spoken.error.slice(0, 200),
    });
    return spoken.outcome === "unreachable"
      ? refuse(503, "provider_unreachable", `voice ${spoken.status || "timeout"}`)
      : refuse(502, "provider_refused", `voice ${spoken.status}`);
  }
  // The words themselves are never logged (a brief names customers); their length and the time to the vendor's first
  // byte are what a question about speed or cost needs.
  L.info("voice_speech_spoken", {
    tenant_id: tenantId,
    purpose,
    chars: text.length,
    ttfb_ms: Date.now() - t0,
    ...(before ? { follows: true } : {}),
  });
  return new Response(spoken.body, {
    status: 200,
    headers: { "content-type": spoken.contentType, "cache-control": "no-store" },
  });
});
