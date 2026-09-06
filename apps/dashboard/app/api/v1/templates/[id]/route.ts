import { AppError, TEMPLATE_TITLE_MAX } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody, requireUuid } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { deleteTemplate } from "@/server/service";

/**
 * PUT /api/v1/templates/:id — { hidden?: boolean, title?: string | null }.
 * Hidden from the composers or shown again (the row stays, syncs keep it,
 * the wire may still send it by name); named in the workspace's own words,
 * or the name cleared. Owner or operator, through the definer doors.
 *
 * DELETE /api/v1/templates/:id — a template gone from Meta and from here.
 *
 * Owner or operator. A template a broadcast is still using is refused: the
 * job checks the template at each batch and would fail the broadcast. The
 * edge does Meta's delete and the row's; this route proves who is asking
 * and says what happened.
 */
const SAID: Record<string, string> = {
  preview: "Deleting only works on the production dashboard.",
  not_found: "That template is not on file.",
  no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
  no_token: "Chanlytics has no access token for this number yet.",
  meta_refused: "WhatsApp did not let the template be deleted. Try again in a moment.",
  write_failed: "The template could not be removed here. Sync from Meta and try again.",
};

export const PUT = withRoute(async (req, ctx) => {
  const id = requireUuid(ctx.params.id, "template");
  const body = (await jsonBody(req)) as { hidden?: unknown; title?: unknown } | null;
  const hasHidden = typeof body?.hidden === "boolean";
  const hasTitle = !!body && "title" in body && (body.title === null || typeof body.title === "string");
  if (!hasHidden && !hasTitle) throw new AppError("validation", "Say what changes: whether it is hidden, or its title.");
  const title = hasTitle ? String(body!.title ?? "").replace(/\s+/g, " ").trim().slice(0, TEMPLATE_TITLE_MAX) : undefined;
  const { data: tpl, error } = await ctx.supabase.from("templates").select("id, tenant_id, name").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!tpl) throw new AppError("not_found", "Template not found.", 404);
  const member = await memberContext(ctx, tpl.tenant_id);
  requireRole(member, "operator");
  takeRate(ctx.userId, "settings");
  if (hasHidden) {
    const { error: dErr } = await ctx.supabase.rpc("set_template_hidden", { p_template_id: id, p_hidden: body!.hidden as boolean });
    if (dErr) throw new Error(dErr.message);
  }
  if (hasTitle) {
    const { error: tErr } = await ctx.supabase.rpc("set_template_title", { p_template_id: id, p_title: title || "" });
    if (tErr) throw new Error(tErr.message);
  }
  return { id, name: tpl.name, ...(hasHidden ? { hidden: body!.hidden as boolean } : {}), ...(hasTitle ? { title: title || null } : {}) };
});

export const DELETE = withRoute(async (req, ctx) => {
  const id = requireUuid(ctx.params.id, "template");
  const { data: tpl, error } = await ctx.supabase.from("templates").select("id, tenant_id, name, language").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!tpl) throw new AppError("not_found", "Template not found.", 404);
  const member = await memberContext(ctx, tpl.tenant_id);
  requireRole(member, "operator");
  takeRate(ctx.userId, "settings");

  const { count, error: bErr } = await ctx.supabase
    .from("broadcasts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tpl.tenant_id)
    .eq("template_name", tpl.name)
    .eq("template_language", tpl.language)
    .in("state", ["scheduled", "sending"]);
  if (bErr) throw new Error(bErr.message);
  if (count) throw new AppError("conflict", "A broadcast is still using this template. Cancel it first.", 409);

  const r = await deleteTemplate(tpl.tenant_id, id);
  if (!r.ok) {
    const said = SAID[r.reason] ?? `The template could not be deleted (${r.reason}).`;
    throw new AppError(r.reason === "not_found" ? "not_found" : "upstream_meta", said, r.reason === "not_found" ? 404 : 502);
  }
  return { deleted: true, id, name: tpl.name, language: tpl.language, at_meta: r.atMeta };
});
