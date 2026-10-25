/**
 * POST /api/admin/imports/again: Try again on a source of the imports ledger that stopped (decision 0073, R23), as the
 * first run's Bringing it in, Today's Brought in and Connections offer it.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace) and
 * the body (readBody); importAgain in lib/imports/import-again.ts is everything after.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { importAgain } from "../../../lib/imports/import-again.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/imports/again");
  if (!auth.ok) return auth.response;
  return importAgain(auth, await readBody(request));
});
