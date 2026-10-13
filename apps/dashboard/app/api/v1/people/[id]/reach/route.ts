import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { personReach } from "@/server/readers/person";

/**
 * GET /api/v1/people/:id/reach — how one person can be written to and called now.
 *
 * Each wire (WhatsApp, a text, an email) with whether a message can go by it, why not, and what it carries; the wire a
 * new conversation opens on; their number for a call, or why none is offered; and whether the receptionist answers
 * them. One rule answers it (contracts writeWaysOf), the same one the send asks again before anything is queued. Any
 * member may read it: it says nothing the person's own page does not. A person not in the workspace is a 404.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const id = requireUuid(ctx.params.id, "person");
    return (await load(readerContext(ctx, member), personReach, { id })).data;
  },
});
