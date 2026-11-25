/**
 * POST /api/admin/ads/turn-on: an owner turns an ad on (decision 0050, calls 3 and 5; the Ads plan's 4.7). Signed admin
 * token only; the dashboard's /api/v1/ads/turn-on route calls it for the owner, with what it judged at the press. Meta's
 * token and wire live on the edge and nowhere else, and nothing here calls Meta: the account's job does.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes) and asks authorizeAdmin;
 * runAdTurnOn in lib/ads/turn-on.ts is what it keeps and what its answer means.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { runAdTurnOn } from "../../../lib/ads/turn-on.js";
import { ADS_TURN_ON_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const auth = await authorizeAdmin(request, "/api/admin/ads/turn-on", { body: raw });
  if (!auth.ok) return auth.response;
  const read = await readBody(raw, ADS_TURN_ON_DOOR);
  if (!read.ok) return read.response;
  const body = read.body;
  return runAdTurnOn(auth, body);
});
