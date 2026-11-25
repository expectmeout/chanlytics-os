/**
 * POST /api/admin/ads/check: the paused-ad check on an owner's own ad account (the Ads plan's step 4). Signed admin
 * token only; the dashboard's /api/v1/ads/check route calls it for the owner, with the draft it judged. Meta's
 * token and wire live on the edge and nowhere else.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes) and asks authorizeAdmin;
 * runAdsCheck in lib/ads/paused-check.ts is what it sends and what its answer means.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { runAdsCheck } from "../../../lib/ads/paused-check.js";
import { ADS_CHECK_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const auth = await authorizeAdmin(request, "/api/admin/ads/check", { body: raw });
  if (!auth.ok) return auth.response;
  const read = await readBody(raw, ADS_CHECK_DOOR);
  if (!read.ok) return read.response;
  const body = read.body;
  return runAdsCheck(auth, body);
});
