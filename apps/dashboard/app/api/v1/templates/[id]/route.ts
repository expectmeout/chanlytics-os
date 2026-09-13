import { z } from "zod";
import { AppError, TEMPLATE_TITLE_MAX } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { templateScope } from "@/server/verbs";
import { deleteTemplate } from "@/server/service";

/**
 * PUT /api/v1/templates/:id — { hidden?: boolean, title?: string | null }.
 * Hidden from the composers or shown again (the row stays, syncs keep it,
 * the wire may still send it by name); named in the workspace's own words,
 * or the name cleared. Owner or operator, through the definer doors.
 *
 * DELETE /api/v1/templates/:id — a template gone from Meta and from here.
 *
 * Owner or operator, judged where the template lives (templateScope). A
 * template a broadcast is still using is refused: the job checks the
 * template at each batch and would fail the broadcast. The edge does Meta's
 * delete and the row's; this route proves who is asking and says what
 * happened.
 */
const SAID: Record<string, string> = {
  preview: "Deleting only works on the production dashboard.",
  not_found: "That template is not on file.",
  no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
  no_token: "Chanlytics has no access token for this number yet.",
  not_synced: "This template has not been synced from WhatsApp yet, so it cannot be deleted precisely. Sync from WhatsApp first, then delete it.",
  meta_refused: "WhatsApp did not let the template be deleted. Try again in a moment.",
  write_failed: "The template could not be removed here. Sync from Meta and try again.",
};

const Body = z
  .object({
    hidden: z.boolean().optional(),
    title: z.string().nullable().optional(),
  })
  .refine((b) => b.hidden !== undefined || b.title !== undefined, "Say what changes: whether it is hidden, or its title.");

export const PUT = write({
  scope: templateScope,
  role: "operator",
  rate: "settings",
  input: Body,
  handle: async ({ ctx, row: tpl, input }) => {
    const id = tpl.id;
    const hasHidden = input.hidden !== undefined;
    const hasTitle = input.title !== undefined;
    const title = hasTitle ? String(input.title ?? "").replace(/\s+/g, " ").trim().slice(0, TEMPLATE_TITLE_MAX) : undefined;
    if (hasHidden) {
      const { error: dErr } = await ctx.supabase.rpc("set_template_hidden", { p_template_id: id, p_hidden: input.hidden === true });
      if (dErr) throw new Error(dErr.message);
    }
    if (hasTitle) {
      const { error: tErr } = await ctx.supabase.rpc("set_template_title", { p_template_id: id, p_title: title || "" });
      if (tErr) throw new Error(tErr.message);
    }
    return { id, name: tpl.name, ...(hasHidden ? { hidden: input.hidden === true } : {}), ...(hasTitle ? { title: title || null } : {}) };
  },
});

export const DELETE = write({
  scope: templateScope,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, row: tpl }) => {
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

    const r = await deleteTemplate(tpl.tenant_id, id);
    if (!r.ok) {
      const said = SAID[r.reason] ?? `The template could not be deleted (${r.reason}).`;
      throw new AppError(r.reason === "not_found" ? "not_found" : "upstream_meta", said, r.reason === "not_found" ? 404 : 502);
    }
    return { deleted: true, id, name: tpl.name, language: tpl.language, at_meta: r.atMeta };
  },
});
