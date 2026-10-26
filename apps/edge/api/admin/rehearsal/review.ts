/**
 * POST /api/admin/rehearsal/review: How it did: one conversation judged against what the receptionist was told (a spoken rehearsal, a typed one, or a real call), the review kept on its rehearsal (decision 0069).
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace) and
 * the body (readBody); reviewConversation in lib/receptionist/review.ts is everything after.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { reviewConversation } from "../../../lib/receptionist/review.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/rehearsal/review");
  if (!auth.ok) return auth.response;
  return reviewConversation(auth, await readBody(request));
});
