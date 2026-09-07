import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";
import { edgeLines } from "@/server/lines";

/**
 * POST /api/v1/lines/buy — {number, area_code?}: get this number for the
 * workspace. Owners only; it costs money every month. The edge runs the
 * saga and answers with the line as the page may see it. A saga that
 * fails is a result, not an error: the row says the step, the bell says a
 * person at Chanlytics has it, and Retry is on the row.
 */
export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  await takeRate(ctx.userId, "lines_buy");
  const body = (await req.json().catch(() => ({}))) as { number?: unknown; area_code?: unknown };
  const number = typeof body.number === "string" ? body.number.trim() : "";
  if (!/^\+[1-9]\d{6,14}$/.test(number)) throw new AppError("validation", "Choose one of the numbers offered.", 400);
  const areaCode = typeof body.area_code === "number" ? body.area_code : typeof body.area_code === "string" && /^\d{3}$/.test(body.area_code.trim()) ? Number(body.area_code.trim()) : undefined;
  const a = await edgeLines({ op: "buy", tenant_id: member.tenantId, number, ...(areaCode ? { area_code: areaCode } : {}) }, 60_000);
  const b = a.body ?? {};
  if (a.status === 409) throw new AppError("conflict", b.error === "line_failed_retry" ? "This workspace has a line that stopped part-way — retry it from Setup." : "This workspace already has a line.", 409);
  if (a.status === 503 && b.error === "no_line_provider") throw new AppError("conflict", "Getting a line is not available here yet — ask us and a person at Chanlytics sets it up with you.", 409);
  if (a.status === 400) throw new AppError("validation", typeof b.error === "string" ? b.error : "That number cannot be used.", 400);
  if (a.status !== 200 && a.status !== 502) throw new AppError("internal", typeof b.error === "string" ? b.error : "The carrier did not answer. Try again in a moment.", 502);
  return { ok: b.ok === true, line: b.line ?? null, step: typeof b.step === "string" ? b.step : null, error: typeof b.error === "string" ? b.error : null };
});
