import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { AppError, isUuid } from "@chanlytics/contracts";
import { dbRefusal } from "@/server/shared/with-route";
import { askForwardingTest } from "@/server/lines/forwarding";

/**
 * POST /api/v1/lines/forwarding/test — {line_id}: open the 30-minute test
 * window. A call to the kept number that arrives on the receptionist's line
 * inside it marks the row verified; the call webhook does that, and the
 * page repaints by itself.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_forwarding",
  input: z.object({ line_id: z.string().nullish() }),
  handle: async ({ ctx, input, member }) => {
    const lineId = (input.line_id ?? "").trim();
    if (!isUuid(lineId)) throw new AppError("validation", "Which line?", 400);
    const { data, error } = await askForwardingTest(ctx, {
      p_tenant_id: member.tenantId,
      p_line_id: lineId,
    });
    if (error) throw dbRefusal(error);
    return { test: data };
  },
});
