/**
 * POST /api/admin/steer: rewrites a held draft to the owner's instruction, the text whisper; the new draft is queued
 * first, then the old one is retired with its job.
 *
 * The door is the knock (authorizeAdmin: the per-call token, whose workspace steerHeldDraft reads with tokenWorkspace),
 * the body (readBody) and the model as a port, which a test hands in; steerHeldDraft in lib/receptionist/steer.ts is
 * everything after.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { readBody } from "../../lib/admin-door.js";
import { adminDoor } from "../../lib/log.js";
import { steerHeldDraft, type BrainPort } from "../../lib/receptionist/steer.js";
export { type BrainPort } from "../../lib/receptionist/steer.js";

export const POST = adminDoor(async function POST(request: Request, brain?: BrainPort | null): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/steer");
  if (!auth.ok) return auth.response;
  return steerHeldDraft(auth, await readBody(request), brain);
});
