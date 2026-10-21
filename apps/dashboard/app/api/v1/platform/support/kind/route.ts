import { write, platform } from "@/server/route";
import { SupportKindSchema } from "@chanlytics/contracts";
import { supportMove } from "@/server/platform/support";

/**
 * POST /api/v1/platform/support/kind — {id, kind}: a report moved between Support and Health, as what the member
 * needed (decision 0067): "wrong" sends it to Health, any other kind back to Support. An act whose reason is the
 * report's code, its note the way it went.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_support",
  act: "report_moved",
  input: SupportKindSchema,
  handle: async ({ office, input }) => supportMove(office, input.id, input.kind),
});
