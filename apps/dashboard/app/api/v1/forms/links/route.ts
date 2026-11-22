import { FormLinkPress } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { applyFormLinkPress } from "@/server/forms/press";

/**
 * POST /api/v1/forms/links: one place a form is shared (00680). A link made by saying where (`make`), renamed
 * (`rename`), stopped (`stop`: it lands on the business's own page and counts nothing) or started again (`start`). An
 * owner, an operator or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "form_change",
  input: FormLinkPress,
  handle: ({ ctx, member, input }) => applyFormLinkPress(ctx, member, input),
});
