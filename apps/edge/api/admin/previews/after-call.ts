/**
 * POST /api/admin/previews/after-call: what a call to a lead's preview left once it ended (decision 0079), asked by the
 * dashboard's public read of a preview's call so the page shows the business what it would get after a real one.
 * Signed admin token only.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); previewAfterCall in lib/previews/after-call.ts is the
 * answer.
 */
import { readBody } from "../../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { previewAfterCall } from "../../../lib/previews/after-call.js";
import { PREVIEW_AFTER_CALL_DOOR } from "@chanlytics/contracts";

const AUD = "/api/admin/previews/after-call";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  const read = await readBody(request, PREVIEW_AFTER_CALL_DOOR);
  if (!read.ok) return read.response;
  return previewAfterCall(auth, read.body);
});
