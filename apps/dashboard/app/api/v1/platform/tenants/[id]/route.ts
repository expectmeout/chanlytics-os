import { withRoute } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { requireUuid } from "@/server/request-guards";
import { requirePlatformAdmin, platformTenant, platformEvents, platformDb } from "@/server/platform";
import { setupDtoFor } from "@/server/setup";

/**
 * GET /api/v1/platform/tenants/:id — one workspace, as its own owner sees it.
 *
 * The Setup payload here is built by `setupDtoFor`, which is the same function
 * /api/v1/setup calls for the signed-in owner. That is the whole point: support
 * looking at a second rendering of the same facts is how two people end up on a
 * call disagreeing about what the product says. Same function, same view model,
 * so the rows on this page and the rows the customer is staring at cannot
 * differ.
 *
 * `role: "owner"` because a support question is always about what the owner can
 * see and do -- the most complete view, and the one being asked about.
 *
 * The events are the trail `emitEvent` has been writing all along on every
 * provisioning step, filing, connection and billing change, and which nothing
 * has ever read. "What changed just before it broke" is the second question
 * support asks, every time.
 *
 * Read-only. Actions across tenants come later, and only ones that already exist
 * as a workspace's own verb.
 */
export const GET = withRoute(async (_req, ctx) => {
  await requirePlatformAdmin(ctx);
  const id = requireUuid(ctx.params.id, "workspace");
  const tenant = await platformTenant(id);
  if (!tenant) throw new AppError("not_found", "No such workspace.", 404);
  const [setup, events] = await Promise.all([
    setupDtoFor(platformDb(), id, "owner"),
    platformEvents(id),
  ]);
  return { tenant, setup, events };
});
