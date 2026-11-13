/**
 * One template, hidden, named or deleted (app/api/v1/templates/:id): hidden from the composers or shown again (the row
 * stays, syncs keep it, the wire may still send it by name), named in the workspace's own words or the name cleared,
 * through the database's definer doors; or gone from Meta and from the table. A template a broadcast is still using is
 * refused (the job checks the template at each batch and would fail the broadcast), and a running playbook that sends
 * it is named, so the owner can pause it or give it another message first. The edge does Meta's delete and the row's
 * (meta-templates.ts); the template is the row (templateScope), and the route declares who may and how often.
 */
import { z } from "zod";
import { AppError, DbFailure, TEMPLATE_TITLE_MAX, playbooksStillSending } from "@chanlytics/contracts";
import type { TenantId } from "@chanlytics/contracts";
import { deleteTemplate, recordTemplateEvent } from "@/server/campaigns/meta-templates";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import type { templateScope } from "@/server/shared/verbs";
import { WHATSAPP_ACCOUNT_MISSING, WHATSAPP_NO_TOKEN } from "@/server/campaigns/whatsapp-refusals";
import { TemplateWords, sendWordsBack } from "@/server/campaigns/template-words";
import type { ReviewWords } from "@/server/campaigns/whatsapp-refusals";
import {
  countLiveRunsOfTemplate,
  listRunningStepsOfTemplate,
  setTemplateHidden,
  setTemplateTitle,
} from "@chanlytics/db/campaigns";

/** The template a templateScope route acts on, as the scope read it. */
type TemplateRow = Awaited<ReturnType<typeof templateScope.load>>;

export const TemplateChange = z
  .object({
    hidden: z.boolean().optional(),
    title: z.string().nullable().optional(),
    /** WhatsApp's words, changed and sent back to WhatsApp (template-words.ts): alone, never beside the others. */
    words: TemplateWords.optional(),
  })
  .refine(
    (b) => b.hidden !== undefined || b.title !== undefined || b.words !== undefined,
    "Say what changes: whether it is hidden, its title, or its words.",
  );

/** `review`: a reader's look at changed words before they are sent to WhatsApp (whatsapp-refusals.ts), the route's to hand in. */
export async function changeTemplate(
  ctx: RouteContext,
  tpl: TemplateRow,
  input: z.infer<typeof TemplateChange>,
  review?: ReviewWords,
) {
  if (input.words) return sendWordsBack(ctx, tpl, input.words, review);
  const id = tpl.id;
  const hasHidden = input.hidden !== undefined;
  const hasTitle = input.title !== undefined;
  const title = hasTitle
    ? String(input.title ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, TEMPLATE_TITLE_MAX)
    : undefined;
  if (hasHidden) {
    const { error: dErr } = await setTemplateHidden(ctx.supabase, id, input.hidden === true);
    if (dErr) throw new Error(dErr.message);
  }
  if (hasTitle) {
    const { error: tErr } = await setTemplateTitle(ctx.supabase, id, title || "");
    if (tErr) throw new Error(tErr.message);
  }
  return {
    id,
    name: tpl.name,
    ...(hasHidden ? { hidden: input.hidden === true } : {}),
    ...(hasTitle ? { title: title || null } : {}),
  };
}

/**
 * Why a message cannot be deleted now, or null: a send using it (the job checks the template at each batch and would fail
 * the broadcast), or a running playbook that sends it (it would skip every run from now on), named, so the owner can pause
 * it or give it another message first; a paused one runs nothing, and the page names it before the delete. This door's,
 * and Ask's card's (ask/tools/act/message-change.ts), so a card never promises what this refuses.
 */
export async function getDeleteRefusal(
  ctx: RouteContext,
  tenantId: TenantId,
  key: { name: string; language: string },
): Promise<string | null> {
  const { count, error } = await countLiveRunsOfTemplate(ctx.supabase, tenantId, key);
  if (error) throw new DbFailure(error, "sends of a template");
  if (count) return "A send is still using this message. Cancel it first.";
  const { data: running, error: pErr } = await listRunningStepsOfTemplate(ctx.supabase, tenantId, key);
  if (pErr) throw new DbFailure(pErr, "steps that send a template");
  return running?.length ? playbooksStillSending(running.map((p) => String(p.name))) : null;
}

export async function deleteTemplateRow(ctx: RouteContext, tpl: TemplateRow) {
  const SAID: Record<string, string> = {
    preview: "Deleting only works on the production dashboard.",
    not_found: "That template is not on file.",
    no_waba: WHATSAPP_ACCOUNT_MISSING,
    no_token: WHATSAPP_NO_TOKEN,
    meta_refused: "WhatsApp did not let the template be deleted. Try again in a moment.",
    write_failed: "The template could not be removed here. Sync from Meta and try again.",
  };
  const id = tpl.id;
  const refused = await getDeleteRefusal(ctx, tpl.tenant_id, tpl);
  if (refused) throw new AppError("conflict", refused, 409);

  const result = await deleteTemplate(tpl.tenant_id, id, ctx.userId);
  if (!result.ok) {
    const sentence = SAID[result.reason] ?? `The template could not be deleted (${result.reason}).`;
    throw new AppError(
      result.reason === "not_found" ? "not_found" : "upstream_meta",
      sentence,
      result.reason === "not_found" ? 404 : 502,
    );
  }
  // Its row is gone, so the ledger names it: a broadcast or a playbook that sent it still says the name.
  await recordTemplateEvent(serviceDb(), tpl.tenant_id, "removed", tpl, ctx.userId);
  return { deleted: true, id, name: tpl.name, language: tpl.language, at_meta: result.atMeta };
}
