import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";
import { edgeLines } from "@/server/lines";

/**
 * POST /api/v1/lines/retry — {line_id}: resume a line that stopped at a
 * step. Owners only. The edge resumes the saga where it failed and buys
 * nothing twice.
 */
export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  await takeRate(ctx.userId, "lines_retry");
  const body = (await req.json().catch(() => ({}))) as { line_id?: unknown };
  const lineId = typeof body.line_id === "string" ? body.line_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lineId)) throw new AppError("validation", "Which line?", 400);
  // `by`, because the edge cannot tell an owner's Retry from support's: both send the
  // same op, and it used to write "started by support" on every one of them.
  const a = await edgeLines({ op: "retry", tenant_id: member.tenantId, line_id: lineId, by: "owner" }, 60_000);
  const b = a.body ?? {};
  if (a.status === 404) throw new AppError("not_found", "That line is not here any more.", 404);
  if (a.status === 409) throw new AppError("conflict", typeof b.error === "string" ? b.error : "That line is not waiting on a retry.", 409);
  if (a.status === 503 && b.error === "no_line_provider") throw new AppError("conflict", "Getting a line is not available here yet — a person at Chanlytics has it.", 409);
  if (a.status !== 200 && a.status !== 502) throw new AppError("internal", typeof b.error === "string" ? b.error : "The carrier did not answer. Try again in a moment.", 502);
  return { ok: b.ok === true, line: b.line ?? null, step: typeof b.step === "string" ? b.step : null, error: typeof b.error === "string" ? b.error : null };
});
