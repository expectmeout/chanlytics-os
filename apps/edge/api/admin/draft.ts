/**
 * POST /api/admin/draft: a member's change to a thread's draft, or their Try again (decision 0093); the words are kept on
 * the thread, and nothing is sent.
 *
 * The door is the knock (authorizeAdmin: the per-call token, whose workspace draftAtTheDoor reads with tokenWorkspace) and
 * the body (readBody); draftAtTheDoor in lib/drafts/draft-door.ts is everything after.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { readBody } from "../../lib/admin-door.js";
import { draftAtTheDoor } from "../../lib/drafts/draft-door.js";
import { adminDoor } from "../../lib/log.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/draft");
  if (!auth.ok) return auth.response;
  return draftAtTheDoor(auth, await readBody(request));
});
