/**
 * POST /api/admin/files/copies: the copies Ask reads a business's pictures by (decision 0099, step 2), for the dashboard, which
 * holds no model key.
 *
 * The door is the knock (authorizeAdmin: a token the dashboard minted for this door, the member and the workspace);
 * fileCopies in lib/files/copies.ts is everything after.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { fileCopies } from "../../../lib/files/copies.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/files/copies");
  if (!auth.ok) return auth.response;
  return fileCopies(auth, request);
});
