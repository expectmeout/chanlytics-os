import { write } from "@/server/shared/route";
import { readerContext } from "@/server/readers";
import { sequenceScope } from "@/server/shared/verbs";
import { REWRITE_BODY } from "@/server/campaigns/sequences/bodies";
import { rewriteLeadEmail } from "@/server/campaigns/sequences/rewrite";

/**
 * POST /api/v1/sequences/:id/rewrite — { subject, body, change } → { subject, body, cannot }: an email of a sequence to
 * leads written again as its owner says, under the rules a draft is written under and in the way they write, with what
 * a rule kept out said in `cannot`. Words handed back, never saved: the sheet's box holds them, and the chain's own save
 * judges them as it judges typed words. A later email has no subject (`subject` null). Owner or operator; counted against
 * the workspace's assistant budget like any other assistant turn.
 */
export const POST = write({
  scope: sequenceScope,
  role: "operator",
  rate: "ask",
  input: REWRITE_BODY,
  handle: ({ ctx, member, row, input }) => rewriteLeadEmail(readerContext(ctx, member), row, input),
});
