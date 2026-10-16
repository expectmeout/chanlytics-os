/**
 * POST /api/admin/email/test-to-self: a step's message mailed to the member who pressed Send me a test, at their own
 * address and to nobody else (a sequence's step, the parity review's W5).
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody); sendTestToSelf in
 * lib/email/test-to-self.ts is everything after.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { sendTestToSelf } from "../../../lib/email/test-to-self.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/email/test-to-self");
  if (!auth.ok) return auth.response;
  return sendTestToSelf(auth, await readBody(request));
});
