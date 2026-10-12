/**
 * One template, hidden, named or deleted (app/api/v1/templates/:id): hidden from the composers or shown again (the row
 * stays, syncs keep it, the wire may still send it by name), named in the workspace's own words or the name cleared,
 * through the database's definer doors; or gone from Meta and from the table. A template a broadcast is still using is
 * refused (the job checks the template at each batch and would fail the broadcast), and a running playbook that sends
 * it is named, so the owner can pause it or give it another message first. The edge does Meta's delete and the row's
 * (meta-templates.ts); the template is the row (templateScope), and the route declares who may and how often.
 */
import { z } from "zod";
import { AppError, TEMPLATE_TITLE_MAX, playbooksStillSending } from "@chanlytics/contracts";
import { deleteTemplate, templateEvent } from "@/server/campaigns/meta-templates";
import { serviceDb } from "@/server/service-db";
import type { RouteContext } from "@/server/with-route";
import type { templateScope } from "@/server/verbs";

/** The template a templateScope route acts on, as the scope read it. */
type TemplateRow = Awaited<ReturnType<typeof templateScope.load>>;

export const TemplateChange = z
  .object({
    hidden: z.boolean().optional(),
    title: z.string().nullable().optional(),
  })
  .refine(
    (b) => b.hidden !== undefined || b.title !== undefined,
    "Say what changes: whether it is hidden, or its title.",
  );

export async function changeTemplate(ctx: RouteContext, tpl: TemplateRow, input: z.infer<typeof TemplateChange>) {
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
    const { error: dErr } = await ctx.supabase.rpc("set_template_hidden", {
      p_template_id: id,
      p_hidden: input.hidden === true,
    });
    if (dErr) throw new Error(dErr.message);
  }
  if (hasTitle) {
    const { error: tErr } = await ctx.supabase.rpc("set_template_title", { p_template_id: id, p_title: title || "" });
    if (tErr) throw new Error(tErr.message);
  }
  return {
    id,
    name: tpl.name,
    ...(hasHidden ? { hidden: input.hidden === true } : {}),
    ...(hasTitle ? { title: title || null } : {}),
  };
}

export async function deleteTemplateRow(ctx: RouteContext, tpl: TemplateRow) {
  const SAID: Record<string, string> = {
    preview: "Deleting only works on the production dashboard.",
    not_found: "That template is not on file.",
    no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
    no_token: "Chanlytics has no access token for this number yet.",
    meta_refused: "WhatsApp did not let the template be deleted. Try again in a moment.",
    write_failed: "The template could not be removed here. Sync from Meta and try again.",
  };
  const id = tpl.id;
  const { count, error: bErr } = await ctx.supabase
    .from("broadcasts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tpl.tenant_id)
    .eq("template_name", tpl.name)
    .eq("template_language", tpl.language)
    .in("state", ["scheduled", "sending"]);
  if (bErr) throw new Error(bErr.message);
  if (count) throw new AppError("conflict", "A broadcast is still using this template. Cancel it first.", 409);
  // A running playbook that sends it would skip every run from now on: named, so the owner can pause it or give
  // it another message first. A paused one runs nothing, and the page names it before the delete.
  const { data: running, error: pErr } = await ctx.supabase
    .from("playbooks")
    .select("name")
    .eq("tenant_id", tpl.tenant_id)
    .eq("template_name", tpl.name)
    .eq("template_language", tpl.language)
    .eq("state", "running");
  if (pErr) throw new Error(pErr.message);
  if (running?.length) throw new AppError("conflict", playbooksStillSending(running.map((p) => String(p.name))), 409);

  const r = await deleteTemplate(tpl.tenant_id, id, ctx.userId);
  if (!r.ok) {
    const said = SAID[r.reason] ?? `The template could not be deleted (${r.reason}).`;
    throw new AppError(
      r.reason === "not_found" ? "not_found" : "upstream_meta",
      said,
      r.reason === "not_found" ? 404 : 502,
    );
  }
  // Its row is gone, so the ledger names it: a broadcast or a playbook that sent it still says the name.
  await templateEvent(serviceDb(), tpl.tenant_id, "removed", tpl, ctx.userId);
  return { deleted: true, id, name: tpl.name, language: tpl.language, at_meta: r.atMeta };
}
