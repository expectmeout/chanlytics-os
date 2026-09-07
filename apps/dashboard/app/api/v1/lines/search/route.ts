import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { takeRate } from "@/server/rate-limit";
import { edgeLines } from "@/server/lines";

/**
 * POST /api/v1/lines/search — {area_code}: local numbers to choose from,
 * with the monthly cost. Owners only (getting a line is theirs); the edge
 * asks the provider.
 */
export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  await takeRate(ctx.userId, "lines_search");
  const body = (await req.json().catch(() => ({}))) as { area_code?: unknown };
  const raw = typeof body.area_code === "number" ? String(body.area_code) : typeof body.area_code === "string" ? body.area_code.trim() : "";
  if (!/^\d{3}$/.test(raw)) throw new AppError("validation", "Give a three-digit area code, like 305.", 400);
  const a = await edgeLines({ op: "search", area_code: Number(raw) }, 20_000);
  const b = a.body ?? {};
  if (a.status === 503 && b.error === "no_line_provider") throw new AppError("conflict", "Getting a line is not available here yet — ask us and a person at Chanlytics sets it up with you.", 409);
  if (a.status !== 200 || b.ok !== true) throw new AppError("internal", typeof b.error === "string" ? b.error : "The carrier did not answer. Try again in a moment.", 502);
  return { area_code: Number(raw), numbers: Array.isArray(b.numbers) ? b.numbers : [], cost_month_usd: typeof b.cost_month_usd === "number" ? b.cost_month_usd : null, provider: b.provider ?? null };
});
