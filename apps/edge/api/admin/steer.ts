/**
 * POST /api/admin/steer: rewrites a held draft to the owner's instruction, the text whisper; the new draft is queued
 * first, then the old one is retired with its job.
 *
 * The door is the knock (authorizeAdmin: the per-call token, whose workspace steerHeldDraft reads with tokenWorkspace),
 * the body (readBody) and the model as a port, which a test hands in; steerHeldDraft in lib/receptionist/steer.ts is
 * everything after.
 */
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { readBody } from "../../lib/shared/admin-door.js";
import { adminDoor } from "../../lib/shared/log.js";
import { steerHeldDraft, type BrainPort } from "../../lib/receptionist/steer.js";
import { STEER_DOOR } from "@chanlytics/contracts";
export { type BrainPort } from "../../lib/receptionist/steer.js";

export const POST = adminDoor(async function POST(request: Request, brain?: BrainPort | null): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/steer");
  if (!auth.ok) return auth.response;
  return steerHeldDraft(auth, await readBody(request, STEER_DOOR), brain);
});
