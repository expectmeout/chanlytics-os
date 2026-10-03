/**
 * POST /api/admin/page: the pager's door, for a platform condition seen outside the edge (the nightly red twice
 * running; production's migrations disagreeing with main's). The platform's key only (DIAG_KEY): nothing mints a token
 * for this door.
 *
 * The door is the knock (authorizeAdmin with platformKey: true); pageFromOutside in lib/ops/outside-page.ts refuses a
 * token (platform_only), reads the condition, and pages the way the edge's own do.
 */
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { adminDoor } from "../../lib/log.js";
import { pageFromOutside } from "../../lib/ops/outside-page.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/page", { platformKey: true });
  if (!auth.ok) return auth.response;
  return pageFromOutside(auth, request);
});
