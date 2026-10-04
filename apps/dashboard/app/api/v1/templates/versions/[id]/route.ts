import { write } from "@/server/route";
import { templateScope } from "@/server/verbs";
import { removeVersion } from "@/server/campaigns/template-versions";

/**
 * DELETE /api/v1/templates/versions/:id — an email or text version a member wrote, gone.
 *
 * Owner or operator, judged where the version lives (templateScope: a row the caller cannot see is a 404). Only an
 * email or a text written here: a WhatsApp template is Meta's and goes through DELETE templates/:id, which tells
 * Meta, and a reach-out's email belongs to the reach-out. The database door says which rows (remove_template_version,
 * 00296), so the answer for a row that is not a version is the same 404. A version a playbook or broadcast still
 * names is a conflict, with the door's words.
 */
export const DELETE = write({
  scope: templateScope,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, row }) => ({ deleted: true, ...(await removeVersion(ctx, row.id)) }),
});
