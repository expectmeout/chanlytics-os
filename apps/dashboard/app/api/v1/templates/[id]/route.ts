import { write } from "@/server/route";
import { templateScope } from "@/server/verbs";
import { changeTemplate, deleteTemplateRow, TemplateChange } from "@/server/campaigns/template-row";

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
 *
 * The handles are changeTemplate and deleteTemplateRow in src/server/campaigns/template-row.ts: each route is its
 * declaration (who may, how often), each verb is what it does.
 */

export const PUT = write({
  scope: templateScope,
  role: "operator",
  rate: "settings",
  input: TemplateChange,
  handle: ({ ctx, row, input }) => changeTemplate(ctx, row, input),
});

export const DELETE = write({
  scope: templateScope,
  role: "operator",
  rate: "settings",
  handle: ({ ctx, row }) => deleteTemplateRow(ctx, row),
});
