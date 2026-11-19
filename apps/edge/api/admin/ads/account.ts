/**
 * POST /api/admin/ads/account: an owner's own ad account at Meta, connected, the one of two chosen, looked at again, or
 * asked whether it can be connected here (decision 0049, step P1). Signed admin token only; the dashboard's /api/v1/ads
 * routes call it for the owner. The Meta app's secret, the tokens and Meta's wire live on the edge and nowhere else.
 *
 * The door reads the body once as text (the token's body hash is checked over these bytes) and asks authorizeAdmin;
 * runAdsAccountOp in lib/ads/account-ops.ts is the op table and what each answer means.
 */
import { authorizeAdmin } from "../../../lib/shared/admin-auth.js";
import { readBody } from "../../../lib/shared/admin-door.js";
import { adminDoor } from "../../../lib/shared/log.js";
import { runAdsAccountOp } from "../../../lib/ads/account-ops.js";
import { ADS_ACCOUNT_DOOR } from "@chanlytics/contracts";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const body = await readBody(raw, ADS_ACCOUNT_DOOR);
  const auth = await authorizeAdmin(request, "/api/admin/ads/account", { body: raw });
  if (!auth.ok) return auth.response;
  return runAdsAccountOp(auth, body);
});
