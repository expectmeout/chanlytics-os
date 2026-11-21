/**
 * POST /api/admin/ads/preview: Meta's own preview of one version of New ad's draft, in each place the ad shows (the Ads
 * plan's 4.6). Signed admin token only; the dashboard's /api/v1/ads/preview route calls it for a member who may draft,
 * with the version its kept draft holds. Meta's token and wire live on the edge and nowhere else.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes) and asks authorizeAdmin;
 * answerAdPreview in lib/ads/preview.ts is what it asks Meta and what its answer means.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { answerAdPreview } from "../../../lib/ads/preview.js";
import { ADS_PREVIEW_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const body = await readBody(raw, ADS_PREVIEW_DOOR);
  const auth = await authorizeAdmin(request, "/api/admin/ads/preview", { body: raw });
  if (!auth.ok) return auth.response;
  return answerAdPreview(auth, body);
});
