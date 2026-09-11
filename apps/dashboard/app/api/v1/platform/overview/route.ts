import { read, platform } from "@/server/route";
import { platformOverview } from "@/server/platform";

/**
 * GET /api/v1/platform/overview — every workspace, for the back office.
 *
 * The only endpoint in this product that deliberately answers about workspaces
 * the caller is not a member of. It is read-only, and it is a list of facts each
 * workspace's own pages already show its owner; the cross-tenant part is that
 * they are in one place.
 *
 * No workspace scope, and so no `memberContext`: the question is not "which of
 * my workspaces" but "all of them". Declared on the platform scope, whose
 * door is `backOffice()`: authorization is `is_platform_admin()` in the
 * database, and the handle the reads below take exists only on the far side
 * of it -- so a route cannot reach them without passing it.
 */
export const GET = read({
  scope: platform,
  handle: async ({ office }) => ({ tenants: await platformOverview(office) }),
});
