/**
 * POST /api/admin/reach-out-preview: one reach-out email written for one lead of a search, for a person to read before
 * anything is sent. Signed admin token only.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); previewReachOut in lib/campaigns/reach-out/preview-run.ts
 * checks every field, holds the day's Ask budget, writes the preview (lib/campaigns/reach-out/preview.ts) and records what it
 * spent.
 */
import { readBody } from "../../lib/shared/admin-door.js";
import { authorizeAdmin } from "../../lib/shared/admin-auth.js";
import { adminDoor } from "../../lib/shared/log.js";
import { previewReachOut } from "../../lib/campaigns/reach-out/preview-run.js";
import { REACH_OUT_PREVIEW_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/reach-out-preview");
  if (!auth.ok) return auth.response;
  return previewReachOut(auth, await readBody(request, REACH_OUT_PREVIEW_DOOR));
});
