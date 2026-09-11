import { write, workspace } from "@/server/route";
import { AppError } from "@chanlytics/contracts";

/**
 * POST /api/v1/lines/forwarding/test — {line_id}: open the 30-minute test
 * window. A call to the kept number that arrives on the receptionist's line
 * inside it marks the row verified; the call webhook does that, and the
 * page repaints by itself.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "lines_forwarding",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => ({}))) as { line_id?: unknown };
    const lineId = typeof body.line_id === "string" ? body.line_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lineId)) throw new AppError("validation", "Which line?", 400);
    const { data, error } = await ctx.supabase.rpc("line_forwarding_test", { p_tenant_id: member.tenantId, p_line_id: lineId });
    if (error) throw new AppError(error.code === "P0002" ? "not_found" : "validation", error.message, error.code === "P0002" ? 404 : 400);
    return { test: data };
  },
});
