import { write, workspace } from "@/server/route";
import { AppError } from "@chanlytics/contracts";
import { edgeLines } from "@/server/connections/lines";
import { edgeRefusalWords } from "@/server/edge";

/**
 * POST /api/v1/lines/search — {area_code}: local numbers to choose from,
 * with the monthly cost. Owners only (getting a line is theirs); the edge
 * asks the provider.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_search",
  handle: async ({ req }) => {
    const body = (await req.json().catch(() => ({}))) as { area_code?: unknown };
    const raw =
      typeof body.area_code === "number"
        ? String(body.area_code)
        : typeof body.area_code === "string"
          ? body.area_code.trim()
          : "";
    if (!/^\d{3}$/.test(raw)) throw new AppError("validation", "Give a three-digit area code, like 305.", 400);
    const a = await edgeLines({ op: "search", area_code: Number(raw) }, 20_000);
    const b = a.body ?? {};
    if (a.status === 503 && b.error === "preview")
      throw new AppError("conflict", "Getting a line only works on the production dashboard.", 409);
    if (a.status === 503 && b.error === "no_line_provider")
      throw new AppError(
        "conflict",
        "Getting a line is not available here yet — ask us and a person at Chanlytics sets it up with you.",
        409,
      );
    if (a.status !== 200 || b.ok !== true)
      throw new AppError("internal", edgeRefusalWords(b) ?? "The carrier did not answer. Try again in a moment.", 502);
    return {
      area_code: Number(raw),
      numbers: Array.isArray(b.numbers) ? b.numbers : [],
      cost_month_usd: typeof b.cost_month_usd === "number" ? b.cost_month_usd : null,
      provider: b.provider ?? null,
    };
  },
});
