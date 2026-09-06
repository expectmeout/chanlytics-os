import { AppError, TEMPLATE_CATEGORIES, TEMPLATE_LANGUAGES } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { draftTemplate } from "@/server/templates";

/**
 * POST /api/v1/templates/draft — { brief, category, language } → a template
 * drafted with the assistant, in the business's voice, inside WhatsApp's
 * rules. A draft, never a submission: the person edits it and submits it
 * themselves. Owner or operator; counted against the workspace's assistant
 * budget like any other assistant turn.
 */
export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  takeRate(ctx.userId, "ask");
  const body = (await jsonBody(req)) as { brief?: unknown; category?: unknown; language?: unknown } | null;
  const brief = typeof body?.brief === "string" ? body.brief.trim() : "";
  const category = typeof body?.category === "string" ? body.category : "";
  const language = typeof body?.language === "string" ? body.language : "en_US";
  if (brief.length < 4) throw new AppError("validation", "Say what you want to tell customers — one line is enough.");
  if (!(TEMPLATE_CATEGORIES as readonly string[]).includes(category)) throw new AppError("validation", "A template is marketing or utility.");
  if (!TEMPLATE_LANGUAGES.some((l) => l.id === language)) throw new AppError("validation", "Pick a language from the list.");

  const r = await draftTemplate(ctx, member.tenantId, { brief, category: category as "marketing" | "utility", language });
  if (!r.ok) throw new AppError(r.reason === "refused" ? "upstream_anthropic" : "validation", r.message, r.reason === "refused" ? 502 : 422);
  return { draft: r.draft };
});
