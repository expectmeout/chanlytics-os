import { z } from "zod";
import { AppError, E164 } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { edgeLines, EDGE_LINES_TIMEOUT_MS } from "@/server/connections/lines";
import { edgeRefusalWords } from "@/server/edge";

const Body = z.object({
  number: z.string().trim().regex(E164, "Choose one of the numbers offered."),
  area_code: z
    .union([
      z.number().int(),
      z
        .string()
        .trim()
        .regex(/^\d{3}$/),
    ])
    .optional(),
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
  handle: async ({ member, input }) => {
    // Kept as the three digits that were validated. Number() made "000" a zero,
    // which the truthiness check below then dropped -- searching with no area
    // code rather than refusing -- and "012" a 12, a different area code than
    // the one the owner typed.
    const areaCode = input.area_code === undefined || input.area_code === null ? undefined : String(input.area_code);
    const a = await edgeLines(
      {
        op: "buy",
        tenant_id: member.tenantId,
        number: input.number,
        ...(areaCode !== undefined ? { area_code: areaCode } : {}),
      },
      EDGE_LINES_TIMEOUT_MS,
    );
    const b = a.body ?? {};
    if (a.status === 409)
      throw new AppError(
        "conflict",
        b.error === "line_failed_retry"
          ? "This workspace has a line that stopped part-way — retry it from Setup."
          : "This workspace already has a line.",
        409,
      );
    if (a.status === 503 && b.error === "preview")
      throw new AppError("conflict", "Getting a line only works on the production dashboard.", 409);
    if (a.status === 503 && b.error === "no_line_provider")
      throw new AppError(
        "conflict",
        "Getting a line is not available here yet — ask us and a person at Chanlytics sets it up with you.",
        409,
      );
    if (a.status === 400) throw new AppError("validation", edgeRefusalWords(b) ?? "That number cannot be used.", 400);
    if (a.status !== 200 && a.status !== 202 && a.status !== 502)
      throw new AppError("internal", edgeRefusalWords(b) ?? "The carrier did not answer. Try again in a moment.", 502);
    // 202: the saga is on the ledger; the row says the step, and Setup repaints from it.
    return {
      ok: b.ok === true,
      queued: b.queued === true,
      line: b.line ?? null,
      step: typeof b.step === "string" ? b.step : null,
      error: typeof b.error === "string" ? b.error : null,
    };
  },
});
