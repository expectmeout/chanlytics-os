import { LeadOneQuerySchema } from "@chanlytics/contracts";
import { read, workspace, write } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { eraseLead, leadScope } from "@/server/leads/leads";
import { load, readerContext } from "@/server/readers";
import { lead } from "@/server/readers/leads";

/**
 * GET /api/v1/leads/:id — one lead, as a row of the page (Reach out Part 4, PR 9).
 *
 * What the peek draws for a lead the address names that is not on a page the
 * tab has loaded: a link, a lead far down a view. Every member may read it, as
 * every member may read the list. It is the workspace the tab named
 * (`?workspace=`), never the lead's own: a member of two workspaces opening one
 * workspace's lead id on the other's page is answered 404, so it is never drawn,
 * or acted on, where it does not belong. The row is built by the list's own
 * builder, in the view's search when `search` names one. The body is its
 * reader's (readers/leads.ts lead), which Ask reads one lead by too.
 */
export const GET = read({
  scope: workspace,
  query: LeadOneQuerySchema,
  handle: async ({ ctx, member, input }) =>
    (
      await load(readerContext(ctx, member), lead, {
        id: requireUuid(ctx.params.id, "lead"),
        ...(input.search ? { search: input.search } : {}),
      })
    ).data,
});

/**
 * DELETE /api/v1/leads/:id — erase one lead, and never find it again (§0.4).
 *
 * The owner's alone, like erasing a person: an operator who may work a lead
 * must not be able to delete it. The door writes the tombstones before it
 * blanks the row — blanking takes the place, the number and the address away —
 * and the ledger row survives what it destroyed.
 */
export const DELETE = write({
  scope: leadScope,
  fresh: true,
  role: "owner",
  rate: "erase",
  handle: ({ ctx, row }) => eraseLead(ctx, row),
});
