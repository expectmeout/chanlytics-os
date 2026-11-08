import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { AppError, US_AREA_CODE } from "@chanlytics/contracts";
import { callEdgeLines } from "@/server/connections/lines";
import { edgeRefusalWords } from "@/server/shared/edge";
import { LINES_PRODUCTION_ONLY, CARRIER_DID_NOT_ANSWER } from "@/server/connections/line-words";

/**
 * POST /api/v1/lines/search — {area_code}: local numbers to choose from,
 * with the monthly cost. Owners only (getting a line is theirs); the edge
 * asks the provider.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_search",
  input: z.object({ area_code: z.union([z.number(), z.string()]).nullish() }),
  handle: async ({ input }) => {
    const raw =
      typeof input.area_code === "number"
        ? String(input.area_code)
        : typeof input.area_code === "string"
          ? input.area_code.trim()
          : "";
    if (!US_AREA_CODE.test(raw)) throw new AppError("validation", "Give a three-digit area code, like 305.", 400);
    const answer = await callEdgeLines({ op: "search", area_code: Number(raw) }, 20_000);
    const result = answer.body ?? {};
    if (answer.status === 503 && result.error === "preview") throw new AppError("conflict", LINES_PRODUCTION_ONLY, 409);
    if (answer.status === 503 && result.error === "no_line_provider")
      throw new AppError(
        "conflict",
        "Getting a line is not available here yet — ask us and a person at Chanlytics sets it up with you.",
        409,
      );
    if (answer.status !== 200 || result.ok !== true)
      throw new AppError("upstream_provider", edgeRefusalWords(result) ?? CARRIER_DID_NOT_ANSWER);
    return {
      area_code: Number(raw),
      numbers: Array.isArray(result.numbers) ? result.numbers : [],
      cost_month_usd: typeof result.cost_month_usd === "number" ? result.cost_month_usd : null,
      provider: result.provider ?? null,
    };
  },
});
