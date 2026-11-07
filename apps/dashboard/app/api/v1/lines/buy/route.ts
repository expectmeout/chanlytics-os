import { z } from "zod";
import { AppError, E164, US_AREA_CODE } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { callEdgeLines, EDGE_LINES_TIMEOUT_MS } from "@/server/connections/lines";
import { edgeRefusalWords } from "@/server/shared/edge";
import { LINES_PRODUCTION_ONLY, CARRIER_DID_NOT_ANSWER } from "@/server/connections/line-words";

const Body = z.object({
  number: z.string().trim().regex(E164, "Choose one of the numbers offered."),
  area_code: z.union([z.number().int(), z.string().trim().regex(US_AREA_CODE)]).optional(),
});

/**
 * POST /api/v1/lines/buy — {number, area_code?}: get this number for the
 * workspace. Owners only; it costs money every month. The edge runs the
 * saga and answers with the line as the page may see it. A saga that
 * fails is a result, not an error: the row says the step, the bell says a
 * person at Chanlytics has it, and Retry is on the row.
 *
 * Two doors, declared: may this PERSON act for this workspace (owner), and
 * may this WORKSPACE spend our money (spend). A number is $1.15 a month on
 * Chanlytics' Twilio account for as long as it is held, whatever the
 * workspace does next.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_buy",
  spend: true,
  input: Body,
  handle: async ({ ctx, member, input }) => {
    // Kept as the three digits that were validated. Number() made "000" a zero,
    // which the truthiness check below then dropped -- searching with no area
    // code rather than refusing -- and "012" a 12, a different area code than
    // the one the owner typed.
    const areaCode = input.area_code === undefined || input.area_code === null ? undefined : String(input.area_code);
    const first = await callEdgeLines(
      {
        op: "buy",
        tenant_id: member.tenantId,
        user_id: ctx.userId,
        number: input.number,
        ...(areaCode !== undefined ? { area_code: areaCode } : {}),
      },
      EDGE_LINES_TIMEOUT_MS,
    );
    const body = first.body ?? {};
    // The line already being set up is what this press asked for: the server starts the number the workspace chose
    // once its trial or plan does (decision 0091), often before the tab that paid presses, so the line that stands is
    // the answer, not a refusal.
    if (first.status === 409 && body.error === "line_exists")
      return { ok: true, queued: false, line: body.line ?? null, step: null, error: null };
    if (first.status === 409)
      throw new AppError(
        "conflict",
        body.error === "line_failed_retry"
          ? "This workspace has a line that stopped part-way — retry it from Setup."
          : "This workspace already has a line.",
        409,
      );
    if (first.status === 503 && body.error === "preview") throw new AppError("conflict", LINES_PRODUCTION_ONLY, 409);
    if (first.status === 503 && body.error === "no_line_provider")
      throw new AppError(
        "conflict",
        "Getting a line is not available here yet — ask us and a person at Chanlytics sets it up with you.",
        409,
      );
    if (first.status === 400)
      throw new AppError("validation", edgeRefusalWords(body) ?? "That number cannot be used.", 400);
    if (first.status !== 200 && first.status !== 202 && first.status !== 502)
      throw new AppError("internal", edgeRefusalWords(body) ?? CARRIER_DID_NOT_ANSWER, 502);
    // 202: the saga is on the ledger; the row says the step, and Setup repaints from it.
    return {
      ok: body.ok === true,
      queued: body.queued === true,
      line: body.line ?? null,
      step: typeof body.step === "string" ? body.step : null,
      error: typeof body.error === "string" ? body.error : null,
    };
  },
});
