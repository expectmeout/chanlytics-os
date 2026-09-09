import { withRoute } from "@/server/with-route";
import { requirePlatformAdmin, platformOverview } from "@/server/platform";

/**
 * GET /api/v1/platform/overview — every workspace, for the back office.
 *
 * The only endpoint in this product that deliberately answers about workspaces
 * the caller is not a member of. It is read-only, and it is a list of facts each
 * workspace's own pages already show its owner; the cross-tenant part is that
 * they are in one place.
 *
 * No workspace scope, and so no `memberContext`: the question is not "which of
 * my workspaces" but "all of them". Authorization is `is_platform_admin()` in
 * the database, called twice on the way through -- once here so the refusal
 * reads the same as every other platform route, and once inside the RPC, where
 * it cannot be forgotten.
 */
export const GET = withRoute(async (_req, ctx) => {
  await requirePlatformAdmin(ctx);
  return { tenants: await platformOverview(ctx) };
});
