import { write, platform } from "@/server/route";
import { SupportMarkSchema } from "@chanlytics/contracts";
import { supportMark } from "@/server/platform/support";

/**
 * POST /api/v1/platform/support/mark — {target, id, mark}: a question answered or open again; a setup ask answered,
 * done by hand, or open again (decision 0067). One press, an act in the Admin log whose reason is the row's own code.
 * The route names `report_answered`, whose roles every mark asks too, and the log says which mark it was.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_support",
  act: "report_answered",
  input: SupportMarkSchema,
  handle: async ({ office, input }) => supportMark(office, input),
});
