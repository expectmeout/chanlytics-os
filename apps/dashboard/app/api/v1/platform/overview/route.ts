import { read, platform } from "@/server/route";
import { platformHealth, platformOverview, platformPartners, platformWaitlist } from "@/server/platform/platform";
import { platformVitals } from "@/server/platform/vitals";

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
/**
 * The platform's own health and the waiting list ride on this read rather than
 * routes of their own.
 *
 * It is the same question — the state of the platform — asked by the same
 * person through the same door, and the page that shows the workspaces is the
 * page that should say whether the machinery under them is running. A second
 * endpoint would mean a second round trip on open, a policy entry and a client
 * key, to answer half of what this one already answers.
 *
 * The waiting list is here for the same reason and one more: the people on it
 * have no workspace, so they appear on no other surface in this product. This
 * is the only page they can be on.
 *
 * The partners (0012, P5) ride here for the first reason: who brought a
 * workspace and what it has earned them is a fact about the workspaces on this
 * page. Null when it could not be read; the workspaces still come back.
 *
 * How fast the pages are (00225) rides here for the first reason too: it is the platform's own state, platform-wide
 * like the clocks, and nobody else's to see. Null when it could not be read.
 */
export const GET = read({
  scope: platform,
  handle: async ({ office }) => {
    const [tenants, health, queue, partners, vitals] = await Promise.all([
      platformOverview(office),
      platformHealth(office),
      platformWaitlist(office),
      platformPartners(office),
      platformVitals(office),
    ]);
    return { tenants, health, queue, partners, vitals };
  },
});
