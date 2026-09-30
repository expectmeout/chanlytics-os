/**
 * POST /api/admin/voice-provision: a workspace's phone receptionist on a Retell-owned number, from the edge. Dry run by
 * default, idempotent, and a signed admin token only.
 *
 * The door is the knock (authorizeAdmin); provisionVoice in lib/voice/voice-provision.ts checks the provider key, the
 * function secret and the database, and only then reads the body (a refused request reads nothing past the refusal),
 * plans, and with { apply: true } does it, leg by leg.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { provisionVoice } from "../../lib/voice/voice-provision.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/voice-provision");
  if (!auth.ok) return auth.response;
  return provisionVoice(auth, request);
});
