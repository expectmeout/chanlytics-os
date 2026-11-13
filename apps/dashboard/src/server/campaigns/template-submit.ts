/**
 * A template written here, submitted to Meta (POST /api/v1/templates, whose route judges the role): { name, language,
 * category, body, footer?, examples }. Everything Meta refuses at the wire is refused here first, in the person's words
 * (validateTemplateDraft, so the body is this verb's own to read); what Meta then says (pending, approved, rejected
 * with a reason) is the row's status, kept current by the webhook. The submission itself is the edge's
 * (meta-templates.ts createTemplate), as every write that leaves for a provider is. A message written whole
 * (write-message.ts, POST templates/message) submits its WhatsApp version through the same verb (submitDraft).
 */
import {
  AppError,
  LIBRARY_WORDS,
  TEMPLATE_SAME_NAME_WORDS,
  templateComponents,
  validateTemplateDraft,
  textOrEmpty,
  valueAt,
} from "@chanlytics/contracts";
import { findTemplateId } from "@chanlytics/db/campaigns";
import { readJsonBody } from "@/server/shared/request-guards";
import { createTemplate } from "@/server/campaigns/meta-templates";
import type { EdgeReason } from "@/server/shared/edge";
import type { RouteContext } from "@/server/shared/with-route";
import type { Member } from "@/server/shared/route";
import {
  WHATSAPP_ACCOUNT_MISSING,
  WHATSAPP_NO_COPY,
  WHATSAPP_NO_TOKEN,
  refuseTwinWords,
  type ReviewWords,
} from "@/server/campaigns/whatsapp-refusals";

const SUBMIT_SAID: Record<string, string> = {
  preview: "Submitting only works on the production dashboard.",
  no_channel: LIBRARY_WORDS.writeNeedsNumber,
  no_waba: WHATSAPP_ACCOUNT_MISSING,
  no_token: WHATSAPP_NO_TOKEN,
  // A change of words the edge found WhatsApp has no copy of (no id of Meta's on the row).
  not_found: WHATSAPP_NO_COPY,
  write_failed: "WhatsApp has the words, but they could not be saved here. Check WhatsApp for changes to see them.",
};

/** What is said where the edge's reason has no sentence of its own: plainly, never its code (which the log keeps). */
const SUBMIT_UNSAID = "WhatsApp could not be reached just now. Try again in a moment.";

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

/** What the edge said when it did not submit the template, in the person's words: Meta's own reason where it gave one. */
export function submitRefusal(r: { reason: EdgeReason; detail?: string }): AppError {
  if (r.reason === "meta_refused")
    return new AppError(
      "validation",
      `WhatsApp did not accept it: ${r.detail ?? "no reason given"}. Change the message and try again.`,
    );
  const sentence = SUBMIT_SAID[r.reason] ?? SUBMIT_UNSAID;
  const theirs = r.reason === "no_channel" || r.reason === "no_waba";
  return new AppError(theirs ? "conflict" : "upstream_meta", sentence, theirs ? 409 : 502);
}

export async function submitTemplate(ctx: RouteContext, req: Request, member: Member, review?: ReviewWords) {
  return submitDraft(ctx, member, (await readJsonBody(req)) as TemplateAsked | null, review);
}

/**
 * The submission, from a body already read: POST templates' (submitTemplate), and a message written whole's WhatsApp
 * version (write-message.ts). Refusals are thrown in the person's words. `review`: a reader's look at the words once
 * every rule passed, before they are sent (whatsapp-refusals.ts ReviewWords), the route's to hand in.
 */
export async function submitDraft(ctx: RouteContext, member: Member, body: TemplateAsked | null, review?: ReviewWords) {
  const check = validateTemplateDraft({
    name: typeof body?.name === "string" ? body.name : "",
    language: typeof body?.language === "string" ? body.language : "",
    category: typeof body?.category === "string" ? body.category : "",
    body: typeof body?.body === "string" ? body.body : "",
    footer: typeof body?.footer === "string" ? body.footer : null,
    examples: Array.isArray(body?.examples) ? body.examples.map(String) : [],
    // One static URL button, its address the workspace's own booking link. The
    // draft check refuses a value in either half, because a button that takes
    // one needs a parameter `sendTemplate` never sends.
    button:
      body?.button && typeof body.button === "object"
        ? {
            text: textOrEmpty(valueAt(body.button, "text")),
            url: textOrEmpty(valueAt(body.button, "url")),
          }
        : null,
  });
  if (!check.ok) throw new AppError("validation", check.error);
  const value = check.value;

  const dup = await findTemplateId(ctx.supabase, member.tenantId, value.name, value.language);
  // A name and language this workspace already holds, refused as a message written whole and Ask's card refuse it.
  if (dup) throw new AppError("conflict", TEMPLATE_SAME_NAME_WORDS, 409);
  // Nor the words of another message WhatsApp already has from this business, nor what a reader sees it would refuse.
  await refuseTwinWords(ctx, member.tenantId, { id: null, body: value.body, footer: value.footer });
  await review?.(ctx, member.tenantId, value);

  const labels = Array.isArray(body?.labels)
    ? body.labels.map((l) =>
        String(l ?? "")
          .trim()
          .slice(0, 40),
      )
    : [];
  const item = await createTemplate(member.tenantId, ctx.userId, {
    name: value.name,
    language: value.language,
    category: value.category,
    components: templateComponents(value),
    body: value.body,
    examples: value.examples,
    labels: labels.length === value.examples.length ? labels : [],
  });
  if (!item.ok) throw submitRefusal(item);
  return {
    id: item.id,
    name: value.name,
    language: value.language,
    category: value.category,
    meta_status: item.metaStatus,
    warnings: check.warnings,
  };
}
