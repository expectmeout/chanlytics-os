/**
 * A template written here, submitted to Meta (POST /api/v1/templates, whose route judges the role): { name, language,
 * category, body, footer?, examples }. Everything Meta refuses at the wire is refused here first, in the person's words
 * (validateTemplateDraft, so the body is this verb's own to read); what Meta then says (pending, approved, rejected
 * with a reason) is the row's status, kept current by the webhook. The submission itself is the edge's
 * (meta-templates.ts createTemplate), as every write that leaves for a provider is. A message written whole
 * (write-message.ts, POST templates/message) submits its WhatsApp version through the same verb (submitDraft).
 */
import { AppError, LIBRARY_WORDS, templateComponents, validateTemplateDraft } from "@chanlytics/contracts";
import { templateIdOf } from "@chanlytics/db";
import { jsonBody } from "@/server/request-guards";
import { createTemplate } from "@/server/campaigns/meta-templates";
import type { EdgeReason } from "@/server/edge";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

const SUBMIT_SAID: Record<string, string> = {
  preview: "Submitting only works on the production dashboard.",
  no_channel: LIBRARY_WORDS.writeNeedsNumber,
  no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
  no_token: "Chanlytics has no access token for this number yet.",
  write_failed: "The template was submitted but could not be saved here. Sync from Meta to see it.",
};

/** What a template written here is said with, Meta's to review: POST templates' body, as it came. */
interface TemplateAsked {
  name?: unknown;
  language?: unknown;
  category?: unknown;
  body?: unknown;
  footer?: unknown;
  examples?: unknown;
  labels?: unknown;
  button?: unknown;
}

/** A name and language this workspace already holds, as a submission refuses it and a message written whole does. */
export const SAME_NAME_WORDS = "A template with that name and language already exists. Pick another name.";

/** What the edge said when it did not submit the template, in the person's words: Meta's own reason where it gave one. */
function submitRefusal(r: { reason: EdgeReason; detail?: string }): AppError {
  if (r.reason === "meta_refused")
    return new AppError(
      "validation",
      `WhatsApp did not accept it: ${r.detail ?? "no reason given"}. Change the message and try again.`,
    );
  const said = SUBMIT_SAID[r.reason] ?? `The template could not be submitted (${r.reason}).`;
  const theirs = r.reason === "no_channel" || r.reason === "no_waba";
  return new AppError(theirs ? "conflict" : "upstream_meta", said, theirs ? 409 : 502);
}

export async function submitTemplate(ctx: RouteContext, req: Request, member: Member) {
  return submitDraft(ctx, member, (await jsonBody(req)) as TemplateAsked | null);
}

/**
 * The submission, from a body already read: POST templates' (submitTemplate), and a message written whole's WhatsApp
 * version (write-message.ts). Refusals are thrown in the person's words.
 */
export async function submitDraft(ctx: RouteContext, member: Member, body: TemplateAsked | null) {
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
  if (dup) throw new AppError("conflict", SAME_NAME_WORDS, 409);

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
  if (!r.ok) throw submitRefusal(r);
  return {
    id: r.id,
    name: v.name,
    language: v.language,
    category: v.category,
    meta_status: r.metaStatus,
    warnings: check.warnings,
  };
}
