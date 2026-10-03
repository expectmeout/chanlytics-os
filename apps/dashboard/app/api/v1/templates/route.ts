import { z } from "zod";
import { read, write, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { templates } from "@/server/readers/templates";
import { submitTemplate } from "@/server/campaigns/template-submit";

/**
 * GET /api/v1/templates — ONE workspace's approved templates.
 *
 * Scoped explicitly, not by RLS alone. RLS answers "may this caller see this
 * row", and for someone who belongs to two workspaces the answer is yes to
 * both — so this list would have offered another business's templates in the
 * composer, and a send picked from it would have failed the reply route's own
 * tenant check with a confusing "not found".
 *
 * Approved only by default: Meta rejects anything else at the wire, so
 * offering a pending template is offering a send that cannot happen.
 * `?all=1` is for Settings, which shows every template with its status so
 * the owner can see what is in review, rejected or paused. Both carry the
 * category, because a marketing template may only go to people who said yes.
 *
 * POST /api/v1/templates — a template written here, submitted to Meta.
 * { name, language, category, body, footer?, examples }. Owner or operator.
 * Everything Meta refuses at the wire is refused here first, in the person's
 * words (validateTemplateDraft, so the body is the route's own to read); what
 * Meta then says (pending, approved, rejected with a reason) is the row's
 * status, kept current by the webhook.
 *
 * The GET's body is its reader's (readers/templates.ts), which Ask's
 * campaigns.audiences reads too; the route checks `?all=`.
 *
 * The handle is submitTemplate in src/server/campaigns/template-submit.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
const Query = z.object({
  /** `1` for Settings: every template with its status. */
  all: z.string().optional(),
});

export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) =>
    (await load(readerContext(ctx, member), templates, { all: input.all === "1" })).data,
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: ({ ctx, req, member }) => submitTemplate(ctx, req, member),
});
