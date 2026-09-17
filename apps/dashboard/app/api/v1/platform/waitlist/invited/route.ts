import { write, platform } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { platformWaitlistInvited } from "@/server/platform";

/**
 * POST /api/v1/platform/waitlist/invited — somebody on the waiting list was invited.
 *
 * IT SENDS NOTHING, and the page says so where the button is. There is one
 * shared sign-up code, so an invitation is a mail a person writes; this records
 * that they wrote it, which is what takes the row out of the queue. A route
 * that sent something would be a different product decision, and a button that
 * looked like it sent something would leave people waiting for a mail nobody
 * ever wrote.
 *
 * On the platform scope, whose door is `backOffice()`: the people on this list
 * have no workspace, so there is no membership that could authorize it and no
 * tenant to scope it to.
 *
 * `already` is not an error. Two admins working down the same list is the
 * expected way this is used, and the second one is owed the truth rather than
 * a failure: the row was already somebody's.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_waitlist_invited",
  handle: async ({ ctx, req, office }) => {
    const body = (await req.json().catch(() => ({}))) as { id?: unknown };
    const id = requireUuid(body.id, "person");
    return { outcome: await platformWaitlistInvited(office, ctx, id) };
  },
});
