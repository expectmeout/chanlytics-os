/**
 * POST /api/admin/ads/press: an owner pauses an ad, or turns one back on (decision 0050, calls 1, 2 and 9). Signed
 * admin token only; the dashboard's /api/v1/ads/:id routes call it for the owner. Meta's token and wire live on the
 * edge and nowhere else.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes) and asks authorizeAdmin;
 * runAdPress in lib/ads/press.ts is the op table and what each answer means.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { runAdPress } from "../../../lib/ads/press.js";
import { ADS_PRESS_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const body = await readBody(raw, ADS_PRESS_DOOR);
  const auth = await authorizeAdmin(request, "/api/admin/ads/press", { body: raw });
  if (!auth.ok) return auth.response;
  return runAdPress(auth, body);
});
