import { z } from "zod";
import { FormRequestPress } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { formRequest } from "@/server/readers/forms";
import { applyFormRequestPress } from "@/server/forms/request-press";

/** A reply is queued through the reply verb: the reply route's own ceiling (core reply.ts says why it is pinned). */
export const maxDuration = 60;

/**
 * GET /api/v1/forms/requests?id=<id>: one request as Inbox answers it (00680): what was asked, who asked and how they
 * can be reached, where it came through, and where it stands (nobody has answered, answered and by what, held for a
 * look, or a test). Any member. The body is its reader's (readers/forms.ts formRequest).
 */
export const GET = read({
  scope: workspace,
  query: z.object({ id: z.uuid() }),
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), formRequest, input)).data,
});

/**
 * POST /api/v1/forms/requests: one press on a request. Its reply sent (`reply`: queued as a member's first message
 * is, with its seconds to take it back, and kept as what answered this request), a member's word that it was answered
 * another way (`mark`) and that word taken back (`unmark`), a request that is not a real one held (`hold`), a held
 * entry let through (`let_through`), or the time it asked for answered (`book`, `cant`: 00688, F3), as a chat's is,
 * with Booked it's reply answered for the member to send. The reply keeps its own key for one press of Send (decision
 * 0035). An owner, an operator or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "reply",
  idempotent: "own",
  input: FormRequestPress,
  handle: ({ ctx, req, member, input }) =>
    applyFormRequestPress(ctx, member, input, req.headers.get("idempotency-key")),
});
