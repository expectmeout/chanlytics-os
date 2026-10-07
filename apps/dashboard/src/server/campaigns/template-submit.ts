/**
 * A template written here, submitted to Meta (POST /api/v1/templates, whose route judges the role): { name, language,
 * category, body, footer?, examples }. Everything Meta refuses at the wire is refused here first, in the person's words
 * (validateTemplateDraft, so the body is this verb's own to read); what Meta then says (pending, approved, rejected
 * with a reason) is the row's status, kept current by the webhook. The submission itself is the edge's
 * (meta-templates.ts createTemplate), as every write that leaves for a provider is.
 */
import { AppError, LIBRARY_WORDS, templateComponents, validateTemplateDraft } from "@chanlytics/contracts";
import { templateIdOf } from "@chanlytics/db";
import { jsonBody } from "@/server/request-guards";
import { createTemplate } from "@/server/campaigns/meta-templates";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

const SUBMIT_SAID: Record<string, string> = {
  preview: "Submitting only works on the production dashboard.",
  no_channel: LIBRARY_WORDS.writeNeedsNumber,
  no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
  no_token: "Chanlytics has no access token for this number yet.",
  write_failed: "The template was submitted but could not be saved here. Sync from Meta to see it.",
};

export async function submitTemplate(ctx: RouteContext, req: Request, member: Member) {
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

  const dup = await templateIdOf(ctx.supabase, member.tenantId, v.name, v.language);
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
    const said = SUBMIT_SAID[r.reason] ?? `The template could not be submitted (${r.reason}).`;
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
}
