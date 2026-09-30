/**
 * POST /api/admin/voice-converge: the phone agent's settings, planned and applied from the edge, because the provider
 * key lives here and nowhere else. Dry run by default, idempotent; the platform's alone.
 *
 * The door is the knock (authorizeAdmin: a token minted by the platform for this door, or the key on an edge without
 * the secret) and the body (readBody); convergeVoiceAgents in lib/voice/voice-converge.ts refuses a token that names a
 * workspace (platform_only) and does the rest.
 */
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { convergeVoiceAgents } from "../../lib/voice/voice-converge.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/voice-converge");
  if (!auth.ok) return auth.response;
  return convergeVoiceAgents(auth, await readBody(request));
});
