import { z } from "zod";
import { AppError, templateComponents, validateTemplateDraft } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { createTemplate } from "@/server/campaigns/meta-templates";
import { load, readerContext } from "@/server/readers";
import { templates } from "@/server/readers/templates";

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

const SAID: Record<string, string> = {
  preview: "Submitting only works on the production dashboard.",
  no_channel: "Connect a WhatsApp number first — templates belong to a number's account.",
  no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
  no_token: "Chanlytics has no access token for this number yet.",
  write_failed: "The template was submitted but could not be saved here. Sync from Meta to see it.",
};

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, req, member }) => {
    const body = (await jsonBody(req)) as {
      name?: unknown;
      language?: unknown;
      category?: unknown;
      body?: unknown;
      footer?: unknown;
      examples?: unknown;
      labels?: unknown;
      button?: unknown;
    } | null;
    const check = validateTemplateDraft({
      name: typeof body?.name === "string" ? body.name : "",
      language: typeof body?.language === "string" ? body.language : "",
      category: typeof body?.category === "string" ? body.category : "",
      body: typeof body?.body === "string" ? body.body : "",
      footer: typeof body?.footer === "string" ? body.footer : null,
      examples: Array.isArray(body?.examples) ? (body.examples as unknown[]).map(String) : [],
      // One static URL button, its address the workspace's own booking link. The
      // draft check refuses a value in either half, because a button that takes
      // one needs a parameter `sendTemplate` never sends.
      button:
        body?.button && typeof body.button === "object"
          ? {
              text: String((body.button as { text?: unknown }).text ?? ""),
              url: String((body.button as { url?: unknown }).url ?? ""),
            }
          : null,
    });
    if (!check.ok) throw new AppError("validation", check.error);
    const v = check.value;

    const { data: dup, error: dErr } = await ctx.supabase
      .from("templates")
      .select("id")
      .eq("tenant_id", member.tenantId)
      .eq("channel", "whatsapp")
      .eq("name", v.name)
      .eq("language", v.language)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (dup)
      throw new AppError("conflict", "A template with that name and language already exists. Pick another name.", 409);

    const labels = Array.isArray(body?.labels)
      ? (body.labels as unknown[]).map((l) =>
          String(l ?? "")
            .trim()
            .slice(0, 40),
        )
      : [];
    const r = await createTemplate(member.tenantId, ctx.userId, {
      name: v.name,
      language: v.language,
      category: v.category,
      components: templateComponents(v),
      body: v.body,
      examples: v.examples,
      labels: labels.length === v.examples.length ? labels : [],
    });
    if (!r.ok) {
      if (r.reason === "meta_refused")
        throw new AppError(
          "validation",
          `WhatsApp did not accept it: ${r.detail ?? "no reason given"}. Change the message and try again.`,
        );
      const said = SAID[r.reason] ?? `The template could not be submitted (${r.reason}).`;
      throw new AppError(
        r.reason === "no_channel" || r.reason === "no_waba" ? "conflict" : "upstream_meta",
        said,
        r.reason === "no_channel" || r.reason === "no_waba" ? 409 : 502,
      );
    }
    return {
      id: r.id,
      name: v.name,
      language: v.language,
      category: v.category,
      meta_status: r.metaStatus,
      warnings: check.warnings,
    };
  },
});
