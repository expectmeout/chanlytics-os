/**
 * POST /api/admin/whisper: whispers to the phone receptionist mid-call: a sentence injected into the agent's context
 * that only the agent hears and works into its next answer (Retell update-live-call).
 *
 * The door is the knock (authorizeAdmin: the per-call token, for this door's audience) and the body (readBody);
 * whisperToCall in lib/voice/call-controls.ts is everything after: the provider key, the call's workspace (refusedCall)
 * and the provider.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { readBody } from "../../lib/admin-door.js";
import { adminDoor } from "../../lib/log.js";
import { whisperToCall } from "../../lib/voice/call-controls.js";

const AUD = "/api/admin/whisper";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  return whisperToCall(auth, AUD, await readBody(request));
});
