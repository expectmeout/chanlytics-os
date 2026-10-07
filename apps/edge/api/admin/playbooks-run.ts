/**
 * POST /api/admin/playbooks-run: runs one playbook now because a person pressed Run (or Start, on a reach-out): a
 * reach-out's root runs its first step through the sweep's own step runner, any other playbook through
 * lib/playbooks.ts.
 *
 * The door is the knock (authorizeAdmin: a signed admin token for this door) and the body (readBody); runPlaybookNow in
 * lib/reach-out/run-now.ts is everything after.
 */
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { runPlaybookNow } from "../../lib/reach-out/run-now.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/playbooks-run");
  if (!auth.ok) return auth.response;
  return runPlaybookNow(auth, await readBody(request));
});
