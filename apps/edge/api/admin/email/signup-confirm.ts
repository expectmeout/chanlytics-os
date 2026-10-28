/**
 * POST /api/admin/email/signup-confirm: a member asks a website sign-up's person to confirm, from the person's page (Ask to
 * confirm, Ask again; 00489's double opt-in).
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace) and
 * the body (readBody); askAgain in lib/website/signup-confirm.ts is everything after.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { askAgain } from "../../../lib/website/signup-confirm.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/email/signup-confirm");
  if (!auth.ok) return auth.response;
  return askAgain(auth, await readBody(request));
});
