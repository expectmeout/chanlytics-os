/**
 * POST /api/admin/rehearsal/agent: the workspace's receptionist made at the provider before any number (decision 0073,
 * R1), as the first run's Your receptionist goes on to rehearse.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace) and
 * the body (readBody); makeRehearsalAgent in lib/voice/rehearsal-call.ts is everything after.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { makeRehearsalAgent } from "../../../lib/voice/rehearsal-call.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/rehearsal/agent");
  if (!auth.ok) return auth.response;
  return makeRehearsalAgent(auth, await readBody(request));
});
