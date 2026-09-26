import { PageContextSchema } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { readerContext } from "@/server/readers";
import { buildContext } from "@/server/ask/context";

/**
 * POST /api/v1/ask/warm — the page a person is on, read before they ask (the Phase 2 plan, D6).
 *
 * The palette sends it as it opens and again as the page under it changes: the page's context (contracts
 * PageContext, identities only), which the server reads through the page's own readers under the person's RLS and
 * keeps for a minute on this instance (server/ask/context.ts), so the question asked a moment later finds its page
 * read. It answers the build's stamp and nothing of what was read. A write in the aggregate bucket, not a read: a POST
 * is a write (route-policy.test), and every member who may ask may warm. The tab sends it raw, so its reads stay and
 * no refresh runs. A context that is not one is refused here, in words.
 */
export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: "aggregate",
  input: PageContextSchema,
  handle: async ({ ctx, member, input }) => {
    const built = await buildContext(readerContext(ctx, member, undefined, { keep: true }), input);
    return { stamp: built.stamp };
  },
});
